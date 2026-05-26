'use client';
import React, { useState, useEffect } from 'react';
import { Shield, AlertTriangle, MessageSquare, Users, Save, Loader2, Phone, Globe, Gift } from 'lucide-react';
import axios from 'axios';
import Swal from 'sweetalert2';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';
const MIN_AD_PLAN_DAYS = 3;
const MAX_AD_PLAN_DAYS = 30;
const MIN_AD_PLAN_PRICE = 50000;

export interface SettingsLimits {
  maxMessageHistory: number;
  maxStaffAccounts: number;
}
export interface SettingsSecurity {
  autoSuspendOnJailbreak: boolean;
}
export interface AdsPlan {
  id: string;
  durationDays: number;
  price: number;
  label: string;
}
export interface ReferralProgramSettings {
  enabled: boolean;
  minimumFundingAmount: number;
  rewardPercentage: number;
}
export interface SettingsProfile {
  whatsappUrl: string;
  security: SettingsSecurity;
  limits: SettingsLimits;
  adsPlans?: AdsPlan[];
  referralProgram?: ReferralProgramSettings;
}
export default function SettingsTab({ 
  settings, 
  onUpdate, 
  headers 
}: { 
  settings?: Partial<SettingsProfile>, 
  onUpdate: () => void, 
  headers: Record<string, string> 
}) {
    // Initialize with default structure if settings is partial
    const [localSettings, setLocalSettings] = useState({
        whatsappUrl: '',
        security: { autoSuspendOnJailbreak: false },
        limits: { maxMessageHistory: 5, maxStaffAccounts: 2 },
        smtp: { host: '', port: 465, user: '', pass: '', fromAddress: '', secure: true },
        adsPlans: [] as AdsPlan[],
        referralProgram: { enabled: true, minimumFundingAmount: 10000, rewardPercentage: 10 },
        ...settings // Overwrite defaults with actual data
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (settings) {
            setLocalSettings((prev) => ({ ...prev, ...settings }));
        }
    }, [settings]);

    const handleToggle = (key: keyof typeof localSettings.security) => {
        setLocalSettings((prev) => ({
            ...prev,
            security: { ...prev.security, [key]: !prev.security[key] }
        }));
    };

    const handleLimitChange = (key: keyof typeof localSettings.limits, value: string) => {
        setLocalSettings((prev) => ({
            ...prev,
            limits: { ...prev.limits, [key]: parseInt(value) || 0 }
        }));
    };

    const handleUrlChange = (value: string) => {
        setLocalSettings((prev) => ({
            ...prev,
            whatsappUrl: value
        }));
    };

    const handleSmtpChange = (key: string, value: string | number | boolean) => {
        setLocalSettings((prev) => ({
            ...prev,
            smtp: { ...prev.smtp, [key]: value }
        }));
    };

    const handleReferralChange = (key: keyof ReferralProgramSettings, value: string | boolean) => {
        setLocalSettings((prev) => ({
            ...prev,
            referralProgram: {
                ...(prev.referralProgram || { enabled: true, minimumFundingAmount: 10000, rewardPercentage: 10 }),
                [key]: typeof value === 'boolean' ? value : Number(value) || 0
            }
        }));
    };

    const handleSave = async () => {
        const invalidPlan = (localSettings.adsPlans || []).find((plan) => (
            !String(plan.label || '').trim() ||
            Number(plan.durationDays) < MIN_AD_PLAN_DAYS ||
            Number(plan.durationDays) > MAX_AD_PLAN_DAYS ||
            Number(plan.price) < MIN_AD_PLAN_PRICE
        ));
        if (invalidPlan) {
            Swal.fire(
                'Ads plan needs attention',
                `Ads plans must be ${MIN_AD_PLAN_DAYS}-${MAX_AD_PLAN_DAYS} days and at least ₦${MIN_AD_PLAN_PRICE.toLocaleString()}.`,
                'warning'
            );
            return;
        }

        setSaving(true);
        try {
            await axios.put(`${API_URL}/admin/settings`, { 
                whatsappUrl: localSettings.whatsappUrl,
                autoSuspendOnJailbreak: localSettings.security.autoSuspendOnJailbreak,
                maxMessageHistory: localSettings.limits.maxMessageHistory,
                maxStaffAccounts: localSettings.limits.maxStaffAccounts,
                smtp: localSettings.smtp,
                adsPlans: localSettings.adsPlans,
                referralProgram: localSettings.referralProgram
            }, { headers });
            
            onUpdate();
            Swal.fire('Saved!', 'Global settings have been updated.', 'success');
        } catch (e: unknown) {
            const data = axios.isAxiosError(e) ? e.response?.data as { error?: unknown; message?: string } | undefined : undefined;
            Swal.fire('Error', data?.message || 'Failed to save settings. Check server logs.', 'error');
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
                                placeholder={localSettings.whatsappUrl || ''}
                                value={localSettings.whatsappUrl || ''}
                                onChange={(e) => handleUrlChange(e.target.value)}
                                className="bg-transparent border-none text-white text-sm w-full focus:outline-none placeholder:text-slate-400"
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
                <div className="space-y-4 mb-8">
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
                </div>

                {/* 4. SMTP Settings */}
                <div className="space-y-4 mb-8">
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">SMTP Mailserver</h3>
                    <div className="p-5 bg-slate-900/50 rounded-xl border border-slate-700 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-slate-400 font-bold mb-1 block">SMTP Host</label>
                                <input type="text" value={localSettings.smtp?.host || ''} onChange={(e) => handleSmtpChange('host', e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500" placeholder="smtp.gmail.com" />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 font-bold mb-1 block">SMTP Port</label>
                                <input type="number" value={localSettings.smtp?.port || ''} onChange={(e) => handleSmtpChange('port', parseInt(e.target.value))} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500" placeholder="465" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-slate-400 font-bold mb-1 block">SMTP User (Email)</label>
                                <input type="text" value={localSettings.smtp?.user || ''} onChange={(e) => handleSmtpChange('user', e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500" placeholder="admin@example.com" />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 font-bold mb-1 block">SMTP Password</label>
                                <input type="password" value={localSettings.smtp?.pass || ''} onChange={(e) => handleSmtpChange('pass', e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500" placeholder="••••••••" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 items-end">
                            <div>
                                <label className="text-xs text-slate-400 font-bold mb-1 block">Reply-To Address</label>
                                <input type="text" value={localSettings.smtp?.fromAddress || ''} onChange={(e) => handleSmtpChange('fromAddress', e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500" placeholder="support@tallypadi.com" />
                            </div>
                            <div className="flex items-center justify-between p-2 bg-slate-800 border border-slate-600 rounded-lg h-[38px]">
                                <span className="text-sm text-slate-300 font-medium">Use TLS/SSL</span>
                                <button onClick={() => handleSmtpChange('secure', !localSettings.smtp?.secure)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${localSettings.smtp?.secure ? 'bg-green-600' : 'bg-gray-600'}`}>
                                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${localSettings.smtp?.secure ? 'translate-x-4' : 'translate-x-[2px]'}`} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 5. Ads Pricing Plans */}
                <div className="space-y-4 mb-8">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider">Ads & Boost Pricing Plans</h3>
                      <button 
                        onClick={() => {
                          const newPlan = { id: Date.now().toString(), durationDays: MIN_AD_PLAN_DAYS, price: MIN_AD_PLAN_PRICE, label: `${MIN_AD_PLAN_DAYS} Days Boost` };
                          setLocalSettings(prev => ({ ...prev, adsPlans: [...(prev.adsPlans || []), newPlan] }));
                        }}
                        className="text-xs bg-green-500/20 text-green-400 px-3 py-1.5 rounded-lg font-bold hover:bg-green-500/30 transition"
                      >
                        + Add Plan
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 -mt-2 mb-3">
                      User-facing ads plans must respect the boost minimums: {MIN_AD_PLAN_DAYS}-{MAX_AD_PLAN_DAYS} days and at least ₦{MIN_AD_PLAN_PRICE.toLocaleString()}.
                    </p>
                    
                    <div className="space-y-3">
                      {(localSettings.adsPlans || []).length === 0 && (
                        <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700 text-center text-slate-500 text-sm">
                          No ads plans configured. Users will see default pricing.
                        </div>
                      )}
                      
                      {(localSettings.adsPlans || []).map((plan, index) => (
                        <div key={plan.id} className="p-4 bg-slate-900/50 rounded-xl border border-slate-700 grid grid-cols-12 gap-3 items-end">
                          <div className="col-span-12 md:col-span-4">
                            <label className="text-xs text-slate-400 font-bold mb-1 block">Plan Label</label>
                            <input 
                              type="text" 
                              value={plan.label} 
                              onChange={(e) => {
                                const newPlans = [...(localSettings.adsPlans || [])];
                                newPlans[index].label = e.target.value;
                                setLocalSettings(prev => ({ ...prev, adsPlans: newPlans }));
                              }}
                              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500" 
                            />
                          </div>
                          <div className="col-span-6 md:col-span-3">
                            <label className="text-xs text-slate-400 font-bold mb-1 block">Duration (Days)</label>
                            <input 
                              type="number" 
                              min={MIN_AD_PLAN_DAYS}
                              max={MAX_AD_PLAN_DAYS}
                              value={plan.durationDays} 
                              onChange={(e) => {
                                const newPlans = [...(localSettings.adsPlans || [])];
                                newPlans[index].durationDays = parseInt(e.target.value) || 0;
                                setLocalSettings(prev => ({ ...prev, adsPlans: newPlans }));
                              }}
                              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500" 
                            />
                          </div>
                          <div className="col-span-6 md:col-span-3">
                            <label className="text-xs text-slate-400 font-bold mb-1 block">Price (₦)</label>
                            <input 
                              type="number" 
                              min={MIN_AD_PLAN_PRICE}
                              value={plan.price} 
                              onChange={(e) => {
                                const newPlans = [...(localSettings.adsPlans || [])];
                                newPlans[index].price = parseInt(e.target.value) || 0;
                                setLocalSettings(prev => ({ ...prev, adsPlans: newPlans }));
                              }}
                              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500" 
                            />
                          </div>
                          <div className="col-span-12 md:col-span-2">
                            <button 
                              onClick={() => {
                                const newPlans = (localSettings.adsPlans || []).filter((_, i) => i !== index);
                                setLocalSettings(prev => ({ ...prev, adsPlans: newPlans }));
                              }}
                              className="w-full bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/50 rounded-lg px-3 py-2 text-sm font-bold transition"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                </div>

                {/* 6. Referral Program */}
                <div className="space-y-4 mb-8">
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">Referral Program</h3>
                    <div className="p-5 bg-slate-900/50 rounded-xl border border-slate-700 space-y-4">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-amber-500/20 rounded-lg">
                                    <Gift className="w-5 h-5 text-amber-300" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-white">Affiliate Rewards</h4>
                                    <p className="text-sm text-slate-400">Credits the referrer&apos;s ads wallet after the referred user&apos;s first qualifying wallet funding.</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleReferralChange('enabled', !localSettings.referralProgram?.enabled)}
                                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${localSettings.referralProgram?.enabled ? 'bg-green-600' : 'bg-gray-600'}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${localSettings.referralProgram?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-slate-400 font-bold mb-1 block">Minimum Funding (₦)</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={localSettings.referralProgram?.minimumFundingAmount ?? 10000}
                                    onChange={(e) => handleReferralChange('minimumFundingAmount', e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 font-bold mb-1 block">Reward Percentage (%)</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={localSettings.referralProgram?.rewardPercentage ?? 10}
                                    onChange={(e) => handleReferralChange('rewardPercentage', e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500"
                                />
                            </div>
                        </div>
                    </div>
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
