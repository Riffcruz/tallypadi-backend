// Local onboarding and menu copy. This module must not import an AI client.
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


export const WHATSAPP_HELP_TEXT = `🤖 *TallyPadi Help*\n\n• Record sales: Sold 2 rice at 5000 each\n• Add stock: Add 20 sneakers\n• Record expenses: Spent 5000 on fuel\n• Create a receipt: Receipt for Ada\n\nUse the menu buttons for more actions, or visit https://tallypadi.com/help.`;
