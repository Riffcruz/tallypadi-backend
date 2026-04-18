'use client';
import React, { useMemo, useState } from 'react';
import { Search, Filter, Eye, Lock, Unlock, UserPlus } from 'lucide-react';
import UserDeepDiveModal from './UserDeepDiveModal';
import CreateInvestorModal from './CreateInvestorModal';

export interface User {
  id: string;
  businessName?: string;
  phone?: string;
  email?: string;
  status: string;
  plan: string;
  joinedAt?: string;
}

interface UsersTabProps {
  users: User[];
  onAction: (userId: string, action: string, payload?: unknown) => Promise<unknown>;
  adminToken: string;
  role?: 'admin' | 'agent';
}

export default function UsersTab({
  users,
  onAction,
  adminToken,
  role = 'admin',
}: UsersTabProps) {
  const [filterActive, setFilterActive] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showCreateInvestor, setShowCreateInvestor] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return (users || []).filter((u: User) => {
      const name = (u.businessName || '').toLowerCase();
      const phone = String(u.phone || '');
      const matchesSearch = !q || name.includes(q) || phone.includes(q);

      const status = u.status;
      const matchesStatus = filterActive ? status === 'active' || status === 'trial' : true;

      return matchesSearch && matchesStatus;
    });
  }, [users, search, filterActive]);

  const StatusPill = ({ status }: { status: string }) => {
    const cls =
      status === 'active'
        ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
        : status === 'suspended'
        ? 'text-red-300 bg-red-500/10 border-red-500/20'
        : 'text-amber-300 bg-amber-500/10 border-amber-500/20';

    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-extrabold border ${cls}`}>
        {status}
      </span>
    );
  };

  const PlanPill = ({ plan }: { plan: string }) => {
    const cls =
      plan === 'TYCOON'
        ? 'bg-purple-500/10 text-purple-200 border-purple-500/20'
        : 'bg-blue-500/10 text-blue-200 border-blue-500/20';

    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-extrabold border ${cls}`}>
        {plan || '—'}
      </span>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-300">
      {/* Sticky controls (mobile-first) */}
      <div className="sticky top-0 z-10 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 bg-slate-950/70 backdrop-blur border-b border-white/10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg sm:text-2xl font-extrabold text-white">User Database</h2>

            <div className="flex items-center gap-2">
                {role !== 'agent' && (
                  <button
                      onClick={() => setShowCreateInvestor(true)}
                      className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold transition-all border bg-emerald-600 text-white border-emerald-500/30 hover:bg-emerald-500"
                      title="Create Investor"
                  >
                      <UserPlus size={14} /> New Investor
                  </button>
                )}
                <button
                onClick={() => setFilterActive(!filterActive)}
                className={`shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold transition-all border ${
                    filterActive
                    ? 'bg-slate-700 text-white border-slate-600'
                    : 'bg-slate-800 text-slate-200 border-slate-700'
                }`}
                title={filterActive ? 'Showing active + trial users' : 'Showing all users'}
                >
                <Filter size={14} /> {filterActive ? 'Show All Users' : 'Show Active Only'}
                </button>
            </div>
          </div>

          <div className="relative w-full sm:w-[320px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search business name or phone…"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-2 text-xs text-slate-400">
          Showing <span className="text-slate-200 font-bold">{filtered.length}</span> users
        </div>
      </div>

      {/* MOBILE: cards */}
      <div className="sm:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center text-slate-400">
            No users match your search.
          </div>
        ) : (
          filtered.map((u: User) => (
            <div key={u.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white font-extrabold truncate">{u.businessName || '—'}</p>
                  <p className="text-xs text-slate-400 font-mono break-words">{u.phone || '—'}</p>
                  {u.email && <p className="text-xs text-slate-500 font-mono break-words">{u.email}</p>}
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <PlanPill plan={u.plan} />
                  <StatusPill status={u.status} />
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                <span>Joined</span>
                <span className="text-slate-200 font-semibold">
                  {u.joinedAt ? new Date(u.joinedAt).toLocaleDateString() : '—'}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSelectedUser(u)}
                  className="w-full px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 transition"
                >
                  <Eye size={16} /> View
                </button>

                {u.status === 'suspended' ? (
                  <button
                    onClick={() => onAction(u.id, 'unsuspend')}
                    className="w-full px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 transition"
                  >
                    <Unlock size={16} /> Unsuspend
                  </button>
                ) : (
                  <button
                    onClick={() => onAction(u.id, 'suspend')}
                    className="w-full px-3 py-2.5 bg-red-500/15 hover:bg-red-500/20 text-red-200 border border-red-500/25 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 transition"
                  >
                    <Lock size={16} /> Suspend
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* DESKTOP: table */}
      <div className="hidden sm:block bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm text-slate-300">
            <thead className="bg-slate-900/50 text-slate-400 font-medium uppercase text-xs">
              <tr>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Plan</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Joined</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-700">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-400">
                    No users match your search.
                  </td>
                </tr>
              ) : (
                filtered.map((u: User) => (
                  <tr key={u.id} className="hover:bg-gray-700/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-extrabold text-white">{u.businessName}</div>
                      <div className="text-xs text-slate-500 font-mono">{u.phone}</div>
                      {u.email && <div className="text-xs text-slate-500 font-mono">{u.email}</div>}
                    </td>

                    <td className="px-6 py-4">
                      <PlanPill plan={u.plan} />
                    </td>

                    <td className="px-6 py-4">
                      <StatusPill status={u.status} />
                    </td>

                    <td className="px-6 py-4">
                      {u.joinedAt ? new Date(u.joinedAt).toLocaleDateString() : '—'}
                    </td>

                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setSelectedUser(u)}
                          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-extrabold flex items-center gap-1 transition-colors"
                        >
                          <Eye size={14} /> View
                        </button>

                        {u.status === 'suspended' ? (
                          <button
                            onClick={() => onAction(u.id, 'unsuspend')}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors flex items-center justify-center"
                            title="Unsuspend"
                          >
                            <Unlock size={14} />
                          </button>
                        ) : (
                          <button
                            onClick={() => onAction(u.id, 'suspend')}
                            className="bg-red-500/15 hover:bg-red-500/20 text-red-200 border border-red-500/25 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors flex items-center justify-center"
                            title="Suspend"
                          >
                            <Lock size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedUser && (
  <UserDeepDiveModal
  user={selectedUser}
  onClose={() => setSelectedUser(null)}
  adminToken={adminToken}
  onAction={onAction}
  role={role}
/>

)}
{showCreateInvestor && (
    <CreateInvestorModal
      onClose={() => setShowCreateInvestor(false)}
      adminToken={adminToken}
    />
  )}
    </div>
  );
}
