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

export default function AdminDashboard() {
    const [adminKey, setAdminKey] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authLoading, setAuthLoading] = useState(true);
    const [stats, setStats] = useState<any>(null);
    const [users, setUsers] = useState<any[]>([]);
    const [globalSettings, setGlobalSettings] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [tab, setTab] = useState<'overview' | 'users' | 'settings' | 'broadcast'>('overview');

    const getHeaders = () => ({ 'x-admin-secret': adminKey });

    useEffect(() => {
        const envKey = process.env.NEXT_PUBLIC_ADMIN_SECRET;
        const storedKey = sessionStorage.getItem('adminKey');
        const keyToTry = storedKey || envKey || '';
        
        if (keyToTry) {
            setAdminKey(keyToTry);
            verifyAccess(keyToTry);
        } else {
            setAuthLoading(false);
        }
    }, []);

    const verifyAccess = async (key: string) => {
        setAuthLoading(true);
        try {
            await axios.get(`${API_URL}/admin/analytics`, { headers: { 'x-admin-secret': key } });
            setIsAuthenticated(true);
            setAdminKey(key);
            sessionStorage.setItem('adminKey', key);
            loadData(key); 
        } catch (err) {
            console.error("Auth failed");
            setIsAuthenticated(false);
        } finally {
            setAuthLoading(false);
        }
    };

    const loadData = async (key: string) => {
        setLoading(true);
        const headers = { 'x-admin-secret': key };
        try {
            const [statsRes, usersRes, settingsRes] = await Promise.all([
                axios.get(`${API_URL}/admin/analytics?range=week`, { headers }),
                axios.get(`${API_URL}/admin/users?limit=200`, { headers }),
                axios.get(`${API_URL}/admin/settings`, { headers })
            ]);
            setStats(statsRes.data);
            setUsers(usersRes.data);
            setGlobalSettings(settingsRes.data);
        } catch (e) {
            console.error("Data load error", e);
        } finally {
            setLoading(false);
        }
    };

    const handleUserAction = async (userId: string, action: string, payload: any = {}) => {
        try {
            await axios.put(`${API_URL}/admin/users/${userId}`, { action, payload }, { headers: getHeaders() });
            
            if (action !== 'set_expiry' && action !== 'change_plan' && action !== 'cancel') {
                Swal.fire({ title: 'Success', text: `User updated successfully.`, icon: 'success', timer: 1500, showConfirmButton: false });
            }
            
            loadData(adminKey); 
        } catch (e) {
            Swal.fire('Error', 'Action failed', 'error');
        }
    };

    if (!isAuthenticated) return <LoginScreen authLoading={authLoading} onLogin={(key: string) => { setAdminKey(key); verifyAccess(key); }} />;
    if (loading || !stats) return <div className="flex h-screen items-center justify-center bg-slate-900 text-green-500">Loading Command Center...</div>;

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 font-sans flex">
            <Sidebar tab={tab} setTab={setTab} />
            <main className="flex-1 p-8 overflow-y-auto">
                {tab === 'overview' && <OverviewTab stats={stats} />}
                {tab === 'users' && <UsersTab users={users} onAction={handleUserAction} adminKey={adminKey} />}
                {tab === 'settings' && <SettingsTab settings={globalSettings} onUpdate={() => loadData(adminKey)} headers={getHeaders()} />}
                {tab === 'broadcast' && <BroadcastTab headers={getHeaders()} />}
            </main>
        </div>
    );
}