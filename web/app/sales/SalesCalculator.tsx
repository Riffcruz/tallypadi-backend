'use client';

import React, { useMemo, useState } from 'react';
import { Calculator, ChevronDown, Delete, RotateCcw } from 'lucide-react';
import { CartItem } from './page';

type ActiveField = 'qty' | 'price';
type CalculatorDraft = { itemId: string; qty: string; price: string };

interface SalesCalculatorProps {
  cart: CartItem[];
  currencyCode?: string;
  locale?: string;
  discountAmount: number;
  onApplyQty: (itemId: string, quantity: number) => void;
  onApplyPrice: (itemId: string, price: number) => void;
  onApplyBoth: (itemId: string, quantity: number, price: number) => void;
  onApplyDiscount: (amount: number) => void;
}

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '00', '.'];

const parseQuantity = (value: string) => Math.max(1, Math.floor(Number(value) || 1));
const parsePrice = (value: string) => Math.max(0, Number(value) || 0);
const itemQtyBuffer = (item: CartItem) => String(Math.max(1, Math.floor(item.sellQty || 1)));
const itemPriceBuffer = (item: CartItem) => String(Math.max(0, Number(item.sellPrice || item.price || 0)));

export default function SalesCalculator({
  cart,
  currencyCode,
  locale,
  discountAmount,
  onApplyQty,
  onApplyPrice,
  onApplyBoth,
  onApplyDiscount,
}: SalesCalculatorProps) {
  const [open, setOpen] = useState(false);
  const [activeField, setActiveField] = useState<ActiveField>('qty');
  const [draft, setDraft] = useState<CalculatorDraft | null>(null);

  const latestItem = cart[cart.length - 1] || null;
  const draftItemExists = Boolean(draft?.itemId && cart.some((item) => item.id === draft.itemId));
  const selectedItemId = draftItemExists ? draft!.itemId : latestItem?.id || '';

  const selectedItem = useMemo(
    () => cart.find((item) => item.id === selectedItemId) || null,
    [cart, selectedItemId]
  );

  const qtyBuffer = draftItemExists && draft?.itemId === selectedItemId ? draft.qty : selectedItem ? itemQtyBuffer(selectedItem) : '1';
  const priceBuffer = draftItemExists && draft?.itemId === selectedItemId ? draft.price : selectedItem ? itemPriceBuffer(selectedItem) : '0';

  const quantity = parseQuantity(qtyBuffer);
  const price = parsePrice(priceBuffer);
  const amount = quantity * price;

  const formatMoney = (value: number) =>
    new Intl.NumberFormat(locale || 'en-NG', {
      style: 'currency',
      currency: currencyCode || 'NGN',
      maximumFractionDigits: 0,
    }).format(Number(value || 0));

  const appendKey = (key: string) => {
    if (!selectedItem) return;

    if (activeField === 'qty') {
      if (key === '.') return;
      const next = `${qtyBuffer === '0' ? '' : qtyBuffer}${key}`.replace(/[^\d]/g, '').slice(0, 5) || '1';
      setDraft({
        itemId: selectedItem.id,
        qty: next,
        price: priceBuffer,
      });
      return;
    }

    if (key === '.' && priceBuffer.includes('.')) return;
    const nextRaw = `${priceBuffer === '0' && key !== '.' ? '' : priceBuffer}${key}`;
    const cleaned = nextRaw.replace(/[^\d.]/g, '');
    const [whole, decimal] = cleaned.split('.');
    const next = decimal !== undefined ? `${whole || '0'}.${decimal.slice(0, 2)}`.slice(0, 12) : (whole || '0').slice(0, 10);
    setDraft({
      itemId: selectedItem.id,
      qty: qtyBuffer,
      price: next,
    });
  };

  const backspace = () => {
    if (!selectedItem) return;

    if (activeField === 'qty') {
      setDraft({
        itemId: selectedItem.id,
        qty: qtyBuffer.slice(0, -1) || '1',
        price: priceBuffer,
      });
      return;
    }
    setDraft({
      itemId: selectedItem.id,
      qty: qtyBuffer,
      price: priceBuffer.slice(0, -1) || '0',
    });
  };

  const clearActive = () => {
    if (!selectedItem) return;
    setDraft({
      itemId: selectedItem.id,
      qty: activeField === 'qty' ? '1' : qtyBuffer,
      price: activeField === 'price' ? '0' : priceBuffer,
    });
  };

  const syncFromSelectedItem = () => {
    if (!selectedItem) return;
    setDraft({
      itemId: selectedItem.id,
      qty: itemQtyBuffer(selectedItem),
      price: itemPriceBuffer(selectedItem),
    });
  };

  const canApply = Boolean(selectedItem);

  return (
    <div className="border-b border-slate-200/70 bg-white">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-slate-50 transition-colors"
        aria-expanded={open}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-700">
            <Calculator className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black text-slate-900">Quick calculator</span>
            <span className="block truncate text-[11px] font-bold text-slate-500">
              {selectedItem ? `${quantity} x ${formatMoney(price)} = ${formatMoney(amount)}` : 'Add an item to calculate'}
            </span>
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/70 px-4 py-4">
          <div className="grid grid-cols-1 gap-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cart item</label>
            <select
              value={selectedItemId}
              onChange={(event) => {
                const item = cart.find((candidate) => candidate.id === event.target.value);
                setDraft(item ? { itemId: item.id, qty: itemQtyBuffer(item), price: itemPriceBuffer(item) } : null);
              }}
              disabled={cart.length === 0}
              className="min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-extrabold text-slate-800 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 disabled:text-slate-400"
            >
              {cart.length === 0 ? (
                <option value="">No cart item</option>
              ) : (
                cart.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setActiveField('qty')}
              className={`rounded-2xl border px-3 py-2 text-left transition ${
                activeField === 'qty' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <span className="block text-[10px] font-black uppercase tracking-widest opacity-70">Qty</span>
              <span className="block truncate text-lg font-black tabular-nums">{quantity}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveField('price')}
              className={`rounded-2xl border px-3 py-2 text-left transition ${
                activeField === 'price' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <span className="block text-[10px] font-black uppercase tracking-widest opacity-70">Unit price</span>
              <span className="block truncate text-lg font-black tabular-nums">{formatMoney(price)}</span>
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Amount</p>
                <p className="text-2xl font-black tracking-tight text-slate-950 tabular-nums">{formatMoney(amount)}</p>
              </div>
              {discountAmount > 0 && (
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Discount</p>
                  <p className="text-sm font-black text-red-600">{formatMoney(discountAmount)}</p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => appendKey(key)}
                className="h-11 rounded-2xl border border-slate-200 bg-white text-base font-black text-slate-900 shadow-sm transition hover:bg-slate-100 active:scale-[0.98]"
              >
                {key}
              </button>
            ))}
            <button
              type="button"
              onClick={clearActive}
              className="h-11 rounded-2xl border border-slate-200 bg-white text-xs font-black uppercase tracking-wider text-slate-600 shadow-sm transition hover:bg-slate-100"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={backspace}
              className="h-11 rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-100"
              aria-label="Backspace"
            >
              <Delete className="mx-auto h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={syncFromSelectedItem}
              disabled={!selectedItem}
              className="h-11 rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:opacity-50"
              aria-label="Reset to item values"
            >
              <RotateCcw className="mx-auto h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!canApply}
              onClick={() => onApplyQty(selectedItemId, quantity)}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-black text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
            >
              Apply Qty
            </button>
            <button
              type="button"
              disabled={!canApply}
              onClick={() => onApplyPrice(selectedItemId, price)}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-black text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
            >
              Apply Price
            </button>
            <button
              type="button"
              disabled={!canApply}
              onClick={() => onApplyBoth(selectedItemId, quantity, price)}
              className="rounded-2xl bg-slate-900 px-3 py-2.5 text-xs font-black text-white transition hover:bg-black disabled:opacity-50"
            >
              Apply Both
            </button>
            <button
              type="button"
              disabled={!canApply}
              onClick={() => onApplyDiscount(amount)}
              className="rounded-2xl bg-emerald-600 px-3 py-2.5 text-xs font-black text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              Use As Discount
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
