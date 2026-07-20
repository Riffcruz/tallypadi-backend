// ============================================================
// gemini.ai.ts — Gemini API executor
// Handles: model init, timeout, retry, guidance helpers,
// and the main parseMessageWithGemini entry point.
//
// 🔑 Inventory Context:
//   Pass up to 50 recent items as `inventoryContext` to help
//   the model match fuzzy item names against known products.
//   Items are sorted by most recently sold so the most relevant
//   50 are sent and old/stale items are excluded.
// ============================================================

import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import { env } from '../config/env';
import getSystemPrompt from './gemini.prompt';
import {
  stripWhatsAppExportLine,
  sanitizeInput,
  extractJsonObject,
  safeParsedResult,
  fallbackParse,
} from './gemini.parsers';
import type { ParsedResult, InventorySnapshotItem } from './gemini.types';

// ─── Model init ─────────────────────────────────────────────
const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });

// ─── Cache Management ────────────────────────────────────────
interface CacheInfo {
  name: string;
  expiresAt: number;
}
const cachedPrompts = new Map<string, CacheInfo>();

async function getOrCreateCache(userLanguage: string): Promise<string | null> {
  const lang = String(userLanguage).toUpperCase();
  const existing = cachedPrompts.get(lang);
  const now = Date.now();

  // If we have a cache that is valid for at least another 5 minutes, use it
  if (existing && existing.expiresAt > now + 5 * 60 * 1000) {
    return existing.name;
  }

  try {
    const systemPrompt = getSystemPrompt(userLanguage);
    console.log(`[Gemini Caching] Creating context cache for language ${lang}...`);
    
    const cache = await ai.caches.create({
      model: env.geminiModel, // 'gemini-2.0-flash-001'
      config: {
        displayName: `tallypadi-prompt-${lang.toLowerCase()}`,
        systemInstruction: systemPrompt,
        ttl: '3600s', // 1 hour TTL
      },
    });

    if (!cache.name) {
      throw new Error('Cache name not returned by Google Gen AI API');
    }

    const expiresAt = now + 3600 * 1000;
    cachedPrompts.set(lang, { name: cache.name, expiresAt });
    console.log(`[Gemini Caching] Cache created successfully: ${cache.name}. Expires in 1 hour.`);
    return cache.name;
  } catch (error) {
    console.warn('[Gemini Caching] Failed to create context cache, falling back to non-cached request:', error);
    return null;
  }
}

