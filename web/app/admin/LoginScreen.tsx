'use client';

import React, { useState } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import { ShieldAlert, Mail, Lock, Loader2 } from 'lucide-react';

interface LoginScreenProps {
  authLoading: boolean;
  onLogin: (token: string) => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

export default function LoginScreen({ authLoading, onLogin }: LoginScreenProps) {
  const [identifier, setIdentifier] = useState(''); // email or phone
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const busy = authLoading || submitting;

  const extractToken = (data: any): string | null => {
    if (!data) return null;
    return (
      data.token ||
      data.accessToken ||
      data?.data?.token ||
      data?.data?.accessToken ||
      null
    );
  };

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  const id = identifier.trim();
  const pw = password;

  if (!id || !pw) {
    Swal.fire('Missing info', 'Enter your email/phone and password.', 'warning');
    return;
  }

  setSubmitting(true);
  try {
    const res = await axios.post(
      `${API_URL}/login`,
      { identifier: id, password: pw },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const token = extractToken(res.data);
    if (!token) {
      Swal.fire('Login error', 'No token returned by server.', 'error');
      return;
    }

    // ✅ verify admin immediately (better UX)
    try {
      await axios.get(`${API_URL}/admin/analytics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (e: any) {
      if (e?.response?.status === 403) {
        Swal.fire('Access denied', 'This account is not an admin.', 'error');
        return;
      }
      if (e?.response?.status === 401) {
        Swal.fire('Auth error', 'Token invalid or expired.', 'error');
        return;
      }
      Swal.fire('Error', 'Unable to verify admin access.', 'error');
      return;
    }

    onLogin(token);
  } catch (err: any) {
    const status = err?.response?.status;
    const serverMsg =
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      err?.message ||
      'Login failed';

    if (status === 429) {
      Swal.fire('Too many attempts', 'Slow down and try again in a few minutes.', 'error');
    } else if (status === 401) {
      Swal.fire('Invalid login', 'Wrong email/phone or password.', 'error');
    } else {
      Swal.fire('Login failed', String(serverMsg), 'error');
    }
  } finally {
    setSubmitting(false);
  }
};


  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-700 w-full max-w-md">
        <h1 className="text-2xl font-bold text-center text-white mb-2 flex items-center justify-center gap-2">
          <ShieldAlert className="text-green-500" /> Admin Access
        </h1>
        <p className="text-sm text-slate-400 text-center mb-6">
          Sign in with your admin account.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
            <input
              type="text"
              placeholder="Email or Phone (identifier)"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 pl-10 text-white focus:border-green-500 outline-none"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoFocus
              autoComplete="username"
              disabled={busy}
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
            <input
              type="password"
              placeholder="Password"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 pl-10 text-white focus:border-green-500 outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={busy}
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 disabled:hover:bg-green-600 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="animate-spin w-4 h-4" />}
            {busy ? 'Signing in...' : 'Access Command Center'}
          </button>

          <div className="text-xs text-slate-500 text-center pt-2">
            Not an admin? You’ll be blocked by the server.
          </div>
        </form>
      </div>
    </div>
  );
}
