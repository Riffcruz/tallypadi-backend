'use client';
import React, { useState } from 'react';
import axios from 'axios';
import { MessageSquare, Send, Smartphone, Bell, Image as ImageIcon, FileText, Video, Music } from 'lucide-react';
import Swal from 'sweetalert2';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

export default function BroadcastTab({ headers }: { headers: Record<string, string> }) {
    const [msg, setMsg] = useState('');
    const [target, setTarget] = useState('active_24h');
    
    // New States
    const [sendWhatsapp, setSendWhatsapp] = useState(true);
    const [sendPush, setSendPush] = useState(false);
    const [mediaId, setMediaId] = useState('');
    const [mediaType, setMediaType] = useState<'image' | 'video' | 'document' | 'audio'>('image');

    const send = async () => {
        if (!msg) {
             return Swal.fire('Missing Field', 'Please enter a message body.', 'warning');
        }
        if (!sendWhatsapp && !sendPush) {
             return Swal.fire('Error', 'You must select at least one delivery method (WhatsApp or Web Push).', 'error');
        }

        const res = await Swal.fire({
            title: 'Confirm Broadcast',
            text: `Send to: ${target}? ${sendWhatsapp ? '📱 WhatsApp' : ''} ${sendPush ? '🔔 Web Push' : ''}`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Send Now'
        });

        if (res.isConfirmed) {
            try {
                const payload: Record<string, unknown> = {
                    target, 
                    message: msg,
                    sendWhatsapp,
                    sendPush
                };

                if (sendWhatsapp && mediaId.trim()) {
                    payload.mediaId = mediaId.trim();
                    payload.mediaType = mediaType;
                }

                const response = await axios.post(`${API_URL}/admin/broadcast`, payload, { headers });
                Swal.fire('Sent', response.data.message || 'Broadcast queued successfully.', 'success');
                setMsg('');
                setMediaId('');
            } catch (e: unknown) {
                const error = e as { response?: { data?: { error?: string } } };
                Swal.fire('Error', error?.response?.data?.error || 'Broadcast failed', 'error');
            }
        }
    };

    return (
        <div className="max-w-3xl mx-auto animate-in fade-in duration-300 pb-20">
            <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-lg">
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <MessageSquare className="text-purple-400" /> Mass Broadcast Console
                </h2>
                
                <div className="space-y-8">
                    {/* Delivery Methods */}
                    <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700">
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-4">Delivery Channels</label>
                        <div className="flex flex-col sm:flex-row gap-4">
                            <label className={`flex-1 flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${sendWhatsapp ? 'bg-green-500/10 border-green-500 text-green-400' : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-500'}`}>
                                <div className="flex items-center gap-3">
                                    <Smartphone size={20} />
                                    <span className="font-semibold text-sm">WhatsApp Delivery</span>
                                </div>
                                <input type="checkbox" className="w-5 h-5 accent-green-500" checked={sendWhatsapp} onChange={(e) => setSendWhatsapp(e.target.checked)} />
                            </label>

                            <label className={`flex-1 flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${sendPush ? 'bg-blue-500/10 border-blue-500 text-blue-400' : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-500'}`}>
                                <div className="flex items-center gap-3">
                                    <Bell size={20} />
                                    <span className="font-semibold text-sm">PWA Web Push</span>
                                </div>
                                <input type="checkbox" className="w-5 h-5 accent-blue-500" checked={sendPush} onChange={(e) => setSendPush(e.target.checked)} />
                            </label>
                        </div>
                        {!sendWhatsapp && sendPush && (
                            <p className="text-xs text-blue-400 mt-3 flex items-center gap-1">
                                <span className="block w-1.5 h-1.5 rounded-full bg-blue-400" /> WhatsApp delivery is disabled. Only installed PWA apps will receive this instantly.
                            </p>
                        )}
                    </div>

                    {/* Target Audience */}
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Target Audience</label>
                        <select className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white focus:border-green-500 outline-none transition-colors" value={target} onChange={(e) => setTarget(e.target.value)}>
                            <option value="active_24h">Active Users (24h) - Text Only</option>
                            <option value="all">ALL Users - Requires Template</option>
                            <option value="tycoon">Tycoon Only</option>
                            <option value="oga_boss">Oga Boss Only</option>
                        </select>
                    </div>

                    {/* Message Body */}
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Message Body</label>
                        <textarea className="w-full h-32 bg-slate-900 border border-slate-600 rounded-xl p-4 text-white focus:border-green-500 outline-none resize-none transition-colors" placeholder="Type your broadcast message here..." value={msg} onChange={(e) => setMsg(e.target.value)}></textarea>
                        <p className="text-xs text-slate-500 mt-2">This will be used as the caption if media is attached.</p>
                    </div>

                    {/* Media Attachments */}
                    {sendWhatsapp && (
                        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-700 space-y-4">
                            <label className="block text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                                <ImageIcon size={14} /> Optional Meta API Attachment
                            </label>
                            
                            <div className="flex flex-col sm:flex-row gap-4">
                                <div className="flex-1">
                                    <input 
                                        type="text" 
                                        placeholder="Paste Meta Media ID here (e.g., 29103...)" 
                                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:border-purple-500 outline-none transition-colors"
                                        value={mediaId}
                                        onChange={(e) => setMediaId(e.target.value)}
                                    />
                                </div>
                                <div className="sm:w-1/3">
                                    <select 
                                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:border-purple-500 outline-none transition-colors opacity-90"
                                        value={mediaType}
                                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMediaType(e.target.value as 'image' | 'video' | 'document' | 'audio')}
                                        disabled={!mediaId.trim()}
                                    >
                                        <option value="image">🖼️ Image (JPEG/PNG)</option>
                                        <option value="document">📄 Document (PDF)</option>
                                        <option value="video">🎥 Video (MP4)</option>
                                        <option value="audio">🎵 Audio</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}

                    <button 
                        onClick={send} 
                        disabled={!sendWhatsapp && !sendPush}
                        className={`w-full font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${
                            (!sendWhatsapp && !sendPush) ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20'
                        }`}
                    >
                        <Send size={18} /> Broadcast Now
                    </button>
                </div>
            </div>
        </div>
    );
}