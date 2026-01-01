'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  ChevronDown, 
  ChevronUp, 
  MessageSquare, 
  Plus, 
  DollarSign, 
  FileText, 
  Users 
} from 'lucide-react';

export default function FAQPage() {
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
          <h1 className="text-3xl md:text-4xl font-heading font-bold text-slate-900 mb-4">How can we help you?</h1>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto">
            Everything you need to know about using Tallypadi to manage your business.
          </p>
        </div>

        {/* --- USER GUIDE SECTION --- */}
        <div className="mb-20">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-8 w-1 bg-green-500 rounded-full"></div>
            <h2 className="text-2xl font-heading font-bold text-slate-900">Quick Start Guide</h2>
          </div>

          <div className="grid gap-6">
            
            {/* Command Card 1: Registration */}
            <GuideCard 
              icon={<MessageSquare size={24} />}
              title="1. How to Register"
              color="blue"
              steps={[
                "Save our number and send 'Hello' on WhatsApp.",
                "The bot will ask for your email address to link your account.",
                "Set a secure password when prompted.",
                "Done! Your shop is created automatically using your WhatsApp name."
              ]}
            />

            {/* Command Card 2: Adding Stock */}
            <GuideCard 
              icon={<Plus size={24} />}
              title="2. Adding Inventory"
              color="green"
              description="Tell the bot what you have in your shop. You must add stock before you can sell it."
              commands={[
                { cmd: "Add 50 bags of Rice at 40k", desc: "Adds 50 items with a unit cost of 40,000" },
                { cmd: "Restock 20 Coke", desc: "Adds more quantity to an existing item" },
                { cmd: "Set price of Rice to 45000", desc: "Updates the selling price (optional)" }
              ]}
            />

            {/* Command Card 3: Recording Sales */}
            <GuideCard 
              icon={<DollarSign size={24} />}
              title="3. Recording Sales"
              color="purple"
              description="Record sales immediately as they happen. The bot calculates totals and profit."
              commands={[
                { cmd: "Sold 2 bags of Rice", desc: "Records a cash sale" },
                { cmd: "Sold 5 Coke for 1000", desc: "Records sale with a specific total amount" },
                { cmd: "Sold 1 Rice on credit to Mama Chinedu", desc: "Records a debt/credit sale" }
              ]}
            />

            {/* Command Card 4: Reports */}
            <GuideCard 
              icon={<FileText size={24} />}
              title="4. Checking Reports"
              color="orange"
              description="Ask the bot for your business performance at any time."
              commands={[
                { cmd: "How much did I make today?", desc: "Shows today's total sales and profit" },
                { cmd: "Show me my stock", desc: "Lists all items currently in inventory" },
                { cmd: "Generate receipt for John", desc: "Creates a PDF receipt for the last sale" }
              ]}
            />

            {/* Command Card 5: Staff (Tycoon Only) */}
            <GuideCard 
              icon={<Users size={24} />}
              title="5. Managing Staff (Tycoon Plan)"
              color="red"
              description="Owners on the Tycoon plan can let staff sell from their own WhatsApp."
              commands={[
                { cmd: "Add staff 08012345678", desc: "Links a staff member's phone number to your shop" },
                { cmd: "Remove staff 08012345678", desc: "Revokes access for a staff member" }
              ]}
            />

          </div>
        </div>

        {/* --- FAQ SECTION --- */}
        <div>
          <div className="flex items-center gap-3 mb-8">
            <div className="h-8 w-1 bg-slate-900 rounded-full"></div>
            <h2 className="text-2xl font-heading font-bold text-slate-900">Frequently Asked Questions</h2>
          </div>

          <div className="space-y-4">
            <FAQItem 
              question="Is Tallypadi free to use?" 
              answer="We offer a free trial for 7 days (Oga Boss Plan). After that, you can choose to subscribe to the Oga Boss plan for basic features or the Tycoon Plan for advanced features like Staff Management and PDF Reports." 
            />
            <FAQItem 
              question="Do I need to download an app?" 
              answer="No! Tallypadi works entirely inside WhatsApp. You only need the website dashboard if you want to see detailed charts or export your data to Excel." 
            />
            <FAQItem 
              question="What happens if I don't renew my subscription?" 
              answer="Your data is safe, but the bot will stop responding to new commands. You will have 'Read Only' access via the web dashboard until you renew." 
            />
            <FAQItem 
              question="Can I use Tallypadi for multiple shops?" 
              answer="Currently, one phone number is linked to one shop inventory. To manage multiple shops, you would need to register different phone numbers for each shop." 
            />
            <FAQItem 
              question="How is my data secured?" 
              answer="We use bank-level encryption for all your data. Your sales records are private and can only be accessed by you and the staff you explicitly authorize." 
            />
          </div>
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

const GuideCard = ({ icon, title, steps, commands, color, description }: any) => {
  const colorClasses: any = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    green: "bg-green-50 text-green-600 border-green-100",
    purple: "bg-purple-50 text-purple-600 border-purple-100",
    orange: "bg-orange-50 text-orange-600 border-orange-100",
    red: "bg-red-50 text-red-600 border-red-100",
  };

  return (
    <div className={`p-6 md:p-8 rounded-3xl border ${colorClasses[color]} bg-opacity-50`}>
      <div className="flex items-center gap-4 mb-4">
        <div className={`p-3 rounded-xl bg-white shadow-sm ${colorClasses[color].split(' ')[1]}`}>
          {icon}
        </div>
        <h3 className="text-xl font-bold text-slate-900">{title}</h3>
      </div>

      {description && <p className="text-slate-600 mb-4">{description}</p>}

      {steps && (
        <ol className="list-decimal list-inside space-y-2 text-slate-700 font-medium">
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
                <th className="px-4 py-2 font-medium">Command to type</th>
                <th className="px-4 py-2 font-medium">What it does</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {commands.map((item: any, i: number) => (
                <tr key={i}>
                  <td className="px-4 py-3 font-mono text-slate-800 font-bold bg-slate-50/50">"{item.cmd}"</td>
                  <td className="px-4 py-3 text-slate-600">{item.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const FAQItem = ({ question, answer }: { question: string, answer: string }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-slate-200 rounded-2xl bg-white overflow-hidden transition-all duration-200 hover:shadow-md">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center p-5 text-left bg-white"
      >
        <span className="font-bold text-slate-800 text-lg">{question}</span>
        {isOpen ? <ChevronUp className="text-green-500" /> : <ChevronDown className="text-slate-400" />}
      </button>
      
      <div className={`px-5 text-slate-600 leading-relaxed overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-48 pb-5 opacity-100' : 'max-h-0 opacity-0'}`}>
        {answer}
      </div>
    </div>
  );
};