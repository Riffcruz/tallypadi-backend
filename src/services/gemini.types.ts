// ============================================================
// gemini.types.ts — All shared types for the Gemini pipeline
// ============================================================

export type ParsedIntent =
  | 'SALE'
  | 'RESTOCK'
  | 'SET_STOCK'
  | 'DELETED_STOCK'
  | 'DELETE_ALL_INVENTORY'
  | 'DEFINE_PRICE'
  | 'PRICE_CHECK'
  | 'REPORT_SALES'
  | 'REPORT_STOCK'
  | 'REPORT_FULL'
  | 'SETTINGS'
  | 'CHANGE_LANGUAGE'
  | 'DEBT_PAYMENT'
  | 'CLOSE_BOOK'
  | 'ADD_STAFF'
  | 'DOWNLOAD_REPORT'
  | 'UNDO_LAST_SALE'
  | 'REPORT_DEBTS'
  | 'REPORT_RECENT'
  | 'SHOW_SETTINGS'
  | 'CREATE_ORDER'
  | 'LIST_ORDERS'
  | 'UPDATE_ORDER'
  | 'CANCEL_ORDER'
  | 'GET_SHOP_LINK'
  | 'HQ_DASHBOARD'
  | 'HQ_COMPARE_BRANCHES'
  | 'HQ_STOCK_TRANSFER'
  | 'CREATE_INVOICE'
  | 'UPDATE_BANK_DETAILS'
  | 'EXPENSE'
  | 'REPORT_EXPENSE'
  | 'BEST_SELLING'
  | 'COMPARE_SALES'
  | 'HELP'
  | 'UNKNOWN';

export interface ParsedItem {
  name: string;
  qty: number;
  unit_price: number | null;
  cost_price?: number | null;
  unit?: string;
  category?: string | null;
}

export interface ParsedResult {
  intent: ParsedIntent;
  is_credit: boolean;
  customer_name?: string;
  staffPhoneNumber?: string;
  staffName?: string;
  items: ParsedItem[];
  total_money: number | null;
  amount_paid?: number | null;
  discount_amount?: number | null;
  confidence_score?: number;
  needs_clarification?: boolean;
  report_params: {
    start_date: string | null;
    end_date: string | null;
    category_filter?: string | null;
    include_undone?: boolean;
    compare_start_date?: string | null;
    compare_end_date?: string | null;
  };
  expense_params?: {
    category: string | null;
    description: string | null;
  };
  order_params?: {
    description: string | null;
    delivery_date: string | null;
    status: string | null;
  };
  transfer_params?: {
    from_branch: string | null;
    to_branch: string | null;
  };
  bank_details?: {
    bank_name: string | null;
    account_number: string | null;
    account_name: string | null;
  };
  settings_update: { key: string | null; value: string | boolean | null };
  reply_text: string;
}

// Lightweight inventory snapshot sent to the AI for context (capped at 50 items)
export interface InventorySnapshotItem {
  name: string;
  qty: number;
  price?: number;
  category?: string;
}
