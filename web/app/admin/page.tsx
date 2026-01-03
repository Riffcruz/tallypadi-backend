'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';

// Sub-components
import LoginScreen from '../../components/admin/LoginScreen';
import Sidebar from '../../components/admin/Sidebar';
import OverviewTab from '../../components/admin/OverviewTab';
import UsersTab from '../../components/admin/UsersTab';
import SettingsTab from '../../components/admin/SettingsTab';
import BroadcastTab from '../../components/admin/BroadcastTab';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';
const TOKEN_KEY = 'adminToken';

export default function AdminDashboard() {
  const [token, setToken] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [globalSettings, setGlobalSettings] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'overview' | 'users' | 'settings' | 'broadcast'>('overview');

  // Mobile sidebar
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const getHeaders = (tkn = token) => ({
    Authorization: `Bearer ${tkn}`,
    'Content-Type': 'application/json',
  });

  useEffect(() => {
    const stored = sessionStorage.getItem(TOKEN_KEY) || '';
    if (stored) {
      setToken(stored);
      verifyAccess(stored);
    } else {
      setAuthLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken('');
    setIsAuthenticated(false);
    setStats(null);
    setUsers([]);
    setGlobalSettings(null);
    Swal.fire({ title: 'Logged out', icon: 'success', timer: 900, showConfirmButton: false });
  };

  const verifyAccess = async (tkn: string) => {
    setAuthLoading(true);
    try {
      await axios.get(`${API_URL}/admin/analytics`, { headers: getHeaders(tkn) });
      setIsAuthenticated(true);
      setToken(tkn);
      sessionStorage.setItem(TOKEN_KEY, tkn);
      await loadData(tkn);
    } catch (err: any) {
      console.error('Admin auth failed:', err?.response?.data || err?.message || err);
      setIsAuthenticated(false);
      sessionStorage.removeItem(TOKEN_KEY);

      const msg =
        err?.response?.status === 401
          ? 'Session expired. Please login again.'
          : err?.response?.status === 403
            ? 'Access denied. Admin account required.'
            : 'Authentication failed. Please login again.';
      Swal.fire('Auth Error', msg, 'error');
    } finally {
      setAuthLoading(false);
    }
  };

  const loadData = async (tkn = token) => {
    setLoading(true);
    const headers = getHeaders(tkn);

    try {
      const [statsRes, usersRes, settingsRes] = await Promise.all([
        axios.get(`${API_URL}/admin/analytics?range=week`, { headers }),
        axios.get(`${API_URL}/admin/users?limit=200`, { headers }),
        axios.get(`${API_URL}/admin/settings`, { headers }),
      ]);

      setStats(statsRes.data);
      setUsers(usersRes.data);
      setGlobalSettings(settingsRes.data);
    } catch (e: any) {
      console.error('Data load error:', e?.response?.data || e?.message || e);

      const status = e?.response?.status;
      if (status === 401) {
        // token invalid/expired
        logout();
        return;
      }

      Swal.fire('Error', 'Failed to load admin data.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUserAction = async (userId: string, action: string, payload: any = {}) => {
    try {
      await axios.put(`${API_URL}/admin/users/${userId}`, { action, payload }, { headers: getHeaders() });

      // Keep your original "silent" behavior for certain actions
      if (action !== 'set_expiry' && action !== 'change_plan' && action !== 'cancel') {
        Swal.fire({
          title: 'Success',
          text: 'User updated successfully.',
          icon: 'success',
          timer: 1500,
          showConfirmButton: false,
        });
      }

      await loadData(token);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 401) return logout();

      const msg = e?.response?.data?.error || 'Action failed';
      Swal.fire('Error', msg, 'error');
    }
  };

  // ✅ LoginScreen should call onLogin(token)
  if (!isAuthenticated) {
    return (
      <LoginScreen
        authLoading={authLoading}
        onLogin={(newToken: string) => {
          setToken(newToken);
          verifyAccess(newToken);
        }}
      />
    );
  }

  if (loading || !stats) {
    return <div className="flex h-screen items-center justify-center bg-slate-900 text-green-500">Loading Command Center...</div>;
  }

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 font-sans overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Responsive Sidebar Wrapper */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800
          transform transition-transform duration-300 ease-in-out
          md:relative md:translate-x-0 md:border-r-0
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="h-full overflow-y-auto">
          <Sidebar
            tab={tab}
            setTab={(t: any) => {
              setTab(t);
              setIsSidebarOpen(false);
            }}
          />
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        {/* Mobile Header with Hamburger Menu */}
        <div className="md:hidden flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900 shrink-0">
          <span className="font-bold text-lg text-green-500">Admin Panel</span>
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
            aria-label="Open Menu"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Desktop top bar (adds logout) */}
        <div className="hidden md:flex items-center justify-between px-8 py-4 border-b border-slate-800 bg-slate-900 shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-bold text-lg text-green-500">Admin Panel</span>
            <span className="text-xs text-slate-500">JWT + Role Protected</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadData(token)}
              className="px-3 py-2 text-sm rounded-lg bg-slate-800 hover:bg-slate-700 transition"
            >
              Refresh
            </button>
            <button
              onClick={logout}
              className="px-3 py-2 text-sm rounded-lg bg-red-600/80 hover:bg-red-600 transition"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {tab === 'overview' && <OverviewTab stats={stats} />}
          {tab === 'users' && <UsersTab users={users} onAction={handleUserAction} />}
          {tab === 'settings' && (
            <SettingsTab
              settings={globalSettings}
              onUpdate={() => loadData(token)}
              headers={getHeaders()} // keep compatibility if your SettingsTab expects headers
            />
          )}
          {tab === 'broadcast' && <BroadcastTab headers={getHeaders()} />}
        </div>
      </main>
    </div>
  );
}
