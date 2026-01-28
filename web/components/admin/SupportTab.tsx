'use client';

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Search, Plus, UserPlus, RefreshCw, Edit, Trash2, Save, X, 
  MessageSquare, Users, CheckCircle, Clock, User 
} from 'lucide-react';
import Swal from 'sweetalert2';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

export default function SupportTab({ adminToken }: { adminToken: string }) {
  const [activeTab, setActiveTab] = useState<'agents' | 'tickets'>('tickets');

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
       {/* Sub-Header */}
       <div className="flex items-center gap-4 border-b border-slate-800 pb-1">
          <button 
            onClick={() => setActiveTab('tickets')}
            className={`px-4 py-2 text-sm font-bold border-b-2 transition-all ${
                activeTab === 'tickets' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
             <div className="flex items-center gap-2">
                 <MessageSquare size={16} /> All Tickets
             </div>
          </button>
          <button 
            onClick={() => setActiveTab('agents')}
            className={`px-4 py-2 text-sm font-bold border-b-2 transition-all ${
                activeTab === 'agents' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
             <div className="flex items-center gap-2">
                 <Users size={16} /> Manage Agents
             </div>
          </button>
       </div>

       {activeTab === 'agents' ? <AgentsManager adminToken={adminToken} /> : <TicketsManager adminToken={adminToken} />}
    </div>
  );
}

// ==========================================
// 🎟️ TICKETS MANAGER
// ==========================================
function TicketsManager({ adminToken }: { adminToken: string }) {
    const [tickets, setTickets] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, ACTIVE, CLOSED, QUEUED
    const [selectedTicket, setSelectedTicket] = useState<any>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchTickets();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statusFilter]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const fetchTickets = async () => {
        setLoading(true);
        try {
            let url = `${API_URL}/support/admin/tickets`;
            const params: any = {};
            
            if (statusFilter !== 'ALL') {
                 if (statusFilter === 'ACTIVE') params.status = 'ASSIGNED,ACTIVE';
                 else params.status = statusFilter;
            }

            const res = await axios.get(url, {
                params,
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            setTickets(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const viewTicket = async (ticket: any) => {
        setSelectedTicket(ticket);
        try {
            const res = await axios.get(`${API_URL}/support/admin/tickets/${ticket._id}/messages`, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            setMessages(res.data);
        } catch (e) {
            console.error(e);
        }
    };

    const closeDetails = () => {
        setSelectedTicket(null);
        setMessages([]);
    };

    if (selectedTicket) {
        return (
            <div className="h-[600px] flex flex-col bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-xl animate-in slide-in-from-right duration-300">
                {/* Chat Header */}
                <div className="bg-slate-900/50 p-4 border-b border-slate-700 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <button onClick={closeDetails} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white">
                            <X size={20} />
                        </button>
                        <div>
                            <h3 className="font-bold text-white text-lg">{selectedTicket.userPhone}</h3>
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                <span>Status: <b className="text-emerald-400">{selectedTicket.status}</b></span>
                                {selectedTicket.assignedAgentId && (
                                    <span>• Agent: {selectedTicket.assignedAgentId.username || 'Unknown'}</span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="text-xs text-slate-500">
                        ID: {selectedTicket._id}
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-900/30">
                    {messages.length === 0 ? (
                        <div className="text-center text-slate-500 py-10">No messages found</div>
                    ) : (
                        messages.map((msg, idx) => {
                            const isOut = msg.direction === 'OUT';
                            return (
                                <div key={idx} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[70%] flex flex-col ${isOut ? 'items-end' : 'items-start'}`}>
                                        <div className={`px-4 py-2 rounded-2xl text-sm leading-relaxed ${
                                            isOut 
                                            ? 'bg-emerald-600/20 text-emerald-100 border border-emerald-500/30 rounded-tr-none' 
                                            : 'bg-slate-700/50 text-slate-200 border border-slate-600 rounded-tl-none'
                                        }`}>
                                            {msg.text}
                                        </div>
                                        <span className="text-[10px] text-slate-500 mt-1 px-1">
                                            {new Date(msg.timestamp).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {['ALL', 'QUEUED', 'ACTIVE', 'CLOSED'].map(status => (
                    <button
                        key={status}
                        onClick={() => setStatusFilter(status)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                            statusFilter === status 
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' 
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'
                        }`}
                    >
                        {status === 'ALL' ? 'All Tickets' : status}
                    </button>
                ))}
                <div className="flex-1"></div>
                <button
                    onClick={fetchTickets}
                    className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-lg border border-slate-700"
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* List */}
            <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-xl">
                <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-900/50 text-slate-400 font-medium uppercase text-xs">
                        <tr>
                            <th className="px-6 py-4">User / Phone</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">Assigned To</th>
                            <th className="px-6 py-4">Last Activity</th>
                            <th className="px-6 py-4 text-right">View</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {tickets.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-10 text-center text-slate-500">
                                    No tickets found matching this filter.
                                </td>
                            </tr>
                        ) : (
                            tickets.map((t: any) => (
                                <tr key={t._id} className="hover:bg-slate-700/30 transition-colors group cursor-pointer" onClick={() => viewTicket(t)}>
                                    <td className="px-6 py-4 font-bold text-white flex items-center gap-2">
                                        <User size={16} className="text-slate-500" />
                                        {t.userPhone}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-extrabold border ${
                                            t.status === 'QUEUED' ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' :
                                            t.status === 'CLOSED' ? 'bg-slate-500/10 text-slate-400 border-slate-500/20' :
                                            'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                                        }`}>
                                            {t.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-400">
                                        {t.assignedAgentId?.username || <span className="text-slate-600 italic">Unassigned</span>}
                                    </td>
                                    <td className="px-6 py-4 text-slate-500 text-xs">
                                        {new Date(t.lastMessageAt).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="text-emerald-400 hover:text-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity">
                                            Open Chat &rarr;
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ==========================================
// 🕵️ AGENTS MANAGER (Existing Logic)
// ==========================================
function AgentsManager({ adminToken }: { adminToken: string }) {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState('');
  
  const [username, setUsername] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    fetchAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/support/admin/agents`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      setAgents(res.data);
    } catch (e: any) {
      console.error('Fetch agents error:', e);
      Swal.fire('Error', 'Failed to fetch support agents', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
      setIsEditing(false);
      setUsername('');
      setPhoneNumber('');
      setPassword('');
      setEditId('');
      setShowForm(true);
  };

  const openEdit = (agent: any) => {
      setIsEditing(true);
      setUsername(agent.username);
      setPhoneNumber(agent.phoneNumber || '');
      setPassword(''); // Don't prefill password
      setEditId(agent._id);
      setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = { username, phoneNumber };
      if (password) payload.password = password;

      if (isEditing) {
          if (!password) delete payload.password; // Only send if changing
          await axios.put(`${API_URL}/support/admin/agents/${editId}`, payload, {
            headers: { Authorization: `Bearer ${adminToken}` }
          });
          Swal.fire('Success', 'Agent updated successfully!', 'success');
      } else {
          if (!password) {
              Swal.fire('Error', 'Password is required for new agents', 'error');
              return;
          }
          await axios.post(`${API_URL}/support/admin/agents`, 
            { username, phoneNumber, password },
            { headers: { Authorization: `Bearer ${adminToken}` } }
          );
          Swal.fire('Success', 'Agent created successfully!', 'success');
      }
      
      setUsername('');
      setPhoneNumber('');
      setPassword('');
      setShowForm(false);
      fetchAgents();
    } catch (e: any) {
      console.error('Save agent error:', e);
      Swal.fire('Error', e?.response?.data?.error || 'Failed to save agent', 'error');
    }
  };

  const handleDelete = async (agent: any) => {
      const result = await Swal.fire({
          title: 'Delete Agent?',
          text: `Are you sure you want to delete ${agent.username}? This cannot be undone.`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#d33',
          cancelButtonColor: '#3085d6',
          confirmButtonText: 'Yes, delete it!'
      });

      if (result.isConfirmed) {
          try {
              await axios.delete(`${API_URL}/support/admin/agents/${agent._id}`, {
                  headers: { Authorization: `Bearer ${adminToken}` }
              });
              Swal.fire('Deleted!', 'Agent has been deleted.', 'success');
              fetchAgents();
          } catch (e: any) {
              Swal.fire('Error', 'Failed to delete agent', 'error');
          }
      }
  };

  return (
    <div className="space-y-6">
       {/* Header */}
       <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white">Support Agents</h2>
            <span className="bg-slate-800 text-slate-300 px-2 py-1 rounded-md text-xs font-bold border border-slate-700">
                {agents.length} Total
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
                onClick={fetchAgents}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Refresh"
            >
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
                onClick={showForm ? () => setShowForm(false) : openCreate}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
                    showForm 
                    ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    : 'bg-emerald-600 text-white border-emerald-500/30 hover:bg-emerald-500'
                }`}
            >
                {showForm ? <><X size={16} /> Cancel</> : <><UserPlus size={16} /> New Agent</>}
            </button>
          </div>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 shadow-xl max-w-lg mx-auto">
            <h3 className="text-lg font-bold text-white mb-4">
                {isEditing ? 'Edit Agent' : 'Create New Agent'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Username</label>
                    <input 
                        type="text" 
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        placeholder="e.g. agent_007"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">WhatsApp Phone Number</label>
                    <input 
                        type="text" 
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
                        value={phoneNumber}
                        onChange={e => setPhoneNumber(e.target.value)}
                        placeholder="e.g. 2348012345678"
                    />
                    <p className="text-xs text-slate-500 mt-1">Required for WhatsApp alerts & routing.</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">
                        {isEditing ? 'New Password (Optional)' : 'Password'}
                    </label>
                    <input 
                        type="password" 
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder={isEditing ? 'Leave blank to keep current' : 'Strong password...'}
                        required={!isEditing}
                        minLength={isEditing ? 0 : 6}
                    />
                </div>
                <div className="flex justify-end pt-2">
                    <button 
                        type="submit" 
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-xl font-bold transition-all flex items-center gap-2"
                    >
                        <Save size={18} /> {isEditing ? 'Update Agent' : 'Create Agent'}
                    </button>
                </div>
            </form>
        </div>
      )}

      {/* Agents List */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/50 text-slate-400 font-medium uppercase text-xs">
              <tr>
                <th className="px-6 py-4">Agent</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Active Tickets</th>
                <th className="px-6 py-4">Last Seen</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
                {agents.length === 0 ? (
                    <tr>
                        <td colSpan={5} className="px-6 py-10 text-center text-slate-500">
                            No support agents found. Create one to get started.
                        </td>
                    </tr>
                ) : (
                    agents.map((agent: any) => (
                        <tr key={agent._id} className="hover:bg-slate-700/30 transition-colors">
                            <td className="px-6 py-4 font-bold text-white">
                                <div>{agent.username}</div>
                                {agent.phoneNumber && <div className="text-xs text-slate-500 font-normal">{agent.phoneNumber}</div>}
                            </td>
                            <td className="px-6 py-4">
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-extrabold border ${
                                    agent.status === 'ONLINE' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' :
                                    agent.status === 'BUSY' ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' :
                                    'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                }`}>
                                    {agent.status || 'OFFLINE'}
                                </span>
                            </td>
                            <td className="px-6 py-4">
                                {agent.activeTicketsCount || 0}
                            </td>
                            <td className="px-6 py-4 text-slate-500">
                                {agent.lastSeenAt ? new Date(agent.lastSeenAt).toLocaleString() : 'Never'}
                            </td>
                            <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                    <button 
                                        onClick={() => openEdit(agent)}
                                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-600 rounded-lg transition-colors"
                                        title="Edit Agent"
                                    >
                                        <Edit size={16} />
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(agent)}
                                        className="p-2 text-red-400 hover:text-red-200 hover:bg-red-500/20 rounded-lg transition-colors"
                                        title="Delete Agent"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))
                )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
