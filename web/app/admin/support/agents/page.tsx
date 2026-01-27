'use client';

import { useState, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function AdminSupportAgents() {
  const [agents, setAgents] = useState<any[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(true);

  // Use main app token (assuming logged in as admin)
  // or a specific admin token. For now, try retrieving from localStorage 'token' or 'adminToken'
  // In a real integration, we'd use the auth context.
  
  const getToken = () => localStorage.getItem('token') || ''; 

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const res = await fetch(`${API_URL}/api/support/admin/agents`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAgents(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const createAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/support/admin/agents`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`
        },
        body: JSON.stringify({ username: newUsername, password: newPassword })
      });
      
      if (res.ok) {
          setNewUsername('');
          setNewPassword('');
          fetchAgents();
          alert('Agent Created!');
      } else {
          alert('Failed to create agent');
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Manage Support Agents</h1>

      {/* Create Form */}
      <div className="bg-white p-6 rounded shadow mb-8">
        <h2 className="text-lg font-semibold mb-4">Add New Agent</h2>
        <form onSubmit={createAgent} className="flex gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Username</label>
            <input 
              type="text" 
              className="border p-2 rounded w-64"
              value={newUsername}
              onChange={e => setNewUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input 
              type="text" 
              className="border p-2 rounded w-64"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
            Create Agent
          </button>
        </form>
      </div>

      {/* List */}
      <div className="bg-white rounded shadow overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4">Username</th>
              <th className="p-4">Status</th>
              <th className="p-4">Active Tickets</th>
              <th className="p-4">Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {agents.map(agent => (
              <tr key={agent._id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="p-4 font-medium">{agent.username}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 text-xs rounded ${
                    agent.status === 'ONLINE' ? 'bg-green-100 text-green-800' :
                    agent.status === 'BUSY' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {agent.status}
                  </span>
                </td>
                <td className="p-4">{agent.activeTicketsCount}</td>
                <td className="p-4 text-gray-500 text-sm">{new Date(agent.lastSeenAt).toLocaleString()}</td>
              </tr>
            ))}
            {agents.length === 0 && (
                <tr>
                    <td colSpan={4} className="p-8 text-center text-gray-500">No agents found.</td>
                </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
