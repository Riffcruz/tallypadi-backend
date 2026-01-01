'use client';
import React, { useState } from 'react';
import { ShieldAlert, Key, Loader2 } from 'lucide-react';

interface LoginScreenProps {
    authLoading: boolean;
    onLogin: (key: string) => void;
}

export default function LoginScreen({ authLoading, onLogin }: LoginScreenProps) {
    const [key, setKey] = useState('');
    
    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-700 w-full max-w-md">
                <h1 className="text-2xl font-bold text-center text-white mb-6 flex items-center justify-center gap-2">
                    <ShieldAlert className="text-red-500" /> Admin Access
                </h1>
                <form onSubmit={(e) => { e.preventDefault(); onLogin(key); }} className="space-y-4">
                    <div className="relative">
                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
                        <input 
                            type="password" 
                            placeholder="Enter Secret Key"
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 pl-10 text-white focus:border-green-500 outline-none"
                            value={key}
                            onChange={(e) => setKey(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <button type="submit" disabled={authLoading} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2">
                        {authLoading && <Loader2 className="animate-spin w-4 h-4" />}
                        {authLoading ? 'Verifying...' : 'Access Command Center'}
                    </button>
                </form>
            </div>
        </div>
    );
}