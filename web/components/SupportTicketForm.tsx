'use client';

import Script from 'next/script';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Send } from 'lucide-react';

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

const initialForm = {
  name: '',
  email: '',
  phone: '',
  category: 'ACCOUNT',
  subject: '',
  message: '',
  website: '',
};

const categories = [
  ['ACCOUNT', 'Account'],
  ['BILLING', 'Billing & subscription'],
  ['TECHNICAL', 'Technical issue'],
  ['MARKETPLACE', 'Marketplace'],
  ['ADS', 'Ads'],
  ['PRIVACY', 'Privacy'],
  ['OTHER', 'Other'],
] as const;

export default function SupportTicketForm() {
  const captchaContainer = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [captchaToken, setCaptchaToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');

  const renderCaptcha = useCallback(() => {
    if (!SITE_KEY || !window.turnstile || !captchaContainer.current || widgetId.current) return;
    widgetId.current = window.turnstile.render(captchaContainer.current, {
      sitekey: SITE_KEY,
      action: 'support_ticket',
      theme: 'light',
      size: 'flexible',
      callback: (token: string) => {
        setCaptchaToken(token);
        setError('');
      },
      'expired-callback': () => setCaptchaToken(''),
      'error-callback': () => {
        setCaptchaToken('');
        setError('Security check could not load. Please refresh and try again.');
      },
    });
  }, []);

  const resetCaptcha = useCallback(() => {
    setCaptchaToken('');
    if (window.turnstile && widgetId.current) window.turnstile.reset(widgetId.current);
  }, []);

  useEffect(() => {
    renderCaptcha();
    return () => {
      if (window.turnstile && widgetId.current) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [renderCaptcha]);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!captchaToken) {
      setError('Complete the security check before sending.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/public/contact-tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, turnstileToken: captchaToken }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Your message could not be sent.');

      setTicketNumber(String(data.ticketNumber || ''));
      setForm(initialForm);
      resetCaptcha();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Your message could not be sent.');
      resetCaptcha();
    } finally {
      setSubmitting(false);
    }
  };

  if (ticketNumber) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-white p-7 sm:p-9 shadow-sm">
        <CheckCircle2 className="text-emerald-600" size={38} />
        <h2 className="mt-5 text-2xl font-black text-stone-950">Ticket received</h2>
        <p className="mt-2 text-stone-600">Your ticket number is <strong className="text-stone-950">{ticketNumber}</strong>.</p>
        <button
          type="button"
          onClick={() => setTicketNumber('')}
          className="mt-6 rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-bold text-stone-800 hover:border-emerald-500"
        >
          Send another message
        </button>
      </div>
    );
  }

  const inputClass = 'mt-2 w-full rounded-lg border border-stone-300 bg-white px-4 py-3 text-stone-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100';

  return (
    <form onSubmit={submit} className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-8 shadow-sm">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-bold text-stone-800">
          Name
          <input required minLength={2} maxLength={100} autoComplete="name" value={form.name} onChange={(e) => updateField('name', e.target.value)} className={inputClass} />
        </label>
        <label className="text-sm font-bold text-stone-800">
          Email
          <input required type="email" maxLength={254} autoComplete="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} className={inputClass} />
        </label>
        <label className="text-sm font-bold text-stone-800">
          Phone <span className="font-normal text-stone-500">(optional)</span>
          <input type="tel" maxLength={30} autoComplete="tel" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} className={inputClass} />
        </label>
        <label className="text-sm font-bold text-stone-800">
          Help with
          <select value={form.category} onChange={(e) => updateField('category', e.target.value)} className={inputClass}>
            {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>

      <label className="mt-5 block text-sm font-bold text-stone-800">
        Subject
        <input required minLength={5} maxLength={160} value={form.subject} onChange={(e) => updateField('subject', e.target.value)} className={inputClass} />
      </label>
      <label className="mt-5 block text-sm font-bold text-stone-800">
        Message
        <textarea required minLength={20} maxLength={5000} rows={6} value={form.message} onChange={(e) => updateField('message', e.target.value)} className={`${inputClass} resize-y`} />
      </label>

      <label className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        Website
        <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => updateField('website', e.target.value)} />
      </label>

      <div className="mt-5 min-h-[65px]">
        {SITE_KEY ? (
          <>
            <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onLoad={renderCaptcha} />
            <div ref={captchaContainer} />
          </>
        ) : (
          <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">Security verification is not configured.</p>
        )}
      </div>

      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={submitting || !SITE_KEY}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-3.5 font-black text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {submitting ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
        {submitting ? 'Sending…' : 'Submit ticket'}
      </button>
    </form>
  );
}
