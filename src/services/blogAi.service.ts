import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env';
import { extractJsonObject, sanitizeInput } from './gemini.parsers';
import {
  assertSafeTallyPadiDraft,
  TALLYPADI_EDITORIAL_KNOWLEDGE,
} from '../content/tallypadiKnowledge';

export type BlogAiRequest = {
  brief: string;
  primaryKeyword?: string;
  audience?: string;
  tone?: string;
  length?: 'STANDARD' | 'IN_DEPTH';
};

const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('AI generation timed out')), timeoutMs);
  promise.then((value) => { clearTimeout(timer); resolve(value); }).catch((error) => { clearTimeout(timer); reject(error); });
});

export const generateBlogDraft = async (request: BlogAiRequest): Promise<Record<string, unknown>> => {
  if (!env.geminiApiKey) throw new Error('GEMINI_API_KEY is not configured');

  const brief = sanitizeInput(request.brief).slice(0, 12000);
  const targetWords = request.length === 'IN_DEPTH' ? '1400-2000' : '800-1200';
  const prompt = `
You are the senior content editor and SEO strategist for TallyPadi, a WhatsApp and web business-management platform for SMEs.

Create a genuinely useful, accurate blog draft from the supplied editorial brief. The result must sound human, practical, specific, and easy to edit. Never invent statistics, customer claims, product capabilities, laws, prices, or external sources. Avoid keyword stuffing, repetitive introductions, fake quotations, and generic AI phrases.

Treat the TallyPadi fact sheet below as authoritative. Select only facts relevant to the article; do not dump the entire fact sheet into the draft. The editorial brief controls the topic and emphasis, but it must not cause you to invent or exaggerate product claims.

<tallypadi_fact_sheet>
${TALLYPADI_EDITORIAL_KNOWLEDGE}
</tallypadi_fact_sheet>

SEO requirements:
- Match the likely search intent and answer the main question early.
- Use one clear H1 title (returned as title), then logical H2/H3 heading blocks.
- Naturally use the primary keyword and close variants.
- Produce ${targetWords} words unless the brief calls for less.
- Include actionable lists, short paragraphs, and a concise conclusion.
- Use plain text inside blocks. Do not put Markdown headings, Markdown links, or HTML inside paragraph text.
- Add 2-4 useful internal links using button blocks with descriptive labels. Only use these verified paths:
  /, /register, /login, /marketplace, /blog, /whatsapp-receipt-generator,
  /free-invoice-generator, /inventory-stock-management, /sales-tracking-ledger,
  /accounts-receivable-debtors-tracking, /product-catalog-shop-link-generator,
  /best-way-to-grow-business, /about, /contact, /faq
- External links are allowed only when the brief explicitly supplies the URL. Never invent an external URL.
- Meta title: maximum 60 characters. Meta description: 140-160 characters.
- Slug must be short, lowercase, and hyphenated.
- Canonical URL must be https://tallypadi.com/blog/{slug}.
- Suggest meaningful cover-image alt text. Do not invent an image URL.
- Add one empty image block only when an illustration materially improves the article; give it useful alt text and a caption describing what the admin should upload.

Return JSON only in exactly this shape:
{
  "title": "",
  "slug": "",
  "excerpt": "",
  "coverImage": "",
  "coverImageAlt": "",
  "category": "",
  "tags": [""],
  "authorName": "TallyPadi Team",
  "status": "DRAFT",
  "contentBlocks": [
    { "type": "heading|paragraph|list|quote|callout|divider|button|image", "text": "", "level": 2, "items": [], "href": "", "label": "", "imageUrl": "", "alt": "", "caption": "", "fontSize": "base", "align": "left" }
  ],
  "seo": {
    "metaTitle": "",
    "metaDescription": "",
    "keywords": [""],
    "canonicalUrl": "",
    "ogImage": "",
    "noIndex": false
  }
}

Primary keyword: ${sanitizeInput(request.primaryKeyword || 'Choose the most relevant phrase from the brief').slice(0, 160)}
Audience: ${sanitizeInput(request.audience || 'Small and growing business owners in Nigeria and Africa').slice(0, 300)}
Tone: ${sanitizeInput(request.tone || 'Clear, trustworthy, practical and conversational').slice(0, 160)}

<editorial_brief>
${brief}
</editorial_brief>
`;

  const result = await withTimeout(ai.interactions.create({
    model: env.geminiModel as any,
    input: prompt,
    store: false,
    stream: false,
  }), 120000);
  const responseText = (result as any).output_text || '';
  if (!responseText) throw new Error('AI returned an empty article');
  const draft = JSON.parse(extractJsonObject(responseText)) as Record<string, unknown>;
  return assertSafeTallyPadiDraft(draft);
};
