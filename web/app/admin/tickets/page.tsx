'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Mail,
  MessageCircle,
  RefreshCw,
  Save,
  Search,
  Ticket as TicketIcon,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';
const getAdminHeaders = () => ({
  Authorization: `Bearer ${typeof window === 'undefined' ? '' : sessionStorage.getItem('adminToken') || ''}`,
});
const statuses = ['ALL', 'NEW', 'OPEN', 'WAITING', 'RESOLVED', 'CLOSED'] as const;

type TicketSummary = {
  _id: string;
  ticketNumber: string;
  name: string;
  email: string;
  phone?: string;
  category: string;
  subject: string;
  status: string;
  priority: string;
  emailNotificationStatus: string;
  createdAt: string;
  updatedAt: string;
};

type TicketDetail = TicketSummary & {
  message: string;
  adminNotes?: string;
  resolvedAt?: string | null;
  emailNotificationError?: string;
};

type TicketResponse = {
  tickets: TicketSummary[];
  counts: Record<string, number>;
  pagination: { page: number; pages: number; total: number; limit: number };
};

const formatDate = (value: string) => new Date(value).toLocaleString('en-NG', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const statusStyle: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-800',
  OPEN: 'bg-emerald-100 text-emerald-800',
  WAITING: 'bg-amber-100 text-amber-800',
  RESOLVED: 'bg-violet-100 text-violet-800',
  CLOSED: 'bg-slate-200 text-slate-700',
};

