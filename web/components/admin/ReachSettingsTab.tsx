'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import { CheckCircle2, KeyRound, Loader2, Mail, PlugZap, Save, Tags, Workflow } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

export type HostingerReachSettings = {
    enabled: boolean;
    apiToken: string;
    apiTokenConfigured?: boolean;
    profileUuid: string;
    senderName: string;
    senderEmail: string;
    automationTagUuid: string;
    automationUuid: string;
};

const DEFAULT_SETTINGS: HostingerReachSettings = {
    enabled: false,
    apiToken: '',
    apiTokenConfigured: false,
    profileUuid: '',
    senderName: 'TallyPadi',
    senderEmail: '',
    automationTagUuid: '',
    automationUuid: '',
};

type ReachOptions = {
    tags: Array<{ uuid: string; value: string }>;
    automations: Array<{ uuid: string; name: string; status: string }>;
};

export default function ReachSettingsTab({
    settings,
    onUpdate,
    headers,
}: {
    settings?: Partial<HostingerReachSettings>;
    onUpdate: () => void;
    headers: Record<string, string>;
}) {
    const [form, setForm] = useState<HostingerReachSettings>({ ...DEFAULT_SETTINGS, ...settings });
    const [options, setOptions] = useState<ReachOptions>({ tags: [], automations: [] });
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        setForm({ ...DEFAULT_SETTINGS, ...settings, apiToken: '' });
    }, [settings]);

    const update = <K extends keyof HostingerReachSettings>(key: K, value: HostingerReachSettings[K]) => {
        setForm((current) => ({ ...current, [key]: value }));
    };

    const save = async () => {
        setSaving(true);
        try {
            await axios.put(`${API_URL}/admin/settings`, { hostingerReach: form }, { headers });
            await onUpdate();
            Swal.fire('Saved', 'Hostinger Reach settings have been updated.', 'success');
        } catch (error: unknown) {
            const message = axios.isAxiosError(error)
                ? error.response?.data?.message || error.response?.data?.error
                : undefined;
            Swal.fire('Error', typeof message === 'string' ? message : 'Failed to save Hostinger Reach settings.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const testConnection = async () => {
        setTesting(true);
        try {
            const response = await axios.post(`${API_URL}/admin/settings/hostinger-reach/test`, {}, { headers });
            const profiles = Array.isArray(response.data?.profiles) ? response.data.profiles : [];
            const tags = Array.isArray(response.data?.tags) ? response.data.tags : [];
            const automations = Array.isArray(response.data?.automations) ? response.data.automations : [];
            const profileUuid = response.data?.resolvedProfileUuid || profiles[0]?.uuid || '';
            if (!form.profileUuid && profileUuid) update('profileUuid', profileUuid);
            setOptions({ tags, automations });
            Swal.fire('Connected', `${tags.length} tag(s) and ${automations.length} active automation(s) found.`, 'success');
        } catch (error: unknown) {
            const message = axios.isAxiosError(error) ? error.response?.data?.error : undefined;
            Swal.fire('Connection failed', message || 'Save the API token, enable Reach, and try again.', 'error');
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="mx-auto max-w-3xl space-y-6 animate-in fade-in duration-300">
            <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-lg sm:p-8">
                <div className="mb-7 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-violet-500/15 p-3 text-violet-300"><Mail className="h-6 w-6" /></div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Hostinger Reach</h2>
                            <p className="text-sm text-slate-400">API connection, sender and automation audience.</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => update('enabled', !form.enabled)}
                        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${form.enabled ? 'bg-violet-600' : 'bg-slate-600'}`}
                        aria-label="Enable Hostinger Reach"
                    >
                        <span className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${form.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>

                <div className="space-y-6">
                    <section className="rounded-xl border border-slate-700 bg-slate-900/50 p-4 sm:p-5">
                        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-white"><KeyRound className="h-4 w-4 text-violet-300" /> Connection</h3>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-400">API Token</label>
                                <input
                                    type="password"
                                    value={form.apiToken}
                                    onChange={(event) => update('apiToken', event.target.value)}
                                    placeholder={form.apiTokenConfigured ? 'Configured — leave blank to keep it' : 'Paste Hostinger API token'}
                                    autoComplete="new-password"
                                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-400">Profile UUID</label>
                                <input
                                    type="text"
                                    value={form.profileUuid}
                                    onChange={(event) => update('profileUuid', event.target.value)}
                                    placeholder="Detected when connection is tested"
                                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                                />
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={testConnection}
                            disabled={testing}
                            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-violet-500/40 bg-violet-500/10 px-4 py-2.5 text-sm font-bold text-violet-300 transition hover:bg-violet-500/20 disabled:opacity-60"
                        >
                            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                            Test saved connection and load options
                        </button>
                    </section>

                    <section className="rounded-xl border border-slate-700 bg-slate-900/50 p-4 sm:p-5">
                        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-white"><Workflow className="h-4 w-4 text-violet-300" /> Automation</h3>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-400">Audience Tag</label>
                                {options.tags.length ? (
                                    <select value={form.automationTagUuid} onChange={(event) => update('automationTagUuid', event.target.value)} className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500">
                                        <option value="">Select the tag watched by Reach</option>
                                        {options.tags.map((tag) => <option key={tag.uuid} value={tag.uuid}>{tag.value}</option>)}
                                    </select>
                                ) : (
                                    <input type="text" value={form.automationTagUuid} onChange={(event) => update('automationTagUuid', event.target.value)} placeholder="Tag UUID" className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500" />
                                )}
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-400">Active Automation</label>
                                {options.automations.length ? (
                                    <select value={form.automationUuid} onChange={(event) => update('automationUuid', event.target.value)} className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500">
                                        <option value="">Select the automation to run</option>
                                        {options.automations.map((automation) => <option key={automation.uuid} value={automation.uuid}>{automation.name}</option>)}
                                    </select>
                                ) : (
                                    <input type="text" value={form.automationUuid} onChange={(event) => update('automationUuid', event.target.value)} placeholder="Automation UUID" className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500" />
                                )}
                            </div>
                        </div>
                        <div className="mt-3 flex items-start gap-2 rounded-lg bg-slate-800 px-3 py-2.5 text-xs text-slate-400">
                            <Tags className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
                            Choose the permanent tag monitored by the automation. TallyPadi sends each shop name to Reach&apos;s Name field for personalization.
                        </div>
                    </section>

                    <section className="rounded-xl border border-slate-700 bg-slate-900/50 p-4 sm:p-5">
                        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-white"><CheckCircle2 className="h-4 w-4 text-violet-300" /> Sender</h3>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-400">Sender Name</label>
                                <input type="text" maxLength={50} value={form.senderName} onChange={(event) => update('senderName', event.target.value)} placeholder="TallyPadi" className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500" />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-400">Verified Sender Email</label>
                                <input type="email" value={form.senderEmail} onChange={(event) => update('senderEmail', event.target.value)} placeholder="marketing@tallypadi.com" className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500" />
                            </div>
                        </div>
                    </section>

                    <button
                        type="button"
                        onClick={save}
                        disabled={saving}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 font-bold text-white transition hover:bg-violet-500 disabled:opacity-60"
                    >
                        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                        Save Reach Settings
                    </button>
                </div>
            </div>
        </div>
    );
}
