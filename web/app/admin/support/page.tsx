'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import io, { Socket } from 'socket.io-client';
import { 
  Trash2, Search, User, Clock, MessageSquare, ArrowLeft, RefreshCw, AlertTriangle
} from 'lucide-react';
import Swal from 'sweetalert2';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

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

function AdminSupportContent() {
  const router = useRouter();
  const [socket, setSocket] = useState<Socket | null>(null);
  
  // Data
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const selectedTicketRef = useRef<Ticket | null>(null); // For socket closure

  // UI
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    selectedTicketRef.current = selectedTicket;
  }, [selectedTicket]);

  // Init
  useEffect(() => {
    const init = async () => {
        try {
            // 1. Socket
            const baseUrl = API_URL.endsWith('/api') ? API_URL.slice(0, -4) : API_URL;
            const socketConn = io(baseUrl);
            setSocket(socketConn);

            socketConn.on('connect', () => {
                console.log('Admin Socket connected');
                // Admin might join a specific room if we had one, but 'agents' room receives general updates
                // Or we can rely on polling + specific ticket rooms?
                // For now, let's just listen. 
                // Since we don't have an "admin" room in backend explicitly emitting everything, 
                // we might miss some events unless we join 'agents' or similar.
                // But admin auth usually doesn't have an agentId.
                // Let's rely on fetching mostly, or maybe modify backend to emit to 'admins'?
                // For this prototype, real-time might be limited to the OPEN ticket if we join it?
                // Actually, let's try to join 'agents' room effectively by emitting 'join_agent' with a fake ID? No.
            });

            // We can manually poll or just rely on 'ticket:message' if it was broadcasted globally.
            // Currently `ticket:message` is emitted to `agent:{id}`.
            // Admin won't receive it unless we change backend.
            // However, `supportService` emits `ticket:queued` to `agents` room.
            
            // WORKAROUND: For real-time chat in Admin, we need to poll messages or update backend.
            // For now, I'll poll messages when a ticket is selected every 3 seconds. 
            // It's not "true" socket real-time but it works for "getting real time update" requirement if backend changes are risky.
            // BUT, I can check if I can emit to a global room.
            
            await fetchTickets();
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    init();

    return () => {
        socket?.disconnect();
    };
  }, []);

  // Poll messages if ticket selected (Admin Specific Workaround)
  useEffect(() => {
      let interval: NodeJS.Timeout;
      if (selectedTicket) {
          fetchMessages(selectedTicket._id); // Initial fetch
          interval = setInterval(() => {
              fetchMessages(selectedTicket._id, true); // Silent update
          }, 3000);
      }
      return () => clearInterval(interval);
  }, [selectedTicket]);

  const fetchTickets = async () => {
    try {
      // Fetch all
      const res = await fetch(`${API_URL}/support/admin/tickets`, {
         // Add admin auth headers if needed
      });
      if (res.ok) {
          const data = await res.json();
          setTickets(data);
      }
    } catch (e) { console.error(e); }
  };

  const fetchMessages = async (ticketId: string, silent = false) => {
    try {
      const res = await fetch(`${API_URL}/support/admin/tickets/${ticketId}/messages`);
      if (res.ok) {
          const data = await res.json();
          setMessages(data);
          if (!silent) scrollToBottom();
      }
    } catch (e) { console.error(e); }
  };

  const scrollToBottom = () => {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

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
            await fetch(`${API_URL}/support/admin/tickets/${selectedTicket._id}`, { method: 'DELETE' });
            setTickets(prev => prev.filter(t => t._id !== selectedTicket._id));
            setSelectedTicket(null);
            setMessages([]);
            setShowSidebar(true);
            Swal.fire('Deleted', '', 'success');
        } catch (e) {
            Swal.fire('Error', 'Failed to delete', 'error');
        }
    }
  };

  const filteredTickets = tickets.filter(t => {
      const matchStatus = filterStatus === 'ALL' ? true : t.status === filterStatus;
      const matchSearch = t.userPhone.includes(searchTerm);
      return matchStatus && matchSearch;
  });

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      {/* SIDEBAR */}
      <div className={`
        flex-col bg-white border-r border-slate-200 
        w-full md:w-96 flex
        ${showSidebar ? 'flex' : 'hidden md:flex'}
      `}>
          <div className="p-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center justify-between mb-4">
                  <h1 className="font-bold text-lg text-slate-800">Support Admin</h1>
                  <button onClick={fetchTickets} className="p-2 hover:bg-slate-200 rounded-full text-slate-500">
                      <RefreshCw size={18} />
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
                        onClick={() => { setSelectedTicket(ticket); setShowSidebar(false); }}
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
                    <button 
                        onClick={deleteTicket}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Ticket"
                    >
                        <Trash2 size={18} />
                    </button>
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

                {/* Read Only Input */}
                <div className="p-4 border-t border-slate-200 bg-white">
                    <div className="flex items-center justify-center gap-2 text-slate-400 text-sm bg-slate-50 py-3 rounded-xl border border-dashed border-slate-300">
                        <AlertTriangle size={16} />
                        <span>Admin View Only. To chat, assign to an agent.</span>
                    </div>
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
