'use client';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MessageSquare, Send, Smartphone, Bell, Image as ImageIcon, Mail, Plus, Trash2, List } from 'lucide-react';
import Swal from 'sweetalert2';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

export default function BroadcastTab({ headers }: { headers: Record<string, string> }) {
    const [msg, setMsg] = useState('');
    const [target, setTarget] = useState('active_24h');
    
    // Existing States
    const [sendWhatsapp, setSendWhatsapp] = useState(true);
    const [sendPush, setSendPush] = useState(false);
    const [mediaId, setMediaId] = useState('');
    const [mediaType, setMediaType] = useState<'image' | 'video' | 'document' | 'audio'>('image');

    // Email States
    const [sendEmail, setSendEmail] = useState(false);
    const [emailDelayMs, setEmailDelayMs] = useState(1000);
    const [specificIdentifier, setSpecificIdentifier] = useState('');
    
    const [templates, setTemplates] = useState<any[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
    const [templateTitle, setTemplateTitle] = useState('');
    const [templateSubject, setTemplateSubject] = useState('');
    const [templateHtml, setTemplateHtml] = useState('');
    const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);

    useEffect(() => {
        loadTemplates();
    }, []);

    const loadTemplates = async () => {
        try {
            const res = await axios.get(`${API_URL}/admin/email-templates`, { headers });
            setTemplates(res.data);
            if (res.data.length > 0 && !selectedTemplateId) {
                 setSelectedTemplateId(res.data[0]._id);
            }
        } catch (e) {
            console.error('Failed to load templates', e);
        }
    };

    const handleSaveTemplate = async () => {
        if (!templateTitle || !templateSubject || !templateHtml) {
            return Swal.fire('Error', 'Please fill title, subject, and HTML body correctly.', 'error');
        }
        try {
            const res = await axios.post(`${API_URL}/admin/email-templates`, {
                 title: templateTitle,
                 subject: templateSubject,
                 htmlBody: templateHtml
            }, { headers });
            Swal.fire('Saved', 'Email Template has been saved!', 'success');
            setIsCreatingTemplate(false);
            setTemplateTitle('');
            setTemplateSubject('');
            setTemplateHtml('');
            loadTemplates();
            setSelectedTemplateId(res.data._id);
        } catch (e) {
            Swal.fire('Error', 'Failed to save template', 'error');
        }
    };

    const handleDeleteTemplate = async (id: string) => {
        if (!confirm('Are you sure you want to delete this template?')) return;
        try {
            await axios.delete(`${API_URL}/admin/email-templates/${id}`, { headers });
            loadTemplates();
        } catch (e) {
            Swal.fire('Error', 'Failed to delete template', 'error');
        }
    };

    const send = async () => {
        if (!sendWhatsapp && !sendPush && !sendEmail) {
             return Swal.fire('Error', 'You must select at least one delivery method (WhatsApp, Push, or Email).', 'error');
        }
        if ((sendWhatsapp || sendPush) && !msg) {
             return Swal.fire('Missing Field', 'Please enter a message body for WhatsApp/Push.', 'warning');
        }
        if (sendEmail && !selectedTemplateId) {
             return Swal.fire('Missing Template', 'Please select an Email Template to use for broadcasting.', 'warning');
        }
        if (target === 'particular_user' && !specificIdentifier) {
             return Swal.fire('Missing', 'Please enter the specific phone number or email of the recipient.', 'warning');
        }

        const res = await Swal.fire({
            title: 'Confirm Broadcast',
            text: `Send to: ${target}? ${sendWhatsapp ? '📱 WhatsApp ' : ''}${sendPush ? '🔔 Push ' : ''}${sendEmail ? '✉️ Email' : ''}`,
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
                    sendPush,
                    sendEmail,
                    emailDelayMs,
                    specificIdentifier
                };

                if (sendWhatsapp && mediaId.trim()) {
                    payload.mediaId = mediaId.trim();
                    payload.mediaType = mediaType;
                }

                if (sendEmail && selectedTemplateId) {
                    payload.emailTemplateId = selectedTemplateId;
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
        <div className="max-w-4xl mx-auto animate-in fade-in duration-300 pb-20">
            <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-lg">
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <MessageSquare className="text-purple-400" /> Mass Broadcast Console
                </h2>
                
                <div className="space-y-8">
                    {/* Delivery Methods */}
                    <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700">
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-4">Delivery Channels</label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <label className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${sendWhatsapp ? 'bg-green-500/10 border-green-500 text-green-400' : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-500'}`}>
                                <div className="flex items-center gap-3">
                                    <Smartphone size={20} />
                                    <span className="font-semibold text-sm">WhatsApp</span>
                                </div>
                                <input type="checkbox" className="w-5 h-5 accent-green-500" checked={sendWhatsapp} onChange={(e) => setSendWhatsapp(e.target.checked)} />
                            </label>

                            <label className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${sendPush ? 'bg-blue-500/10 border-blue-500 text-blue-400' : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-500'}`}>
                                <div className="flex items-center gap-3">
                                    <Bell size={20} />
                                    <span className="font-semibold text-sm">Web Push</span>
                                </div>
                                <input type="checkbox" className="w-5 h-5 accent-blue-500" checked={sendPush} onChange={(e) => setSendPush(e.target.checked)} />
                            </label>
                            
                            <label className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${sendEmail ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400' : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-500'}`}>
                                <div className="flex items-center gap-3">
                                    <Mail size={20} />
                                    <span className="font-semibold text-sm">Email (SMTP)</span>
                                </div>
                                <input type="checkbox" className="w-5 h-5 accent-indigo-500" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
                            </label>
                        </div>
                    </div>

                    {/* Target Audience */}
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Target Audience</label>
                        <select className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white focus:border-green-500 outline-none transition-colors" value={target} onChange={(e) => setTarget(e.target.value)}>
                            <option value="active_24h">Active Users (24h)</option>
                            <option value="all">ALL Users</option>
                            <option value="tycoon">Tycoon Only</option>
                            <option value="oga_boss">Oga Boss Only</option>
                            <option value="trial">Trial Users</option>
                            <option value="past_due">Past Due Users</option>
                            <option value="particular_user">Specific User (Test Broadcast)</option>
                        </select>
                    </div>

                    {target === 'particular_user' && (
                         <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Recipient Phone or Email</label>
                            <input 
                                type="text"
                                value={specificIdentifier}
                                onChange={(e) => setSpecificIdentifier(e.target.value)}
                                placeholder="Enter specific user's phone or email..."
                                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white focus:border-green-500 outline-none transition-colors"
                            />
                         </div>
                    )}

                    {/* EMAIL TEMPLATE SECTION */}
                    {sendEmail && (
                        <div className="bg-slate-900/50 p-5 rounded-xl border border-indigo-900/50 space-y-5 animate-in slide-in-from-top-2">
                             <div className="flex items-center justify-between border-b border-slate-700 pb-3">
                                <h3 className="font-bold text-indigo-400 flex items-center gap-2">
                                    <Mail className="w-5 h-5" /> Email HTML Configuration
                                </h3>
                                <div className="text-xs flex gap-2">
                                    <button onClick={() => setIsCreatingTemplate(false)} className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 ${!isCreatingTemplate ? 'bg-indigo-600/20 text-indigo-400' : 'text-slate-400 hover:bg-slate-800'}`}><List className="w-3.5 h-3.5"/> Use Saved</button>
                                    <button onClick={() => setIsCreatingTemplate(true)} className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 ${isCreatingTemplate ? 'bg-indigo-600/20 text-indigo-400' : 'text-slate-400 hover:bg-slate-800'}`}><Plus className="w-3.5 h-3.5"/> Create New</button>
                                </div>
                             </div>

                             {isCreatingTemplate ? (
                                 <div className="space-y-4">
                                     <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 mb-1">Template Map Title</label>
                                            <input type="text" value={templateTitle} onChange={e=>setTemplateTitle(e.target.value)} placeholder="e.g. Welcome Series" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 mb-1">Subject Line</label>
                                            <input type="text" value={templateSubject} onChange={e=>setTemplateSubject(e.target.value)} placeholder="e.g. Check this out ##usershopname##!" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-sm" />
                                        </div>
                                     </div>
                                     <div>
                                        <div className="flex justify-between items-end mb-1">
                                            <label className="block text-xs font-bold text-slate-400">Pure HTML Body</label>
                                            <span className="text-[10px] text-slate-500 font-mono bg-slate-800 px-1.5 rounded">Variables: ##name##, ##usershopname##, ##phonenumber##</span>
                                        </div>
                                        <textarea value={templateHtml} onChange={e=>setTemplateHtml(e.target.value)} rows={6} className="w-full font-mono text-xs bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500" placeholder="<html><body><h1>Hi ##name##</h1></body></html>"></textarea>
                                     </div>
                                     <button onClick={handleSaveTemplate} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-colors text-sm">Save & Store Template</button>
                                 </div>
                             ) : (
                                 <div className="space-y-4">
                                    {templates.length === 0 ? (
                                        <p className="text-sm text-slate-500 italic p-4 text-center border border-dashed border-slate-700 rounded-xl">No templates found. Click 'Create New' to craft your first HTML campaign.</p>
                                    ) : (
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 mb-2">Select Active Template</label>
                                            <div className="flex items-center gap-3">
                                                <select value={selectedTemplateId} onChange={e=>setSelectedTemplateId(e.target.value)} className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500">
                                                    {templates.map(t => (
                                                        <option key={t._id} value={t._id}>{t.title} [Subject: {t.subject}]</option>
                                                    ))}
                                                </select>
                                                <button onClick={() => handleDeleteTemplate(selectedTemplateId)} disabled={!selectedTemplateId} className="p-2.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors border border-red-500/20 disabled:opacity-50">
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                            {selectedTemplateId && (
                                                <div className="mt-3 p-3 bg-slate-800 border border-slate-700 rounded-lg h-32 overflow-y-auto">
                                                    <p className="text-xs text-slate-400 mb-1 font-bold">HTML Preview Map:</p>
                                                    <div className="text-xs text-slate-300 font-mono opacity-80 select-all">{templates.find(t=>t._id===selectedTemplateId)?.htmlBody}</div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div className="pt-3 border-t border-slate-700">
                                            <label className="block text-xs font-bold text-slate-400 mb-1">Email Dispatch Throttle Delay (Milliseconds)</label>
                                            <p className="text-[10px] text-slate-500 mb-2">Wait interval between each sent email. Recommedations: 1000 - 3000ms</p>
                                            <input type="number" value={emailDelayMs} onChange={e=>setEmailDelayMs(Number(e.target.value))} className="w-32 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-sm text-center" />
                                    </div>
                                 </div>
                             )}
                        </div>
                    )}

                    {/* WhatsApp/Push Core Message Body */}
                    {(sendWhatsapp || sendPush) && (
                        <div className="animate-in slide-in-from-top-2">
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Basic Text Body (WhatsApp & PWA)</label>
                            <textarea className="w-full h-32 bg-slate-900 border border-slate-600 rounded-xl p-4 text-white focus:border-green-500 outline-none resize-none transition-colors" placeholder="Type your WhatsApp/Push generic message here..." value={msg} onChange={(e) => setMsg(e.target.value)}></textarea>
                            <p className="text-xs text-slate-500 mt-2">This will be used as the caption if meta media is attached.</p>
                        </div>
                    )}

                    {/* Media Attachments */}
                    {sendWhatsapp && (
                        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-700 space-y-4 animate-in slide-in-from-top-2">
                            <label className="block text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                                <ImageIcon size={14} /> Optional Meta API Attachment (Whatsapp)
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
                        disabled={!sendWhatsapp && !sendPush && !sendEmail}
                        className={`w-full font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${
                            (!sendWhatsapp && !sendPush && !sendEmail) ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20'
                        }`}
                    >
                        <Send size={18} /> Launch Mass Campaign
                    </button>
                </div>
            </div>
        </div>
    );
}