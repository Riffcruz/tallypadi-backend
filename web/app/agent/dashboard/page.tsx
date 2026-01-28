'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import io, { Socket } from 'socket.io-client';
import { 
  Send, User, LogOut, MessageSquare, CheckCircle, Clock, 
  XCircle, Bell, Phone, Search, MoreVertical, ArrowLeft
} from 'lucide-react';
import Swal from 'sweetalert2';

// Ensure consistent API URL logic
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

interface Ticket {
  _id: string;
  userPhone: string;
  status: string;
  lastMessageAt: string;
  priority: string;
  assignedAt?: string;
}

interface Message {
  _id: string;
  text: string;
  direction: 'IN' | 'OUT';
  timestamp: string;
}

function safeDate(d: any) {
    if (!d) return null;
    const date = new Date(d);
    return isNaN(date.getTime()) ? null : date;
}

function formatTime(d: any) {
    const date = safeDate(d);
    if (!date) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(d: any) {
    const date = safeDate(d);
    if (!date) return '';
    return date.toLocaleDateString();
}

function AgentDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTicketId = searchParams.get('ticketId');

  const [socket, setSocket] = useState<Socket | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [agentStatus, setAgentStatus] = useState('OFFLINE');
  const [agentName, setAgentName] = useState('');
  const [loading, setLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true); // Mobile toggle
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Search state
  const [searchTerm, setSearchTerm] = useState('');

  // Auth & Init
  useEffect(() => {
    const init = async () => {
        const token = localStorage.getItem('agent_token');
        if (!token) {
            router.push('/agent/login');
            return;
        }

        try {
            // 1. Fetch Current Agent Status & Info from DB (Single Source of Truth)
            const meRes = await fetch(`${API_URL}/support/me`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (!meRes.ok) {
                if (meRes.status === 401) {
                    localStorage.removeItem('agent_token');
                    router.push('/agent/login');
                }
                return;
            }
            
            const me = await meRes.json();
            setAgentStatus(me.status);
            setAgentName(me.username);

            // 2. Initialize Socket
            const baseUrl = API_URL.endsWith('/api') ? API_URL.slice(0, -4) : API_URL;
            const socketConn = io(baseUrl);

            setSocket(socketConn);

            socketConn.on('connect', () => {
                console.log('Socket connected');
                socketConn.emit('join_agent', me._id);
            });

            socketConn.on('ticket:assigned', (ticket: Ticket) => {
                setTickets(prev => {
                    if (prev.find(t => t._id === ticket._id)) return prev;
                    const audio = new Audio('/sounds/notification.mp3'); 
                    audio.play().catch(() => {});
                    return [ticket, ...prev];
                });
            });

            socketConn.on('ticket:message', (data: { ticketId: string, message: Message }) => {
                setTickets(prev => {
                    const others = prev.filter(t => t._id !== data.ticketId);
                    const target = prev.find(t => t._id === data.ticketId);
                    if (target) {
                        target.lastMessageAt = new Date().toISOString();
                        return [target, ...others];
                    }
                    return prev;
                });

                if (selectedTicket?._id === data.ticketId) {
                    setMessages(prev => [...prev, data.message]);
                }
            });

            socketConn.on('ticket:removed', (data: { ticketId: string }) => {
                setTickets(prev => prev.filter(t => t._id !== data.ticketId));
                if (selectedTicket?._id === data.ticketId) {
                    setSelectedTicket(null);
                    setMessages([]);
                    setShowSidebar(true); // Return to list on mobile
                }
            });

            // 3. Fetch Tickets
            fetchTickets(token);

        } catch (e) {
            console.error('Init error', e);
        } finally {
            setLoading(false);
        }
    };

    init();

    return () => {
        socket?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once

  // Scroll on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle URL param selection
  useEffect(() => {
    if (initialTicketId && tickets.length > 0 && !selectedTicket) {
        const t = tickets.find(x => x._id === initialTicketId);
        if (t) selectTicket(t);
    }
  }, [initialTicketId, tickets, selectedTicket]);

  const fetchTickets = async (token: string) => {
    try {
      // ✅ FIX: Fetch both ASSIGNED and ACTIVE
      const res = await fetch(`${API_URL}/support/tickets?status=ASSIGNED,ACTIVE`, { 
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTickets(data);
      }
    } catch (e) { console.error(e); }
  };

  const selectTicket = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setShowSidebar(false); // Mobile: Hide sidebar
    const token = localStorage.getItem('agent_token');
    try {
      const res = await fetch(`${API_URL}/support/tickets/${ticket._id}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setMessages(data);
    } catch (e) { console.error(e); }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !inputText.trim()) return;

    const token = localStorage.getItem('agent_token');
    const tempId = 'temp-' + Date.now();
    
    try {
      // Optimistic
      const tempMsg: Message = { _id: tempId, text: inputText, direction: 'OUT', timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, tempMsg]);
      setInputText('');

      const res = await fetch(`${API_URL}/support/tickets/${selectedTicket._id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: tempMsg.text })
      });
      
      const realMsg = await res.json();
      setMessages(prev => prev.map(m => m._id === tempId ? realMsg : m));
    } catch (e) {
      console.error(e);
      // Revert if failed (simplified)
    }
  };

  const changeStatus = async (newStatus: string) => {
      const token = localStorage.getItem('agent_token');
      try {
        const res = await fetch(`${API_URL}/support/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ status: newStatus })
        });
        
        if (res.ok) {
            setAgentStatus(newStatus);
            // Update local storage just in case, though we rely on DB now
            const infoStr = localStorage.getItem('agent_info');
            if (infoStr) {
                const info = JSON.parse(infoStr);
                info.status = newStatus;
                localStorage.setItem('agent_info', JSON.stringify(info));
            }
        }
      } catch (e) {
          console.error(e);
      }
  };

  const closeTicket = async () => {
      if (!selectedTicket) return;
      
      const result = await Swal.fire({
          title: 'Close Ticket?',
          text: 'This will archive the chat and remove it from your active list.',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#d33',
          confirmButtonText: 'Yes, close it'
      });

      if (result.isConfirmed) {
        const token = localStorage.getItem('agent_token');
        await fetch(`${API_URL}/support/tickets/${selectedTicket._id}/close`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
        });
        setTickets(prev => prev.filter(t => t._id !== selectedTicket._id));
        setSelectedTicket(null);
        setMessages([]);
        setShowSidebar(true); // Return to list
        Swal.fire('Closed!', 'Ticket has been closed.', 'success');
      }
  };

  const filteredTickets = tickets.filter(t => t.userPhone.includes(searchTerm));

  if (loading) {
      return (
          <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-400">
              <div className="flex flex-col items-center gap-4">
                  <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="font-medium">Connecting to Headquarters...</p>
              </div>
          </div>
      );
  }

  return (
    <div className="flex h-screen bg-white overflow-hidden font-sans text-slate-900 relative">
      {/* SIDEBAR */}
      <div className={`
        flex-col bg-slate-50 border-r border-slate-200 
        absolute inset-0 z-20 md:static md:w-80 md:flex
        ${showSidebar ? 'flex' : 'hidden md:flex'}
      `}>
        {/* Agent Header */}
        <div className="p-4 bg-white border-b border-slate-200 shrink-0">
           <div className="flex items-center justify-between mb-4">
               <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-lg">
                       {agentName.charAt(0).toUpperCase()}
                   </div>
                   <div>
                       <h3 className="font-bold text-sm text-slate-800">{agentName}</h3>
                       <p className="text-xs text-slate-500">Support Agent</p>
                   </div>
               </div>
               <button 
                onClick={() => {
                   localStorage.removeItem('agent_token');
                   localStorage.removeItem('agent_info');
                   router.push('/agent/login');
               }} 
               className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
               title="Logout"
               >
                   <LogOut size={18} />
               </button>
           </div>
           
           {/* Status Toggle */}
           <div className="flex p-1 bg-slate-100 rounded-xl">
               {['ONLINE', 'BUSY', 'OFFLINE'].map(status => (
                   <button
                    key={status}
                    onClick={() => changeStatus(status)}
                    className={`flex-1 py-1.5 text-[10px] font-extrabold rounded-lg transition-all ${
                        agentStatus === status 
                        ? (status === 'ONLINE' ? 'bg-emerald-500 text-white shadow-sm' : 
                           status === 'BUSY' ? 'bg-amber-500 text-white shadow-sm' : 
                           'bg-slate-600 text-white shadow-sm')
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                   >
                       {status}
                   </button>
               ))}
           </div>
        </div>

        {/* Search */}
        <div className="p-3">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input 
                    type="text" 
                    placeholder="Search tickets..." 
                    className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>
        </div>

        {/* Ticket List */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
            {filteredTickets.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm">
                    {searchTerm ? 'No tickets match' : 'No active tickets'}
                </div>
            ) : (
                filteredTickets.map(ticket => (
                    <div 
                        key={ticket._id} 
                        onClick={() => selectTicket(ticket)}
                        className={`p-3 rounded-xl cursor-pointer transition-all ${
                            selectedTicket?._id === ticket._id 
                            ? 'bg-white shadow-md border border-emerald-100 ring-1 ring-emerald-500/20' 
                            : 'hover:bg-white hover:shadow-sm border border-transparent'
                        }`}
                    >
                        <div className="flex justify-between items-start mb-1">
                            <span className="font-bold text-sm text-slate-800">{ticket.userPhone}</span>
                            <span className="text-[10px] text-slate-400">
                                {formatTime(ticket.lastMessageAt)}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                ticket.priority === 'URGENT' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'
                            }`}>
                                {ticket.status}
                            </span>
                        </div>
                    </div>
                ))
            )}
        </div>
      </div>

      {/* CHAT AREA */}
      <div className={`
        flex-1 flex-col bg-slate-50/50 relative
        ${!showSidebar ? 'flex' : 'hidden md:flex'}
      `}>
        {selectedTicket ? (
            <>
                {/* Chat Header */}
                <div className="bg-white px-4 py-3 border-b border-slate-200 flex justify-between items-center shadow-sm z-10">
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => setShowSidebar(true)}
                            className="p-1 md:hidden text-slate-500 hover:bg-slate-100 rounded-full"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                            <User size={20} />
                        </div>
                        <div>
                            <h2 className="font-bold text-slate-800 text-sm md:text-base">{selectedTicket.userPhone}</h2>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span className="flex items-center gap-1">
                                    <Clock size={12} /> Started {formatDate(selectedTicket.assignedAt || Date.now())}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={closeTicket}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded-xl text-xs md:text-sm font-bold hover:bg-red-50 hover:border-red-300 transition-colors"
                        >
                            <CheckCircle size={16} /> <span className="hidden md:inline">Mark Resolved</span>
                        </button>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
                    {messages.map((msg, idx) => {
                        const isOut = msg.direction === 'OUT';
                        return (
                            <div key={idx} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] md:max-w-[65%] flex flex-col ${isOut ? 'items-end' : 'items-start'}`}>
                                    <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                                        isOut 
                                        ? 'bg-emerald-600 text-white rounded-tr-none' 
                                        : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none'
                                    }`}>
                                        {msg.text}
                                    </div>
                                    <span className="text-[10px] text-slate-400 mt-1 px-1">
                                        {formatTime(msg.timestamp)}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-3 md:p-4 bg-white border-t border-slate-200">
                    <form onSubmit={sendMessage} className="max-w-4xl mx-auto relative flex items-center gap-2 md:gap-3">
                        <input 
                            type="text" 
                            className="flex-1 bg-slate-100 border-0 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:bg-white transition-all placeholder:text-slate-400 text-sm md:text-base"
                            placeholder="Type reply..."
                            value={inputText}
                            onChange={e => setInputText(e.target.value)}
                        />
                        <button 
                            type="submit" 
                            disabled={!inputText.trim()}
                            className="p-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-600/20"
                        >
                            <Send size={20} />
                        </button>
                    </form>
                </div>
            </>
        ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-300 p-8 text-center">
                <div className="w-20 h-20 md:w-24 md:h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6 text-slate-300">
                    <MessageSquare size={32} className="md:w-10 md:h-10" />
                </div>
                <h3 className="text-lg md:text-xl font-bold text-slate-400">No Ticket Selected</h3>
                <p className="max-w-xs text-sm mt-2 text-slate-400">
                    Select a ticket from the sidebar to start chatting.
                </p>
                <button 
                    onClick={() => setShowSidebar(true)}
                    className="mt-6 md:hidden px-6 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-emerald-500/30"
                >
                    View Tickets
                </button>
            </div>
        )}
      </div>
    </div>
  );
}

export default function AgentDashboard() {
  return (
    <Suspense fallback={<div className="h-screen w-full flex items-center justify-center bg-white text-emerald-600">Loading Agent Portal...</div>}>
      <AgentDashboardContent />
    </Suspense>
  );
}