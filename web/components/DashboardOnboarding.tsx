'use client';

import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Banknote,
  ClipboardList,
  FileText,
  Megaphone,
  Package,
  ReceiptText,
  Settings,
  ShoppingCart,
  Store,
  UserCog,
  Users,
  X,
} from 'lucide-react';

const steps = [
  {
    title: 'See how business is doing',
    text: 'Your sales, profit, stock and unpaid balances are always at the top of the dashboard.',
    icon: BarChart3,
  },
  {
    title: 'Add your products',
    text: 'Start in Product/Stocks. Add each product, selling price, cost price and available quantity.',
    icon: Package,
  },
  {
    title: 'Record sales',
    text: 'Open Sales, choose the products sold, enter payment details and complete the transaction.',
    icon: ShoppingCart,
  },
  {
    title: 'Generate customer receipts',
    text: 'After recording a sale, generate its receipt and share or print it for the customer.',
    icon: ReceiptText,
  },
  {
    title: 'Create invoices',
    text: 'Use Invoices to prepare a bill before payment, add customer details and share the finished invoice.',
    icon: FileText,
  },
  {
    title: 'Set up your online store',
    text: 'Open Online Store, choose your shop link and details, then publish the products customers should see.',
    icon: Store,
  },
  {
    title: 'Manage customer orders',
    text: 'Orders from your shop appear in Orders. Accept, decline and update them as you fulfil each request.',
    icon: ClipboardList,
  },
  {
    title: 'Keep customer records',
    text: 'Customers keeps names and contact details together so repeat sales and follow-up are easier.',
    icon: Users,
  },
  {
    title: 'Track money customers owe',
    text: 'Use Debtors to see unpaid balances, record repayments and know who still owes the business.',
    icon: Banknote,
  },
  {
    title: 'Record business expenses',
    text: 'Add rent, transport, supplies and other costs in Expenses so your net profit stays accurate.',
    icon: BarChart3,
  },
  {
    title: 'Promote products',
    text: 'Ads Manager lets you choose a product, set a budget and submit a promotion when you are ready.',
    icon: Megaphone,
  },
  {
    title: 'Give staff controlled access',
    text: 'Add staff accounts and choose exactly which parts of the business each person can use.',
    icon: UserCog,
  },
  {
    title: 'Finish your business setup',
    text: 'Use Settings for business details, currency and account preferences. The Guide is always available if you need help.',
    icon: Settings,
  },
];

export default function DashboardOnboarding({ userKey }: { userKey: string }) {
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);
  const storageKey = `tallypadi-dashboard-tour:v2:${userKey || 'account'}`;

  useEffect(() => {
    if (!localStorage.getItem(storageKey)) setOpen(true);
  }, [storageKey]);

  const finish = () => {
    localStorage.setItem(storageKey, 'done');
    setOpen(false);
  };

  if (!open) return null;
  const current = steps[step];
  const Icon = current.icon;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="Dashboard introduction">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-center justify-between">
          <div className="flex max-w-[80%] gap-1" aria-label={`Step ${step + 1} of ${steps.length}`}>
            {steps.map((item, index) => <span key={item.title} className={`h-1.5 rounded-full transition-all ${index === step ? 'w-6 bg-emerald-600' : index < step ? 'w-2 bg-emerald-200' : 'w-2 bg-slate-200'}`} />)}
          </div>
          <button onClick={finish} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Skip introduction"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><Icon className="h-7 w-7" /></div>
        <p className="mt-6 text-xs font-black uppercase tracking-widest text-emerald-700">Step {step + 1} of {steps.length}</p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">{current.title}</h2>
        <p className="mt-3 text-sm font-medium leading-6 text-slate-500">{current.text}</p>

        <div className="mt-8 flex items-center justify-between gap-3">
          <button onClick={finish} className="px-2 py-3 text-sm font-bold text-slate-500 hover:text-slate-900">Skip</button>
          <div className="flex gap-2">
            {step > 0 && <button onClick={() => setStep((value) => value - 1)} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700"><ArrowLeft className="h-4 w-4" /> Back</button>}
            <button onClick={() => step === steps.length - 1 ? finish() : setStep((value) => value + 1)} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700">
              {step === steps.length - 1 ? 'Start using TallyPadi' : 'Next'} {step < steps.length - 1 && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
