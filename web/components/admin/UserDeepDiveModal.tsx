import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import {
  Crown,
  X,
  Calendar,
  Download,
  FileText,
  Share2,
  Loader2,
  Trash2,
  MessageSquare,
  Send,
  Unlink,
  ExternalLink,
  Edit2,
} from 'lucide-react';
import Swal from 'sweetalert2';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

const COUNTRY_CURRENCIES: Record<string, string> = {
  NG: '₦',
  US: '$',
  GB: '£',
  EU: '€',
  GH: '₵',
  KE: 'KSh',
  ZA: 'R',
  IN: '₹',
  CN: '¥',
  CA: 'C$',
};

type ViewType = 'info' | 'inventory' | 'sales' | 'staff';

export default function UserDeepDiveModal({
  user,
  onClose,
  adminToken,
  onAction,
}: {
  user: any;
  onClose: () => void;
  adminToken: string; // ✅ JWT token
  onAction: (userId: string, action: string, payload?: any) => Promise<any>;
}) {
  const userId = String(user?.id || user?._id || '').trim();

  const [details, setDetails] = useState<any>(null);
  const [view, setView] = useState<ViewType>('info');
  const [salesDate, setSalesDate] = useState({ start: '', end: '' });
  const [loadingDetails, setLoadingDetails] = useState(false);

  // ✅ Individual message UI (like Broadcast)
  const [target, setTarget] = useState<'user' | 'staff'>('user');
  const [staffTarget, setStaffTarget] = useState<string>(''); // phone number
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);

  const [deletingUser, setDeletingUser] = useState(false);
  const [clearingMsgHistory, setClearingMsgHistory] = useState(false);
  const [deletingSales, setDeletingSales] = useState(false);

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${adminToken}` }),
    [adminToken]
  );

  if (!adminToken) {
  Swal.fire('Auth Error', 'Missing admin token. Please login again.', 'error');
  onClose();
  return null;
}


  // ✅ Central refresh (prevents stale UI after deletes)
  const refreshDetails = useCallback(async () => {
    if (!userId) return;

    setLoadingDetails(true);
    try {
      const res = await axios.get(`${API_URL}/admin/users/${userId}/details`, {
        headers: authHeaders,
      });
      setDetails(res.data);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 401) Swal.fire('Unauthorized', 'Your session expired. Please login again.', 'error');
      else if (status === 403) Swal.fire('Forbidden', 'Admin access required.', 'error');
      else Swal.fire('Error', 'Failed to load details', 'error');
    } finally {
      setLoadingDetails(false);
    }
  }, [userId, authHeaders]);

  useEffect(() => {
    refreshDetails();
  }, [refreshDetails]);

  // auto-set default staff target when staff loads
  useEffect(() => {
    const staff = details?.staff || [];
    if (staff.length && !staffTarget) {
      setStaffTarget(staff[0]?.phoneNumber || '');
    }
  }, [details?.staff, staffTarget]);

  const currencySymbol = useMemo(() => {
    const code = details?.profile?.countryCode || 'NG';
    return COUNTRY_CURRENCIES[String(code).toUpperCase()] || '₦';
  }, [details?.profile?.countryCode]);

  const expiryDisplay = useMemo(() => {
    const d = details?.profile?.trialEndsAt;
    if (!d) return '—';
    const dt = new Date(d);
    return Number.isFinite(dt.getTime()) ? dt.toLocaleDateString() : '—';
  }, [details?.profile?.trialEndsAt]);

  const handlePlanChange = async () => {
    const { value: plan } = await Swal.fire({
      title: 'Change / Renew Plan',
      input: 'select',
      inputOptions: { OGA_BOSS: 'Oga Boss', TYCOON: 'Tycoon' },
      inputPlaceholder: 'Select a plan',
      showCancelButton: true,
    });
    if (!plan) return;

    const { isConfirmed: isStandard } = await Swal.fire({
      title: 'Plan Duration',
      text: 'Use standard 30 Days or set custom date?',
      icon: 'question',
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: 'Standard 30 Days',
      denyButtonText: 'Custom Date',
      cancelButtonText: 'Cancel',
    });

    let expiryDate = new Date();
    if (isStandard) {
      expiryDate.setDate(expiryDate.getDate() + 30);
    } else {
      const { value: customDate } = await Swal.fire({
        title: 'Select Expiry Date',
        input: 'date',
        showCancelButton: true,
      });
      if (!customDate) return;
      expiryDate = new Date(customDate);
    }

    try {
      await onAction(userId, 'change_plan', { planType: plan });
      await onAction(userId, 'set_expiry', { date: expiryDate });
      await onAction(userId, 'activate');

      Swal.fire('Success', `Plan set to ${plan} until ${expiryDate.toLocaleDateString()}`, 'success');

      setDetails((prev: any) => ({
        ...prev,
        profile: {
          ...prev.profile,
          planType: plan,
          subscriptionStatus: 'active',
          trialEndsAt: expiryDate,
        },
      }));
    } catch {
      Swal.fire('Error', 'Failed to update plan', 'error');
    }
  };

  const handleChangeExpiry = async () => {
    const { value: date } = await Swal.fire({
      title: 'Modify Expiration',
      input: 'date',
      inputLabel: 'Select new expiration date',
      showCancelButton: true,
    });
    if (!date) return;

    const newDate = new Date(date);
    await onAction(userId, 'set_expiry', { date: newDate });

    if (newDate < new Date()) {
      await onAction(userId, 'cancel');
      setDetails((prev: any) => ({
        ...prev,
        profile: { ...prev.profile, subscriptionStatus: 'cancelled', trialEndsAt: newDate },
      }));
      Swal.fire('Updated', 'Date is in past. User Cancelled.', 'info');
    } else {
      await onAction(userId, 'activate');
      setDetails((prev: any) => ({
        ...prev,
        profile: { ...prev.profile, subscriptionStatus: 'active', trialEndsAt: newDate },
      }));
      Swal.fire('Updated', 'Expiration date extended.', 'success');
    }
  };

  const isUnknownItemSale = (s: any) => {
    const items = Array.isArray(s?.items) ? s.items : [];
    if (!items.length) return true;

    return items.some((i: any) => {
      const name = String(i?.name ?? '').trim().toLowerCase();
      return (
        !name ||
        name === 'unknown_item' ||
        name === 'unknown' ||
        name === 'item' ||
        name === 'null' ||
        name === 'undefined'
      );
    });
  };

  const getFilteredSales = () => {
    let data = details?.recentSales || [];

    data = data.filter((s: any) => !s?.isUndone && !isUnknownItemSale(s));

    if (salesDate.start) data = data.filter((s: any) => new Date(s.timestamp) >= new Date(salesDate.start));

    if (salesDate.end) {
      const end = new Date(salesDate.end);
      end.setHours(23, 59, 59);
      data = data.filter((s: any) => new Date(s.timestamp) <= end);
    }

    return data;
  };

  const exportSales = (format: 'csv' | 'pdf') => {
    const data = getFilteredSales();
    if (!data.length) return Swal.fire('Info', 'No data to export', 'info');

    const businessName = details?.profile?.businessName || user?.businessName || 'business';
    const fileName = `sales_${businessName}_${new Date().toISOString().split('T')[0]}`;

    if (format === 'csv') {
      const csv =
        `Date,Item Details,Amount (${currencySymbol})\n` +
        data
          .map((s: any) => {
            const items = (s.items || []).map((i: any) => `${i.qty}x ${i.name}`).join('; ');
            const amount = s.totalMoney ?? 0;
            return `${new Date(s.timestamp).toLocaleDateString()},"${items}",${amount}`;
          })
          .join('\n');

      const link = document.createElement('a');
      link.href = encodeURI('data:text/csv;charset=utf-8,' + csv);
      link.download = `${fileName}.csv`;
      link.click();
      return;
    }

    const doc = new jsPDF();
    doc.text(`Sales Report: ${businessName}`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 22);

    autoTable(doc, {
      head: [['Date', 'Items', `Amount (${currencySymbol})`]],
      body: data.map((s: any) => {
        const amount = s.totalMoney ?? 0;
        return [
          new Date(s.timestamp).toLocaleDateString(),
          (s.items || []).map((i: any) => `${i.qty}x ${i.name}`).join(', '),
          `${currencySymbol}${Number(amount).toLocaleString()}`,
        ];
      }),
      startY: 30,
    });

    doc.save(`${fileName}.pdf`);
  };

  const handleDeleteSalesHistoryOnly = async () => {
    const res = await Swal.fire({
      title: 'Delete Sales History?',
      text: 'This will permanently delete ALL sales records for this user (including staff sales).',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, Delete Sales',
      confirmButtonColor: '#dc2626',
    });
    if (!res.isConfirmed) return;

    try {
      setDeletingSales(true);
      await onAction(userId, 'delete_sales_history');
      setDetails((prev: any) => ({ ...prev, recentSales: [] }));
      await refreshDetails();
      Swal.fire('Deleted', 'Sales history deleted successfully.', 'success');
    } catch (e) {
      Swal.fire('Error', 'Failed to delete sales history', 'error');
    } finally {
      setDeletingSales(false);
    }
  };

  const handleDeleteUserAndHistory = async () => {
    const res = await Swal.fire({
      title: 'Delete User?',
      text: 'This will delete the user AND their history (messages, sales, inventory, staff, etc). This cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, Delete',
      confirmButtonColor: '#dc2626',
    });
    if (!res.isConfirmed) return;

    try {
      setDeletingUser(true);
      await onAction(userId, 'delete_user', { deleteHistory: true });
      Swal.fire('Deleted', 'User and history deleted successfully.', 'success');
      onClose();
    } catch (e) {
      Swal.fire('Error', 'Failed to delete user', 'error');
    } finally {
      setDeletingUser(false);
    }
  };

  const handleClearHistoryOnly = async () => {
    const res = await Swal.fire({
      title: 'Clear Message History?',
      text: 'This will delete user message history only. (Sales remain.)',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Clear Messages',
      confirmButtonColor: '#f59e0b',
    });
    if (!res.isConfirmed) return;

    try {
      setClearingMsgHistory(true);
      await onAction(userId, 'clear_history');
      setDetails((prev: any) => ({ ...prev, lastMessages: [] }));
      Swal.fire('Cleared', 'Message history cleared.', 'success');
    } catch (e) {
      Swal.fire('Error', 'Failed to clear history', 'error');
    } finally {
      setClearingMsgHistory(false);
    }
  };

  const sendIndividualMessage = async (directTo?: string) => {
    const to =
      directTo ||
      (target === 'user'
        ? (details?.profile?.phoneNumber || user?.phoneNumber || '')
        : staffTarget);

    const text = String(msg || '').trim();
    if (!to) return Swal.fire('Error', 'No phone number found for target.', 'error');
    if (!text) return;

    const res = await Swal.fire({
      title: 'Confirm Message',
      text: `Send to: ${to}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Send Now',
    });
    if (!res.isConfirmed) return;

    try {
      setSending(true);
      await onAction(userId, 'send_message', { to, message: text });
      Swal.fire('Sent', 'Message queued', 'success');
      setMsg('');
    } catch (e) {
      Swal.fire('Error', 'Message failed', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleDeleteStaff = async (staffId: string, staffName: string) => {
    const res = await Swal.fire({
      title: 'Delete Staff?',
      text: `Are you sure you want to delete ${staffName}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, Delete',
      confirmButtonColor: '#dc2626',
    });
    if (!res.isConfirmed) return;

    try {
      await axios.delete(`${API_URL}/admin/staff/${staffId}`, { headers: authHeaders });
      Swal.fire('Deleted', 'Staff member removed.', 'success');
      refreshDetails();
    } catch (e) {
      Swal.fire('Error', 'Failed to delete staff', 'error');
    }
  };

  const handleUnlinkStaff = async (staffId: string, staffName: string) => {
    const res = await Swal.fire({
      title: 'Unlink Staff?',
      text: `Promote ${staffName} to independent business owner?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Unlink',
    });
    if (!res.isConfirmed) return;

    try {
      await axios.put(`${API_URL}/admin/staff/${staffId}/unlink`, {}, { headers: authHeaders });
      Swal.fire('Success', 'Staff promoted to Owner.', 'success');
      refreshDetails();
    } catch (e) {
      Swal.fire('Error', 'Failed to unlink staff', 'error');
    }
  };

  if (loadingDetails || !details) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 text-white">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin" />
            <p className="font-bold">Loading user details…</p>
          </div>
          <p className="text-slate-400 text-sm mt-2">Please wait.</p>
        </div>
      </div>
    );
  }

  const handleUpdatePhone = async () => {
    const currentPhone = details?.profile?.phoneNumber || '';
    const { value: newPhone } = await Swal.fire({
      title: 'Update WhatsApp Number',
      input: 'text',
      inputValue: currentPhone,
      inputLabel: 'Enter new phone number (with country code)',
      showCancelButton: true,
      inputValidator: (value) => {
        if (!value) return 'You need to write something!';
        if (value.length < 7) return 'Phone number too short!';
        return null; // Add return null for valid input
      }
    });

    if (newPhone && newPhone !== currentPhone) {
      try {
        await onAction(userId, 'update_phone', { phone: newPhone });
        
        setDetails((prev: any) => ({
          ...prev,
          profile: {
            ...prev.profile,
            phoneNumber: newPhone,
          },
        }));
      } catch (error) {
        // Error handled by parent
      }
    }
  };

  const handleUpdateEmail = async () => {
    const currentEmail = details?.profile?.email || '';
    const { value: newEmail } = await Swal.fire({
      title: 'Update Email Address',
      input: 'email',
      inputValue: currentEmail,
      inputLabel: 'Enter new email address',
      showCancelButton: true,
      inputValidator: (value) => {
        if (!value) return 'You need to write something!';
        return null;
      }
    });

    if (newEmail && newEmail !== currentEmail) {
      try {
        await onAction(userId, 'update_email', { email: newEmail });
        
        setDetails((prev: any) => ({
          ...prev,
          profile: {
            ...prev.profile,
            email: newEmail,
          },
        }));
        Swal.fire('Success', 'Email updated successfully', 'success');
      } catch (error) {
        // Error handled by parent/onAction
      }
    }
  };

  const tabBtn = (m: ViewType) =>
    `px-4 sm:px-6 py-3 text-sm font-semibold capitalize whitespace-nowrap ${
      view === m ? 'text-emerald-300 border-b-2 border-emerald-400' : 'text-slate-400 hover:text-white'
    }`;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-0 sm:p-4 backdrop-blur-sm">
      <div className="bg-slate-800 w-full sm:max-w-4xl h-[100dvh] sm:h-auto sm:max-h-[95dvh] rounded-none sm:rounded-2xl border border-slate-700 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-700 flex justify-between items-start bg-slate-900/60 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-2xl font-extrabold text-white flex items-center gap-2 truncate">
              {details?.profile?.businessName || 'User'}
              {details?.profile?.planType === 'TYCOON' && <Crown className="text-purple-400 w-5 h-5 shrink-0" />}
            </h2>
            
            <div className="flex flex-col gap-1 mt-1">
              <div className="flex items-center gap-2">
                <p className="text-slate-400 text-xs sm:text-sm font-mono break-words">
                  {details?.profile?.phoneNumber || '—'}
                </p>
                <button
                  onClick={handleUpdatePhone}
                  className="text-slate-500 hover:text-white transition"
                  title="Edit Phone Number"
                >
                  <Edit2 size={14} />
                </button>
              </div>
              {details?.profile?.email && (
                <div className="flex items-center gap-2">
                   <p className="text-slate-500 text-xs font-mono break-words">
                     {details.profile.email}
                   </p>
                   <button
                     onClick={handleUpdateEmail}
                     className="text-slate-500 hover:text-white transition"
                     title="Edit Email"
                   >
                     <Edit2 size={14} />
                   </button>
                </div>
              )}
              {!details?.profile?.email && (
                 <button
                    onClick={handleUpdateEmail}
                    className="text-xs text-emerald-500 hover:text-emerald-400 font-bold flex items-center gap-1 mt-1"
                 >
                    + Add Email
                 </button>
              )}
            </div>

            {details?.profile?.shopSlug && (
               <a 
                 href={`https://tallypadi.com/shop/${details.profile.shopSlug}`}
                 target="_blank"
                 rel="noopener noreferrer"
                 className="text-xs text-emerald-400 hover:underline flex items-center gap-1 mt-1"
               >
                 tallypadi.com/shop/{details.profile.shopSlug} <ExternalLink size={12} />
               </a>
            )}
          </div>

          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white p-2 -mr-2 rounded-xl hover:bg-white/10 transition"
            aria-label="Close"
          >
            <X size={22} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700 overflow-x-auto shrink-0 bg-slate-900/30">
          <button onClick={() => setView('info')} className={tabBtn('info')}>info</button>
          <button onClick={() => setView('inventory')} className={tabBtn('inventory')}>inventory</button>
          <button onClick={() => setView('sales')} className={tabBtn('sales')}>sales</button>
          <button onClick={() => setView('staff')} className={tabBtn('staff')}>staff</button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 pb-24 sm:pb-6">
          {/* INFO */}
          {view === 'info' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-700/30 rounded-xl border border-slate-600 space-y-3">
                <h3 className="text-slate-400 text-xs font-extrabold uppercase">Subscription</h3>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-slate-300">
                    <span>Plan</span> <span className="font-extrabold text-white">{details?.profile?.planType || '—'}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-300">
                    <span>Status</span>
                    <span
                      className={`uppercase font-extrabold ${
                        details?.profile?.subscriptionStatus === 'active' ? 'text-emerald-300' : 'text-red-300'
                      }`}
                    >
                      {details?.profile?.subscriptionStatus || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-300">
                    <span>Expires</span> <span>{expiryDisplay}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-300">
                    <span>Region</span>{' '}
                    <span>
                      {(details?.profile?.countryCode || 'NG').toUpperCase()} ({currencySymbol})
                    </span>
                  </div>
                </div>

                <div className="hidden sm:grid grid-cols-2 gap-2 mt-2">
                  <button
                    onClick={handlePlanChange}
                    className="bg-purple-600 text-white px-3 py-2 rounded-lg text-xs font-extrabold hover:bg-purple-500"
                  >
                    Renew / Change
                  </button>
                  <button
                    onClick={handleChangeExpiry}
                    className="bg-blue-600 text-white px-3 py-2 rounded-lg text-xs hover:bg-blue-500 flex items-center justify-center gap-1 font-extrabold"
                  >
                    <Calendar size={14} /> Set Expiry
                  </button>
                </div>

                {/* ✅ Danger Zone */}
                <div className="hidden sm:block mt-3 pt-3 border-t border-slate-600/60 space-y-2">
                  <h4 className="text-[11px] text-red-300 font-extrabold uppercase">Danger Zone</h4>

                  <button
                    disabled={clearingMsgHistory}
                    onClick={handleClearHistoryOnly}
                    className="w-full bg-amber-600/90 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-xs font-extrabold flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {clearingMsgHistory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 size={14} />}
                    Clear Message History
                  </button>

                  <button
                    disabled={deletingSales}
                    onClick={handleDeleteSalesHistoryOnly}
                    className="w-full bg-red-600/90 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-xs font-extrabold flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {deletingSales ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 size={14} />}
                    Delete Sales History
                  </button>

                  <button
                    disabled={deletingUser}
                    onClick={handleDeleteUserAndHistory}
                    className="w-full bg-red-800 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-xs font-extrabold flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {deletingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 size={14} />}
                    Delete User + Everything
                  </button>
                </div>
              </div>

              {/* Message panel + last messages */}
              <div className="space-y-4">
                <div className="p-4 bg-slate-700/30 rounded-xl border border-slate-600">
                  <h3 className="text-slate-400 text-xs uppercase font-extrabold mb-3 flex items-center gap-2">
                    <MessageSquare size={14} className="text-purple-300" /> Send Individual Message
                  </h3>

                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">Target</label>
                        <select
                          className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white focus:border-green-500 outline-none"
                          value={target}
                          onChange={(e) => setTarget(e.target.value as any)}
                        >
                          <option value="user">User (Main Number)</option>
                          <option value="staff">Staff</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">Recipient</label>
                        {target === 'user' ? (
                          <div className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm font-mono truncate">
                            {details?.profile?.phoneNumber || '—'}
                          </div>
                        ) : (
                          <select
                            className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white focus:border-green-500 outline-none"
                            value={staffTarget}
                            onChange={(e) => setStaffTarget(e.target.value)}
                          >
                            {(details?.staff || []).length ? (
                              (details.staff || []).map((s: any) => (
                                <option key={s._id} value={s.phoneNumber}>
                                  {(s.name || 'Staff')} — {s.phoneNumber}
                                </option>
                              ))
                            ) : (
                              <option value="">No staff found</option>
                            )}
                          </select>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">Message</label>
                      <textarea
                        className="w-full h-28 bg-slate-900 border border-slate-600 rounded-xl p-4 text-white focus:border-green-500 outline-none resize-none"
                        placeholder="Type message..."
                        value={msg}
                        onChange={(e) => setMsg(e.target.value)}
                      />
                    </div>

                    <button
                      disabled={sending || !msg.trim() || (target === 'staff' && !staffTarget)}
                      onClick={() => sendIndividualMessage()}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white font-extrabold py-4 rounded-xl shadow-lg shadow-blue-900/20 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send size={18} />}
                      Send Message
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-slate-700/30 rounded-xl border border-slate-600">
                  <h3 className="text-slate-400 text-xs uppercase font-extrabold mb-2">Last Messages</h3>
                  <div className="space-y-2">
                    {(details?.lastMessages || []).length ? (
                      (details.lastMessages || []).slice(-5).map((m: string, i: number) => (
                        <div
                          key={i}
                          className="text-xs bg-slate-900 p-2 rounded-lg text-slate-200 border border-slate-700"
                        >
                          <p className="break-words whitespace-pre-wrap">“{m}”</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-500 text-xs">No history.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SALES */}
          {view === 'sales' && (
            <div className="space-y-4">
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="text-xs text-slate-300">
                  <span className="font-extrabold text-white">Sales Records:</span>{' '}
                  {getFilteredSales().length.toLocaleString()}
                </div>

                <button
                  disabled={deletingSales}
                  onClick={handleDeleteSalesHistoryOnly}
                  className="bg-red-700 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-xs font-extrabold flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {deletingSales ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 size={14} />}
                  Delete Sales History
                </button>
              </div>

              <div className="bg-slate-900 p-3 rounded-xl border border-slate-700">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="date"
                    value={salesDate.start}
                    className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white w-full"
                    onChange={(e) => setSalesDate({ ...salesDate, start: e.target.value })}
                  />
                  <input
                    type="date"
                    value={salesDate.end}
                    className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white w-full"
                    onChange={(e) => setSalesDate({ ...salesDate, end: e.target.value })}
                  />
                  <div className="hidden sm:flex gap-2">
                    <button
                      onClick={() => exportSales('csv')}
                      className="flex-1 bg-emerald-700 text-white px-3 py-2 rounded-lg text-sm flex gap-2 items-center justify-center hover:bg-emerald-600 font-extrabold"
                    >
                      <Download size={16} /> CSV
                    </button>
                    <button
                      onClick={() => exportSales('pdf')}
                      className="flex-1 bg-red-700 text-white px-3 py-2 rounded-lg text-sm flex gap-2 items-center justify-center hover:bg-red-600 font-extrabold"
                    >
                      <FileText size={16} /> PDF
                    </button>
                  </div>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden space-y-3">
                {getFilteredSales().length === 0 ? (
                  <div className="text-center text-slate-400 text-sm py-10 border border-slate-700 rounded-xl bg-slate-900">
                    No sales found in this period.
                  </div>
                ) : (
                  getFilteredSales().map((s: any) => (
                    <div key={s._id} className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-slate-200 font-bold">{new Date(s.timestamp).toLocaleDateString()}</p>
                          <p className="text-xs text-slate-500">
                            {new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div className="text-emerald-300 font-mono font-bold whitespace-nowrap">
                          {currencySymbol}
                          {(s.totalMoney ?? 0).toLocaleString()}
                        </div>
                      </div>

                      <div className="mt-3 space-y-1">
                        {(s.items || []).length ? (
                          (s.items || []).slice(0, 4).map((i: any, idx: number) => (
                            <div key={idx} className="text-sm text-slate-200">
                              <span className="font-semibold">{i.name}</span>{' '}
                              <span className="text-slate-400">x{i.qty}</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-slate-500 text-sm">Unknown Item</p>
                        )}

                        {(s.items || []).length > 4 && (
                          <p className="text-xs text-slate-500">+{(s.items || []).length - 4} more…</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block bg-slate-900 rounded-xl overflow-hidden border border-slate-700 max-h-[60vh] overflow-y-auto">
                <table className="w-full text-xs text-left text-slate-300">
                  <thead className="text-slate-400 bg-slate-800 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 w-1/4">Date</th>
                      <th className="px-4 py-3 w-1/2">Items</th>
                      <th className="px-4 py-3 text-right w-1/4">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {getFilteredSales().length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                          No sales found in this period.
                        </td>
                      </tr>
                    ) : (
                      getFilteredSales().map((s: any) => (
                        <tr key={s._id} className="hover:bg-white/5">
                          <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                            {new Date(s.timestamp).toLocaleDateString()}
                            <br />
                            <span className="text-[10px] opacity-70">
                              {new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {(s.items || []).length ? (
                              (s.items || []).map((i: any, idx: number) => (
                                <div key={idx} className="mb-0.5">
                                  <span className="text-white font-medium">{i.name}</span>
                                  <span className="text-slate-500 ml-1">x{i.qty}</span>
                                </div>
                              ))
                            ) : (
                              <span className="text-slate-500">Unknown Item</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-emerald-300 font-mono font-bold whitespace-nowrap">
                            {currencySymbol}
                            {(s.totalMoney ?? 0).toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* INVENTORY */}
          {view === 'inventory' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(details?.inventory || []).map((item: any) => (
                <div
                  key={item._id}
                  className="bg-slate-700/50 p-3 rounded-xl border border-slate-600 flex justify-between items-center"
                >
                  <div className="min-w-0">
                    <p className="font-extrabold text-white truncate">{item.name}</p>
                    <p className="text-xs text-slate-400">
                      {currencySymbol}
                      {(item.lastUnitPrice ?? 0).toLocaleString()}
                    </p>
                  </div>
                  <span className="bg-slate-800 text-slate-200 px-2 py-1 rounded-lg text-xs whitespace-nowrap font-bold">
                    x{item.quantity}
                  </span>
                </div>
              ))}
              {(details?.inventory || []).length === 0 && (
                <p className="text-slate-500 p-4">No inventory found for this user.</p>
              )}
            </div>
          )}

          {/* STAFF */}
          {view === 'staff' && (
            <div className="space-y-2">
              {(details?.staff || []).length === 0 ? (
                <p className="text-slate-500 p-4">No staff found.</p>
              ) : (
                (details.staff || []).map((s: any) => (
                  <div
                    key={s._id}
                    className="flex justify-between items-center bg-slate-700/50 p-3 rounded-xl border border-slate-600"
                  >
                    <div className="min-w-0">
                      <p className="font-extrabold text-white truncate">{s.name || 'Staff'}</p>
                      <p className="text-xs text-slate-400 break-words">{s.phoneNumber}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleUnlinkStaff(s._id, s.name)}
                        className="p-2 rounded-xl hover:bg-white/10 transition text-slate-400 hover:text-amber-400"
                        title="Unlink (Promote to Owner)"
                      >
                        <Unlink size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteStaff(s._id, s.name)}
                        className="p-2 rounded-xl hover:bg-white/10 transition text-slate-400 hover:text-red-400"
                        title="Delete Staff"
                      >
                        <Trash2 size={16} />
                      </button>
                      <button
                        onClick={() => {
                          setTarget('staff');
                          setStaffTarget(s.phoneNumber);
                          setView('info');
                          Swal.fire('Selected', `Staff selected: ${s.name || 'Staff'}`, 'info');
                        }}
                        className="p-2 rounded-xl hover:bg-white/10 transition text-slate-400 hover:text-emerald-400"
                        title="Send message to staff"
                      >
                        <Share2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* ✅ MOBILE FOOTER */}
        <div className="sm:hidden shrink-0 border-t border-slate-700 bg-slate-900/80 backdrop-blur-md px-4 py-3">
          {view === 'info' && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={handlePlanChange} className="bg-purple-600 text-white py-3 rounded-xl text-sm font-extrabold">
                Renew / Change
              </button>
              <button
                onClick={handleChangeExpiry}
                className="bg-blue-600 text-white py-3 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2"
              >
                <Calendar size={16} /> Set Expiry
              </button>

              <button
                disabled={clearingMsgHistory}
                onClick={handleClearHistoryOnly}
                className="bg-amber-600/90 text-white py-3 rounded-xl text-sm font-extrabold col-span-2 disabled:opacity-60"
              >
                {clearingMsgHistory ? 'Clearing…' : 'Clear Message History'}
              </button>

              <button
                disabled={deletingSales}
                onClick={handleDeleteSalesHistoryOnly}
                className="bg-red-600/90 text-white py-3 rounded-xl text-sm font-extrabold col-span-2 disabled:opacity-60"
              >
                {deletingSales ? 'Deleting…' : 'Delete Sales History'}
              </button>

              <button
                disabled={deletingUser}
                onClick={handleDeleteUserAndHistory}
                className="bg-red-800 text-white py-3 rounded-xl text-sm font-extrabold col-span-2 disabled:opacity-60"
              >
                {deletingUser ? 'Deleting…' : 'Delete User + Everything'}
              </button>
            </div>
          )}

          {view === 'sales' && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => exportSales('csv')}
                className="bg-emerald-700 text-white py-3 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2"
              >
                <Download size={16} /> CSV
              </button>
              <button
                onClick={() => exportSales('pdf')}
                className="bg-red-700 text-white py-3 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2"
              >
                <FileText size={16} /> PDF
              </button>

              <button
                disabled={deletingSales}
                onClick={handleDeleteSalesHistoryOnly}
                className="col-span-2 bg-red-600/90 text-white py-3 rounded-xl text-sm font-extrabold disabled:opacity-60"
              >
                {deletingSales ? 'Deleting…' : 'Delete Sales History'}
              </button>
            </div>
          )}

          {(view === 'inventory' || view === 'staff') && (
            <button onClick={onClose} className="w-full bg-white/10 text-white py-3 rounded-xl text-sm font-extrabold">
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
