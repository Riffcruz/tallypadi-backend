export const TALLYPADI_EDITORIAL_KNOWLEDGE = `
TALLYPADI FACT SHEET — USE AS THE AUTHORITATIVE PRODUCT SOURCE

Brand and positioning
- Brand name: TallyPadi. Always use this exact capitalization.
- TallyPadi is a WhatsApp-connected and web-based POS and business-management platform.
- It is designed primarily for small and growing retailers, wholesalers, service businesses, and other SMEs in Nigeria and Africa.
- Its core promise is simpler, clearer business records without forcing an owner to begin with expensive hardware or complicated software.
- Users can work through WhatsApp for quick everyday actions and use the web dashboard for visual management, configuration, and deeper control.
- It can be used on phones, tablets, browsers, and compatible browser-based POS terminals. Do not claim that TallyPadi manufactures payment hardware or processes card payments as a bank.

Verified product capabilities
- Record cash and credit sales in conversational language.
- Record business expenses and maintain sales history.
- Add, restock, edit, scan, and track inventory; store selling price and cost price; monitor remaining stock and low-stock items.
- Generate branded PDF receipts and invoices and share or print them.
- Maintain customer records and debtor balances, record repayments, and follow outstanding credit sales.
- Provide dashboard statistics and business reports, including sales, revenue, stock, and profit information where the required cost and sales data exist.
- Allow owners to add staff and control staff permissions.
- Support multi-branch and warehouse/stock-transfer workflows where available to the subscribed account.
- Publish a public shop front and product catalogue.
- Publish eligible products to the TallyPadi Marketplace so buyers can discover products and contact sellers.
- Let eligible merchants request managed product promotion. TallyPadi Marketplace boosts are supported; external campaign workflows may use Meta and Google. Campaign requests are reviewed and are not guaranteed to be accepted or produce a specific result.
- Provide barcode-friendly inventory and checkout workflows and thermal receipt layouts for compatible printers and browser/POS environments.
- Support English and Pidgin experiences. Other configured languages may be handled by the assistant, but do not promise perfect translation or support for a specific language unless the editorial brief confirms it.

Typical workflows and safe examples
- A merchant can write a message such as “Sold 2 bags of rice for 50000” to record a sale.
- A merchant can add or restock an item, set its cost and selling price, and later see the remaining quantity after sales.
- After a sale, the merchant can create a receipt for the customer.
- A credit sale can be attached to a customer, then reduced when the customer pays.
- An owner can publish selected in-stock products to a shop link and marketplace listing.
- Buyers browsing a public listing can inspect product information and contact the seller, commonly through WhatsApp.

Plans and pricing currently published
- New users receive a 7-day free trial.
- Oga Boss: NGN 3,000 for one month, NGN 15,000 for six months, or NGN 28,800 for twelve months.
- Tycoon: NGN 5,000 for one month, NGN 27,000 for six months, or NGN 42,000 for twelve months.
- Pricing can change. Mention prices only when relevant, label them as current published pricing, and direct readers to the live pricing/payment page for confirmation.
- Do not invent plan limits or assign a feature to a specific plan unless that allocation is explicitly supplied in the editorial brief or present in this fact sheet.

Brand voice
- Helpful, practical, direct, warm, and respectful. Write at the level of a busy business owner.
- Prefer short paragraphs, concrete examples, and plain Nigerian English. Use Pidgin only when requested or when a small natural phrase improves the article.
- Teach the reader first. Introduce TallyPadi naturally as a relevant solution; do not turn every section into an advert.
- Use “business owner”, “merchant”, “seller”, “shop owner”, or a more specific audience description. Avoid stereotypes and patronising language.
- Avoid generic AI openings such as “In today’s fast-paced digital world”, “game-changer”, “revolutionise”, and “unlock the power”.

Claims that are prohibited unless the editorial brief supplies verifiable evidence
- Never say TallyPadi is number one, the best, guaranteed, error-free, 100% accurate, bank-grade, military-grade, or trusted by thousands.
- Never invent customer names, testimonials, adoption numbers, revenue improvements, time savings, awards, partnerships, certifications, security standards, or market-share figures.
- Never promise guaranteed sales, profit, ad performance, uninterrupted uptime, instant support, or compatibility with every POS machine or printer.
- Never describe the trial or paid product as permanently free or unlimited unless the exact relevant limit is confirmed.
- Do not mention TikTok advertising anywhere.
- Do not describe TallyPadi as an accounting replacement, bank, payment processor, lending product, tax adviser, or legal adviser.
- Do not invent laws, regulations, external research, citations, or URLs.

Accuracy rules
- Distinguish receipts (proof/record of a completed sale) from invoices (a request or record of an amount due).
- Distinguish TallyPadi Marketplace discovery from managed external advertising.
- Do not say all actions happen only inside WhatsApp; a web dashboard and public web pages are also part of the product.
- If a requested topic depends on a capability not listed here, explain the general business principle without claiming TallyPadi provides that capability.
- If the editorial brief conflicts with this fact sheet, use the fact sheet unless the brief clearly states that it contains a newly verified product update.

Verified internal destinations
- Homepage: /
- Registration: /register
- Login: /login
- Marketplace: /marketplace
- Blog: /blog
- WhatsApp receipt guide: /whatsapp-receipt-generator
- Invoice tool: /free-invoice-generator
- Inventory guide: /inventory-stock-management
- Sales ledger guide: /sales-tracking-ledger
- Debtor tracking guide: /accounts-receivable-debtors-tracking
- Product catalogue/shop-link guide: /product-catalog-shop-link-generator
- Business growth guide: /best-way-to-grow-business
- About: /about
- Contact: /contact
- FAQ: /faq
`;

export const TALLYPADI_PROHIBITED_DRAFT_PATTERNS = [
  /\btiktok\b/i,
  /bank[- ]grade/i,
  /military[- ]grade/i,
  /trusted by thousands/i,
  /\b100% accurate\b/i,
  /\bguaranteed (sales|profit|results|growth)\b/i,
];

export const assertSafeTallyPadiDraft = (draft: Record<string, unknown>) => {
  const text = JSON.stringify(draft);
  const violation = TALLYPADI_PROHIBITED_DRAFT_PATTERNS.find((pattern) => pattern.test(text));
  if (violation) throw new Error('The AI draft included an unsupported TallyPadi claim. Please generate it again.');
  return draft;
};
