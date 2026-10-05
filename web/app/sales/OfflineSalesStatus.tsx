'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, CloudUpload, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { getCookie } from '../../utils/cookies';
import {
  listOfflineSales,
  OFFLINE_SALES_CHANGE_EVENT,
  OfflineSaleRecord,
  retryOfflineSale,
  syncOfflineSales,
} from '../../lib/offlineSales';

interface OfflineSalesStatusProps {
  userId: string;
  apiUrl: string;
}

export default function OfflineSalesStatus({ userId, apiUrl }: OfflineSalesStatusProps) {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [records, setRecords] = useState<OfflineSaleRecord[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [storageError, setStorageError] = useState('');
  const syncingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      setRecords(await listOfflineSales(userId));
      setStorageError('');
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Offline storage is unavailable');
    }
  }, [userId]);

  const sync = useCallback(async () => {
    if (!userId || !navigator.onLine || syncingRef.current) return;
    const token = getCookie('tallyToken');
    if (!token) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      await syncOfflineSales(userId, token, apiUrl);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      await refresh();
    }
  }, [apiUrl, refresh, userId]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const handleChange = () => void refresh();
    const handleOnline = () => {
      setOnline(true);
      window.setTimeout(() => void sync(), 250);
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener(OFFLINE_SALES_CHANGE_EVENT, handleChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.clearTimeout(initialRefresh);
      window.removeEventListener(OFFLINE_SALES_CHANGE_EVENT, handleChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refresh, sync]);

  useEffect(() => {
    if (!online) return;
    const initialSync = window.setTimeout(() => void sync(), 0);
    const interval = window.setInterval(() => void sync(), 30_000);
    return () => {
      window.clearTimeout(initialSync);
      window.clearInterval(interval);
    };
  }, [online, sync]);

  const attentionCount = records.filter((record) => record.status === 'needs_attention').length;
  const pendingCount = records.length - attentionCount;
  const totalValue = useMemo(() => records.reduce((sum, record) => {
    const gross = record.payload.items.reduce((itemSum, item) => itemSum + item.quantity * item.price, 0);
    return sum + Math.max(0, gross - record.payload.discountAmount);
  }, 0), [records]);

  const retryOne = async (queueKey: string) => {
    const token = getCookie('tallyToken');
    if (!token || !navigator.onLine || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      await retryOfflineSale(queueKey, token, apiUrl);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      await refresh();
    }
  };

  if (storageError) {
    return (
      <div className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
        <AlertTriangle className="h-4 w-4" /> Offline saving unavailable
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-extrabold shadow-sm transition ${
          attentionCount > 0
            ? 'border-red-200 bg-red-50 text-red-700'
            : !online
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : pendingCount > 0
                ? 'border-blue-200 bg-blue-50 text-blue-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
        }`}
      >
        {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
        {attentionCount > 0
          ? `${attentionCount} sale${attentionCount === 1 ? '' : 's'} need attention`
          : pendingCount > 0
            ? `${pendingCount} sale${pendingCount === 1 ? '' : 's'} awaiting sync`
            : online ? 'Online' : 'Offline · sales save safely'}
        {records.length > 0 && <ChevronDown className={`h-3.5 w-3.5 transition ${expanded ? 'rotate-180' : ''}`} />}
      </button>

      {expanded && records.length > 0 && (
        <div className="absolute right-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-900">Saved sales</p>
              <p className="text-[11px] font-semibold text-slate-500">{records.length} saved · {totalValue.toLocaleString()}</p>
            </div>
            <button
              type="button"
              disabled={!online || syncing || pendingCount === 0}
              onClick={() => void sync()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-2 text-[11px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {syncing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
              Sync now
            </button>
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto">
            {records.map((record) => {
              const total = Math.max(0, record.payload.items.reduce((sum, item) => sum + item.quantity * item.price, 0) - record.payload.discountAmount);
              return (
                <div key={record.queueKey} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black text-slate-900">{record.payload.items.length} item{record.payload.items.length === 1 ? '' : 's'} · {total.toLocaleString()}</p>
                      <p className="mt-0.5 text-[10px] font-semibold text-slate-500">{new Date(record.payload.recordedAt).toLocaleString()}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${record.status === 'needs_attention' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                      {record.status === 'needs_attention' ? 'Check' : 'Saved'}
                    </span>
                  </div>
                  {record.lastError && <p className="mt-2 text-[10px] font-semibold leading-4 text-slate-600">{record.lastError}</p>}
                  {record.status === 'needs_attention' && (
                    <button
                      type="button"
                      disabled={!online || syncing}
                      onClick={() => void retryOne(record.queueKey)}
                      className="mt-2 inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 disabled:opacity-40"
                    >
                      <RefreshCw className="h-3 w-3" /> Retry sale
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
