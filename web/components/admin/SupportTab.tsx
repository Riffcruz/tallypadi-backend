'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, Plus, UserPlus, RefreshCw } from 'lucide-react';
import Swal from 'sweetalert2';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

export default function SupportTab({ adminToken }: { adminToken: string }) {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');

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

  const createAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/support/admin/agents`, 
        { username: newUsername, password: newPassword },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      
      setNewUsername('');
      setNewPassword('');
      setShowCreateForm(false);
      fetchAgents();
      Swal.fire('Success', 'Agent created successfully!', 'success');
    } catch (e: any) {
      console.error('Create agent error:', e);
      Swal.fire('Error', e?.response?.data?.error || 'Failed to create agent', 'error');
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
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border bg-emerald-600 text-white border-emerald-500/30 hover:bg-emerald-500"
            >
                {showCreateForm ? 'Cancel' : <><UserPlus size={16} /> New Agent</>}
            </button>
          </div>
        </div>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 shadow-xl max-w-lg mx-auto">
            <h3 className="text-lg font-bold text-white mb-4">Create New Agent</h3>
            <form onSubmit={createAgent} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Username</label>
                    <input 
                        type="text" 
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
                        value={newUsername}
                        onChange={e => setNewUsername(e.target.value)}
                        placeholder="e.g. agent_007"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Password</label>
                    <input 
                        type="password" 
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Strong password..."
                        required
                        minLength={6}
                    />
                </div>
                <div className="flex justify-end pt-2">
                    <button 
                        type="submit" 
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-xl font-bold transition-all"
                    >
                        Create
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
                {/* <th className="px-6 py-4 text-right">Actions</th> */}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
                {agents.length === 0 ? (
                    <tr>
                        <td colSpan={4} className="px-6 py-10 text-center text-slate-500">
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
