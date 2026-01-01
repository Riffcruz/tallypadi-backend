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
    
    // New state for mobile sidebar visibility
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
        <div className="flex h-screen bg-slate-900 text-slate-100 font-sans overflow-hidden">
            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div 
                    className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Responsive Sidebar Wrapper */}
            <div className={`
                fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 
                transform transition-transform duration-300 ease-in-out
                md:relative md:translate-x-0 md:border-r-0
                ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <div className="h-full overflow-y-auto">
                    {/* Pass a wrapped setTab to close sidebar on selection on mobile */}
                    <Sidebar tab={tab} setTab={(t: any) => { setTab(t); setIsSidebarOpen(false); }} />
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
                        {/* Hamburger Icon */}
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-8">
                    {tab === 'overview' && <OverviewTab stats={stats} />}
                    {tab === 'users' && <UsersTab users={users} onAction={handleUserAction} adminKey={adminKey} />}
                    {tab === 'settings' && <SettingsTab settings={globalSettings} onUpdate={() => loadData(adminKey)} headers={getHeaders()} />}
                    {tab === 'broadcast' && <BroadcastTab headers={getHeaders()} />}
                </div>
            </main>
        </div>
    );
}