export default function AdminContactTicketsPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [status, setStatus] = useState('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleAuthFailure = useCallback((response: Response) => {
    if (response.status === 401 || response.status === 403) {
      sessionStorage.removeItem('adminToken');
      router.replace('/admin');
      return true;
    }
    return false;
  }, [router]);

  const loadTicket = useCallback(async (id: string, silent = false) => {
    if (!silent) setDetailLoading(true);
    try {
      const response = await fetch(`${API_URL}/admin/contact-tickets/${id}`, { headers: getAdminHeaders() });
      if (handleAuthFailure(response)) return;
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Could not load ticket.');
      setSelected(data.ticket);
    } catch (loadError) {
      if (!silent) setError(loadError instanceof Error ? loadError.message : 'Could not load ticket.');
    } finally {
      if (!silent) setDetailLoading(false);
    }
  }, [handleAuthFailure]);

  const loadTickets = useCallback(async (silent = false) => {
    if (!getAdminHeaders().Authorization.replace('Bearer ', '')) {
      router.replace('/admin');
      return;
    }
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (status !== 'ALL') params.set('status', status);
      if (search) params.set('search', search);
      const response = await fetch(`${API_URL}/admin/contact-tickets?${params}`, { headers: getAdminHeaders() });
      if (handleAuthFailure(response)) return;
      const data: TicketResponse & { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load tickets.');
      setTickets(data.tickets || []);
      setCounts(data.counts || {});
      setPages(data.pagination?.pages || 1);
      setError('');

    } catch (loadError) {
      if (!silent) setError(loadError instanceof Error ? loadError.message : 'Could not load tickets.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [handleAuthFailure, page, router, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTickets(), 0);
    return () => window.clearTimeout(timer);
  }, [loadTickets]);

  useEffect(() => {
    const timer = window.setInterval(() => void loadTickets(true), 20000);
    return () => window.clearInterval(timer);
  }, [loadTickets]);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('ticket');
    if (!requested) return;
    const timer = window.setTimeout(() => void loadTicket(requested), 0);
    return () => window.clearTimeout(timer);
  }, [loadTicket]);

  const saveTicket = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/admin/contact-tickets/${selected._id}`, {
        method: 'PATCH',
        headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: selected.status,
          priority: selected.priority,
          adminNotes: selected.adminNotes || '',
        }),
      });
      if (handleAuthFailure(response)) return;
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Could not save ticket.');
      setSelected(data.ticket);
      await loadTickets(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save ticket.');
    } finally {
      setSaving(false);
    }
  };

  const whatsappNumber = selected?.phone?.replace(/\D/g, '') || '';

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/admin')} className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800" aria-label="Back to admin">
              <ArrowLeft size={19} />
            </button>
            <div>
              <h1 className="flex items-center gap-2 text-xl font-black"><TicketIcon className="text-emerald-400" size={21} /> Support tickets</h1>
              <p className="text-xs text-slate-400">Contact form inbox</p>
            </div>
          </div>
          <button onClick={() => void loadTickets()} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-bold hover:bg-slate-800">
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-5 px-4 py-5 sm:px-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(440px,1.1fr)]">
        <section className="min-w-0">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {statuses.map((item) => (
              <button
                key={item}
                onClick={() => { setStatus(item); setPage(1); }}
                className={`rounded-lg border px-2 py-2.5 text-xs font-black transition ${status === item ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300' : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'}`}
              >
                {item}<span className="ml-1 text-[10px] opacity-70">{item === 'ALL' ? Object.values(counts).reduce((sum, value) => sum + value, 0) : counts[item] || 0}</span>
              </button>
            ))}
          </div>

          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search ticket, name, email or subject" className="w-full rounded-lg border border-slate-800 bg-slate-900 py-3 pl-10 pr-4 text-sm outline-none focus:border-emerald-500" />
          </div>

          {error && <p className="mt-4 rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">{error}</p>}

          <div className="mt-4 space-y-2">
            {loading ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">Loading tickets…</div>
            ) : tickets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center text-slate-500">No tickets found.</div>
            ) : tickets.map((ticket) => (
              <button
                key={ticket._id}
                onClick={() => void loadTicket(ticket._id)}
                className={`w-full rounded-xl border p-4 text-left transition ${selected?._id === ticket._id ? 'border-emerald-500 bg-emerald-950/30' : 'border-slate-800 bg-slate-900 hover:border-slate-700'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-white">{ticket.subject}</p>
                    <p className="mt-1 truncate text-sm text-slate-400">{ticket.name} · {ticket.email}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${statusStyle[ticket.status] || statusStyle.CLOSED}`}>{ticket.status}</span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span>{ticket.ticketNumber} · {ticket.category}</span>
                  <span>{formatDate(ticket.createdAt)}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
            <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-slate-800 p-2 disabled:opacity-30"><ChevronLeft size={18} /></button>
            Page {page} of {pages}
            <button disabled={page >= pages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-slate-800 p-2 disabled:opacity-30"><ChevronRight size={18} /></button>
          </div>
        </section>

        <section className="min-w-0 xl:sticky xl:top-24 xl:self-start">
          {detailLoading ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-400">Loading ticket…</div>
          ) : !selected ? (
            <div className="rounded-xl border border-dashed border-slate-700 p-12 text-center text-slate-500">Select a ticket to view it.</div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
              <div className="border-b border-slate-800 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">{selected.ticketNumber}</p>
                    <h2 className="mt-2 text-xl font-black text-white">{selected.subject}</h2>
                    <p className="mt-2 flex items-center gap-1 text-xs text-slate-500"><Clock3 size={13} /> {formatDate(selected.createdAt)}</p>
                  </div>
                  {selected.priority === 'HIGH' && <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-black text-red-300">HIGH PRIORITY</span>}
                </div>
              </div>

              <div className="grid gap-4 border-b border-slate-800 p-5 sm:grid-cols-2">
                <div><p className="text-xs uppercase text-slate-500">From</p><p className="mt-1 font-bold">{selected.name}</p></div>
                <div><p className="text-xs uppercase text-slate-500">Category</p><p className="mt-1 font-bold">{selected.category}</p></div>
                <a href={`mailto:${selected.email}`} className="flex items-center gap-2 text-sm text-emerald-300 hover:underline"><Mail size={16} /> {selected.email}</a>
                {selected.phone && <a href={whatsappNumber ? `https://wa.me/${whatsappNumber}` : '#'} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-emerald-300 hover:underline"><MessageCircle size={16} /> {selected.phone}</a>}
              </div>

              <div className="border-b border-slate-800 p-5">
                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-200">{selected.message}</p>
              </div>

              <div className="space-y-5 p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-bold uppercase text-slate-400">Status
                    <select value={selected.status} onChange={(e) => setSelected({ ...selected, status: e.target.value })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500">
                      {statuses.filter((item) => item !== 'ALL').map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-bold uppercase text-slate-400">Priority
                    <select value={selected.priority} onChange={(e) => setSelected({ ...selected, priority: e.target.value })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500">
                      <option>NORMAL</option><option>HIGH</option>
                    </select>
                  </label>
                </div>
                <label className="block text-xs font-bold uppercase text-slate-400">Private admin notes
                  <textarea rows={5} maxLength={5000} value={selected.adminNotes || ''} onChange={(e) => setSelected({ ...selected, adminNotes: e.target.value })} className="mt-2 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm normal-case text-white outline-none focus:border-emerald-500" />
                </label>
                <button onClick={() => void saveTicket()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-500 disabled:opacity-50">
                  <Save size={17} /> {saving ? 'Saving…' : 'Save ticket'}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
