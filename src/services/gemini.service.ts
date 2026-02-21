// ============================================================
// gemini.service.ts — Re-export barrel (backward-compatible)
//
// The original 1,531-line file has been split into:
//   gemini.types.ts   — All shared types
//   gemini.parsers.ts — Utility functions, normalizers, fallback parser
//   gemini.prompt.ts  — System prompt builder (660 lines)
//   gemini.ai.ts      — Gemini model, retry, guidance, parseMessageWithGemini
//
// All existing imports from this file continue to work unchanged.
// ============================================================

export type { ParsedIntent, ParsedItem, ParsedResult, InventorySnapshotItem } from './gemini.types';

export {
  SAFE_MAX,
  stripWhatsAppExportLine,
  sanitizeInput,
  extractJsonObject,
  normalizePhone,
  detectMoneySymbol,
  parseMoney,
  normalizeItemName,
  computeTotalFromItems,
  safeParsedResult,
  fallbackParse,
} from './gemini.parsers';

export { default as getSystemPrompt } from './gemini.prompt';

export {
  generateGuidanceMessage,
  generateWelcomeMessage,
  parseMessageWithGemini,
} from './gemini.ai';
