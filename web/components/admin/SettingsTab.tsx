'use client';
import React, { useState, useEffect } from 'react';
import { Shield, AlertTriangle, MessageSquare, Users, Save, Loader2, Phone, Globe } from 'lucide-react';
import axios from 'axios';
import Swal from 'sweetalert2';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

export default function SettingsTab({ settings, onUpdate, headers }: any) {
    // Initialize with default structure if settings is partial
    const [localSettings, setLocalSettings] = useState({
        whatsappUrl: '',
        security: { autoSuspendOnJailbreak: false },
        limits: { maxMessageHistory: 5, maxStaffAccounts: 2 },
        ...settings // Overwrite defaults with actual data
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (settings) {
            setLocalSettings((prev: any) => ({ ...prev, ...settings }));
        }
    }, [settings]);

    const handleToggle = (key: keyof typeof localSettings.security) => {
        setLocalSettings((prev: any) => ({
            ...prev,
            security: { ...prev.security, [key]: !prev.security[key] }
        }));
    };

    const handleLimitChange = (key: keyof typeof localSettings.limits, value: string) => {
        setLocalSettings((prev: any) => ({
            ...prev,
            limits: { ...prev.limits, [key]: parseInt(value) || 0 }
        }));
    };

    const handleUrlChange = (value: string) => {
        setLocalSettings((prev: any) => ({
            ...prev,
            whatsappUrl: value
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await axios.put(`${API_URL}/admin/settings`, { 
                whatsappUrl: localSettings.whatsappUrl,
                autoSuspendOnJailbreak: localSettings.security.autoSuspendOnJailbreak,
                maxMessageHistory: localSettings.limits.maxMessageHistory,
                maxStaffAccounts: localSettings.limits.maxStaffAccounts
            }, { headers });
            
            onUpdate();
            Swal.fire('Saved!', 'Global settings have been updated.', 'success');
        } catch (e) {
            Swal.fire('Error', 'Failed to save settings. Check server logs.', 'error');
        } finally {
            setSaving(false);
        }
    };

    if (!localSettings) return null;

    return (
        <div className="max-w-xl mx-auto space-y-6 animate-in fade-in duration-300">
            <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-lg">
                
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <Shield className="text-blue-400" /> Global Configuration
                </h2>

                {/* 1. Public Contact Config */}
                <div className="space-y-4 mb-8">
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Public Contact</h3>
                    <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700 space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-green-500/20 rounded-lg">
                                <Phone className="w-5 h-5 text-green-400" />
                            </div>
                            <div>
                                <h4 className="font-bold text-white">WhatsApp Entry Point</h4>
                                <p className="text-sm text-slate-400">The link used on the landing page CTA buttons.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 focus-within:border-green-500 transition-colors">
                            <Globe className="w-4 h-4 text-slate-500" />
                            <input
                                type="text"
                                placeholder="https://wa.me/234..."
                                value={localSettings.whatsappUrl || ''}
                                onChange={(e) => handleUrlChange(e.target.value)}
                                className="bg-transparent border-none text-white text-sm w-full focus:outline-none placeholder:text-slate-600"
                            />
                        </div>
                    </div>
                </div>
                
                {/* 2. Dynamic Limits */}
                <div className="space-y-4 mb-8">
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Resource Limits</h3>
                    
                    {/* Max Message History */}
                    <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-700">
                        <div className="flex items-center gap-3">
                            <MessageSquare className="w-5 h-5 text-gray-400" />
                            <div>
                                <h4 className="font-bold text-white">Max Message History</h4>
                                <p className="text-sm text-slate-400">Context memory stored per user.</p>
                            </div>
                        </div>
                        <input
                            type="number"
                            min="1"
                            max="50"
                            value={localSettings.limits.maxMessageHistory}
                            onChange={(e) => handleLimitChange('maxMessageHistory', e.target.value)}
                            className="bg-slate-700 border border-slate-600 rounded-lg w-16 px-2 py-1 text-sm text-white text-center focus:border-green-500 outline-none"
                        />
                    </div>

                    {/* Max Staff Accounts */}
                    <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-700">
                        <div className="flex items-center gap-3">
                            <Users className="w-5 h-5 text-gray-400" />
                            <div>
                                <h4 className="font-bold text-white">Maximum Staff Accounts</h4>
                                <p className="text-sm text-slate-400">Limit for Tycoon plan owners.</p>
                            </div>
                        </div>
                        <input
                            type="number"
                            min="1"
                            max="50"
                            value={localSettings.limits.maxStaffAccounts}
                            onChange={(e) => handleLimitChange('maxStaffAccounts', e.target.value)}
                            className="bg-slate-700 border border-slate-600 rounded-lg w-16 px-2 py-1 text-sm text-white text-center focus:border-green-500 outline-none"
                        />
                    </div>
                </div>

                {/* 3. Security Toggle */}
                <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">Security</h3>
                <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-700">
                    <div>
                        <h3 className="font-bold text-white">Auto-Suspend on Jailbreak</h3>
                        <p className="text-sm text-slate-400 mt-1">Automatically suspend users attempting injection/jailbreak attacks.</p>
                    </div>
                    <button onClick={() => handleToggle('autoSuspendOnJailbreak')} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${localSettings.security.autoSuspendOnJailbreak ? 'bg-green-600' : 'bg-gray-600'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${localSettings.security.autoSuspendOnJailbreak ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
                
                {/* Save Button */}
                <button 
                    onClick={handleSave} 
                    disabled={saving}
                    className="w-full mt-8 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition-colors flex justify-center items-center gap-2 disabled:opacity-50 shadow-lg shadow-green-900/20"
                >
                    {saving ? <Loader2 className="animate-spin w-5 h-5" /> : <Save className="w-5 h-5" />}
                    Save All Settings
                </button>

                <div className="mt-6 p-4 bg-orange-900/20 border border-orange-900/50 rounded-xl flex gap-3">
                    <AlertTriangle className="text-orange-500 shrink-0" />
                    <p className="text-xs text-orange-200">Changing global settings affects all users immediately.</p>
                </div>
            </div>
        </div>
    );
}