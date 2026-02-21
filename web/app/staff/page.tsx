'use client';

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Sidebar from '../../components/Sidebar';
import Preloader from '../../components/Preloader';
import { useRouter } from 'next/navigation';
import {
  Users,
  Plus,
  Trash2,
  X,
  Menu,
  Shield,
  Smartphone,
  Crown,
  Loader2,
  Pencil,
  Bell,
  Save
} from 'lucide-react';
import Swal from 'sweetalert2';
import { getCookie } from '../../utils/cookies';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

interface StaffMember {
  id: string;
  phoneNumber: string;
  name?: string;
  dateAdded: string;
  isHqManager?: boolean;
}

export default function StaffPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const router = useRouter();

  // Settings State
  const [staffAlertsEnabled, setStaffAlertsEnabled] = useState(false);
  const [staffPermissions, setStaffPermissions] = useState({
    canViewDashboard: false,
    canManageInventory: true,
    canViewSalesHistory: false,
    canViewReports: false,
    canManageCustomers: true,
    canViewSettings: false,
  });

  // Staff State
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);

  // New Staff Input State
  const [staffCountryCode, setStaffCountryCode] = useState('+234');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [addingStaff, setAddingStaff] = useState(false);

  // Original Data blocks needed for saving (since we only update partials in /settings endpoint usually we need to be careful, but the API accepts partial settings if we don't send others, WAIT the API overwrites settings, so we better not overwrite unless we fetch them all first. Wait, let's look at Settings save logic.)
  // Actually, we must fetch dashboard, hold ALL settings, and update only staffAlerts and staffPermissions when saving.
  const [fullSettings, setFullSettings] = useState<any>({});
  
  // We need businessName and bankDetails to send them back since the `/settings` endpoint takes the whole chunk.
  const [businessName, setBusinessName] = useState('');
  const [bankDetails, setBankDetails] = useState<any>({});

  const getTokenOrRedirect = () => {
    const token = getCookie('tallyToken');
    if (!token) router.push('/login');
    return token;
  };

  const isTycoon = String(user?.planType || '').toUpperCase() === 'TYCOON';

  const fetchStaff = async (token: string) => {
    try {
      const res = await axios.get(`${API_URL}/staff`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStaff(res.data);
    } catch (err) {
      console.error('Failed to load staff', err);
    }
  };

  const hydrateFromDashboard = (userData: any) => {
    setUser({
      ...userData,
      planType: userData?.planType || 'OGA_BOSS',
    });

    const bName = userData?.businessName || userData?.shopName || 'My Shop';
    setBusinessName(bName);
    setBankDetails(userData?.bankDetails || {});
    setFullSettings(userData?.settings || {});

    setStaffAlertsEnabled(userData?.settings?.staffTransactionReport ?? false);

    setStaffPermissions({
      canViewDashboard: userData?.settings?.staffPermissions?.canViewDashboard ?? false,
      canManageInventory: userData?.settings?.staffPermissions?.canManageInventory ?? true,
      canViewSalesHistory: userData?.settings?.staffPermissions?.canViewSalesHistory ?? false,
      canViewReports: userData?.settings?.staffPermissions?.canViewReports ?? false,
      canManageCustomers: userData?.settings?.staffPermissions?.canManageCustomers ?? true,
      canViewSettings: userData?.settings?.staffPermissions?.canViewSettings ?? false,
    });
  };

  useEffect(() => {
    const token = getTokenOrRedirect();
    if (!token) return;

    const fetchData = async () => {
      try {
        const res = await axios.get(`${API_URL}/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const userData = res.data?.user || {};
        hydrateFromDashboard(userData);

        if (String(userData?.planType || '').toUpperCase() === 'TYCOON') {
          await fetchStaff(token);
        }
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const handleSave = async () => {
    const token = getTokenOrRedirect();
    if (!token) return;

    setSaving(true);

    try {
      await axios.put(
        `${API_URL}/settings`,
        {
          businessName,
          shopName: businessName, // backward compatibility
          settings: {
            ...fullSettings,
            staffTransactionReport: staffAlertsEnabled,
            staffPermissions,
          },
          bankDetails: bankDetails
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Re-fetch dashboard so UI ALWAYS reflects saved data
      const res = await axios.get(`${API_URL}/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const userData = res.data?.user || {};
      hydrateFromDashboard(userData);

      Swal.fire({
        title: 'Saved!',
        text: 'Staff permissions and settings updated.',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false,
        confirmButtonColor: '#16a34a',
      });
    } catch (err: any) {
      console.error('Save failed:', err?.response?.data || err);
      Swal.fire(
        'Error',
        err?.response?.data?.error || err?.response?.data?.message || 'Failed to save settings',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAddStaff = async () => {
    if (!newStaffPhone) return;

    const token = getTokenOrRedirect();
    if (!token) return;

    setAddingStaff(true);

    try {
      // Format Number: Remove leading zero from local number, combine with code
      const cleanLocalNumber = newStaffPhone.replace(/^0+/, '');
      const cleanCode = staffCountryCode.replace('+', '');
      const formattedNumber = `${cleanCode}${cleanLocalNumber}`;

      await axios.post(
        `${API_URL}/staff`,
        { phoneNumber: formattedNumber, name: newStaffName },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      Swal.fire({
        title: 'Invitation Sent!',
        text: `${newStaffName || formattedNumber} has been added as staff.`,
        icon: 'success',
        confirmButtonColor: '#9333ea',
      });

      setNewStaffPhone('');
      setNewStaffName('');
      setIsStaffModalOpen(false);
      fetchStaff(token); // Refresh list
    } catch (err: any) {
      Swal.fire('Error', err?.response?.data?.error || 'Failed to add staff', 'error');
    } finally {
      setAddingStaff(false);
    }
  };

  const handleUpdateStaff = async (staffId: string, currentName: string) => {
    const { value: newName } = await Swal.fire({
      title: 'Update Staff Name',
      input: 'text',
      inputValue: currentName,
      showCancelButton: true,
      inputValidator: (value) => {
        if (!value) return 'Name cannot be empty!';
        return null;
      }
    });

    if (newName && newName !== currentName) {
        const token = getTokenOrRedirect();
        if (!token) return;

        try {
            await axios.put(`${API_URL}/staff/${staffId}`, 
                { name: newName }, 
                { headers: { Authorization: `Bearer ${token}` } }
            );
            
            setStaff(prev => prev.map(s => s.id === staffId ? { ...s, name: newName } : s));
            Swal.fire('Updated!', 'Staff name has been updated.', 'success');
        } catch (err: any) {
             Swal.fire('Error', err?.response?.data?.error || 'Failed to update staff', 'error');
        }
    }
  };

  const handlePromoteStaff = async (staffId: string) => {
      const result = await Swal.fire({
          title: 'Promote to HQ Manager?',
          text: 'This staff member will have access to your HQ Dashboard (Branches & Transfers).',
          icon: 'question',
          showCancelButton: true,
          confirmButtonColor: '#9333ea',
          confirmButtonText: 'Yes, Promote',
      });

      if (!result.isConfirmed) return;

      const token = getTokenOrRedirect();
      if (!token) return;

      try {
          await axios.post(`${API_URL}/hq/staff/promote`, 
              { staffId }, 
              { headers: { Authorization: `Bearer ${token}` } }
          );

          setStaff(prev => prev.map(s => s.id === staffId ? { ...s, isHqManager: true } : s));
          Swal.fire('Promoted!', 'Staff member is now an HQ Manager.', 'success');
      } catch (err: any) {
           Swal.fire('Error', err?.response?.data?.error || 'Failed to promote staff', 'error');
      }
  };

  const handleRemoveStaff = async (staffId: string) => {
    const result = await Swal.fire({
      title: 'Remove Staff?',
      text: 'They will no longer be able to record sales for you.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#e5e7eb',
      cancelButtonText: '<span style="color:#374151">Cancel</span>',
      confirmButtonText: 'Yes, remove',
    });

    if (!result.isConfirmed) return;

    const token = getTokenOrRedirect();
    if (!token) return;

    try {
      await axios.delete(`${API_URL}/staff/${staffId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setStaff((prev) => prev.filter((s) => s.id !== staffId));
      Swal.fire({
        title: 'Removed!',
        text: 'Staff member removed successfully.',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (err: any) {
      Swal.fire('Error', err?.response?.data?.error || 'Failed to remove', 'error');
    }
  };

  if (loading) {
    return <Preloader />;
  }


  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-gray-900 relative overflow-x-hidden">
      {/* Ambient blob */}
      <div className="fixed top-0 right-0 w-[600px] h-[600px] bg-purple-100/40 rounded-full blur-[120px] pointer-events-none z-0 translate-x-1/3 -translate-y-1/3" />

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out md:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar />
      </div>

      <main className="relative z-10 flex-1 md:ml-64 p-4 md:p-8 min-h-screen">
        <header className="flex items-center gap-4 mb-8">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="md:hidden p-2 -ml-2 text-slate-600 bg-white rounded-xl border border-slate-200 shadow-sm"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Staff Management</h1>
            <p className="text-gray-500 text-sm mt-1">Manage your team and control what they can see or do.</p>
          </div>
        </header>

        <div className="max-w-4xl space-y-8">
            
          {/* Staff Alerts Toggle */}
          {isTycoon && (
              <div
                className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
                  staffAlertsEnabled ? 'bg-purple-50/30 border-purple-100' : 'bg-slate-50 border-slate-100'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-1 p-1 rounded-full ${staffAlertsEnabled ? 'bg-purple-100 text-purple-600' : 'bg-gray-200 text-gray-400'}`}>
                    <Bell size={16} /> 
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">Staff Transaction Alerts</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Get instant WhatsApp notifications when your staff records a sale.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setStaffAlertsEnabled((v) => !v)}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none ${
                    staffAlertsEnabled ? 'bg-purple-600' : 'bg-gray-300'
                  } cursor-pointer`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                      staffAlertsEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
          )}

          {/* Staff Permissions (Tycoon Only) */}
          {isTycoon && (
            <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-indigo-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                  <Shield size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Staff Permissions</h2>
                  <p className="text-xs text-gray-400">Control what your staff can see and do.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: 'canViewDashboard', label: 'View Dashboard Stats', desc: 'See total revenue and daily stats.' },
                  { key: 'canManageInventory', label: 'Manage Inventory', desc: 'Add products and update stock/prices.' },
                  { key: 'canViewSalesHistory', label: 'View Sales History', desc: 'See transaction history of other staff.' },
                  { key: 'canViewReports', label: 'Access Reports', desc: 'View detailed sales and profit reports.' },
                  { key: 'canManageCustomers', label: 'Manage Debtors', desc: 'View and edit customer debt records.' },
                  { key: 'canViewSettings', label: 'Access Settings', desc: 'View store configuration (Read-only).' },
                ].map((perm) => (
                  <div key={perm.key} className="flex items-center justify-between p-4 rounded-xl border border-slate-100 hover:border-indigo-100 transition-colors">
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm">{perm.label}</h3>
                      <p className="text-[10px] text-gray-500 mt-0.5">{perm.desc}</p>
                    </div>
                    <button
                      onClick={() =>
                        setStaffPermissions((prev: any) => ({ ...prev, [perm.key]: !prev[perm.key] }))
                      }
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                        (staffPermissions as any)[perm.key] ? 'bg-indigo-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                          (staffPermissions as any)[perm.key] ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>

               {/* Save Button for settings */}
              <div className="flex justify-end pt-6">
                 <button
                   onClick={handleSave}
                   disabled={saving}
                   className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3.5 rounded-xl font-semibold text-sm shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                 >
                   {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                   <span>Save Staff Settings</span>
                 </button>
              </div>
            </div>
          )}

          {/* Staff List */}
          {isTycoon ? (
            <div className="relative overflow-hidden bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-purple-100 mt-8">
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-bl-full opacity-50 pointer-events-none"></div>

              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-xl text-purple-700">
                    <Users size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      Team Members
                    </h2>
                    <p className="text-xs text-gray-500">Allow others to record sales for your shop.</p>
                  </div>
                </div>

                <button
                  onClick={() => setIsStaffModalOpen(true)}
                  className="mt-4 sm:mt-0 bg-purple-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-purple-700 shadow-lg shadow-purple-600/20 transition-all active:scale-95 flex items-center gap-2"
                >
                  <Plus size={16} /> Add Staff
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {staff.length === 0 ? (
                  <div className="col-span-full text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <div className="bg-white w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                      <Smartphone className="w-6 h-6 text-slate-300" />
                    </div>
                    <p className="text-sm font-medium text-slate-500">No staff members added yet.</p>
                    <p className="text-xs text-slate-400 mt-1">Add a number to send an invite.</p>
                  </div>
                ) : (
                  staff.map((member) => (
                    <div
                      key={member.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-4 rounded-xl border border-purple-50 shadow-sm hover:border-purple-200 transition-all group gap-4"
                    >
                      <div className="flex items-center gap-3">
                         <div className="relative">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-100 to-indigo-100 text-purple-600 flex items-center justify-center font-bold text-sm">
                              {member.name ? member.name[0].toUpperCase() : 'S'}
                            </div>
                            {member.isHqManager && (
                                <div className="absolute -bottom-1 -right-1 bg-yellow-400 text-yellow-900 rounded-full p-0.5 border-2 border-white" title="HQ Manager">
                                    <Crown size={10} />
                                </div>
                            )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-gray-900">{member.name || 'Staff Member'}</p>
                              {member.isHqManager && (
                                  <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded border border-yellow-200 font-bold">HQ</span>
                              )}
                          </div>
                          <p className="text-xs text-gray-500 font-medium">{member.phoneNumber}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                         <button
                          onClick={() => handleUpdateStaff(member.id, member.name || '')}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit Name"
                        >
                           <Pencil size={16} /> 
                        </button>

                         {!member.isHqManager && (
                             <button
                                 onClick={() => handlePromoteStaff(member.id)}
                                 className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                 title="Promote to HQ Manager"
                             >
                                 <Crown size={16} />
                             </button>
                         )}

                        <button
                          onClick={() => handleRemoveStaff(member.id)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remove Staff"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
             <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-2xl shadow-xl mt-8 text-white">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>

              <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                  <div className="inline-flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full text-xs font-bold mb-3 border border-white/10">
                    <Crown size={12} className="text-yellow-400" />
                    <span className="text-yellow-100">PREMIUM FEATURE</span>
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Upgrade to Tycoon</h2>
                  <p className="text-slate-300 text-sm max-w-md leading-relaxed">
                    Unlock staff accounts, automated PDF reports, and export your data to Excel.
                    Take full control of your business today.
                  </p>
                </div>

                <div className="text-left md:text-right bg-white/5 p-4 rounded-xl border border-white/10 backdrop-blur-sm">
                  <span className="block text-3xl font-extrabold text-white">₦5,000</span>
                  <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">Per Month</span>
                  <button
                    onClick={() => router.push('/payment?plan=TYCOON')}
                    className="mt-4 w-full bg-white text-slate-900 px-6 py-2.5 rounded-lg text-sm font-bold hover:bg-slate-100 transition-colors shadow-lg"
                  >
                    Get Started
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

       {/* ADD STAFF MODAL */}
       {isStaffModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200 scale-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-900">Add New Staff</h3>
              <button
                onClick={() => setIsStaffModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 p-1.5 rounded-full transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-purple-50 p-4 rounded-xl mb-6 flex gap-3 items-start">
              <div className="p-1.5 bg-white rounded-full shadow-sm text-purple-600 mt-0.5">
                <Smartphone size={16} />
              </div>
              <p className="text-xs text-purple-800 leading-relaxed">
                Enter their WhatsApp number. They will receive an automated invitation to join your shop immediately.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
                  Staff Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  className="w-full border border-gray-200 bg-slate-50 focus:bg-white rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all font-medium text-gray-900 placeholder:text-gray-400"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                />
              </div>

              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
                Phone Number
              </label>

              <div className="flex gap-2">
                <select
                  className="w-28 border border-gray-200 bg-slate-50 focus:bg-white rounded-xl px-3 py-3.5 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all font-medium text-gray-900 text-sm cursor-pointer"
                  value={staffCountryCode}
                  onChange={(e) => setStaffCountryCode(e.target.value)}
                >
                  <option value="+234">🇳🇬 +234</option>
                  <option value="+233">🇬🇭 +233</option>
                  <option value="+254">🇰🇪 +254</option>
                  <option value="+27">🇿🇦 +27</option>
                  <option value="+20">🇪🇬 +20</option>
                  <option value="+256">🇺🇬 +256</option>
                  <option value="+250">🇷🇼 +250</option>
                  <option value="+1">🇺🇸 +1</option>
                  <option value="+44">🇬🇧 +44</option>
                </select>

                <input
                  id="staffPhone"
                  type="tel"
                  placeholder="8012345678"
                  maxLength={15}
                  className="flex-1 border border-gray-200 bg-slate-50 focus:bg-white rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all font-medium text-gray-900 placeholder:text-gray-400"
                  value={newStaffPhone}
                  onChange={(e) => setNewStaffPhone(e.target.value.replace(/\D/g, ''))}
                />
              </div>

              <p className="text-[10px] text-gray-400">Enter digits only (e.g., 8012345678 for Nigeria)</p>
            </div>

            <button
              onClick={handleAddStaff}
              disabled={addingStaff || !newStaffPhone}
              className="w-full mt-4 bg-purple-600 text-white py-3.5 rounded-xl font-bold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 shadow-lg shadow-purple-600/20 transition-all active:scale-[0.98]"
            >
              {addingStaff ? <Loader2 className="animate-spin w-5 h-5" /> : 'Send Invitation'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
