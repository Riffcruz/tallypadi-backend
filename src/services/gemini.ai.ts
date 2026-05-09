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

import { GoogleGenerativeAI } from '@google/generative-ai';
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
const genAI = new GoogleGenerativeAI(env.geminiApiKey);

const model = genAI.getGenerativeModel({
  model: env.geminiModel,
  generationConfig: { responseMimeType: 'application/json' },
});

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
async function generateWithRetry(parts: (string | import('@google/generative-ai').Part)[], retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const result = await withTimeout(model.generateContent(parts), 45000);
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

// ─── Guidance message (dynamic help) ────────────────────────
export const generateGuidanceMessage = async (
  intent: string,
  userLanguage: string = 'English'
): Promise<string> => {
  const prompt = `
You are TallyPadi, a helpful business assistant.
User Language: ${userLanguage.toUpperCase()}

Task: Explain clearly and briefly how to use the feature related to "${intent}".
**CRITICAL RULES:**
1. DO NOT mention the technical intent name.
2. Speak like a human to a shop owner. Be natural and cool.
3. Use "stock" instead of "inventory" where applicable.
4. Give 2 clear natural language examples of exactly what they should type.

INTENT CONTEXT:
- RECORD_INVENTORY: Adding new items to stock.
- RECORD_SALE: Recording a cash sale.
- RECORD_CREDIT: Recording a sale on credit.
- DELETE_STOCK: Removing an item from the list.
- SET_STOCK: Correcting the exact quantity of stock.
- SET_PRICE: Setting the selling price and cost price. Instructions must explicitly show how to update Cost Price AND Selling Price separately (e.g. "set [item] selling price to X and cost price to Y").
- MANAGE_STAFF: Adding a staff member number.
- CREATE_INVOICE: Generating a PDF invoice.
- EXPENSE: Recording money spent.

Format: Under 3 lines. Use emojis. Examples must be natural user input.
Output: Return ONLY the explanation text.
`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'text/plain' },
    });
    return result.response.text().replace(/\\n/g, '\n').trim();
  } catch (error) {
    console.error('Gemini Guidance Error:', error);
    if (intent === 'RECORD_SALE') return 'To record a sale, simply type what you sold. Example: Sold 2 rice 5000';
    if (intent === 'RECORD_INVENTORY') return 'To add stock, just type it. Example: Add 20 sneakers';
    if (intent === 'EXPENSE') return "To record expense: 'Spent 5000 on fuel' or 'Transport 2k'";
    return 'Please tell me what you want to do clearly.';
  }
};

// ─── Welcome message ─────────────────────────────────────────
export const generateWelcomeMessage = async (userLanguage: string = 'English'): Promise<string> => {
  const prompt = `
You are TallyPadi, a professional business assistant.
The user just registered successfully.
User Language: ${userLanguage.toUpperCase()}

Task: Write a concise confirmation message for "Registration Complete".
Do NOT include trial info or pricing. Just confirmation and web access link.

Required Content:
1. Header: "✅ Registration Complete"
2. (Gap)
3. "🌐 Web Access"
4. "Login here to manage your shop on the web:"
5. Link: https://tallypadi.com/login

Tone: Professional, spacious.
Output: Return ONLY the message text.
`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'text/plain' },
    });
    return result.response.text().replace(/\\n/g, '\n');
  } catch (error) {
    console.error('Gemini Welcome Message Error:', error);
    return `✅ Registration Complete\n\n🌐 Web Access\nLogin here to manage your shop on the web:\nhttps://tallypadi.com/login`;
  }
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
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });
    const parsed = JSON.parse(extractJsonObject(result.response.text()));

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
): Promise<ParsedResult> => {
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

  // 2️⃣ Gemini path (with history + capped inventory context)
  const recentHistory = history.slice(-5);
  const basePrompt = getSystemPrompt(userLanguage, new Date().toISOString(), recentHistory);
  const inventorySnippet = buildInventoryContext(inventoryContext);

  let userPrompt = `${basePrompt}${inventorySnippet}\n\nUSER MESSAGE: "${safeMessage}"\n\nReturn JSON only.`;

  if (imageMimeType && imageMimeType.startsWith('audio/')) {
    userPrompt += '\n\n🔊 AUDIO INSTRUCTION: The user has sent a voice note. Listen carefully and extract intent/data as if it were written text. Ignore the text "Analyze this audio".';
  }

  const parts: (string | import('@google/generative-ai').Part)[] = [userPrompt];
  if (imageBuffer && imageMimeType) {
    parts.push({ inlineData: { data: imageBuffer, mimeType: imageMimeType } });
  }

  try {
    const result = await generateWithRetry(parts);
    const text = result.response.text();
    const cleanJson = extractJsonObject(text);
    return safeParsedResult(JSON.parse(cleanJson));
  } catch (error) {
    console.error('❌ Gemini Error:', error);
    return safeParsedResult({
      intent: 'UNKNOWN',
      reply_text: 'Network weak. Please try again or use format: "Sold 2 rice 5000"',
    });
  }
};
