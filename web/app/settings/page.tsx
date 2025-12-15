'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
// Ensure this path is correct based on your folder structure
import Sidebar from '../../components/Sidebar';
import { useRouter } from 'next/navigation';
import { 
    Save, User, Clock, Languages, FileText, Crown, Loader2, 
    Users, Plus, Trash2, X, Menu, Shield, CheckCircle2, AlertCircle, Smartphone
} from 'lucide-react';
import Swal from 'sweetalert2';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

interface StaffMember {
    id: string;
    phoneNumber: string;
    name?: string;
    dateAdded: string;
}

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const router = useRouter();

  // Form State
  const [businessName, setBusinessName] = useState('');
  const [closingTime, setClosingTime] = useState('');
  const [language, setLanguage] = useState('');
  const [pdfEnabled, setPdfEnabled] = useState(false);

  // Staff State
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  
  // New Staff Input State
  const [staffCountryCode, setStaffCountryCode] = useState('+234');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [addingStaff, setAddingStaff] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('tallyToken');
    if (!token) {
        router.push('/login');
        return;
    }

    // 1. Fetch User Settings
    axios.get(`${API_URL}/dashboard`, { headers: { Authorization: `Bearer ${token}` }})
      .then(res => {
          const userData = res.data.user || {};
          
          setUser({
              ...userData,
              planType: userData.planType || 'OGA_BOSS', 
          });
          
          setBusinessName(userData.shopName || "My Shop");
          setClosingTime(userData.settings?.closingTime || "20:00");
          setLanguage(userData.settings?.language || "English");
          setPdfEnabled(userData.settings?.pdfReportsEnabled || false);
          
          setLoading(false);

          // 2. Fetch Staff if Tycoon
          if (userData.planType === 'TYCOON') {
              fetchStaff(token);
          }
      })
      .catch(err => {
          console.error(err);
          setLoading(false);
      });
  }, [router]);

  const fetchStaff = async (token: string) => {
      try {
          const res = await axios.get(`${API_URL}/staff`, { 
              headers: { Authorization: `Bearer ${token}` } 
          });
          setStaff(res.data);
      } catch (err) {
          console.error("Failed to load staff", err);
      }
  };

  const handleSave = async () => {
    setSaving(true);
    const token = localStorage.getItem('tallyToken');
    
    try {
        await axios.put(`${API_URL}/settings`, {
            businessName,
            settings: {
                closingTime,
                language,
                pdfReportsEnabled: pdfEnabled
            }
        }, { headers: { Authorization: `Bearer ${token}` }});

        Swal.fire({
            title: 'Saved!',
            text: 'Your settings have been updated.',
            icon: 'success',
            timer: 1500,
            showConfirmButton: false,
            confirmButtonColor: '#16a34a'
        });
    } catch (err) {
        console.error("Save failed", err);
        Swal.fire('Error', 'Failed to save settings', 'error');
    } finally {
        setSaving(false);
    }
  };

  const handleAddStaff = async () => {
      if (!newStaffPhone) return;
      setAddingStaff(true);
      const token = localStorage.getItem('tallyToken');

      try {
          // Format Number: Remove leading zero from local number, combine with code
          const cleanLocalNumber = newStaffPhone.replace(/^0+/, '');
          const cleanCode = staffCountryCode.replace('+', '');
          const formattedNumber = `${cleanCode}${cleanLocalNumber}`;

          await axios.post(`${API_URL}/staff`, { phoneNumber: formattedNumber }, {
              headers: { Authorization: `Bearer ${token}` }
          });
          
          Swal.fire({
              title: 'Invitation Sent!',
              text: `${formattedNumber} has been added as staff.`,
              icon: 'success',
              confirmButtonColor: '#9333ea'
          });
          
          setNewStaffPhone('');
          setIsStaffModalOpen(false);
          fetchStaff(token!); // Refresh list
      } catch (err: any) {
          Swal.fire('Error', err.response?.data?.error || 'Failed to add staff', 'error');
      } finally {
          setAddingStaff(false);
      }
  };

  const handleRemoveStaff = async (staffId: string) => {
      const result = await Swal.fire({
          title: 'Remove Staff?',
          text: "They will no longer be able to record sales for you.",
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#ef4444',
          cancelButtonColor: '#e5e7eb',
          cancelButtonText: '<span style="color:#374151">Cancel</span>',
          confirmButtonText: 'Yes, remove'
      });

      if (result.isConfirmed) {
          const token = localStorage.getItem('tallyToken');
          try {
              await axios.delete(`${API_URL}/staff/${staffId}`, {
                  headers: { Authorization: `Bearer ${token}` }
              });
              setStaff(prev => prev.filter(s => s.id !== staffId));
              Swal.fire('Removed!', 'Staff access has been revoked.', 'success');
          } catch (err) {
              Swal.fire('Error', 'Failed to remove staff', 'error');
          }
      }
  };

  if (loading) return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-green-600" />
            <p className="text-gray-500 font-medium animate-pulse">Loading Settings...</p>
          </div>
      </div>
  );

  const isTycoon = user?.planType === 'TYCOON';

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-gray-900 relative">
      
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
            className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar />
      </div>

      <main className="flex-1 md:ml-64 p-4 md:p-8 overflow-x-hidden min-h-screen w-full">
        {/* Header */}
        <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-3 w-full md:w-auto">
                <button 
                    onClick={() => setIsMobileMenuOpen(true)}
                    className="p-2 -ml-2 text-gray-600 hover:bg-white hover:shadow-sm rounded-lg md:hidden transition-all"
                >
                    <Menu className="w-6 h-6" />
                </button>

                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Settings</h1>
                    <p className="text-gray-500 text-sm mt-1">Manage store preferences</p>
                </div>
            </div>
            
            {/* Plan Badge */}
            <div className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 border shadow-sm ${isTycoon ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-green-50 text-green-700 border-green-100'}`}>
                {isTycoon ? <Crown size={14} className="fill-purple-200" /> : <Shield size={14} />}
                {isTycoon ? 'TYCOON PLAN' : 'OGA BOSS PLAN'}
            </div>
        </header>

        <div className="max-w-4xl space-y-8 mx-auto md:mx-0">
            
            {/* General Settings Card */}
            <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-slate-50 rounded-xl text-slate-600">
                        <User size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">General Information</h2>
                        <p className="text-xs text-gray-400">Basic details about your business</p>
                    </div>
                </div>

                <div className="space-y-5">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Store Name</label>
                        <input 
                            type="text" 
                            value={businessName}
                            onChange={(e) => setBusinessName(e.target.value)}
                            className="w-full border border-gray-200 bg-slate-50/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-sm font-medium" 
                        />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider flex items-center gap-1">
                                <Clock size={14} /> Closing Time
                            </label>
                            <input 
                                type="time" 
                                value={closingTime}
                                onChange={(e) => setClosingTime(e.target.value)}
                                className="w-full border border-gray-200 bg-slate-50/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-sm font-medium" 
                            />
                            <p className="text-[10px] text-gray-400 mt-1.5">Daily summary is generated at this time.</p>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider flex items-center gap-1">
                                <Languages size={14} /> Bot Language
                            </label>
                            <div className="relative">
                                <select 
                                    value={language}
                                    onChange={(e) => setLanguage(e.target.value)}
                                    className="w-full border border-gray-200 bg-slate-50/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-sm font-medium appearance-none cursor-pointer"
                                >
                                    <option value="English">English</option>
                                    <option value="Pidgin">Pidgin</option>
                                    <option value="Hausa">Hausa</option>
                                    <option value="Yoruba">Yoruba</option>
                                    <option value="Igbo">Igbo</option>
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Notifications & Reports */}
            <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                        <FileText size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Reports & Automation</h2>
                        <p className="text-xs text-gray-400">Configure how you receive updates</p>
                    </div>
                </div>

                <div className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${pdfEnabled ? 'bg-green-50/30 border-green-100' : 'bg-slate-50 border-slate-100'}`}>
                    <div className="flex items-start gap-3">
                        <div className={`mt-1 p-1 rounded-full ${pdfEnabled ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-400'}`}>
                            {pdfEnabled ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900 text-sm">Automatic PDF Reports</h3>
                            <p className="text-xs text-gray-500 mt-0.5">Receive a formatted PDF summary with your daily closing message.</p>
                            {!isTycoon && (
                                <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                                    <Crown size={10} /> TYCOON ONLY
                                </span>
                            )}
                        </div>
                    </div>
                    <button 
                        onClick={() => isTycoon && setPdfEnabled(!pdfEnabled)}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none ${pdfEnabled ? 'bg-green-600' : 'bg-gray-300'} ${!isTycoon ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${pdfEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-2">
                <button 
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-green-600 hover:bg-green-700 text-white px-8 py-3.5 rounded-xl font-semibold text-sm shadow-lg shadow-green-600/20 flex items-center gap-2 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    <span>Save Changes</span>
                </button>
            </div>

            {/* PLAN FEATURES: STAFF MANAGEMENT */}
            {isTycoon ? (
                <div className="relative overflow-hidden bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-purple-100 mt-8">
                    {/* Background decoration */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-bl-full opacity-50 pointer-events-none"></div>

                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 relative z-10">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 rounded-xl text-purple-700">
                                <Users size={20} />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    Staff Management <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">PRO</span>
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
                                <div key={member.id} className="flex justify-between items-center bg-white p-4 rounded-xl border border-purple-50 shadow-sm hover:border-purple-200 transition-all group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-100 to-indigo-100 text-purple-600 flex items-center justify-center font-bold text-sm">
                                            {member.name ? member.name[0].toUpperCase() : 'S'}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">{member.name || 'Staff Member'}</p>
                                            <p className="text-xs text-gray-500 font-medium">{member.phoneNumber}</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => handleRemoveStaff(member.id)}
                                        className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                        title="Remove Staff"
                                    >
                                        <Trash2 size={16} />
                                    </button>
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
                                Unlock staff accounts, automated PDF reports, and export your data to Excel. Take full control of your business today.
                            </p>
                        </div>
                        <div className="text-left md:text-right bg-white/5 p-4 rounded-xl border border-white/10 backdrop-blur-sm">
                            <span className="block text-3xl font-extrabold text-white">₦5,000</span>
                            <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">Per Month</span>
                            <button className="mt-4 w-full bg-white text-slate-900 px-6 py-2.5 rounded-lg text-sm font-bold hover:bg-slate-100 transition-colors shadow-lg">
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
                      <button onClick={() => setIsStaffModalOpen(false)} className="text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 p-1.5 rounded-full transition-colors">
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
                      <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Phone Number</label>
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