// ─── Timeout wrapper ─────────────────────────────────────────
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TIMEOUT')), ms);
    promise
      .then((value) => { clearTimeout(timer); resolve(value); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

// ─── Retry with exponential backoff ─────────────────────────
async function generateWithRetry(
  params: Parameters<typeof ai.models.generateContent>[0],
  retries = 3,
  timeoutMs = 90000
) {
  for (let i = 0; i <= retries; i++) {
    try {
      const result = await withTimeout(ai.models.generateContent(params), timeoutMs);
      return result;
    } catch (err: unknown) {
      if (i === retries) throw err;
      const baseDelay = 1000 * Math.pow(2, i);
      const jitter = Math.floor(Math.random() * 500);
      const waitTime = baseDelay + jitter;
      console.warn(`[Gemini] Attempt ${i + 1}/${retries} failed. Retrying in ${waitTime}ms...`);
      await new Promise((r) => setTimeout(r, waitTime));
    }
  }
  throw new Error('Gemini retries failed');
}

// ─── Local LLM Fallback (Ollama) ────────────────────────────
async function parseMessageWithLocalLLM(
  userPrompt: string,
  systemPrompt: string
): Promise<ParsedResult | null> {
  const ollamaUrl = env.ollamaUrl || 'http://localhost:11434';
  const modelName = env.ollamaModel || 'qwen2.5:7b';

  try {
    console.log(`[Ollama Fallback] Querying local model "${modelName}" at ${ollamaUrl}...`);
    const response = await axios.post(`${ollamaUrl}/api/generate`, {
      model: modelName,
      system: systemPrompt,
      prompt: userPrompt,
      format: 'json',
      stream: false,
    }, {
      timeout: 90000, // 90s timeout for local CPU/GPU inference
    });

    const responseText = response.data?.response;
    if (!responseText) {
      console.warn('[Ollama Fallback] Empty response returned from local model');
      return null;
    }

    const cleanJson = extractJsonObject(responseText);
    return safeParsedResult(JSON.parse(cleanJson));
  } catch (error) {
    console.error('[Ollama Fallback] Local LLM execution failed:', error);
    return null;
  }
}

// ─── Static Guidance Map ────────────────────────────────────
const GUIDANCE_MAP: Record<string, Record<string, string>> = {
  ENGLISH: {
    RECORD_INVENTORY: "📦 Add new items to your stock. Just type what you bought.\nExample: 'Add 20 sneakers' or 'Restock 15 bags of rice'",
    RECORD_SALE: "💰 Record a cash sale instantly. Just type what you sold.\nExample: 'Sold 2 rice 5000' or '2 bread sold at 500'",
    RECORD_CREDIT: "💳 Record a sale on credit/debt. Include the customer name.\nExample: 'Sold 2 shoes to Emeka on credit' or 'Ada owes 10k for gown'",
    DELETE_STOCK: "🗑️ Remove an item completely from your stock list.\nExample: 'delete sneakers' or 'remove bread from stock'",
    SET_STOCK: "📝 Correct the exact quantity of stock currently on hand.\nExample: 'set rice stock to 20' or 'rice remaining is 12'",
    SET_PRICE: "🏷️ Update your selling price and cost price separately.\nExample: 'set shoe selling price to 15000 and cost price to 10000'",
    MANAGE_STAFF: "👥 Add a staff member's phone number to grant them access.\nExample: 'Add staff John 08012345678' or 'New staff 08123456789'",
    CREATE_INVOICE: "📄 Generate a professional PDF invoice for a customer.\nExample: 'Create invoice for Amina' or 'Invoice for GTBank branding'",
    EXPENSE: "💸 Record money spent on business expenses.\nExample: 'Spent 5000 on fuel' or 'Transport to market 1500'"
  },
  PIDGIN: {
    RECORD_INVENTORY: "📦 Add new items to your stock. Just type wetin you buy.\nExample: 'Add 20 sneakers' or 'Restock 15 bags of rice'",
    RECORD_SALE: "💰 Record cash sale sharp-sharp. Just type wetin you sell.\nExample: 'Sold 2 rice 5000' or '2 bread sold at 500'",
    RECORD_CREDIT: "💳 Record credit sale for customer wey never pay. Put dia name.\nExample: 'Sold 2 shoes to Emeka on credit' or 'Ada owes 10k for gown'",
    DELETE_STOCK: "🗑️ Comot item completely from your stock list.\nExample: 'delete sneakers' or 'remove bread from stock'",
    SET_STOCK: "📝 Correct the exact number of stock wey you get now.\nExample: 'set rice stock to 20' or 'rice remaining is 12'",
    SET_PRICE: "🏷️ Change the selling price and cost price separate.\nExample: 'set shoe selling price to 15000 and cost price to 10000'",
    MANAGE_STAFF: "👥 Add your staff phone number make dem fit login.\nExample: 'Add staff John 08012345678' or 'New staff 08123456789'",
    CREATE_INVOICE: "📄 Do professional PDF invoice send to customer.\nExample: 'Create invoice for Amina' or 'Invoice for GTBank branding'",
    EXPENSE: "💸 Write down money wey you spend for business.\nExample: 'Spent 5000 on fuel' or 'Transport to market 1500'"
  }
};

// ─── Guidance message (dynamic help - now optimized to static) ───
export const generateGuidanceMessage = async (
  intent: string,
  userLanguage: string = 'English'
): Promise<string> => {
  const lang = String(userLanguage).toUpperCase();
  const normalizedIntent = String(intent).toUpperCase();

  const guidance = GUIDANCE_MAP[lang]?.[normalizedIntent] || GUIDANCE_MAP['ENGLISH']?.[normalizedIntent];
  if (guidance) {
    return guidance;
  }

  // Fallback if intent is not found in static maps
  if (normalizedIntent === 'RECORD_SALE') return 'To record a sale, simply type what you sold. Example: Sold 2 rice 5000';
  if (normalizedIntent === 'RECORD_INVENTORY') return 'To add stock, just type it. Example: Add 20 sneakers';
  if (normalizedIntent === 'EXPENSE') return "To record expense: 'Spent 5000 on fuel' or 'Transport 2k'";
  return 'Please tell me what you want to do clearly.';
};

// ─── Randomized Welcome Message Variations ────────────────────────
const WELCOME_VARIATIONS = [
  // Type 1: Standard
  (lang: string) => lang === 'PIDGIN'
    ? `✅ Registration Complete\n\n🌐 Web Access\nLogin here to manage your shop on the web:\nhttps://tallypadi.com/login`
    : `✅ Registration Complete\n\n🌐 Web Access\nLogin here to manage your shop on the web:\nhttps://tallypadi.com/login`,
  
  // Type 2: Desktop/Dashboard focused
  (lang: string) => lang === 'PIDGIN'
    ? `✅ Registration Complete\n\n🌐 Web Access\nManage your inventory and track sales on big screen. Login here:\nhttps://tallypadi.com/login`
    : `✅ Registration Complete\n\n🌐 Web Access\nManage your inventory and track sales on a larger screen. Login here:\nhttps://tallypadi.com/login`,

  // Type 3: Dashboards
  (lang: string) => lang === 'PIDGIN'
    ? `✅ Registration Complete\n\n🌐 Web Access\nYou fit access your business dashboard on the web too. Click here to login:\nhttps://tallypadi.com/login`
    : `✅ Registration Complete\n\n🌐 Web Access\nYou can also access your business dashboard on the web. Click here to login:\nhttps://tallypadi.com/login`,

  // Type 4: Features focus
  (lang: string) => lang === 'PIDGIN'
    ? `✅ Registration Complete\n\n🌐 Web Access\nTrack profit, check fine reports, and manage staff on the web:\nhttps://tallypadi.com/login`
    : `✅ Registration Complete\n\n🌐 Web Access\nTrack your profits, view detailed reports, and manage staff on the web:\nhttps://tallypadi.com/login`,

  // Type 5: Spacious / Professional Command center
  (lang: string) => lang === 'PIDGIN'
    ? `✅ Registration Complete\n\n🌐 Web Access\nAccess your full business command center from your browser:\nhttps://tallypadi.com/login`
    : `✅ Registration Complete\n\n🌐 Web Access\nAccess your full business command center from your browser:\nhttps://tallypadi.com/login`
];

export const generateWelcomeMessage = async (userLanguage: string = 'English'): Promise<string> => {
  const lang = String(userLanguage).toUpperCase();
  const randomIndex = Math.floor(Math.random() * WELCOME_VARIATIONS.length);
  return WELCOME_VARIATIONS[randomIndex](lang);
};

export interface AdSeoMetadataInput {
  productName: string;
  productDescription?: string;
  productCategory?: string | null;
  price?: number;
  businessName?: string;
  city?: string;
  state?: string;
  country?: string;
  adBrief?: string;
  adAudience?: string;
  adKeywords?: string[];
}

export interface AdSeoMetadata {
  title: string;
  metaDescription: string;
  adDescription: string;
  keywords: string[];
  source?: 'AI' | 'FALLBACK';
}

const cleanSeoText = (value: unknown, maxLength: number) =>
  sanitizeInput(String(value || '')).slice(0, maxLength).trim();

const fallbackAdSeoMetadata = (input: AdSeoMetadataInput): AdSeoMetadata => {
  const location = [input.city, input.state].filter(Boolean).join(', ');
  const category = input.productCategory ? ` ${input.productCategory}` : '';
  const priceText = input.price ? ` from ₦${Number(input.price).toLocaleString()}` : '';
  const locationText = location ? ` in ${location}` : '';
  const shopText = input.businessName ? ` from ${input.businessName}` : '';
  const base = `${input.productName}${category}${priceText}${locationText}${shopText}`;

  return {
    title: cleanSeoText(`${input.productName}${locationText} | TallyPadi Marketplace`, 65),
    metaDescription: cleanSeoText(`${base}. View product details, availability, seller location, and contact the advertiser directly on TallyPadi.`, 160),
    adDescription: cleanSeoText(`${base}. Check the product details, available options, and seller information before contacting the advertiser.`, 500),
    keywords: Array.from(new Set([
      input.productName,
      input.productCategory || '',
      ...(input.adKeywords || []),
      input.city || '',
      input.state || '',
      input.businessName || '',
      'TallyPadi marketplace',
    ].map((item) => cleanSeoText(item, 60).toLowerCase()).filter(Boolean))).slice(0, 12),
    source: 'FALLBACK',
  };
};

export const generateAdSeoMetadata = async (input: AdSeoMetadataInput): Promise<AdSeoMetadata> => {
  const fallback = fallbackAdSeoMetadata(input);
  const prompt = `
You are TallyPadi's marketplace SEO assistant.

Create honest, high-click product SEO copy for a single product landing page.
Use only the supplied facts. Do not invent discounts, ratings, stock promises, or guarantees.
Avoid keyword stuffing. Make it natural for Nigerian shoppers and useful for Google Ads landing pages.

Return JSON only with:
{
  "title": "55-65 character page title",
  "metaDescription": "140-160 character search description",
  "adDescription": "60-90 word visible product ad description",
  "keywords": ["max 12 focused search phrases"]
}

Facts:
Product: ${input.productName}
Category: ${input.productCategory || 'Not supplied'}
Price: ${input.price ? `₦${Number(input.price).toLocaleString()}` : 'Not supplied'}
Shop: ${input.businessName || 'Not supplied'}
Location: ${[input.city, input.state, input.country].filter(Boolean).join(', ') || 'Not supplied'}
Product description: ${input.productDescription || 'Not supplied'}
Advertiser brief: ${input.adBrief || 'Not supplied'}
Target audience: ${input.adAudience || 'Not supplied'}
Advertiser keywords: ${(input.adKeywords || []).join(', ') || 'Not supplied'}
`;

  try {
    const result = await ai.models.generateContent({
      model: env.geminiModel,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json' },
    });
    const responseText = result.text || '';
    const parsed = JSON.parse(extractJsonObject(responseText));

    const keywords: string[] = Array.isArray(parsed?.keywords)
      ? parsed.keywords
        .map((item: unknown) => cleanSeoText(item, 60))
        .filter((item: string) => Boolean(item))
      : fallback.keywords;

    return {
      title: cleanSeoText(parsed?.title, 65) || fallback.title,
      metaDescription: cleanSeoText(parsed?.metaDescription, 170) || fallback.metaDescription,
      adDescription: cleanSeoText(parsed?.adDescription, 700) || fallback.adDescription,
      keywords: Array.from(new Set<string>(keywords.map((item) => item.toLowerCase()))).slice(0, 12),
      source: 'AI',
    };
  } catch (error) {
    console.error('Gemini Ad SEO Error:', error);
    return fallback;
  }
};

// ─── Build inventory context snippet ────────────────────────
// Caps at 50 items to prevent massive token usage.
// Items are expected pre-sorted by recency (most recent first).
function buildInventoryContext(items?: InventorySnapshotItem[]): string {
  if (!items || items.length === 0) return '';
  const capped = items.slice(0, 50);
  const lines = capped.map((item) => {
    let line = `• ${item.name}`;
    if (item.qty != null) line += ` (qty: ${item.qty})`;
    if (item.price != null) line += ` @ ₦${item.price.toLocaleString()}`;
    if (item.category) line += ` [${item.category}]`;
    return line;
  });
  return `\n\n*** KNOWN INVENTORY (use for fuzzy name matching, top ${capped.length} recent items) ***\n${lines.join('\n')}\n*** END INVENTORY ***`;
}

// ─── Main entry point ─────────────────────────────────────────
export const parseMessageWithGemini = async (
  message: string,
  userLanguage: string = 'English',
  history: string[] = [],
  imageBuffer?: string,
  imageMimeType?: string,
  inventoryContext?: InventorySnapshotItem[], // ← capped at 50 in buildInventoryContext
  options?: { maxRetries?: number; timeoutMs?: number },
): Promise<ParsedResult> => {
  const maxRetries = options?.maxRetries ?? 3;
  const timeoutMs = options?.timeoutMs ?? 90000;

  const stripped = stripWhatsAppExportLine(message);
  const safeMessage = sanitizeInput(stripped);

  // 1️⃣ Fast local path (skip for bare numbers that need context)
  const isShortNumber = /^\d+$/.test(safeMessage.trim());
  if (!isShortNumber) {
    const localResult = fallbackParse(safeMessage);
    if (localResult) {
      console.log(`⚡ Handled locally: ${localResult.intent}`);
      return localResult;
    }
  }

  // 2️⃣ Gemini path (with history + capped inventory context + context caching)
  const cacheName = await getOrCreateCache(userLanguage);
  
  const recentHistory = history.slice(-5);
  const inventorySnippet = buildInventoryContext(inventoryContext);

  let userPrompt = `[CONTEXT]
Current Date: ${new Date().toISOString()}
Conversation History:
${recentHistory.map((msg, i) => `[Turn ${i + 1}]: ${msg}`).join('\n')}
${inventorySnippet}

[USER MESSAGE]
"${safeMessage}"

Return JSON only.`;

  if (imageMimeType && imageMimeType.startsWith('audio/')) {
    userPrompt += '\n\n🔊 AUDIO INSTRUCTION: The user has sent a voice note. Listen carefully and extract intent/data as if it were written text. Ignore the text "Analyze this audio".';
  }

  const contents: any[] = [{ role: 'user', parts: [{ text: userPrompt }] }];
  if (imageBuffer && imageMimeType) {
    contents[0].parts.push({ inlineData: { data: imageBuffer, mimeType: imageMimeType } });
  }

  const generateParams: Parameters<typeof ai.models.generateContent>[0] = {
    model: env.geminiModel,
    contents,
    config: cacheName
      ? {
          responseMimeType: 'application/json',
          cachedContent: cacheName,
        }
      : {
          responseMimeType: 'application/json',
          systemInstruction: getSystemPrompt(userLanguage),
        },
  };

  try {
    const result = await generateWithRetry(generateParams, maxRetries, timeoutMs);
    const responseText = result.text || '';
    const cleanJson = extractJsonObject(responseText);
    return safeParsedResult(JSON.parse(cleanJson));
  } catch (error) {
    console.error('❌ Gemini Error:', error);
    
    /* TEMPORARILY DISABLED LOCAL LLM FALLBACK
    // Fallback to local LLM (Ollama)
    try {
      console.log('🔄 Attempting fallback to local LLM (Ollama)...');
      const localResult = await parseMessageWithLocalLLM(
        userPrompt,
        getSystemPrompt(userLanguage)
      );
      if (localResult) {
        console.log('✅ Fallback to local LLM succeeded!');
        return localResult;
      }
    } catch (fallbackError) {
      console.error('❌ Local LLM Fallback failed:', fallbackError);
    }
    */

    return safeParsedResult({
      intent: 'UNKNOWN',
      reply_text: 'Network weak. Please try again or use format: "Sold 2 rice 5000"',
    });
  }
};
