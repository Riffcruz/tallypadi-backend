'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import io, { Socket } from 'socket.io-client';
import { 
  Send, User, LogOut, MessageSquare, CheckCircle, Clock, 
  Trash2, Hand, Search, ArrowLeft, RefreshCw
} from 'lucide-react';
import Swal from 'sweetalert2';
import UsersTab from '../../../components/admin/UsersTab';

// Ensure consistent API URL logic
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

interface Ticket {
  _id: string;
  userPhone: string;
  status: string;
  lastMessageAt: string;
  priority: string;
  assignedAt?: string;
  assignedAgentId?: string;
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
  
  // Ticket State
  const [myTickets, setMyTickets] = useState<Ticket[]>([]);
  const [queueTickets, setQueueTickets] = useState<Ticket[]>([]);
  const [viewMode, setViewMode] = useState<'MINE' | 'QUEUE' | 'USERS'>('MINE');

  const [supportUsers, setSupportUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const selectedTicketRef = useRef<Ticket | null>(null);

  useEffect(() => {
    selectedTicketRef.current = selectedTicket;
  }, [selectedTicket]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  
  // Agent Info
  const [agentStatus, setAgentStatus] = useState('OFFLINE');
  const [agentName, setAgentName] = useState('');
  const [agentId, setAgentId] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true); // Mobile toggle
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Search state
  const [searchTerm, setSearchTerm] = useState('');

  // fetchSupportUsers defined first so it can be used in init useEffect below
  const fetchSupportUsers = async () => {
    setUsersLoading(true);
    const token = localStorage.getItem('agent_token');
    try {
      const res = await fetch(`${API_URL}/support/users`, { 
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSupportUsers(data);
      } else {
        console.error('fetchSupportUsers failed:', res.status, await res.text());
      }
    } catch (e) { console.error('fetchSupportUsers error:', e); }
    finally { setUsersLoading(false); }
  };

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
            setAgentId(me._id);

            // 2. Initialize Socket
            const baseUrl = API_URL.endsWith('/api') ? API_URL.slice(0, -4) : API_URL;
            const socketConn = io(baseUrl);

            setSocket(socketConn);

            socketConn.on('connect', () => {
                socketConn.emit('join_agent', me._id);
            });

            // Assigned to me (or anyone, but we filter)
            socketConn.on('ticket:assigned', (ticket: Ticket) => {
                const isAssignedToMe = String(ticket.assignedAgentId) === String(me._id);
                
                if (isAssignedToMe) {
                    setMyTickets(prev => {
                        if (prev.find(t => t._id === ticket._id)) return prev;
                        const audio = new Audio('/sounds/notification.mp3'); 
                        audio.play().catch(() => {});
                        return [ticket, ...prev];
                    });
                    // If it was in queue, remove it
                    setQueueTickets(prev => prev.filter(t => t._id !== ticket._id));
                } else {
                    // Assigned to someone else -> Remove from Queue
                    setQueueTickets(prev => prev.filter(t => t._id !== ticket._id));
                }
            });

            // New ticket in Queue
            socketConn.on('ticket:queued', (ticket: Ticket) => {
                setQueueTickets(prev => {
                    if (prev.find(t => t._id === ticket._id)) return prev;
                    return [ticket, ...prev];
                });
            });

            socketConn.on('ticket:message', (data: { ticketId: string, message: Message }) => {
                setMyTickets(prev => {
                    const targetIndex = prev.findIndex(t => t._id === data.ticketId);
                    if (targetIndex === -1) return prev;

                    const updatedTicket = { 
                        ...prev[targetIndex], 
                        lastMessageAt: data.message.timestamp || new Date().toISOString() 
                    };
                    
                    const others = prev.filter(t => t._id !== data.ticketId);
                    // Move to top
                    return [updatedTicket, ...others];
                });

                if (selectedTicketRef.current?._id === data.ticketId) {
                    setMessages(prev => [...prev, data.message]);
                }
            });

            socketConn.on('ticket:removed', (data: { ticketId: string }) => {
                setMyTickets(prev => prev.filter(t => t._id !== data.ticketId));
                setQueueTickets(prev => prev.filter(t => t._id !== data.ticketId));
                
                if (selectedTicketRef.current?._id === data.ticketId) {
                    setSelectedTicket(null);
                    setMessages([]);
                    setShowSidebar(true); 
                }
            });

            // 3. Fetch Tickets
            await fetchTickets(token);

            // 4. Restore last viewed tab from sessionStorage
            const savedViewMode = sessionStorage.getItem('agentViewMode') as 'MINE' | 'QUEUE' | 'USERS' | null;
            if (savedViewMode) {
                setViewMode(savedViewMode);
            }

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

  // Auto-fetch users whenever USERS tab becomes active
  useEffect(() => {
    if (viewMode === 'USERS') {
      fetchSupportUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  // Scroll on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle URL param selection
  useEffect(() => {
    if (initialTicketId && myTickets.length > 0 && !selectedTicket) {
        const t = myTickets.find(x => x._id === initialTicketId);
        if (t) {
            setViewMode('MINE');
            sessionStorage.setItem('agentViewMode', 'MINE');
            selectTicket(t);
        }
    }
  }, [initialTicketId, myTickets, selectedTicket]);

  const fetchTickets = async (token: string) => {
    try {
      // 1. My Tickets
      const resMine = await fetch(`${API_URL}/support/tickets?status=ASSIGNED,ACTIVE`, { 
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resMine.ok) setMyTickets(await resMine.json());

      // 2. Queue Tickets
      const resQueue = await fetch(`${API_URL}/support/tickets?status=QUEUED`, { 
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resQueue.ok) setQueueTickets(await resQueue.json());

    } catch (e) { console.error(e); }
  };

  // NOTE: fetchSupportUsers is defined above the init useEffect to avoid hoisting issues with `const`

  // Join Ticket Room on Selection
  useEffect(() => {
    if (socket && selectedTicket) {
        socket.emit('join_ticket', selectedTicket._id);
    }
  }, [socket, selectedTicket]);

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
        }
      } catch (e) {
          console.error(e);
      }
  };

  const closeTicket = async () => {
      if (!selectedTicket) return;
      
      const result = await Swal.fire({
          title: 'Close Ticket?',
          text: 'This will archive the chat.',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#10b981',
          cancelButtonColor: '#d33',
          confirmButtonText: 'Yes, close it'
      });

      if (result.isConfirmed) {
        const token = localStorage.getItem('agent_token');
        await fetch(`${API_URL}/support/tickets/${selectedTicket._id}/close`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
        });
        setMyTickets(prev => prev.filter(t => t._id !== selectedTicket._id));
        setSelectedTicket(null);
        setMessages([]);
        setShowSidebar(true);
        Swal.fire('Closed!', 'Ticket has been closed.', 'success');
      }
  };

  const deleteTicket = async () => {
    if (!selectedTicket) return;
    
    const result = await Swal.fire({
        title: 'Delete Ticket?',
        text: 'This will permanently delete the ticket and all messages. This cannot be undone.',
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Yes, DELETE it'
    });

    if (result.isConfirmed) {
      const token = localStorage.getItem('agent_token');
      await fetch(`${API_URL}/support/tickets/${selectedTicket._id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
      });
      // Socket event 'ticket:removed' usually handles the UI update, but we do it optimistically too
      setMyTickets(prev => prev.filter(t => t._id !== selectedTicket._id));
      setQueueTickets(prev => prev.filter(t => t._id !== selectedTicket._id));
      setSelectedTicket(null);
      setMessages([]);
      setShowSidebar(true);
      Swal.fire('Deleted!', 'Ticket has been deleted.', 'success');
    }
  };

  const pickupTicket = async () => {
      if (!selectedTicket) return;
      
      const token = localStorage.getItem('agent_token');
      try {
          const res = await fetch(`${API_URL}/support/tickets/${selectedTicket._id}/pickup`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` }
          });
          
          if (res.ok) {
              // Move to MINE locally (socket will also confirm)
              const t = { ...selectedTicket, status: 'ASSIGNED', assignedAgentId: agentId };
              setMyTickets(prev => [t, ...prev]);
              setQueueTickets(prev => prev.filter(x => x._id !== t._id));
              setViewMode('MINE');
              sessionStorage.setItem('agentViewMode', 'MINE');
              setSelectedTicket(t); // Update selected ref
              Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Ticket picked up!', timer: 2000, showConfirmButton: false });
          }
      } catch (e) {
          console.error(e);
      }
  };

  const handleUserAction = async (userId: string, action: string, payload: any = {}) => {
    const token = localStorage.getItem('agent_token');
    try {
      const res = await fetch(`${API_URL}/support/users/${userId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action, payload })
      });
      
      if (res.ok) {
          if (!['set_expiry', 'change_plan', 'cancel'].includes(action)) {
            Swal.fire({
              title: 'Success',
              text: 'User updated successfully.',
              icon: 'success',
              timer: 1500,
              showConfirmButton: false,
            });
          }
          await fetchSupportUsers(); 
          return await res.json();
      } else {
          const err = await res.json();
          Swal.fire('Error', err.error || 'Action failed', 'error');
          throw new Error(err.error || 'Action failed');
      }
    } catch (e: any) {
      throw e;
    }
  };

  const activeList = viewMode === 'MINE' ? myTickets : queueTickets;
  const filteredTickets = activeList.filter(t => t.userPhone.includes(searchTerm));

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
           <div className="flex p-1 bg-slate-100 rounded-xl mb-4">
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

           <div className="flex border-b border-slate-200">
               <button 
                onClick={() => { setViewMode('MINE'); sessionStorage.setItem('agentViewMode', 'MINE'); }}
                className={`flex-1 pb-2 text-sm font-bold transition-colors relative ${
                    viewMode === 'MINE' ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600'
                }`}
               >
                   My Tickets
                   {viewMode === 'MINE' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-emerald-500" />}
                   <span className="ml-2 px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[10px]">
                       {myTickets.length}
                   </span>
               </button>
               <button 
                onClick={() => { setViewMode('QUEUE'); sessionStorage.setItem('agentViewMode', 'QUEUE'); }}
                className={`flex-1 pb-2 text-sm font-bold transition-colors relative ${
                    viewMode === 'QUEUE' ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600'
                }`}
               >
                   Queue
                   {viewMode === 'QUEUE' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-emerald-500" />}
                   <span className="ml-2 px-1.5 py-0.5 bg-red-100 text-red-500 rounded-full text-[10px]">
                       {queueTickets.length}
                   </span>
               </button>
               <button 
                onClick={() => { setViewMode('USERS'); sessionStorage.setItem('agentViewMode', 'USERS'); setShowSidebar(false); fetchSupportUsers(); }}
                className={`flex-1 pb-2 text-sm font-bold transition-colors relative ${
                    viewMode === 'USERS' ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600'
                }`}
               >
                   Users
                   {viewMode === 'USERS' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-emerald-500" />}
               </button>
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
                    {searchTerm ? 'No tickets match' : (viewMode === 'MINE' ? 'No active tickets' : 'Queue is empty')}
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

      {/* CHAT OR USERS AREA */}
      <div className={`
        flex-1 flex-col bg-slate-50/50 relative
        ${!showSidebar ? 'flex' : 'hidden md:flex'}
      `}>
        {viewMode === 'USERS' ? (
           <div className="flex flex-col bg-slate-900 text-slate-100 h-full w-full overflow-hidden min-h-0">

              {/* Mobile-only: Full-width "Back to Tickets" top bar — easy for agents to find */}
              <button
                onClick={() => { setViewMode('MINE'); sessionStorage.setItem('agentViewMode', 'MINE'); setShowSidebar(true); }}
                className="md:hidden flex items-center gap-3 w-full px-5 py-4 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 border-b border-slate-600 transition-all text-left"
              >
                <ArrowLeft size={18} className="text-emerald-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-white leading-none">Back to My Tickets</p>
                  <p className="text-xs text-slate-400 mt-0.5">Return to the ticket queue</p>
                </div>
              </button>

              {/* Header row: title + reload button */}
              <div className="flex items-center justify-between px-4 md:px-8 py-4 bg-slate-800 border-b border-slate-700 flex-shrink-0">
                <div>
                  <h2 className="text-sm font-bold text-slate-100">All Users</h2>
                  <p className="text-xs text-slate-400">
                    {usersLoading ? 'Fetching latest data...' : `${supportUsers.length} user${supportUsers.length !== 1 ? 's' : ''} loaded`}
                  </p>
                </div>
                <button
                  onClick={() => fetchSupportUsers()}
                  disabled={usersLoading}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 shadow-lg shadow-emerald-900/30"
                >
                  <RefreshCw size={14} className={usersLoading ? 'animate-spin' : ''} />
                  {usersLoading ? 'Loading...' : 'Refresh Users'}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0 p-4 md:p-8">
                {usersLoading && supportUsers.length === 0 ? (
                    <div className="text-center text-slate-400 py-20 animate-pulse">Fetching users from database...</div>
                ) : supportUsers.length === 0 ? (
                    <div className="text-center py-20">
                      <p className="text-slate-400 font-bold mb-2">No users loaded</p>
                      <p className="text-slate-500 text-sm mb-6">Tap the button below to fetch all users</p>
                      <button
                        onClick={() => fetchSupportUsers()}
                        className="flex items-center gap-2 mx-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all shadow-lg"
                      >
                        <RefreshCw size={16} />
                        Load Users Now
                      </button>
                    </div>
                ) : (
                    <UsersTab 
                        users={supportUsers} 
                        adminToken={localStorage.getItem('agent_token') || ''}
                        role="agent"
                        onAction={handleUserAction}
                    />
                )}
              </div>
           </div>
        ) : selectedTicket ? (
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
                    <div className="flex items-center gap-2">
                        {/* Only show CLOSE if assigned to me */}
                        {viewMode === 'MINE' && (
                            <button 
                                onClick={closeTicket}
                                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs md:text-sm font-bold hover:bg-slate-50 hover:border-slate-300 transition-colors"
                            >
                                <CheckCircle size={16} /> <span className="hidden md:inline">Resolve</span>
                            </button>
                        )}

                        {/* Delete Button (Always available or restricted?) - Requested feature */}
                        <button 
                            onClick={deleteTicket}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded-xl text-xs md:text-sm font-bold hover:bg-red-50 hover:border-red-300 transition-colors"
                            title="Delete Ticket"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
                    {messages.length === 0 && viewMode === 'QUEUE' && (
                        <div className="text-center text-slate-400 text-sm mt-10">
                            This ticket is in the queue. Pick it up to start chatting.
                        </div>
                    )}
                    {messages.map((msg, idx) => {
                        const isOut = msg.direction === 'OUT'; 
                        const alignClass = isOut ? 'justify-start' : 'justify-end';
                        const itemsClass = isOut ? 'items-start' : 'items-end';
                        
                        return (
                            <div key={idx} className={`flex ${alignClass}`}>
                                <div className={`max-w-[85%] md:max-w-[65%] flex flex-col ${itemsClass}`}>
                                    <span className="text-[10px] text-slate-400 mb-1 px-1">
                                        {isOut ? 'Agent (You)' : 'User'}
                                    </span>
                                    <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                                        isOut 
                                        ? 'bg-emerald-600 text-white rounded-tl-none' 
                                        : 'bg-white text-slate-700 border border-slate-100 rounded-tr-none'
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

                {/* Input Area or Pickup Action */}
                <div className="p-3 md:p-4 bg-white border-t border-slate-200">
                    {viewMode === 'MINE' ? (
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
                    ) : (
                        <div className="max-w-4xl mx-auto flex justify-center">
                            <button 
                                onClick={pickupTicket}
                                className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/30 hover:bg-emerald-500 transition-all"
                            >
                                <Hand size={20} /> Pick Up Ticket
                            </button>
                        </div>
                    )}
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