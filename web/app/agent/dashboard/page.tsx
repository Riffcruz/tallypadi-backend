'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import io, { Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const VAPID_PUBLIC_KEY = 'YOUR_VAPID_PUBLIC_KEY_FROM_BACKEND_ENV'; // ideally fetched or env

interface Ticket {
  _id: string;
  userPhone: string;
  status: string;
  lastMessageAt: string;
  priority: string;
}

interface Message {
  _id: string;
  text: string;
  direction: 'IN' | 'OUT';
  timestamp: string;
}

export default function AgentDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTicketId = searchParams.get('ticketId');

  const [socket, setSocket] = useState<Socket | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [agentStatus, setAgentStatus] = useState('OFFLINE');
  const [agentId, setAgentId] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auth & Init
  useEffect(() => {
    const token = localStorage.getItem('agent_token');
    const infoStr = localStorage.getItem('agent_info');
    if (!token || !infoStr) {
      router.push('/agent/login');
      return;
    }
    const info = JSON.parse(infoStr);
    setAgentId(info.id);
    setAgentStatus(info.status);

    // Socket
    const newSocket = io(API_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Socket connected');
      newSocket.emit('join_agent', info.id);
    });

    newSocket.on('ticket:assigned', (ticket: Ticket) => {
      setTickets(prev => {
        if (prev.find(t => t._id === ticket._id)) return prev;
        return [ticket, ...prev];
      });
      // Play sound?
    });

    newSocket.on('ticket:message', (data: { ticketId: string, message: Message }) => {
      // Update ticket list lastMessageTime (reorder)
      setTickets(prev => {
        const others = prev.filter(t => t._id !== data.ticketId);
        const target = prev.find(t => t._id === data.ticketId);
        if (target) {
            target.lastMessageAt = new Date().toISOString();
            return [target, ...others]; // Move to top
        }
        return prev;
      });

      // If active ticket
      if (selectedTicket?._id === data.ticketId) {
        setMessages(prev => [...prev, data.message]);
      }
    });

    newSocket.on('ticket:removed', (data: { ticketId: string }) => {
        setTickets(prev => prev.filter(t => t._id !== data.ticketId));
        if (selectedTicket?._id === data.ticketId) {
            setSelectedTicket(null);
            setMessages([]);
        }
    });

    // Initial Data
    fetchTickets(token);

    setLoading(false);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Handle URL Ticket Param
  useEffect(() => {
      if (initialTicketId && tickets.length > 0) {
          const t = tickets.find(x => x._id === initialTicketId);
          if (t) selectTicket(t);
      }
  }, [initialTicketId, tickets]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchTickets = async (token: string) => {
    try {
      const res = await fetch(`${API_URL}/api/support/tickets?status=ASSIGNED`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTickets(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const selectTicket = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    const token = localStorage.getItem('agent_token');
    try {
      const res = await fetch(`${API_URL}/api/support/tickets/${ticket._id}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setMessages(data);
    } catch (e) {
      console.error(e);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !inputText.trim()) return;

    const token = localStorage.getItem('agent_token');
    try {
      // Optimistic Update
      const tempMsg: Message = { _id: 'temp', text: inputText, direction: 'OUT', timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, tempMsg]);
      setInputText('');

      const res = await fetch(`${API_URL}/api/support/tickets/${selectedTicket._id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: tempMsg.text })
      });
      
      const realMsg = await res.json();
      // Replace temp
      setMessages(prev => prev.map(m => m._id === 'temp' ? realMsg : m));
    } catch (e) {
      console.error(e);
    }
  };

  const changeStatus = async (newStatus: string) => {
      const token = localStorage.getItem('agent_token');
      await fetch(`${API_URL}/api/support/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: newStatus })
      });
      setAgentStatus(newStatus);
  };

  const closeTicket = async () => {
      if (!selectedTicket) return;
      if (!confirm('Close this ticket?')) return;
      const token = localStorage.getItem('agent_token');
      await fetch(`${API_URL}/api/support/tickets/${selectedTicket._id}/close`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
      });
      setTickets(prev => prev.filter(t => t._id !== selectedTicket._id));
      setSelectedTicket(null);
  };

  const subscribePush = async () => {
    if (!('serviceWorker' in navigator)) return;
    
    // Check permission
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;

    const reg = await navigator.serviceWorker.ready;
    
    // Ideally fetch key from API
    // For now using placeholder or assuming env
    // Convert base64 key...
    
    // Skipping VAPID subscription details for brevity unless requested. 
    // Assuming simple subscription works or I need to fetch public key.
    // I'll assume the user configures VAPID_PUBLIC_KEY in the frontend ENV manually for now.
    
    // const sub = await reg.pushManager.subscribe({
    //     userVisibleOnly: true,
    //     applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    // });
    
    // await fetch(`${API_URL}/api/support/push/subscribe`, {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    //     body: JSON.stringify(sub)
    // });
    
    alert('Push notifications logic requires valid VAPID key. Check code.');
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Sidebar */}
      <div className="w-1/4 bg-white border-r flex flex-col">
        <div className="p-4 border-b bg-gray-50">
           <div className="flex items-center justify-between mb-2">
               <span className="font-bold">Agent Dashboard</span>
               <button onClick={() => {
                   localStorage.removeItem('agent_token');
                   router.push('/agent/login');
               }} className="text-xs text-red-500">Logout</button>
           </div>
           <div className="flex gap-2">
               <button onClick={() => changeStatus('ONLINE')} className={`px-2 py-1 text-xs rounded ${agentStatus === 'ONLINE' ? 'bg-green-500 text-white' : 'bg-gray-200'}`}>Online</button>
               <button onClick={() => changeStatus('BUSY')} className={`px-2 py-1 text-xs rounded ${agentStatus === 'BUSY' ? 'bg-yellow-500 text-white' : 'bg-gray-200'}`}>Busy</button>
               <button onClick={() => changeStatus('OFFLINE')} className={`px-2 py-1 text-xs rounded ${agentStatus === 'OFFLINE' ? 'bg-gray-500 text-white' : 'bg-gray-200'}`}>Offline</button>
           </div>
        </div>
        <div className="flex-1 overflow-y-auto">
            {tickets.length === 0 && <div className="p-4 text-gray-400 text-sm">No active tickets</div>}
            {tickets.map(ticket => (
                <div 
                    key={ticket._id} 
                    onClick={() => selectTicket(ticket)}
                    className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${selectedTicket?._id === ticket._id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
                >
                    <div className="font-medium text-gray-800">{ticket.userPhone}</div>
                    <div className="text-xs text-gray-500 truncate">{ticket.status} • {new Date(ticket.lastMessageAt).toLocaleTimeString()}</div>
                </div>
            ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedTicket ? (
            <>
                {/* Header */}
                <div className="p-4 bg-white border-b flex justify-between items-center shadow-sm">
                    <div>
                        <h2 className="font-bold text-lg">{selectedTicket.userPhone}</h2>
                        <span className="text-xs text-gray-500">Ticket ID: {selectedTicket._id}</span>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={closeTicket} className="px-3 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200">Close Ticket</button>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-100">
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.direction === 'OUT' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[70%] p-3 rounded-lg shadow-sm ${msg.direction === 'OUT' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white text-gray-800 rounded-bl-none'}`}>
                                <div className="whitespace-pre-wrap">{msg.text}</div>
                                <div className={`text-[10px] mt-1 text-right ${msg.direction === 'OUT' ? 'text-blue-200' : 'text-gray-400'}`}>
                                    {new Date(msg.timestamp).toLocaleTimeString()}
                                </div>
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <form onSubmit={sendMessage} className="p-4 bg-white border-t">
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            className="flex-1 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Type a message..."
                            value={inputText}
                            onChange={e => setInputText(e.target.value)}
                        />
                        <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-medium">Send</button>
                    </div>
                </form>
            </>
        ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400 flex-col gap-4">
                <div className="text-6xl">💬</div>
                <p>Select a ticket to start chatting</p>
                <button onClick={subscribePush} className="text-sm text-blue-500 underline">Enable Push Notifications</button>
            </div>
        )}
      </div>
    </div>
  );
}
