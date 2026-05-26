'use client';

import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calculator, Copy, Delete, Percent, X } from 'lucide-react';

interface SalesCalculatorProps {
  total: number;
  netTotal: number;
  discountAmount: number;
  currencyCode?: string;
  locale?: string;
  onApplyDiscount: (amount: number) => void;
}

type Operator = '+' | '-' | '×' | '÷';

const CALCULATOR_ROWS: Array<Array<string | Operator>> = [
  ['7', '8', '9', '÷'],
  ['4', '5', '6', '×'],
  ['1', '2', '3', '-'],
  ['00', '0', '.', '+'],
];
const QUICK_RECEIVED_MULTIPLIERS = [0, 500, 1000, 5000];

const toNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const compute = (left: number, operator: Operator, right: number) => {
  if (operator === '+') return left + right;
  if (operator === '-') return left - right;
  if (operator === '×') return left * right;
  if (operator === '÷') return right === 0 ? left : left / right;
  return right;
};

const normalizeDisplay = (value: number) => {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 100) / 100;
  return String(rounded).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
};

export default function SalesCalculator({
  total,
  netTotal,
  discountAmount,
  currencyCode,
  locale,
  onApplyDiscount,
}: SalesCalculatorProps) {
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState('0');
  const [storedValue, setStoredValue] = useState<number | null>(null);
  const [pendingOperator, setPendingOperator] = useState<Operator | null>(null);
  const [waitingForValue, setWaitingForValue] = useState(false);
  const [history, setHistory] = useState('');
  const [amountReceived, setAmountReceived] = useState('');
  const [copied, setCopied] = useState(false);

  const formatMoney = (value: number) =>
    new Intl.NumberFormat(locale || 'en-NG', {
      style: 'currency',
      currency: currencyCode || 'NGN',
      maximumFractionDigits: 0,
    }).format(Number(value || 0));

  const currentValue = toNumber(display);
  const receivedValue = toNumber(amountReceived);
  const changeDue = Math.max(0, receivedValue - netTotal);
  const balanceDue = Math.max(0, netTotal - receivedValue);

  const quickReceivedAmounts = useMemo(() => {
    const roundedTotal = Math.ceil(Math.max(0, netTotal) / 100) * 100;
    return QUICK_RECEIVED_MULTIPLIERS.map((extra) => roundedTotal + extra)
      .filter((amount, index, list) => amount > 0 && list.indexOf(amount) === index)
      .slice(0, 4);
  }, [netTotal]);

  const inputDigit = (digit: string) => {
    setCopied(false);
    if (waitingForValue) {
      setDisplay(digit === '.' ? '0.' : digit);
      setWaitingForValue(false);
      return;
    }

    if (digit === '.' && display.includes('.')) return;
    if (display === '0' && digit !== '.') {
      setDisplay(digit === '00' ? '0' : digit);
      return;
    }

    const next = `${display}${digit}`.replace(/^(-?)0+(\d)/, '$1$2');
    setDisplay(next.length > 14 ? display : next);
  };

  const chooseOperator = (operator: Operator) => {
    setCopied(false);
    if (storedValue === null) {
      setStoredValue(currentValue);
      setHistory(`${normalizeDisplay(currentValue)} ${operator}`);
    } else if (!waitingForValue && pendingOperator) {
      const result = compute(storedValue, pendingOperator, currentValue);
      setStoredValue(result);
      setDisplay(normalizeDisplay(result));
      setHistory(`${normalizeDisplay(result)} ${operator}`);
    } else {
      setHistory(`${normalizeDisplay(storedValue)} ${operator}`);
    }
    setPendingOperator(operator);
    setWaitingForValue(true);
  };

  const calculateResult = () => {
    setCopied(false);
    if (storedValue === null || !pendingOperator) return;
    const result = compute(storedValue, pendingOperator, currentValue);
    setHistory(`${normalizeDisplay(storedValue)} ${pendingOperator} ${normalizeDisplay(currentValue)} =`);
    setDisplay(normalizeDisplay(result));
    setStoredValue(null);
    setPendingOperator(null);
    setWaitingForValue(true);
  };

  const clearAll = () => {
    setDisplay('0');
    setStoredValue(null);
    setPendingOperator(null);
    setWaitingForValue(false);
    setHistory('');
    setCopied(false);
  };

  const backspace = () => {
    setCopied(false);
    if (waitingForValue) {
      setDisplay('0');
      setWaitingForValue(false);
      return;
    }
    setDisplay(display.length <= 1 || (display.length === 2 && display.startsWith('-')) ? '0' : display.slice(0, -1));
  };

  const toggleSign = () => {
    setCopied(false);
    if (display === '0') return;
    setDisplay(display.startsWith('-') ? display.slice(1) : `-${display}`);
  };

  const applyPercent = () => {
    setCopied(false);
    setDisplay(normalizeDisplay(currentValue / 100));
    setWaitingForValue(false);
  };

  const copyResult = async () => {
    try {
      await navigator.clipboard.writeText(display);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const setReceivedFromCalculator = () => {
    setAmountReceived(normalizeDisplay(Math.max(0, currentValue)));
  };

  const applyResultAsDiscount = () => {
    onApplyDiscount(Math.max(0, currentValue));
    setOpen(false);
  };

  const modal = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
        aria-label="Close calculator"
        onClick={() => setOpen(false)}
      />

      <div className="relative flex max-h-[92dvh] w-full max-w-[440px] min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/30">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-950 px-5 py-4 text-white">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-200 ring-1 ring-white/10">
              <Calculator className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-base font-black">POS Calculator</h3>
              <p className="truncate text-xs font-bold text-slate-300">Order total: {formatMoney(netTotal)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-slate-300 transition hover:bg-white/10 hover:text-white"
            aria-label="Close calculator"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="rounded-3xl border border-slate-200 bg-slate-950 p-4 text-white shadow-inner">
            <div className="min-h-5 text-right text-xs font-bold text-slate-400">{history || pendingOperator || ' '}</div>
            <div className="mt-1 min-w-0 truncate text-right text-4xl font-black tracking-tight tabular-nums">{display}</div>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2">
            <button type="button" onClick={clearAll} className="h-12 rounded-2xl bg-red-50 text-sm font-black text-red-700 ring-1 ring-red-100 transition hover:bg-red-100">
              C
            </button>
            <button type="button" onClick={toggleSign} className="h-12 rounded-2xl bg-slate-100 text-sm font-black text-slate-800 transition hover:bg-slate-200">
              +/-
            </button>
            <button type="button" onClick={applyPercent} className="flex h-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-800 transition hover:bg-slate-200" aria-label="Percent">
              <Percent className="h-4 w-4" />
            </button>
            <button type="button" onClick={backspace} className="flex h-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-800 transition hover:bg-slate-200" aria-label="Backspace">
              <Delete className="h-4 w-4" />
            </button>

            {CALCULATOR_ROWS.flat().map((key) => {
              const isOperator = ['÷', '×', '-', '+'].includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => (isOperator ? chooseOperator(key as Operator) : inputDigit(key))}
                  className={
                    isOperator
                      ? `h-12 rounded-2xl text-xl font-black shadow-sm transition active:scale-[0.98] ${
                          pendingOperator === key && waitingForValue
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-900 text-white hover:bg-black'
                        }`
                      : 'h-12 rounded-2xl border border-slate-200 bg-white text-lg font-black text-slate-950 shadow-sm transition hover:bg-slate-50 active:scale-[0.98]'
                  }
                >
                  {key}
                </button>
              );
            })}

            <button
              type="button"
              onClick={calculateResult}
              className="col-span-2 h-12 rounded-2xl bg-emerald-600 text-xl font-black text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98]"
            >
              =
            </button>
            <button
              type="button"
              onClick={copyResult}
              className="col-span-2 inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              <Copy className="h-4 w-4" />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {balanceDue > 0 ? 'Balance due' : 'Change due'}
                </p>
                <p className={`mt-1 text-2xl font-black tabular-nums ${balanceDue > 0 ? 'text-slate-900' : 'text-emerald-700'}`}>
                  {balanceDue > 0 ? formatMoney(balanceDue) : formatMoney(changeDue)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {balanceDue > 0 ? 'Still owed' : 'Give back'}
                </p>
                <p className="mt-1 text-xs font-black text-slate-500">Paid: {formatMoney(receivedValue)}</p>
              </div>
            </div>

            <div className="mt-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Amount received</label>
              <input
                type="number"
                min={0}
                value={amountReceived}
                onChange={(event) => setAmountReceived(event.target.value)}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-right text-lg font-black text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                placeholder="0"
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {quickReceivedAmounts.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setAmountReceived(String(amount))}
                  className="rounded-2xl border border-slate-200 bg-white px-2 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-100"
                >
                  {formatMoney(amount)}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={setReceivedFromCalculator}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
            >
              Use Result As Paid
            </button>
            <button
              type="button"
              onClick={applyResultAsDiscount}
              className="rounded-2xl bg-slate-900 px-3 py-3 text-xs font-black text-white transition hover:bg-black"
            >
              Use Result As Discount
            </button>
          </div>

          {discountAmount > 0 && (
            <div className="mt-3 space-y-2 rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-black text-red-700">
              <div className="flex items-center justify-between">
                <span>Subtotal</span>
                <span>{formatMoney(total)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Current discount</span>
                <span>{formatMoney(discountAmount)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="border-b border-slate-200/70 bg-white px-5 py-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-left text-emerald-900 transition hover:bg-emerald-100"
        >
          <span className="inline-flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm">
              <Calculator className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-black">Quick POS Calculator</span>
              <span className="block truncate text-[11px] font-bold text-emerald-700/80">
                Change, discount, quick math
              </span>
            </span>
          </span>
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white">
            <Calculator className="h-4 w-4" />
          </span>
        </button>
      </div>

      {open && typeof document !== 'undefined' ? createPortal(modal, document.body) : null}
    </>
  );
}
