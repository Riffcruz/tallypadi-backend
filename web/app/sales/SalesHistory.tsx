'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  Loader2,
  Search,
  Filter,
  ArrowRight,
  Receipt,
  TrendingUp,
  Clock,
  FileDown,
  Lock,
  CalendarDays,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { UserProfile } from './page';
import Swal from 'sweetalert2';
import { getCookie } from '../../utils/cookies';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

type SaleStatusType = 'PAID' | 'CREDIT' | 'PART_PAYMENT';

function safeNum(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default function SalesHistory({ user }: { user: UserProfile | null }) {
  const router = useRouter();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);

  // ✅ NEW: per-row pdf loading
  const [rowPdfLoading, setRowPdfLoading] = useState<Record<string, boolean>>({});

  const [dates, setDates] = useState({ start: '', end: '' });
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const fetchHistory = () => {
    setLoading(true);
    const token = getCookie('tallyToken');
    const params: any = {};
    if (dates.start) params.startDate = dates.start;
    if (dates.end) params.endDate = dates.end;

    axios
      .get(`${API_URL}/sales`, { headers: { Authorization: `Bearer ${token}` }, params })
      .then((res) => {
        // Handle both array (legacy) and paginated object { data: [...] }
        const rawData = res.data?.data || res.data;
        const rows = Array.isArray(rawData) ? rawData : [];

        const filtered = rows.filter((sale: any) => !isUndoneSale(sale) && !isUnknownItemSale(sale));
        setHistory(filtered);
      })
      .catch((err) => {
        console.error('History Error', err);
        setHistory([]);
      })
      .finally(() => setLoading(false));
  };

  const isUnknownItemSale = (sale: any) => {
    const items = Array.isArray(sale?.items) ? sale.items : [];
    // Only hide if there are no items at all
    return items.length === 0;
  };

  const isUndoneSale = (sale: any) => {
    const raw =
      sale?.isUndone ??
      sale?.is_undone ??
      sale?.undone ??
      sale?.is_undone_sale ??
      sale?.meta?.isUndone;

    if (raw === true) return true;

    const s = String(raw ?? '').trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes' || s === 'y' || s === 'undone';
  };

  // ✅ helper: open/preview pdf
  function openPdfInNewTab(url: string) {
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }

  // ✅ helper: preview/download/both modal
  async function presentPdfActions(blob: Blob, fileName: string) {
    const url = window.URL.createObjectURL(blob);

    const doDownload = () => {
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
    };

    const doShare = async () => {
      try {
        const file = new File([blob], fileName, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
          await navigator.share({
            title: 'TallyPadi Receipt',
            text: `Receipt ${fileName}`,
            files: [file],
          });
          return true;
        }
      } catch (err) {
        console.warn('Native share failed', err);
      }
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'TallyPadi Receipt',
            text: `Receipt ${fileName}`,
            url: url,
          });
          return true;
        } catch (err) {
          console.warn('Native URL share failed', err);
        }
      }
      // Clipboard fallback
      try {
        await navigator.clipboard.writeText(url);
        Swal.fire({
          toast: true,
          icon: 'success',
          title: 'Link copied to clipboard',
          position: 'top-end',
          showConfirmButton: false,
          timer: 2000,
        });
      } catch {
        Swal.fire('Error', 'Sharing not supported on this browser/device.', 'error');
      }
      return false;
    };

    const doPreview = () => openPdfInNewTab(url);

    const buttonsHtml = `
      <div class="flex flex-col gap-2 w-full mt-3">
        <button id="swal-btn-share" class="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-2">
          Share (WhatsApp, etc.)
        </button>
        <div class="flex gap-2 w-full">
          <button id="swal-btn-preview" class="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-xl font-bold">
            Preview
          </button>
          <button id="swal-btn-download" class="flex-1 py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl font-bold">
            Download
          </button>
        </div>
      </div>
    `;

    const result = await Swal.fire({
      icon: 'success',
      title: 'PDF is ready ✅',
      html: buttonsHtml,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'Close',
      cancelButtonColor: '#64748b',
      focusCancel: true,
      didOpen: () => {
        const shareBtn = document.getElementById('swal-btn-share');
        const previewBtn = document.getElementById('swal-btn-preview');
        const downloadBtn = document.getElementById('swal-btn-download');

        if (shareBtn) shareBtn.onclick = () => { doShare(); Swal.close(); };
        if (previewBtn) previewBtn.onclick = () => { doPreview(); Swal.close(); };
        if (downloadBtn) downloadBtn.onclick = () => { doDownload(); Swal.close(); };
      }
    });

    // ✅ cleanup later
    setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
  }

  // ✅ NEW: download single transaction receipt pdf
  const downloadSingleReceiptPdf = async (sale: any) => {
    const saleId = String(sale?.id || sale?._id || '').trim();
    if (!saleId) return;

    // ✅ Gate: TYCOON only (same as report)
    if (String(user?.planType || '').toUpperCase() !== 'TYCOON') {
      Swal.fire({
        title: 'Upgrade to Tycoon ✨',
        html: `
          <div style="text-align:left;line-height:1.45">
            <p style="margin:0 0 8px 0">
              Receipt PDFs are available only on the <b>Tycoon Plan</b>.
            </p>
            <p style="margin:0;color:#64748b;font-size:13px">
              Upgrade now to download single transaction receipts.
            </p>
          </div>
        `,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Upgrade to Tycoon',
        confirmButtonColor: '#0F766E',
        cancelButtonText: 'Not now',
        cancelButtonColor: '#64748b',
        reverseButtons: true,
        focusConfirm: false,
      }).then((result) => {
        if (result.isConfirmed) router.push('/payment?plan=TYCOON');
      });
      return;
    }

    const token = getCookie('tallyToken');
    if (!token) {
      Swal.fire({
        title: 'Session expired',
        text: 'Please login again to download your receipt.',
        icon: 'warning',
        confirmButtonColor: '#0F766E',
      });
      return;
    }

    // Ask for format
    const { value: format } = await Swal.fire({
      title: 'Receipt Format',
      input: 'radio',
      inputOptions: {
        standard: 'Standard (A4)',
        thermal: 'Thermal (80mm)'
      },
      inputValue: 'thermal',
      confirmButtonText: 'Download',
      showCancelButton: true,
      confirmButtonColor: '#0F766E',
    });

    if (!format) return;

    setRowPdfLoading((p) => ({ ...p, [saleId]: true }));

    Swal.fire({
      title: 'Generating receipt…',
      html: 'Only this transaction will be included.',
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const res = await axios.get(`${API_URL}/sales/${encodeURIComponent(saleId)}/receipt`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { format },
        responseType: 'blob',
        timeout: 60_000,
      });

      Swal.close();

      const blob = new Blob([res.data], { type: 'application/pdf' });

      // filename: TallyPadi_Receipt_YYYY-MM-DD_<saleId>.pdf
      const d = new Date(sale?.timestamp || sale?.date || Date.now());
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const fileName = `TallyPadi_Receipt_${yyyy}-${mm}-${dd}_${saleId}.pdf`;

      await presentPdfActions(blob, fileName);
    } catch (err: any) {
      console.error('Single Receipt Error', err);
      try {
        Swal.close();
      } catch {}

      const status = err?.response?.status;
      if (status === 401) {
        Swal.fire({
          title: 'Session expired',
          text: 'Please login again and retry.',
          icon: 'warning',
          confirmButtonColor: '#0F766E',
        });
      } else {
        Swal.fire({
          title: 'Receipt failed',
          text: err?.response?.data?.error || 'Could not generate receipt PDF. Please try again.',
          icon: 'error',
          confirmButtonColor: '#0F766E',
        });
      }
    } finally {
      setRowPdfLoading((p) => ({ ...p, [saleId]: false }));
    }
  };

  const downloadPDF = async () => {
    // ✅ Gate: TYCOON only
    if (String(user?.planType || '').toUpperCase() !== 'TYCOON') {
      Swal.fire({
        title: 'Upgrade to Tycoon ✨',
        html: `
        <div style="text-align:left;line-height:1.45">
          <p style="margin:0 0 8px 0">
            PDF reports are available only on the <b>Tycoon Plan</b>.
          </p>
          <p style="margin:0;color:#64748b;font-size:13px">
            Upgrade now to download sales reports as PDF.
          </p>
        </div>
      `,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Upgrade to Tycoon',
        confirmButtonColor: '#0F766E',
        cancelButtonText: 'Not now',
        cancelButtonColor: '#64748b',
        reverseButtons: true,
        focusConfirm: false,
      }).then((result) => {
        if (result.isConfirmed) router.push('/payment?plan=TYCOON');
      });
      return;
    }

    const token = getCookie('tallyToken');
    if (!token) {
      Swal.fire({
        title: 'Session expired',
        text: 'Please login again to download your report.',
        icon: 'warning',
        confirmButtonColor: '#0F766E',
      });
      return;
    }

    setPdfLoading(true);

    // ✅ Loading modal
    Swal.fire({
      title: 'Generating PDF…',
      html: 'Please wait while we prepare your report.',
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const params: any = {};
      if (dates?.start) params.startDate = dates.start;
      if (dates?.end) params.endDate = dates.end;

      const res = await axios.get(`${API_URL}/sales/report`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
        responseType: 'blob',
        timeout: 60_000,
      });

      // ✅ Filename
      const todayStr = new Date().toISOString().split('T')[0];
      const rangeStr =
        dates?.start && dates?.end
          ? `${String(dates.start).slice(0, 10)}_to_${String(dates.end).slice(0, 10)}`
          : dates?.start
          ? `${String(dates.start).slice(0, 10)}`
          : dates?.end
          ? `${String(dates.end).slice(0, 10)}`
          : todayStr;

      const fileName = `TallyPadi_Sales_Report_${rangeStr}.pdf`;

      // ✅ PDF blob
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);

      // ✅ Ask: preview / download / both
      const result = await Swal.fire({
        icon: 'success',
        title: 'PDF is ready ✅',
        html: `<p style="margin:0;color:#475569;font-size:13px">
        Would you like to preview it first, download it, or both?
      </p>`,
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: 'Preview',
        denyButtonText: 'Download',
        cancelButtonText: 'Both',
        confirmButtonColor: '#0F766E',
        denyButtonColor: '#111827',
        cancelButtonColor: '#64748b',
        reverseButtons: true,
        focusConfirm: false,
      });

      const doDownload = () => {
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
      };

      const doPreview = () => {
        const win = window.open(url, '_blank', 'noopener,noreferrer');
        if (!win) {
          // popup blocked fallback
          const a = document.createElement('a');
          a.href = url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
      };

      if (result.isConfirmed) {
        // Preview
        doPreview();
      } else if (result.isDenied) {
        // Download
        doDownload();
      } else {
        // Both (cancel button)
        doPreview();
        doDownload();
      }

      // ✅ Small toast confirmation
      Swal.fire({
        toast: true,
        icon: 'success',
        title: 'Done',
        text: result.isConfirmed
          ? 'Opened preview.'
          : result.isDenied
          ? 'Download started.'
          : 'Preview opened + download started.',
        position: 'top-end',
        showConfirmButton: false,
        timer: 2400,
        timerProgressBar: true,
      });

      // ✅ cleanup later (don’t revoke immediately or preview/download may break)
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (err: any) {
      console.error('PDF Download Error', err);

      const status = err?.response?.status;
      if (status === 401) {
        Swal.fire({
          title: 'Session expired',
          text: 'Please login again and retry.',
          icon: 'warning',
          confirmButtonColor: '#0F766E',
        });
      } else {
        Swal.fire({
          title: 'Download failed',
          text: err?.response?.data?.message || 'Could not generate the report. Please try again.',
          icon: 'error',
          confirmButtonColor: '#0F766E',
        });
      }
    } finally {
      setPdfLoading(false);
      // if loading modal is still open, close it
      try {
        Swal.close();
      } catch {}
    }
  };

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatMoney = (amount: number) => {
    const v = safeNum(amount, 0);
    return new Intl.NumberFormat(user?.locale || 'en-NG', {
      style: 'currency',
      currency: user?.currencyCode || 'NGN',
      maximumFractionDigits: 0
    }).format(v);
  };

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return {
      day: d.getDate(),
      weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
      fullDate: d.toLocaleDateString(user?.locale || 'en-NG', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: d.toLocaleTimeString(user?.locale || 'en-NG', { hour: '2-digit', minute: '2-digit' })
    };
  };

  const toggleRowExpansion = (saleId: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [saleId]: !prev[saleId]
    }));
  };

  // ✅ NEW: status logic (fix “Paid shown for credit”)
  const getSaleTotals = (sale: any) => {
    const total = safeNum(sale?.totalAmount ?? sale?.totalMoney ?? 0, 0);

    // common backend fields
    const paid = safeNum(
      sale?.amountPaid ?? sale?.paidAmount ?? sale?.paid ?? sale?.totalPaid ?? 0,
      0
    );

    // if backend already sends balance use it; else compute
    const balance =
      sale?.balance !== undefined && sale?.balance !== null
        ? Math.max(safeNum(sale.balance, 0), 0)
        : Math.max(total - paid, 0);

    return { total, paid, balance };
  };

  const getSaleStatus = (sale: any): { type: SaleStatusType; balance: number; paid: number; total: number } => {
    const { total, paid, balance } = getSaleTotals(sale);

    const paymentStatus = String(sale?.paymentStatus || '').toUpperCase(); // PAID / CREDIT / PART_PAYMENT
    const explicitCreditFlag = sale?.is_credit === true || sale?.isCredit === true;

    // ✅ If fully settled, ALWAYS PAID
    if (balance <= 0 && paid >= total && total > 0) {
      return { type: 'PAID', balance: 0, paid, total };
    }

    // ✅ If backend explicitly says PAID, trust it (unless balance > 0)
    if (paymentStatus === 'PAID' && balance <= 0) {
      return { type: 'PAID', balance: 0, paid, total };
    }

    // ✅ Now decide credit/part-payment ONLY if there is balance
    if (balance > 0) {
      if (paid > 0) return { type: 'PART_PAYMENT', balance, paid, total };
      return { type: 'CREDIT', balance, paid, total };
    }

    // ✅ Edge: no balance but flags still say credit -> treat as PAID
    if (explicitCreditFlag || paymentStatus === 'CREDIT') {
      return { type: 'PAID', balance: 0, paid, total };
    }

    return { type: 'PAID', balance: 0, paid, total };
  };

  const getItemQty = (item: any) => {
    // supports both quantity and qty
    return safeNum(item?.quantity ?? item?.qty ?? 0, 0);
  };

  const today = new Date().toISOString().split('T')[0];

  const renderStatusBadge = (status: { type: SaleStatusType; balance: number }) => {
    if (status.type === 'PAID') {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-700 text-[10px] font-extrabold border border-emerald-100/50 shadow-sm">
          <TrendingUp className="w-3 h-3" /> Paid
        </span>
      );
    }

    if (status.type === 'PART_PAYMENT') {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-amber-50 to-yellow-50 text-amber-700 text-[10px] font-extrabold border border-amber-100/50 shadow-sm">
          <Clock className="w-3 h-3" /> Part Payment
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-rose-50 to-red-50 text-red-700 text-[10px] font-extrabold border border-red-100/50 shadow-sm">
        <Clock className="w-3 h-3" /> Credit
      </span>
    );
  };

  return (
    <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* --- HEADER & CONTROLS --- */}
      <div className="bg-white p-4 md:p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 md:gap-6">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-sm shrink-0">
            <Receipt className="w-5 h-5 md:w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base md:text-lg font-black text-gray-900 tracking-tight">Transaction History</h2>
            <p className="text-xs md:text-sm text-gray-500 font-medium flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {loading ? 'Syncing records...' : `${history.length} transactions found`}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto items-stretch sm:items-end">
          <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 rounded-2xl p-1.5 border border-blue-100 shadow-sm flex-1 sm:flex-none">
            <div className="flex flex-col sm:flex-row items-center gap-2 bg-white/80 backdrop-blur-sm rounded-xl p-2 border border-blue-50/50">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg shadow-sm shrink-0">
                <CalendarDays className="w-4 h-4 text-white" />
              </div>

              <div className="flex flex-row items-center gap-2 w-full">
                <div className="relative w-full sm:w-32 group">
                  <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                    <Calendar className="h-3 w-3 text-blue-500" />
                  </div>
                  <input
                    type="date"
                    className="w-full pl-7 pr-1 py-1.5 bg-white/90 border border-blue-100 rounded-lg text-xs text-gray-800 font-bold outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition-all"
                    value={dates.start}
                    onChange={(e) => setDates({ ...dates, start: e.target.value })}
                    max={dates.end || today}
                  />
                </div>

                <ArrowRight className="w-3 h-3 text-blue-300 flex-shrink-0" />

                <div className="relative w-full sm:w-32 group">
                  <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                    <Calendar className="h-3 w-3 text-purple-500" />
                  </div>
                  <input
                    type="date"
                    className="w-full pl-7 pr-1 py-1.5 bg-white/90 border border-purple-100 rounded-lg text-xs text-gray-800 font-bold outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300 transition-all"
                    value={dates.end}
                    onChange={(e) => setDates({ ...dates, end: e.target.value })}
                    min={dates.start}
                    max={today}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={fetchHistory}
              disabled={loading}
              className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black text-white font-bold text-xs rounded-2xl shadow-lg shadow-gray-200 active:scale-95 transition-all disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Filter className="w-3 h-3" />}
              Filter
            </button>

            <button
              onClick={downloadPDF}
              disabled={pdfLoading || loading}
              className={`flex-1 px-4 py-3 font-bold text-xs rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
                user?.planType === 'TYCOON'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-emerald-200'
                  : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
              }`}
              title={user?.planType === 'TYCOON' ? 'Download PDF Report' : 'Upgrade to Tycoon to download PDF'}
            >
              {pdfLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : user?.planType === 'TYCOON' ? (
                <>
                  <FileDown className="w-3 h-3" />
                  <span className="hidden sm:inline">Download PDF</span>
                  <span className="sm:hidden">PDF</span>
                </>
              ) : (
                <>
                  <Lock className="w-3 h-3" />
                  <span className="hidden sm:inline">Download PDF</span>
                  <span className="sm:hidden">PDF</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* --- DESKTOP TABLE --- */}
      <div className="hidden md:block bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gradient-to-r from-gray-50 to-blue-50/30 border-b border-blue-100">
                <th className="py-4 px-6 text-xs font-extrabold text-blue-600 uppercase tracking-wider min-w-[120px]">
                  Date Recorded
                </th>
                <th className="py-4 px-6 text-xs font-extrabold text-blue-600 uppercase tracking-wider min-w-[200px]">
                  Items Sold
                </th>
                <th className="py-4 px-6 text-xs font-extrabold text-blue-600 uppercase tracking-wider text-right min-w-[160px]">
                  Total Amount
                </th>
                <th className="py-4 px-6 text-xs font-extrabold text-blue-600 uppercase tracking-wider text-right min-w-[120px]">
                  Profit
                </th>
                {/* ✅ NEW */}
                <th className="py-4 px-6 text-xs font-extrabold text-blue-600 uppercase tracking-wider text-right min-w-[140px]">
                  Receipt
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-blue-50/30">
              {loading ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4">
                      <div className="h-10 w-10 bg-gray-100 rounded-xl mb-1 inline-block mr-3 align-middle"></div>
                      <div className="h-4 bg-gray-100 rounded w-24 inline-block align-middle"></div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-6 bg-gray-100 rounded w-48"></div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="h-6 bg-gray-100 rounded w-24 ml-auto"></div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="h-6 bg-gray-100 rounded w-20 ml-auto"></div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="h-9 bg-gray-100 rounded w-24 ml-auto"></div>
                    </td>
                  </tr>
                ))
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="py-24 flex flex-col items-center justify-center text-center">
                      <div className="w-20 h-20 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-full flex items-center justify-center mb-4 border border-blue-100 shadow-sm">
                        <Search className="w-10 h-10 text-blue-300" />
                      </div>
                      <h3 className="text-gray-900 font-extrabold text-xl mb-1">No transactions found</h3>
                      <p className="text-gray-500 text-sm max-w-xs mx-auto leading-relaxed mb-4">
                        {dates.start || dates.end
                          ? 'No transactions match your date range filter'
                          : 'Start recording sales to see transaction history'}
                      </p>
                      {dates.start || dates.end ? (
                        <button
                          onClick={() => {
                            setDates({ start: '', end: '' });
                            fetchHistory();
                          }}
                          className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-bold rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all"
                        >
                          Clear Date Filter
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : (
                history.map((sale: any) => {
                  const { day, fullDate, time, weekday } = formatDate(sale.date || sale.timestamp);
                  const status = getSaleStatus(sale);
                  const id = String(sale.id || sale._id || '');

                  return (
                    <tr
                      key={id}
                      className="group hover:bg-gradient-to-r hover:from-blue-50/30 hover:to-indigo-50/10 transition-all duration-200"
                    >
                      <td className="px-6 py-5 whitespace-nowrap align-top">
                        <div className="flex items-start gap-4">
                          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-white border border-blue-400 flex flex-col items-center justify-center shrink-0 group-hover:scale-105 group-hover:shadow-lg transition-all duration-300 shadow-sm">
                            <span className="text-xs font-bold uppercase leading-none">{weekday}</span>
                            <span className="text-lg font-black leading-none">{day}</span>
                          </div>
                          <div className="pt-0.5">
                            <p className="font-bold text-gray-900 text-sm">{fullDate}</p>
                            <p className="text-xs font-medium text-blue-500 group-hover:text-blue-600 transition-colors flex items-center gap-1 mt-0.5">
                              <Clock className="w-3 h-3" /> {time}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-5 align-top">
                        <div className="flex flex-wrap gap-2">
                          {(sale.items || []).slice(0, 4).map((item: any, idx: number) => (
                            <div
                              key={idx}
                              className="inline-flex items-center pl-2 pr-3 py-1 rounded-lg bg-gradient-to-r from-blue-50 to-blue-50/50 text-blue-700 text-xs font-semibold border border-blue-100 group-hover:border-blue-200 group-hover:bg-white transition-all shadow-sm"
                            >
                              <span className="w-5 h-5 flex items-center justify-center bg-blue-500 text-white rounded text-[10px] font-bold mr-2">
                                {getItemQty(item)}
                              </span>
                              <span className="capitalize truncate max-w-[120px]">{item.name}</span>
                            </div>
                          ))}
                          {(sale.items || []).length > 4 && (
                            <span className="inline-flex items-center px-3 py-1 text-xs font-bold text-blue-500 bg-blue-50 rounded-full border border-blue-100">
                              +{(sale.items || []).length - 4} more
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-5 text-right align-top">
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-black text-gray-900 text-lg tracking-tight group-hover:text-blue-700 transition-colors">
                            {formatMoney(status.total)}
                          </span>

                          {renderStatusBadge(status)}

                          {/* ✅ show balance when it’s credit / part payment */}
                          {status.type !== 'PAID' ? (
                            <span className="text-[11px] font-bold text-gray-500">
                              Balance: <span className="text-gray-700">{formatMoney(status.balance)}</span>
                            </span>
                          ) : null}
                        </div>
                      </td>

                      <td className="px-6 py-5 text-right align-top">
                        <span className={`font-bold text-sm ${sale.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {formatMoney(sale.profit || 0)}
                        </span>
                      </td>

                      {/* ✅ NEW: per-transaction receipt pdf */}
                      <td className="px-6 py-5 text-right align-top">
                        <button
                          onClick={() => downloadSingleReceiptPdf(sale)}
                          disabled={!!rowPdfLoading[id] || loading}
                          className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl font-extrabold text-xs transition ${
                            user?.planType === 'TYCOON'
                              ? 'bg-white border border-gray-200 text-gray-900 hover:bg-gray-50'
                              : 'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed'
                          }`}
                          title={user?.planType === 'TYCOON' ? 'Download receipt PDF' : 'Upgrade to Tycoon to download receipts'}
                        >
                          {rowPdfLoading[id] ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : user?.planType === 'TYCOON' ? (
                            <FileDown className="w-4 h-4" />
                          ) : (
                            <Lock className="w-4 h-4" />
                          )}
                          PDF
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- MOBILE CARD VIEW --- */}
      <div className="md:hidden space-y-4">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-blue-100 p-4 animate-pulse shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-gradient-to-r from-blue-50 to-blue-100 rounded-xl"></div>
                  <div className="space-y-2">
                    <div className="h-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded w-24"></div>
                    <div className="h-3 bg-gradient-to-r from-blue-50 to-blue-100 rounded w-16"></div>
                  </div>
                </div>
                <div className="text-right space-y-2">
                  <div className="h-5 bg-gradient-to-r from-blue-50 to-blue-100 rounded w-20 ml-auto"></div>
                  <div className="h-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded w-16 ml-auto"></div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded w-full"></div>
                <div className="h-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded w-3/4"></div>
              </div>
            </div>
          ))
        ) : history.length === 0 ? (
          <div className="bg-gradient-to-br from-white to-blue-50 rounded-2xl border border-blue-100 p-8 flex flex-col items-center justify-center text-center shadow-sm">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-full flex items-center justify-center mb-4 border border-blue-100 shadow-sm">
              <Search className="w-8 h-8 text-blue-300" />
            </div>
            <h3 className="text-gray-900 font-extrabold text-lg mb-1">No transactions found</h3>
            <p className="text-gray-500 text-sm leading-relaxed mb-4">
              {dates.start || dates.end ? 'Try adjusting your date range' : 'Record sales to see history here'}
            </p>
            {dates.start || dates.end ? (
              <button
                onClick={() => {
                  setDates({ start: '', end: '' });
                  fetchHistory();
                }}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-bold rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all"
              >
                Clear Filter
              </button>
            ) : null}
          </div>
        ) : (
          history.map((sale: any) => {
            const { day, fullDate, time, weekday } = formatDate(sale.date || sale.timestamp);
            const id = String(sale.id || sale._id || '');
            const isExpanded = expandedRows[id];
            const status = getSaleStatus(sale);

            return (
              <div key={id} className="bg-white rounded-2xl border border-blue-100 p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white border border-blue-400 flex flex-col items-center justify-center shrink-0 shadow-sm">
                      <span className="text-xs font-bold uppercase leading-none">{weekday}</span>
                      <span className="text-base font-black leading-none">{day}</span>
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{fullDate}</p>
                      <p className="text-xs font-medium text-blue-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {time}
                      </p>
                    </div>
                  </div>

                  <div className="text-right flex flex-col items-end gap-1">
                    <span className="font-black text-gray-900 text-lg block">{formatMoney(status.total)}</span>
                    <span className={`text-xs font-bold ${sale.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      Profit: {formatMoney(sale.profit || 0)}
                    </span>
                    {renderStatusBadge(status)}
                    {status.type !== 'PAID' ? (
                      <span className="text-[11px] font-bold text-gray-500">
                        Balance: <span className="text-gray-700">{formatMoney(status.balance)}</span>
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mb-3">
                  <div className="flex flex-wrap gap-2">
                    {(sale.items || [])
                      .slice(0, isExpanded ? (sale.items || []).length : 3)
                      .map((item: any, idx: number) => (
                        <div
                          key={idx}
                          className="inline-flex items-center pl-2 pr-3 py-1 rounded-lg bg-gradient-to-r from-blue-50 to-blue-50/50 text-blue-700 text-xs font-medium border border-blue-100"
                        >
                          <span className="w-5 h-5 flex items-center justify-center bg-blue-500 text-white rounded text-[10px] font-bold mr-2">
                            {getItemQty(item)}
                          </span>
                          <span className="capitalize truncate max-w-[100px]">{item.name}</span>
                        </div>
                      ))}
                  </div>
                </div>

                {(sale.items || []).length > 3 && (
                  <button
                    onClick={() => toggleRowExpansion(id)}
                    className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800 w-full justify-center pt-2 border-t border-blue-100"
                  >
                    {isExpanded ? (
                      <>
                        Show Less <ChevronUp className="w-4 h-4" />
                      </>
                    ) : (
                      <>
                        Show {(sale.items || []).length - 3} More Items <ChevronDown className="w-4 h-4" />
                      </>
                    )}
                  </button>
                )}

                {/* ✅ NEW: per-transaction receipt pdf (mobile) */}
                <button
                  onClick={() => downloadSingleReceiptPdf(sale)}
                  disabled={!!rowPdfLoading[id] || loading}
                  className={`w-full mt-3 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-extrabold text-xs transition ${
                    user?.planType === 'TYCOON'
                      ? 'bg-gray-900 hover:bg-black text-white'
                      : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                  }`}
                  title={user?.planType === 'TYCOON' ? 'Download receipt PDF' : 'Upgrade to Tycoon to download receipts'}
                >
                  {rowPdfLoading[id] ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : user?.planType === 'TYCOON' ? (
                    <FileDown className="w-4 h-4" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )}
                  Download Receipt PDF
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
