'use client';
import React, { useState } from 'react';
import axios from 'axios';
import { MessageSquare, Send } from 'lucide-react';
import Swal from 'sweetalert2';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

export default function BroadcastTab({ headers }: any) {
    const [msg, setMsg] = useState('');
    const [target, setTarget] = useState('active_24h');

    const send = async () => {
        if (!msg) return;
        const res = await Swal.fire({
            title: 'Confirm Broadcast',
            text: `Send to: ${target}`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Send Now'
        });

        if (res.isConfirmed) {
            try {
                await axios.post(`${API_URL}/admin/broadcast`, { target, message: msg }, { headers });
                Swal.fire('Sent', 'Broadcast queued', 'success');
                setMsg('');
            } catch (e) {
                Swal.fire('Error', 'Broadcast failed', 'error');
            }
        }
    };

    return (
        <div className="max-w-2xl mx-auto animate-in fade-in duration-300">
            <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-lg">
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <MessageSquare className="text-purple-400" /> Mass Broadcast
                </h2>
                <div className="space-y-6">
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Target Audience</label>
                        <select className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white focus:border-green-500 outline-none" value={target} onChange={(e) => setTarget(e.target.value)}>
                            <option value="active_24h">Active Users (24h) - Text</option>
                            <option value="all">ALL Users - Template</option>
                            <option value="tycoon">Tycoon Only</option>
                            <option value="oga_boss">Oga Boss Only</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Message Body</label>
                        <textarea className="w-full h-32 bg-slate-900 border border-slate-600 rounded-xl p-4 text-white focus:border-green-500 outline-none resize-none" placeholder="Message..." value={msg} onChange={(e) => setMsg(e.target.value)}></textarea>
                    </div>
                    <button onClick={send} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-900/20 transition-all">Send Broadcast</button>
                </div>
            </div>
        </div>
    );
}