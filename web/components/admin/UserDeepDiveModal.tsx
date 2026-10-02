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
  Mail,
  Sparkles,
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

export interface DeepDiveUser {
  id?: string;
  _id?: string;
  businessName?: string;
  phoneNumber?: string;
  email?: string;
}

export interface UserProfile {
  _id?: string;
  name?: string;
  businessName?: string;
  phoneNumber?: string;
  email?: string;
  countryCode?: string;
  subscriptionStatus?: string;
  trialEndsAt?: string | Date;
  nextBillingDate?: string | Date;
  planType?: string;
  shopSlug?: string;
  emailSubscribed?: boolean;
}

export interface DeepDiveDetails {
  profile?: UserProfile;
  staff?: Record<string, unknown>[];
  recentSales?: Record<string, unknown>[];
  lastMessages?: string[];
  inventory?: Record<string, unknown>[];
}

export default function UserDeepDiveModal({
  user,
  onClose,
  adminToken,
  onAction,
  role = 'admin',
}: {
  user: DeepDiveUser;
  onClose: () => void;
  adminToken: string;
  onAction: (userId: string, action: string, payload?: Record<string, unknown>) => Promise<unknown>;
  role?: 'admin' | 'agent';
}) {
  const userId = String(user?.id || user?._id || '').trim();

  const [details, setDetails] = useState<DeepDiveDetails | null>(null);
  const [view, setView] = useState<ViewType>('info');
  const [salesDate, setSalesDate] = useState({ start: '', end: '' });
  const [loadingDetails, setLoadingDetails] = useState(false);

  // ✅ Individual message UI (like Broadcast)
  const [target, setTarget] = useState<'user' | 'staff'>('user');
  const [staffTarget, setStaffTarget] = useState<string>(''); // phone number
  const [msg, setMsg] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [sendWhatsapp, setSendWhatsapp] = useState(true);
  const [includeUnsubscribed, setIncludeUnsubscribed] = useState(false);
  const [aiBrief, setAiBrief] = useState('');
  const [composing, setComposing] = useState(false);
  const [sending, setSending] = useState(false);

  const [deletingUser, setDeletingUser] = useState(false);
  const [clearingMsgHistory, setClearingMsgHistory] = useState(false);
  const [deletingSales, setDeletingSales] = useState(false);
  const [deletingInventoryId, setDeletingInventoryId] = useState<string | null>(null);
  const [clearingInventory, setClearingInventory] = useState(false);

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${adminToken}` }),
    [adminToken]
  );

  useEffect(() => {
    if (!adminToken) {
      void Swal.fire('Auth Error', 'Missing admin token. Please login again.', 'error').then(onClose);
    }
  }, [adminToken, onClose]);

  // ✅ Central refresh (prevents stale UI after deletes)
  const refreshDetails = useCallback(async () => {
    if (!userId || !adminToken) return;

    setLoadingDetails(true);
    try {
      const endpoint = role === 'agent' ? '/support/users' : '/admin/users';
      const res = await axios.get(`${API_URL}${endpoint}/${userId}/details`, {
        headers: authHeaders,
      });
      setDetails(res.data as DeepDiveDetails);
    } catch (e: unknown) {
      const error = e as { response?: { status?: number } };
      const status = error?.response?.status;
      if (status === 401) Swal.fire('Unauthorized', 'Your session expired. Please login again.', 'error');
      else if (status === 403) Swal.fire('Forbidden', 'Admin access required.', 'error');
      else Swal.fire('Error', 'Failed to load details', 'error');
    } finally {
      setLoadingDetails(false);
    }
  }, [userId, adminToken, authHeaders, role]);

  // ── Admin: Delete one inventory item ────────────────────────────────────────
  const handleDeleteInventoryItem = async (itemId: string, itemName: string) => {
    const confirm = await Swal.fire({
      title: `Delete "${itemName}"?`,
      text: 'This will permanently remove this product from the user\'s inventory.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Yes, Delete',
    });
    if (!confirm.isConfirmed) return;

    setDeletingInventoryId(itemId);
    try {
      const endpoint = role === 'agent' ? '/support/users' : '/admin/users';
      await axios.delete(`${API_URL}${endpoint}/${userId}/inventory/${itemId}`, { headers: authHeaders });
      // Optimistic removal
      setDetails(prev => prev ? {
        ...prev,
        inventory: (prev.inventory || []).filter(i => String(i._id) !== itemId)
      } : prev);
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Deleted', showConfirmButton: false, timer: 1500 });
    } catch {
      Swal.fire('Error', 'Failed to delete item.', 'error');
    } finally {
      setDeletingInventoryId(null);
    }
  };

  // ── Admin: Clear ALL inventory ───────────────────────────────────────────────
  const handleClearInventory = async () => {
    const total = (details?.inventory || []).length;
    const confirm = await Swal.fire({
      title: 'Clear ALL Inventory?',
      text: `This will permanently delete all ${total} product(s) from this user's stock. Cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      confirmButtonText: 'Yes, Clear All',
    });
    if (!confirm.isConfirmed) return;

    setClearingInventory(true);
    try {
      const endpoint = role === 'agent' ? '/support/users' : '/admin/users';
      const res = await axios.delete(`${API_URL}${endpoint}/${userId}/inventory`, { headers: authHeaders });
      setDetails(prev => prev ? { ...prev, inventory: [] } : prev);
      Swal.fire('Cleared', `${res.data.deleted} item(s) deleted.`, 'success');
    } catch {
      Swal.fire('Error', 'Failed to clear inventory.', 'error');
    } finally {
      setClearingInventory(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshDetails(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshDetails]);

  // auto-set default staff target when staff loads
  useEffect(() => {
    const staff = details?.staff || [];
    if (staff.length && !staffTarget) {
      const timer = window.setTimeout(() => setStaffTarget(String(staff[0]?.phoneNumber || '')), 0);
      return () => window.clearTimeout(timer);
    }
  }, [details?.staff, staffTarget]);

  const currencySymbol = useMemo(() => {
    const code = details?.profile?.countryCode || 'NG';
    return COUNTRY_CURRENCIES[String(code).toUpperCase()] || '₦';
  }, [details?.profile?.countryCode]);

  const expiryDisplay = useMemo(() => {
    // For trial, use trialEndsAt. For everything else (active, past_due, cancelled), try nextBillingDate first.
    const profile = details?.profile;
    const isTrial = profile?.subscriptionStatus === 'trial';
    
    const d = isTrial 
      ? profile?.trialEndsAt 
      : (profile?.nextBillingDate || profile?.trialEndsAt);

    if (!d) return '—';
    const dt = new Date(d);
    return Number.isFinite(dt.getTime()) ? dt.toLocaleDateString() : '—';
  }, [details?.profile?.trialEndsAt, details?.profile?.nextBillingDate, details?.profile?.subscriptionStatus]);

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

      setDetails((prev) => prev ? ({
        ...prev,
        profile: {
          ...(prev.profile as UserProfile),
          planType: plan,
          subscriptionStatus: 'active',
          trialEndsAt: expiryDate,
        },
      }) : null);
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
      setDetails((prev) => prev ? ({
        ...prev,
        profile: { ...(prev.profile as UserProfile), subscriptionStatus: 'cancelled', trialEndsAt: newDate },
      }) : null);
      Swal.fire('Updated', 'Date is in past. User Cancelled.', 'info');
    } else {
      await onAction(userId, 'activate');
      setDetails((prev) => prev ? ({
        ...prev,
        profile: { ...(prev.profile as UserProfile), subscriptionStatus: 'active', trialEndsAt: newDate },
      }) : null);
      Swal.fire('Updated', 'Expiration date extended.', 'success');
    }
  };

  const isUnknownItemSale = (s: Record<string, unknown>) => {
    const items = Array.isArray(s?.items) ? s.items : [];
    if (!items.length) return true;

    return items.some((i: unknown) => {
      const itemRecord = i as { name?: string };
      const name = String(itemRecord?.name ?? '').trim().toLowerCase();
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

    data = data.filter((s: Record<string, unknown>) => !s?.isUndone && !isUnknownItemSale(s));

    if (salesDate.start) data = data.filter((s: Record<string, unknown>) => new Date(String(s.timestamp)) >= new Date(salesDate.start));

    if (salesDate.end) {
      const end = new Date(salesDate.end);
      end.setHours(23, 59, 59);
      data = data.filter((s: Record<string, unknown>) => new Date(String(s.timestamp)) <= end);
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
          .map((s: Record<string, unknown>) => {
            const items = ((s.items as Record<string, unknown>[]) || []).map((i) => `${i.qty}x ${i.name}`).join('; ');
            const amount = s.totalMoney ?? 0;
            return `${new Date(String(s.timestamp)).toLocaleDateString()},"${items}",${amount}`;
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
      body: data.map((s: Record<string, unknown>) => {
        const amount = s.totalMoney ?? 0;
        return [
          new Date(String(s.timestamp)).toLocaleDateString(),
          ((s.items as Record<string, unknown>[]) || []).map((i) => `${i.qty}x ${i.name}`).join(', '),
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
      setDetails((prev) => prev ? ({ ...prev, recentSales: [] }) : null);
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
      setDetails((prev) => prev ? ({ ...prev, lastMessages: [] }) : null);
      Swal.fire('Cleared', 'Message history cleared.', 'success');
    } catch (e) {
      Swal.fire('Error', 'Failed to clear history', 'error');
    } finally {
      setClearingMsgHistory(false);
    }
  };

  const sendIndividualMessage = async (directTo?: string) => {
    const text = String(msg || '').trim();
    if (!text) return;

    const selectedStaff = (details?.staff || []).find((staff) => String(staff.phoneNumber || '') === staffTarget);
    const recipientId = target === 'user'
      ? String(details?.profile?._id || userId)
      : String(selectedStaff?._id || '');
    const recipientPhone = directTo || (target === 'user'
      ? (details?.profile?.phoneNumber || user?.phoneNumber || '')
      : staffTarget);
    const recipientEmail = target === 'user'
      ? details?.profile?.email
      : String(selectedStaff?.email || '');
    const channels = [sendEmail ? 'email' : '', sendWhatsapp ? 'whatsapp' : ''].filter(Boolean);

    if (role === 'agent') {
      if (!recipientPhone) return Swal.fire('Error', 'No phone number found for target.', 'error');
      const confirmation = await Swal.fire({
        title: 'Confirm WhatsApp message',
        text: `Send to: ${recipientPhone}`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Send Now',
      });
      if (!confirmation.isConfirmed) return;
      try {
        setSending(true);
        await onAction(userId, 'send_message', { to: recipientPhone, message: text });
        Swal.fire('Sent', 'WhatsApp message sent.', 'success');
        setMsg('');
      } catch {
        Swal.fire('Error', 'Message failed', 'error');
      } finally {
        setSending(false);
      }
      return;
    }

    if (!recipientId) return Swal.fire('Error', 'No recipient was selected.', 'error');
    if (!channels.length) return Swal.fire('Choose a channel', 'Select Email, WhatsApp, or both.', 'warning');
    if (sendEmail && !recipientEmail) return Swal.fire('No email', 'This recipient does not have an email address.', 'warning');
    if (sendEmail && !emailSubject.trim()) return Swal.fire('Subject required', 'Add an email subject before sending.', 'warning');
    if (sendWhatsapp && !recipientPhone) return Swal.fire('No WhatsApp number', 'This recipient does not have a WhatsApp number.', 'warning');

    const res = await Swal.fire({
      title: 'Send personal message?',
      text: `Send by ${channels.join(' and ')} to ${target === 'user' ? details?.profile?.businessName || 'this user' : String(selectedStaff?.name || 'this staff member')}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Send Now',
    });
    if (!res.isConfirmed) return;

    try {
      setSending(true);
      const response = await axios.post(`${API_URL}/admin/users/${recipientId}/messages/send`, {
        channels,
        subject: emailSubject.trim(),
        message: text,
        includeUnsubscribed,
      }, { headers: authHeaders });
      await Swal.fire(
        response.data?.partial ? 'Partly sent' : 'Sent',
        response.data?.message || 'Personal message sent.',
        response.data?.partial ? 'warning' : 'success'
      );
      setMsg('');
      setEmailSubject('');
      setAiBrief('');
    } catch (error: unknown) {
      const message = axios.isAxiosError(error) ? error.response?.data?.error : undefined;
      Swal.fire('Message failed', message || 'The message could not be delivered.', 'error');
    } finally {
      setSending(false);
    }
  };

  const composeMessageWithAi = async () => {
    const brief = aiBrief.trim();
    if (brief.length < 5) return Swal.fire('Add context', 'Tell the AI what you want to say.', 'warning');
    const selectedStaff = (details?.staff || []).find((staff) => String(staff.phoneNumber || '') === staffTarget);
    const recipientId = target === 'user'
      ? String(details?.profile?._id || userId)
      : String(selectedStaff?._id || '');
    const channels = [sendEmail ? 'email' : '', sendWhatsapp ? 'whatsapp' : ''].filter(Boolean);
    if (!recipientId || !channels.length) return Swal.fire('Choose a recipient and channel', '', 'warning');

    setComposing(true);
    try {
      const response = await axios.post(`${API_URL}/admin/users/${recipientId}/messages/compose`, {
        brief,
        channels,
      }, { headers: authHeaders });
      const draft = response.data?.draft;
      setMsg(String(draft?.message || ''));
      if (sendEmail) setEmailSubject(String(draft?.subject || ''));
      if (draft?.source === 'FALLBACK') {
        Swal.fire('Draft prepared', 'AI was temporarily unavailable, so a simple editable draft was prepared.', 'info');
      }
    } catch (error: unknown) {
      const message = axios.isAxiosError(error) ? error.response?.data?.error : undefined;
      Swal.fire('Could not compose', message || 'Try again or write the message manually.', 'error');
    } finally {
      setComposing(false);
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
      const endpoint = role === 'agent' ? '/support/staff' : '/admin/staff';
      await axios.delete(`${API_URL}${endpoint}/${staffId}`, { headers: authHeaders });
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
      const endpoint = role === 'agent' ? '/support/staff' : '/admin/staff';
      await axios.put(`${API_URL}${endpoint}/${staffId}/unlink`, {}, { headers: authHeaders });
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
        
        setDetails((prev) => prev ? ({
          ...prev,
          profile: {
            ...prev.profile,
            phoneNumber: newPhone,
          },
        }) : null);
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
        
        setDetails((prev) => prev ? ({
          ...prev,
          profile: {
            ...prev.profile,
            email: newEmail,
          },
        }) : null);
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

  const selectedStaffRecord = (details?.staff || []).find((staff) => String(staff.phoneNumber || '') === staffTarget);
  const activeRecipient = target === 'user' ? details?.profile : selectedStaffRecord;
  const activeRecipientEmail = String(activeRecipient?.email || '');
  const activeRecipientPhone = String(activeRecipient?.phoneNumber || '');
  const activeRecipientUnsubscribed = activeRecipient?.emailSubscribed === false;

  if (!adminToken) return null;

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
                {role !== 'agent' && (
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
                )}
              </div>

              {/* Message panel + last messages */}
              <div className="space-y-4">
                <div className="p-4 bg-slate-700/30 rounded-xl border border-slate-600">
                  <h3 className="text-slate-400 text-xs uppercase font-extrabold mb-3 flex items-center gap-2">
                    <MessageSquare size={14} className="text-purple-300" /> Personal message
                  </h3>

                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">Target</label>
                        <select
                          className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white focus:border-green-500 outline-none"
                          value={target}
                          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                            setTarget(e.target.value as 'user' | 'staff');
                            setIncludeUnsubscribed(false);
                          }}
                        >
                          <option value="user">User (Main Number)</option>
                          <option value="staff">Staff</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">Recipient</label>
                        {target === 'user' ? (
                          <div className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm truncate">
                            <span className="block font-mono">{details?.profile?.phoneNumber || '—'}</span>
                            {details?.profile?.email && <span className="mt-1 block truncate text-xs text-slate-500">{details.profile.email}</span>}
                          </div>
                        ) : (
                          <select
                            className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white focus:border-green-500 outline-none"
                            value={staffTarget}
                            onChange={(e) => {
                              setStaffTarget(e.target.value);
                              setIncludeUnsubscribed(false);
                            }}
                          >
                            {(details?.staff || []).length ? (
                              (details.staff as Record<string, unknown>[]).map((s) => (
                                <option key={String(s._id)} value={String(s.phoneNumber)}>
                                  {String(s.name || 'Staff')} — {String(s.phoneNumber)}
                                </option>
                              ))
                            ) : (
                              <option value="">No staff found</option>
                            )}
                          </select>
                        )}
                      </div>
                    </div>

                    {role !== 'agent' && (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setSendWhatsapp((current) => !current)}
                            className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold transition ${sendWhatsapp ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300' : 'border-slate-600 bg-slate-900 text-slate-400'}`}
                          >
                            <MessageSquare size={16} /> WhatsApp
                          </button>
                          <button
                            type="button"
                            onClick={() => setSendEmail((current) => !current)}
                            className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold transition ${sendEmail ? 'border-blue-500 bg-blue-500/15 text-blue-300' : 'border-slate-600 bg-slate-900 text-slate-400'}`}
                          >
                            <Mail size={16} /> Email
                          </button>
                        </div>

                        <div className="rounded-xl border border-purple-500/25 bg-purple-500/10 p-3">
                          <label className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase text-purple-200">
                            <Sparkles size={14} /> Compose with AI
                          </label>
                          <textarea
                            className="h-20 w-full resize-none rounded-lg border border-slate-600 bg-slate-900 p-3 text-sm text-white outline-none focus:border-purple-500"
                            placeholder="Example: Remind the user that their subscription expires on Friday and ask them to renew. Keep it friendly."
                            value={aiBrief}
                            onChange={(event) => setAiBrief(event.target.value)}
                            maxLength={4000}
                          />
                          <button
                            type="button"
                            disabled={composing || aiBrief.trim().length < 5 || (!sendEmail && !sendWhatsapp)}
                            onClick={composeMessageWithAi}
                            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-3 py-2.5 text-sm font-extrabold text-white transition hover:bg-purple-500 disabled:opacity-50"
                          >
                            {composing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles size={16} />}
                            Write draft
                          </button>
                        </div>

                        {sendEmail && (
                          <div>
                            <label className="mb-1 block text-[10px] font-extrabold uppercase text-slate-400">Email subject</label>
                            <input
                              type="text"
                              className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
                              placeholder="Subject"
                              value={emailSubject}
                              onChange={(event) => setEmailSubject(event.target.value)}
                              maxLength={160}
                            />
                          </div>
                        )}

                        {sendEmail && activeRecipientUnsubscribed && (
                          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                            <input
                              type="checkbox"
                              checked={includeUnsubscribed}
                              onChange={(event) => setIncludeUnsubscribed(event.target.checked)}
                              className="mt-0.5 h-4 w-4 accent-amber-500"
                            />
                            <span><strong>Emergency email override.</strong> This user unsubscribed. Use only for an essential account message.</span>
                          </label>
                        )}

                        <div className="rounded-lg bg-slate-900/70 px-3 py-2 text-xs text-slate-400">
                          {sendWhatsapp && <span className={activeRecipientPhone ? '' : 'text-amber-300'}>WhatsApp: {activeRecipientPhone || 'missing'}</span>}
                          {sendWhatsapp && sendEmail && <span> · </span>}
                          {sendEmail && <span className={activeRecipientEmail ? '' : 'text-amber-300'}>Email: {activeRecipientEmail || 'missing'}</span>}
                        </div>
                      </>
                    )}

                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">Message</label>
                      <textarea
                        className="w-full h-36 bg-slate-900 border border-slate-600 rounded-xl p-4 text-white focus:border-green-500 outline-none resize-none"
                        placeholder="Write or generate the message, then edit it here..."
                        value={msg}
                        onChange={(e) => setMsg(e.target.value)}
                        maxLength={5000}
                      />
                    </div>

                    <button
                      disabled={sending || !msg.trim() || (target === 'staff' && !staffTarget) || (role !== 'agent' && !sendEmail && !sendWhatsapp)}
                      onClick={() => sendIndividualMessage()}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white font-extrabold py-4 rounded-xl shadow-lg shadow-blue-900/20 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send size={18} />}
                      {role === 'agent' ? 'Send WhatsApp Message' : `Send${sendEmail && sendWhatsapp ? ' Email + WhatsApp' : sendEmail ? ' Email' : sendWhatsapp ? ' WhatsApp' : ' Message'}`}
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
                  (getFilteredSales() as Record<string, unknown>[]).map((s) => (
                    <div key={String(s._id)} className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-slate-200 font-bold">{new Date(String(s.timestamp)).toLocaleDateString()}</p>
                          <p className="text-xs text-slate-500">
                            {new Date(String(s.timestamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div className="text-emerald-300 font-mono font-bold whitespace-nowrap">
                          {currencySymbol}
                          {Number(s.totalMoney ?? 0).toLocaleString()}
                        </div>
                      </div>

                      <div className="mt-3 space-y-1">
                        {((s.items as Record<string, unknown>[]) || []).length ? (
                          ((s.items as Record<string, unknown>[]) || []).slice(0, 4).map((i, idx: number) => (
                            <div key={idx} className="text-sm text-slate-200">
                              <span className="font-semibold">{String(i.name)}</span>{' '}
                              <span className="text-slate-400">x{String(i.qty)}</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-slate-500 text-sm">Unknown Item</p>
                        )}

                        {((s.items as unknown[]) || []).length > 4 && (
                          <p className="text-xs text-slate-500">+{(s.items as unknown[]).length - 4} more…</p>
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
                      (getFilteredSales() as Record<string, unknown>[]).map((s) => (
                        <tr key={String(s._id)} className="hover:bg-white/5">
                          <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                            {new Date(String(s.timestamp)).toLocaleDateString()}
                            <br />
                            <span className="text-[10px] opacity-70">
                              {new Date(String(s.timestamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {((s.items as unknown[]) || []).length ? (
                              ((s.items as Record<string, unknown>[]) || []).map((i, idx: number) => (
                                <div key={idx} className="mb-0.5">
                                  <span className="text-white font-medium">{String(i.name)}</span>
                                  <span className="text-slate-500 ml-1">x{String(i.qty)}</span>
                                </div>
                              ))
                            ) : (
                              <span className="text-slate-500">Unknown Item</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-emerald-300 font-mono font-bold whitespace-nowrap">
                            {currencySymbol}
                            {Number(s.totalMoney ?? 0).toLocaleString()}
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
            <div className="space-y-3">
              {/* Clear All header row — always visible */}
              {(details?.inventory || []).length > 0 && (
                <div className="flex items-center justify-between">
                  <p className="text-slate-400 text-xs font-extrabold uppercase">
                    {(details?.inventory || []).length} product(s)
                  </p>
                  <button
                    disabled={clearingInventory}
                    onClick={handleClearInventory}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600/20 text-red-400 hover:bg-red-600/40 text-xs font-extrabold transition disabled:opacity-50"
                  >
                    <Trash2 size={12} />
                    {clearingInventory ? 'Clearing…' : 'Clear All'}
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {((details?.inventory as Record<string, unknown>[]) || []).map((item) => (
                  <div
                    key={String(item._id)}
                    className="bg-slate-700/50 p-3 rounded-xl border border-slate-600 flex justify-between items-center gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-extrabold text-white truncate">{String(item.name)}</p>
                      <p className="text-xs text-slate-400">
                        {currencySymbol}
                        {Number(item.lastUnitPrice ?? 0).toLocaleString()}
                      </p>
                    </div>
                    <span className="bg-slate-800 text-slate-200 px-2 py-1 rounded-lg text-xs whitespace-nowrap font-bold">
                      x{String(item.quantity)}
                    </span>
                    <button
                      title="Delete this item"
                      disabled={deletingInventoryId === String(item._id)}
                      onClick={() => handleDeleteInventoryItem(String(item._id), String(item.name))}
                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition shrink-0 disabled:opacity-40"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {((details?.inventory as unknown[]) || []).length === 0 && (
                  <p className="text-slate-500 p-4 col-span-3">No inventory found for this user.</p>
                )}
              </div>
            </div>
          )}

          {/* STAFF */}
          {view === 'staff' && (
            <div className="space-y-2">
              {((details?.staff as unknown[]) || []).length === 0 ? (
                <p className="text-slate-500 p-4">No staff found.</p>
              ) : (
                ((details?.staff as Record<string, unknown>[]) || []).map((s) => (
                  <div
                    key={String(s._id)}
                    className="flex justify-between items-center bg-slate-700/50 p-3 rounded-xl border border-slate-600"
                  >
                    <div className="min-w-0">
                      <p className="font-extrabold text-white truncate">{String(s.name || 'Staff')}</p>
                      <p className="text-xs text-slate-400 break-words">{String(s.phoneNumber)}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleUnlinkStaff(String(s._id), String(s.name))}
                        className="p-2 rounded-xl hover:bg-white/10 transition text-slate-400 hover:text-amber-400"
                        title="Unlink (Promote to Owner)"
                      >
                        <Unlink size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteStaff(String(s._id), String(s.name))}
                        className="p-2 rounded-xl hover:bg-white/10 transition text-slate-400 hover:text-red-400"
                        title="Delete Staff"
                      >
                        <Trash2 size={16} />
                      </button>
                      <button
                        onClick={() => {
                          setTarget('staff');
                          setStaffTarget(String(s.phoneNumber));
                          setView('info');
                          Swal.fire('Selected', `Staff selected: ${String(s.name || 'Staff')}`, 'info');
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
            <div className="flex gap-2">
              {view === 'inventory' && (details?.inventory || []).length > 0 && (
                <button
                  disabled={clearingInventory}
                  onClick={handleClearInventory}
                  className="flex-1 bg-red-700/80 text-white py-3 rounded-xl text-sm font-extrabold disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <Trash2 size={14} />
                  {clearingInventory ? 'Clearing…' : 'Clear All Inventory'}
                </button>
              )}
              <button onClick={onClose} className="flex-1 bg-white/10 text-white py-3 rounded-xl text-sm font-extrabold">
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
