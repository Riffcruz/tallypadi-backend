'use client';

import React from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  BookOpen,
  ShoppingCart,
  Package,
  Users,
  BarChart3,
  Settings,
  Shield,
  CreditCard,
  MessageCircle,
  FileText,
  TrendingUp,
  Globe
} from 'lucide-react';

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-600">
      {/* Header */}
      <nav className="bg-white shadow-sm w-full z-50 sticky top-0 border-b border-slate-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition group">
              <div className="bg-green-100 p-2 rounded-full group-hover:bg-green-200 transition">
                <ArrowLeft className="text-green-600" size={20} />
              </div>
              <span className="font-heading font-bold text-lg tracking-tight text-slate-900">Back to Tallypadi</span>
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        
        {/* Page Title */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center p-3 bg-green-100 rounded-2xl mb-4 text-green-600">
            <BookOpen size={32} />
          </div>
          <h1 className="text-3xl md:text-4xl font-heading font-bold text-slate-900 mb-4">Documentation & Guide</h1>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto">
            Master Tallypadi with our comprehensive command reference. Learn how to manage your sales, inventory, and staff entirely from WhatsApp.
          </p>
        </div>

        {/* --- CONTENT SECTIONS --- */}
        <div className="space-y-12">

          {/* Section 1: Sales, Expenses & Finance */}
          <Section 
            title="Sales, Expenses & Finance" 
            description="Record every transaction instantly. Tallypadi handles sales, expenses, invoices, and profit calculations."
          >
            <GuideCard 
              icon={<ShoppingCart size={24} />}
              title="Recording Sales"
              color="green"
              commands={[
                { cmd: "Sold 2 bags of Rice", desc: "Standard sale using your saved price" },
                { cmd: "Sold 2 Rice for 5000", desc: "Override the price (e.g., gave a discount)" },
                { cmd: "Sold 3 Coke, 2 Fanta", desc: "Record multiple items at once" }
              ]}
            />
            <GuideCard 
              icon={<CreditCard size={24} />}
              title="Expenses"
              color="red"
              commands={[
                { cmd: "Spent 5000 on fuel", desc: "Record a business expense" },
                { cmd: "Transport 2000", desc: "Quick expense log" },
                { cmd: "Paid 10k for shop rent", desc: "Categorized expense" }
              ]}
            />
            <GuideCard 
              icon={<FileText size={24} />}
              title="Invoicing & Banking"
              color="indigo"
              commands={[
                { cmd: "Create invoice", desc: "Start an invoice generation flow" },
                { cmd: "Invoice for John", desc: "Generate invoice for a specific customer" },
                { cmd: "Update bank details", desc: "Save your bank info for invoices" }
              ]}
            />
            <GuideCard 
              icon={<Users size={24} />}
              title="Credit Sales & Debts"
              color="orange"
              commands={[
                { cmd: "Sold 2 Rice to Emeka on credit", desc: "Records sale but marks it as unpaid (debt)" },
                { cmd: "Emeka owes me 5000 for Rice", desc: "Alternative way to record a debt" },
                { cmd: "Emeka paid 5000", desc: "Record a debt payment/settlement" }
              ]}
            />
             <GuideCard 
              icon={<Shield size={24} />}
              title="Corrections"
              color="slate"
              commands={[
                { cmd: "Undo last sale", desc: "Immediately cancels the last recorded transaction" },
                { cmd: "Delete sales for today", desc: "Resets today's sales (Owner only - careful!)" }
              ]}
            />
          </Section>

          {/* Section 2: Inventory Management */}
          <Section 
            title="Inventory Management" 
            description="Keep your stock levels accurate. Tallypadi tracks quantity and cost price to calculate your profit."
          >
            <GuideCard 
              icon={<Package size={24} />}
              title="Stock & Pricing"
              color="blue"
              commands={[
                { cmd: "Restock 50 Rice", desc: "Adds 50 to existing stock level" },
                { cmd: "Restock 10 Rice at 20000", desc: "Adds stock and updates cost price for profit tracking" },
                { cmd: "Set stock of Rice to 20", desc: "Corrects the stock count exactly to 20" },
                { cmd: "Set price of Rice to 2500", desc: "Updates the selling price" }
              ]}
            />
            <GuideCard 
              icon={<MessageCircle size={24} />}
              title="Checking Items"
              color="purple"
              commands={[
                { cmd: "Price of Rice", desc: "Check current selling price" },
                { cmd: "How many Rice remain?", desc: "Check current stock level" },
                { cmd: "Stock report", desc: "Get a full list of all items and quantities" }
              ]}
            />
          </Section>

          {/* Section 3: Reports & Insights */}
          <Section 
            title="Reports & Insights" 
            description="Know your numbers. Get instant summaries of your business performance."
          >
            <GuideCard 
              icon={<BarChart3 size={24} />}
              title="Business Reports"
              color="indigo"
              commands={[
                { cmd: "How much did I make today?", desc: "Summary of sales, costs, and profit today" },
                { cmd: "Sales report yesterday", desc: "Get report for a specific day" },
                { cmd: "This week report", desc: "Summary for the current week" },
                { cmd: "Who owes me?", desc: "List of all debtors and amounts owed" }
              ]}
            />
            <GuideCard 
              icon={<TrendingUp size={24} />}
              title="Advanced Analytics"
              color="purple"
              commands={[
                { cmd: "Best selling product today", desc: "See top performing items" },
                { cmd: "Top selling items this week", desc: "Identify fast-moving products" },
                { cmd: "Compare sales this week and last week", desc: "Compare revenue across periods" },
                { cmd: "Compare today and yesterday", desc: "Daily performance check" }
              ]}
            />
          </Section>

          {/* Section 4: Settings & Administration */}
          <Section 
            title="Settings & Admin" 
            description="Configure your shop preferences and manage access."
          >
            <GuideCard 
              icon={<Globe size={24} />}
              title="Online Shop"
              color="blue"
              commands={[
                { cmd: "Get my shop link", desc: "Get your public storefront URL to share with customers" }
              ]}
            />
            <GuideCard 
              icon={<Users size={24} />}
              title="Staff Management (Tycoon Plan)"
              color="teal"
              commands={[
                { cmd: "Add staff 08012345678", desc: "Authorize a staff member's WhatsApp number" },
                { cmd: "Remove staff 08012345678", desc: "Revoke staff access" },
                { cmd: "List staff", desc: "See all authorized staff members" }
              ]}
            />
            <GuideCard 
              icon={<Settings size={24} />}
              title="General Settings"
              color="slate"
              commands={[
                { cmd: "Change language to Pidgin", desc: "Switch bot language (English/Pidgin)" },
                { cmd: "Set closing time to 8pm", desc: "Bot will send daily summary at this time" },
                { cmd: "Enable daily summary", desc: "Turn on automatic end-of-day reports" }
              ]}
            />
          </Section>

        </div>

      </div>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12 mt-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="font-medium">&copy; 2025 Tallypadi. All rights reserved.</p>
          <div className="flex justify-center gap-4 mt-4 text-sm">
             <Link href="/" className="hover:text-white transition">Home</Link>
             <span>•</span>
             <Link href="/login" className="hover:text-white transition">Login</Link>
             <span>•</span>
             <Link href="/policy" className="hover:text-white transition">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

// --- HELPER COMPONENTS ---

const Section = ({ title, description, children }: { title: string, description: string, children: React.ReactNode }) => (
  <div className="border-b border-slate-100 pb-12 last:border-0 last:pb-0">
    <div className="mb-8">
      <h2 className="text-2xl font-heading font-bold text-slate-900 mb-2">{title}</h2>
      <p className="text-slate-500">{description}</p>
    </div>
    <div className="grid gap-6">
      {children}
    </div>
  </div>
);

interface GuideCardProps {
  icon: React.ReactNode;
  title: string;
  steps?: string[];
  commands?: { cmd: string; desc: string }[];
  color?: string;
  description?: string;
}

const GuideCard = ({ icon, title, steps, commands, color, description }: GuideCardProps) => {
  const colorClasses: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    green: "bg-green-50 text-green-600 border-green-100",
    purple: "bg-purple-50 text-purple-600 border-purple-100",
    orange: "bg-orange-50 text-orange-600 border-orange-100",
    red: "bg-red-50 text-red-600 border-red-100",
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-100",
    teal: "bg-teal-50 text-teal-600 border-teal-100",
    slate: "bg-slate-50 text-slate-600 border-slate-200",
  };

  const selectedColor = colorClasses[color || 'slate'] || colorClasses.slate;

  return (
    <div className={`p-6 rounded-3xl border ${selectedColor} bg-opacity-50`}>
      <div className="flex items-center gap-4 mb-4">
        <div className={`p-3 rounded-xl bg-white shadow-sm ${selectedColor.split(' ')[1]}`}>
          {icon}
        </div>
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      </div>

      {description && <p className="text-slate-600 mb-4 text-sm">{description}</p>}

      {steps && (
        <ol className="list-decimal list-inside space-y-2 text-slate-700 font-medium text-sm">
          {steps.map((step: string, i: number) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}

      {commands && (
        <div className="bg-white rounded-xl overflow-hidden border border-slate-100 shadow-sm mt-4">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-4 py-2 font-medium w-1/2">Command</th>
                <th className="px-4 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {commands.map((item, i: number) => (
                <tr key={i}>
                  <td className="px-4 py-3 font-mono text-slate-800 font-bold bg-slate-50/50 text-xs sm:text-sm">"{item.cmd}"</td>
                  <td className="px-4 py-3 text-slate-600 text-xs sm:text-sm">{item.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};