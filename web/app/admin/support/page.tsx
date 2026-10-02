'use client';

import { useCallback, useEffect, useState, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import io, { Socket } from 'socket.io-client';
import { 
  Trash2, Search, User, MessageSquare, ArrowLeft, RefreshCw, Send, LayoutDashboard, Wifi, WifiOff
} from 'lucide-react';
import Swal from 'sweetalert2';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';
const getAdminToken = () => typeof window === 'undefined' ? '' : (sessionStorage.getItem('adminToken') || '');
const adminHeaders = () => ({ Authorization: `Bearer ${getAdminToken()}` });

interface Ticket {
  _id: string;
  userPhone: string;
  status: string;
  lastMessageAt: string;
  priority: string;
  assignedAt?: string;
  assignedAgentId?: { _id: string; username: string } | string;
}

interface Message {
  _id: string;
  text: string;
  direction: 'IN' | 'OUT';
  timestamp: string;
}

function safeDate(d: unknown) {
    if (!d) return null;
    const date = d instanceof Date ? new Date(d.getTime()) : new Date(String(d));
    return isNaN(date.getTime()) ? null : date;
}

function formatTime(d: unknown) {
    const date = safeDate(d);
    if (!date) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(d: unknown) {
    const date = safeDate(d);
    if (!date) return '';
    return date.toLocaleDateString();
}

function AdminSupportContent() {
  const router = useRouter();
  const socketRef = useRef<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  
  // Data
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const selectedTicketRef = useRef<Ticket | null>(null); // For socket closure

  // UI
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    selectedTicketRef.current = selectedTicket;
  }, [selectedTicket]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    window.setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior }), 60);
  }, []);

  const fetchTickets = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch(`${API_URL}/support/admin/tickets`, { headers: adminHeaders() });
      if (res.status === 401 || res.status === 403) {
        router.replace('/admin');
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setTickets(Array.isArray(data) ? data : []);
        setSelectedTicket((current) => {
          if (!current) return current;
          const fresh = (Array.isArray(data) ? data : []).find((ticket: Ticket) => ticket._id === current._id);
          if (!fresh) return null;
          const currentAgent = typeof current.assignedAgentId === 'object' ? current.assignedAgentId?._id : current.assignedAgentId;
          const freshAgent = typeof fresh.assignedAgentId === 'object' ? fresh.assignedAgentId?._id : fresh.assignedAgentId;
          return current.status === fresh.status
            && current.lastMessageAt === fresh.lastMessageAt
            && current.priority === fresh.priority
            && currentAgent === freshAgent
            ? current
            : fresh;
        });
      }
    } catch (error) {
      console.error('Could not load support tickets', error);
    } finally {
      if (!silent) setRefreshing(false);
      setLoading(false);
    }
  }, [router]);

  const fetchMessages = useCallback(async (ticketId: string, silent = false) => {
    try {
      const res = await fetch(`${API_URL}/support/admin/tickets/${ticketId}/messages`, { headers: adminHeaders() });
      if (res.status === 401 || res.status === 403) {
        router.replace('/admin');
        return;
      }
      if (res.ok) {
        const data: Message[] = await res.json();
        if (selectedTicketRef.current?._id !== ticketId) return;
        setMessages((current) => {
          const pending = current.filter((message) => message._id.startsWith('temp-'));
          const merged = [...(Array.isArray(data) ? data : []), ...pending];
          return Array.from(new Map(merged.map((message) => [message._id, message])).values());
        });
        if (!silent) scrollToBottom('auto');
      }
    } catch (error) {
      console.error('Could not load support messages', error);
    }
  }, [router, scrollToBottom]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !inputText.trim()) return;

    // Optimistic UI
    const tempId = 'temp-' + Date.now();
    const tempMsg: Message = { 
        _id: tempId, 
        text: inputText, 
        direction: 'OUT', 
        timestamp: new Date().toISOString() 
    };
    setMessages(prev => [...prev, tempMsg]);
    setInputText('');
    scrollToBottom();

    try {
        setSending(true);
        const res = await fetch(`${API_URL}/support/admin/tickets/${selectedTicket._id}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...adminHeaders() },
            body: JSON.stringify({ text: tempMsg.text })
        });
        
        if (res.ok) {
            const realMsg = await res.json();
            setMessages(prev => {
                const withoutTemporary = prev.filter(message => message._id !== tempId);
                if (withoutTemporary.some(message => message._id === realMsg._id)) return withoutTemporary;
                return [...withoutTemporary, realMsg];
            });
            void fetchTickets(true);
        } else {
             const error = await res.json().catch(() => ({}));
             setMessages(prev => prev.filter(message => message._id !== tempId));
             setInputText(tempMsg.text);
             Swal.fire('Send failed', error?.error || 'The reply could not be sent.', 'error');
        }
    } catch (error) {
        console.error(error);
        setMessages(prev => prev.filter(message => message._id !== tempId));
        setInputText(tempMsg.text);
        Swal.fire('Network problem', 'The reply was not sent. Please try again.', 'error');
    } finally {
        setSending(false);
    }
  };

  // Init
  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      router.replace('/admin');
      return;
    }

    const baseUrl = API_URL.endsWith('/api') ? API_URL.slice(0, -4) : API_URL;
    const socketConn = io(baseUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });
    socketRef.current = socketConn;

    const upsertTicket = (incoming: Ticket) => {
      if (!incoming?._id) return;
      setTickets((current) => [incoming, ...current.filter((ticket) => ticket._id !== incoming._id)]);
    };

    const onConnect = () => {
      setSocketConnected(true);
      socketConn.emit('join_agent', 'ADMIN_VIEWER');
      if (selectedTicketRef.current?._id) socketConn.emit('join_ticket', selectedTicketRef.current._id);
      void fetchTickets(true);
    };
    const onDisconnect = () => setSocketConnected(false);
    const onConnectError = (error: Error) => {
      setSocketConnected(false);
      console.warn('Support socket connection failed; polling remains active.', error.message);
    };
    const onQueued = (ticket: Ticket) => upsertTicket(ticket);
    const onAssigned = (ticket: Ticket) => upsertTicket(ticket);
    const onRemoved = (data: { ticketId?: string }) => {
      const ticketId = String(data?.ticketId || '');
      if (!ticketId) return;
      setTickets((current) => current.filter((ticket) => ticket._id !== ticketId));
      if (selectedTicketRef.current?._id === ticketId) {
        setSelectedTicket(null);
        setMessages([]);
        setShowSidebar(true);
      }
    };
    const onMessage = (data: { ticketId: string; message: Message }) => {
      const ticketId = String(data?.ticketId || '');
      if (!ticketId || !data?.message?._id) return;
      if (selectedTicketRef.current?._id === ticketId) {
        setMessages((current) => current.some((message) => message._id === data.message._id)
          ? current
          : [...current, data.message]);
      }
      setTickets((current) => {
        const target = current.find((ticket) => ticket._id === ticketId);
        if (!target) return current;
        const updated = { ...target, lastMessageAt: data.message.timestamp };
        return [updated, ...current.filter((ticket) => ticket._id !== ticketId)];
      });
      void fetchTickets(true);
    };

    socketConn.on('connect', onConnect);
    socketConn.on('disconnect', onDisconnect);
    socketConn.on('connect_error', onConnectError);
    socketConn.on('ticket:queued', onQueued);
    socketConn.on('ticket:assigned', onAssigned);
    socketConn.on('ticket:removed', onRemoved);
    socketConn.on('ticket:message', onMessage);

    const initialTicketFetch = window.setTimeout(() => void fetchTickets(), 0);
    const ticketPoll = window.setInterval(() => void fetchTickets(true), 8000);
    const syncWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void fetchTickets(true);
        if (selectedTicketRef.current?._id) void fetchMessages(selectedTicketRef.current._id, true);
      }
    };
    document.addEventListener('visibilitychange', syncWhenVisible);
    window.addEventListener('focus', syncWhenVisible);

    return () => {
      window.clearTimeout(initialTicketFetch);
      window.clearInterval(ticketPoll);
      document.removeEventListener('visibilitychange', syncWhenVisible);
      window.removeEventListener('focus', syncWhenVisible);
      socketConn.off('connect', onConnect);
      socketConn.off('disconnect', onDisconnect);
      socketConn.off('connect_error', onConnectError);
      socketConn.off('ticket:queued', onQueued);
      socketConn.off('ticket:assigned', onAssigned);
      socketConn.off('ticket:removed', onRemoved);
      socketConn.off('ticket:message', onMessage);
      socketConn.disconnect();
      socketRef.current = null;
    };
  }, [fetchMessages, fetchTickets, router]);

  // Join Room when ticket selected
  useEffect(() => {
    const activeSocket = socketRef.current;
    if (!activeSocket || !selectedTicket) return;
    activeSocket.emit('join_ticket', selectedTicket._id);
    return () => { activeSocket.emit('leave_ticket', selectedTicket._id); };
  }, [selectedTicket]);

  // Poll messages (Backup)
  useEffect(() => {
      let interval: ReturnType<typeof setInterval> | undefined;
      let initialFetch: ReturnType<typeof setTimeout> | undefined;
      if (selectedTicket) {
          initialFetch = setTimeout(() => void fetchMessages(selectedTicket._id), 0);
          interval = setInterval(() => {
              void fetchMessages(selectedTicket._id, true);
          }, 4000);
      }
      return () => {
        if (initialFetch) clearTimeout(initialFetch);
        if (interval) clearInterval(interval);
      };
  }, [fetchMessages, selectedTicket]);

  useEffect(() => {
    if (messages.length) scrollToBottom();
  }, [messages.length, scrollToBottom]);

  const deleteTicket = async () => {
    if (!selectedTicket) return;
    
    const result = await Swal.fire({
        title: 'Delete Ticket?',
        text: 'Irreversible action. Deletes chat history.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Yes, Delete'
    });

    if (result.isConfirmed) {
        try {
            await fetch(`${API_URL}/support/admin/tickets/${selectedTicket._id}`, { method: 'DELETE', headers: adminHeaders() });
            setTickets(prev => prev.filter(t => t._id !== selectedTicket._id));
            selectedTicketRef.current = null;
            setSelectedTicket(null);
            setMessages([]);
            setShowSidebar(true);
            Swal.fire('Deleted', '', 'success');
        } catch {
            Swal.fire('Error', 'Failed to delete', 'error');
        }
    }
  };

  const filteredTickets = tickets.filter(t => {
      const matchStatus = filterStatus === 'ALL' ? true : t.status === filterStatus;
      const matchSearch = t.userPhone.includes(searchTerm);
      return matchStatus && matchSearch;
  });

  const openTicket = (ticket: Ticket) => {
    selectedTicketRef.current = ticket;
    setSelectedTicket(ticket);
    setMessages([]);
    setShowSidebar(false);
  };

  return (
    <div className="flex h-[100dvh] bg-slate-50 font-sans text-slate-900">
      {/* SIDEBAR */}
      <div className={`
        flex-col bg-white border-r border-slate-200 
        w-full md:w-96 flex
        ${showSidebar ? 'flex' : 'hidden md:flex'}
      `}>
          <div className="p-4 border-b border-slate-200 bg-slate-50">
              <button
                type="button"
                onClick={() => router.push('/admin')}
                className="mb-3 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
              >
                <ArrowLeft size={15} /> Back to Admin Dashboard
              </button>
              <div className="flex items-center justify-between mb-4">
                  <div>
                    <h1 className="font-bold text-lg text-slate-800">Live Support</h1>
                    <div className={`mt-1 flex items-center gap-1.5 text-[11px] font-semibold ${socketConnected ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {socketConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
                      {socketConnected ? 'Live updates connected' : 'Reconnecting · auto-refresh active'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void fetchTickets()}
                    disabled={refreshing}
                    className="p-2 hover:bg-slate-200 rounded-full text-slate-500 disabled:opacity-50"
                    aria-label="Refresh support tickets"
                    title="Refresh tickets"
                  >
                      <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
                  </button>
              </div>
              
              {/* Search */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input 
                    type="text" 
                    placeholder="Search phone..." 
                    className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Filters */}
              <div className="flex gap-2">
                  {['ALL', 'QUEUED', 'ASSIGNED', 'CLOSED'].map(s => (
                      <button
                        key={s}
                        onClick={() => setFilterStatus(s)}
                        className={`px-3 py-1 rounded-lg text-[10px] font-bold border ${
                            filterStatus === s 
                            ? 'bg-slate-800 text-white border-slate-800' 
                            : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                          {s}
                      </button>
                  ))}
              </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {loading ? (
                  <div className="p-4 text-center text-slate-400 text-sm">Loading...</div>
              ) : filteredTickets.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 text-sm">No tickets found</div>
              ) : (
                  filteredTickets.map(ticket => (
                      <div 
                        key={ticket._id}
                        onClick={() => openTicket(ticket)}
                        className={`p-3 rounded-xl cursor-pointer border ${
                            selectedTicket?._id === ticket._id 
                            ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-500/20' 
                            : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-200'
                        }`}
                      >
                          <div className="flex justify-between items-start mb-1">
                              <span className="font-bold text-sm text-slate-800">{ticket.userPhone}</span>
                              <span className="text-[10px] text-slate-400">{formatTime(ticket.lastMessageAt)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                  ticket.status === 'QUEUED' ? 'bg-amber-100 text-amber-700' :
                                  ticket.status === 'ASSIGNED' ? 'bg-emerald-100 text-emerald-700' :
                                  'bg-slate-100 text-slate-500'
                              }`}>
                                  {ticket.status}
                              </span>
                              {ticket.assignedAgentId && (
                                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                      <User size={10} /> 
                                      {typeof ticket.assignedAgentId === 'object' ? ticket.assignedAgentId.username : 'Agent'}
                                  </span>
                              )}
                          </div>
                      </div>
                  ))
              )}
          </div>
      </div>

      {/* CHAT AREA */}
      <div className={`
        flex-1 flex-col bg-white relative
        ${!showSidebar ? 'flex' : 'hidden md:flex'}
      `}>
          {selectedTicket ? (
              <>
                <div className="h-14 border-b border-slate-200 flex items-center justify-between px-4 bg-white shrink-0">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setShowSidebar(true)} className="md:hidden p-1 text-slate-500">
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h2 className="font-bold text-sm">{selectedTicket.userPhone}</h2>
                            <p className="text-xs text-slate-500">
                                {selectedTicket.status} • {formatDate(selectedTicket.lastMessageAt)}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                          type="button"
                          onClick={() => router.push('/admin')}
                          className="hidden sm:inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
                          title="Return to Admin Dashboard"
                      >
                          <LayoutDashboard size={16} /> Dashboard
                      </button>
                      <button
                          onClick={deleteTicket}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete Ticket"
                      >
                          <Trash2 size={18} />
                      </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                    {messages.map((msg, idx) => {
                        const isOut = msg.direction === 'OUT';
                        return (
                            <div key={idx} className={`flex ${isOut ? 'justify-start' : 'justify-end'}`}>
                                <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                                    isOut 
                                    ? 'bg-indigo-600 text-white rounded-tl-none' 
                                    : 'bg-white border border-slate-200 text-slate-700 rounded-tr-none'
                                }`}>
                                    {msg.text}
                                    <div className={`text-[10px] mt-1 text-right ${isOut ? 'text-indigo-200' : 'text-slate-400'}`}>
                                        {formatTime(msg.timestamp)}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 border-t border-slate-200 bg-white">
                    <form onSubmit={sendMessage} className="flex items-center gap-2">
                        <input 
                            type="text" 
                            className="flex-1 bg-slate-100 border-0 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white transition-all placeholder:text-slate-400 text-sm"
                            placeholder="Type reply as Admin..."
                            value={inputText}
                            onChange={e => setInputText(e.target.value)}
                        />
                        <button
                            type="submit" 
                            disabled={sending || !inputText.trim()}
                            className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-600/20"
                            aria-label="Send reply"
                        >
                            {sending ? <RefreshCw size={20} className="animate-spin" /> : <Send size={20} />}
                        </button>
                    </form>
                </div>
              </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-300">
                <div className="text-center">
                    <MessageSquare size={40} className="mx-auto mb-2 opacity-20" />
                    <p>Select a ticket</p>
                </div>
            </div>
          )}
      </div>
    </div>
  );
}

export default function AdminSupportPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AdminSupportContent />
    </Suspense>
  );
}
