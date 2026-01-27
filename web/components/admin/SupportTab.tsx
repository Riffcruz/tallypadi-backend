'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, Plus, UserPlus, RefreshCw, Edit, Trash2, Save, X } from 'lucide-react';
import Swal from 'sweetalert2';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

export default function SupportTab({ adminToken }: { adminToken: string }) {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState('');
  
  const [username, setUsername] = useState('');
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
      setPassword('');
      setEditId('');
      setShowForm(true);
  };

  const openEdit = (agent: any) => {
      setIsEditing(true);
      setUsername(agent.username);
      setPassword(''); // Don't prefill password
      setEditId(agent._id);
      setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = { username };
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
            { username, password },
            { headers: { Authorization: `Bearer ${adminToken}` } }
          );
          Swal.fire('Success', 'Agent created successfully!', 'success');
      }
      
      setUsername('');
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
    <div className="space-y-6 animate-in fade-in duration-300">
       {/* Header */}
       <div className="sticky top-0 z-10 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 bg-slate-950/70 backdrop-blur border-b border-white/10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-extrabold text-white">Support Agents</h2>
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
                            <td className="px-6 py-4 font-bold text-white">{agent.username}</td>
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
