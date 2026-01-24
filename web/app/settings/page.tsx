'use client';

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Sidebar from '../../components/Sidebar';
import { useRouter } from 'next/navigation';
import {
  Save,
  User,
  Clock,
  Languages,
  FileText,
  Crown,
  Loader2,
  Users,
  Plus,
  Trash2,
  X,
  Menu,
  Shield,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Lock,
  Camera,
  Copy,
  ExternalLink,
  Bell,
  Pencil,
} from 'lucide-react';
import Swal from 'sweetalert2';
import { getCookie } from '../../utils/cookies';
import { uploadToR2 } from '../../src/utils/uploadToR2';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

interface StaffMember {
  id: string;
  phoneNumber: string;
  name?: string;
  dateAdded: string;
  isHqManager?: boolean;
}

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null);
// ... existing state ...
  // Staff State
  const [staff, setStaff] = useState<StaffMember[]>([]);
// ...

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
// ... existing logic ...
  };
// ...
// Inside the render loop for staff:
// ...
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
// ...
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
      {/* CHANGE PHONE MODAL */}
      {changePhoneModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200 scale-100">
             <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-900">Change Phone Number</h3>
              <button
                onClick={() => {
                   setChangePhoneModalOpen(false);
                   setChangePhoneStep(1);
                   setNewOwnerPhone('');
                   setChangePhoneOtp('');
                }}
                className="text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 p-1.5 rounded-full transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {changePhoneStep === 1 ? (
               <div className="space-y-4">
                  <p className="text-sm text-gray-500">
                     Enter your new phone number below. For security, we will send the OTP to your <b>current</b> WhatsApp number.
                  </p>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
                      New Phone Number
                    </label>
                    <div className="flex gap-2">
                      <select
                        className="w-28 border border-gray-200 bg-slate-50 focus:bg-white rounded-xl px-3 py-3.5 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-all font-medium text-gray-900 text-sm cursor-pointer"
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
                        type="tel"
                        placeholder="8012345678"
                        className="flex-1 border border-gray-200 bg-slate-50 focus:bg-white rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-all font-medium text-gray-900 placeholder:text-gray-400"
                        value={newOwnerPhone}
                        onChange={(e) => setNewOwnerPhone(e.target.value.replace(/\D/g, ''))}
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleRequestChangePhoneOTP}
                    disabled={changingPhone || !newOwnerPhone}
                    className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-bold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                  >
                    {changingPhone ? <Loader2 className="animate-spin w-5 h-5" /> : 'Send Verification Code'}
                  </button>
               </div>
            ) : (
               <div className="space-y-4">
                  <div className="bg-green-50 p-4 rounded-xl flex gap-3 items-start">
                    <div className="p-1.5 bg-white rounded-full shadow-sm text-green-600 mt-0.5">
                      <CheckCircle2 size={16} />
                    </div>
                    <p className="text-xs text-green-800 leading-relaxed">
                      OTP Sent to your <b>current</b> WhatsApp number. Please check it.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
                      Enter OTP
                    </label>
                    <input
                      type="text"
                      placeholder="123456"
                      className="w-full border border-gray-200 bg-slate-50 focus:bg-white rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-all font-medium text-gray-900 placeholder:text-gray-400 text-center tracking-widest text-lg"
                      value={changePhoneOtp}
                      onChange={(e) => setChangePhoneOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    />
                  </div>
                  <button
                    onClick={handleVerifyChangePhone}
                    disabled={changingPhone || changePhoneOtp.length < 6}
                    className="w-full bg-green-600 text-white py-3.5 rounded-xl font-bold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                  >
                    {changingPhone ? <Loader2 className="animate-spin w-5 h-5" /> : 'Verify & Update Number'}
                  </button>
               </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
