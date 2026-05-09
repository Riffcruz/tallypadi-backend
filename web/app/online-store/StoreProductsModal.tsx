import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Loader2, Save, Eye, EyeOff, Search, TrendingUp, Clock3 } from 'lucide-react';
import Swal from 'sweetalert2';

interface StoreProductsModalProps {
  token: string;
  onClose: () => void;
}

interface StoreProduct {
  id: string;
  name: string;
  stock?: number;
  quantity?: number;
  price?: number;
  image?: string | null;
  isPublished?: boolean;
  description?: string;
  colors?: string[];
  sizes?: string[];
  boosts?: { platform: string; expiresAt: string; planId: string }[];
}

interface AdsPlan {
  id: string;
  durationDays: number;
  price: number;
  label: string;
}

interface StoreCampaign {
  id: string;
  status: string;
  product: string;
}

export default function StoreProductsModal({ token, onClose }: StoreProductsModalProps) {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [editForm, setEditForm] = useState({
    isPublished: true,
    description: '',
    colors: '',
    sizes: ''
  });
  const [saving, setSaving] = useState(false);

  // Boosting States
  const [adsPlans, setAdsPlans] = useState<AdsPlan[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [campaigns, setCampaigns] = useState<StoreCampaign[]>([]);
  const [boostingProductId, setBoostingProductId] = useState<string | null>(null);
  const [boostForm, setBoostForm] = useState({ planId: '', platform: 'ALL', budget: '' });
  const [boosting, setBoosting] = useState(false);
  const selectedBoostPlan = adsPlans.find(plan => plan.id === boostForm.planId);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [invRes, plansRes, dashRes, campaignsRes] = await Promise.all([
        axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api'}/inventory`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api'}/ads/plans`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api'}/dashboard`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api'}/ads/campaigns?limit=100`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setProducts(Array.isArray(invRes.data) ? invRes.data : invRes.data?.data || []);
      setAdsPlans(plansRes.data?.plans || []);
      setWalletBalance(dashRes.data?.user?.walletBalance || 0);
      setCampaigns(campaignsRes.data?.campaigns || []);
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'Failed to fetch data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (product: StoreProduct) => {
    if (editingId === product.id) {
      setEditingId(null);
      return;
    }
    setEditingId(product.id);
    setEditForm({
      isPublished: product.isPublished !== false,
      description: product.description || '',
      colors: Array.isArray(product.colors) ? product.colors.join(', ') : '',
      sizes: Array.isArray(product.sizes) ? product.sizes.join(', ') : ''
    });
  };

  const handleSave = async (id: string) => {
    setSaving(true);
    try {
      const payload = {
        isPublished: editForm.isPublished,
        description: editForm.description,
        colors: editForm.colors.split(',').map(s => s.trim()).filter(Boolean),
        sizes: editForm.sizes.split(',').map(s => s.trim()).filter(Boolean),
      };

      await axios.put(`${process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api'}/inventory/${id}`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setProducts(prev => prev.map(p => p.id === id ? { ...p, ...payload } : p));
      setEditingId(null);
      Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Saved!', showConfirmButton: false, timer: 1500 });
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'Failed to save product details', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleBoostSubmit = async (productId: string) => {
    if (!boostForm.planId) return Swal.fire('Error', 'Please select a duration', 'error');
    
    const selectedPlan = adsPlans.find(p => p.id === boostForm.planId);
    if (!selectedPlan) return;

    const budget = Number(boostForm.budget || selectedPlan.price);
    if (!Number.isFinite(budget) || budget <= 0) {
      return Swal.fire('Invalid Budget', 'Please enter a valid boost budget.', 'warning');
    }
    if (budget < selectedPlan.price) {
      return Swal.fire('Budget Too Low', `Budget must be at least ₦${selectedPlan.price.toLocaleString()} for this plan.`, 'warning');
    }
    
    if (walletBalance < budget) {
      return Swal.fire('Insufficient Balance', 'Please fund your Ads Wallet to boost this product.', 'warning');
    }

    setBoosting(true);
    try {
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api'}/ads/boost/${productId}`, {
        planId: boostForm.planId,
        platform: boostForm.platform,
        budget
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setWalletBalance(res.data.walletBalance);
      if (res.data?.campaign) {
        setCampaigns(prev => [res.data.campaign, ...prev.filter(c => c.id !== res.data.campaign.id)]);
      }
      setBoostingProductId(null);
      setBoostForm({ planId: '', platform: 'ALL', budget: '' });
      Swal.fire('Submitted', 'Boost request is pending admin review.', 'success');
    } catch (err: unknown) {
      console.error(err);
      const data = axios.isAxiosError(err) ? err.response?.data as { message?: string } | undefined : undefined;
      Swal.fire('Error', data?.message || 'Failed to boost product', 'error');
    } finally {
      setBoosting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl flex flex-col max-h-full overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Manage Store Products</h2>
            <p className="text-xs text-slate-500 mt-1">Select products to show on storefront and edit details</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-slate-50">
          {loading ? (
            <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
          ) : (
            <>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search products by name..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm font-medium"
                />
              </div>

              {products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
                <div className="text-center py-10 text-slate-500 font-medium">No products found.</div>
              ) : (
                products
                  .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(product => {
                    const pendingBoost = campaigns.some(c => c.status === 'PENDING' && String(c.product) === String(product.id));
                    return (
              <div key={product.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm transition-all">
                <div 
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-50"
                  onClick={() => handleEditClick(product)}
                >
                  <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center overflow-hidden shrink-0">
                    {product.image ? <img src={product.image} alt="" className="w-full h-full object-cover" /> : <div className="text-xs text-slate-400">No Img</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 truncate">{product.name}</h3>
                    <p className="text-xs text-slate-500">Stock: {product.stock ?? product.quantity ?? 0} • ₦{product.price}</p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                     <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${product.isPublished !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                       {product.isPublished !== false ? 'Published' : 'Hidden'}
                     </span>
                     {product.boosts && product.boosts.length > 0 && (
                       <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 flex items-center gap-1">
                         <TrendingUp size={10} /> Active Boost
                       </span>
                     )}
                     {pendingBoost && (
                       <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 flex items-center gap-1">
                         <Clock3 size={10} /> Pending Review
                       </span>
                     )}
                  </div>
                </div>

                {editingId === product.id && (
                  <div className="p-4 md:p-6 border-t border-slate-100 bg-slate-50/50 space-y-5 animate-in slide-in-from-top-2">
                    <div className="flex flex-wrap items-center gap-3">
                       <button
                         onClick={() => setEditForm(prev => ({ ...prev, isPublished: !prev.isPublished }))}
                         className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${editForm.isPublished ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                       >
                         {editForm.isPublished ? <Eye size={16} /> : <EyeOff size={16} />}
                         {editForm.isPublished ? 'Visible on Store' : 'Hidden from Store'}
                       </button>

                       <button
                         onClick={() => setBoostingProductId(boostingProductId === product.id ? null : product.id)}
                         className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${boostingProductId === product.id ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                       >
                         <TrendingUp size={16} />
                         Boost Product
                       </button>
                    </div>

                    {boostingProductId === product.id && (
                      <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl space-y-4 animate-in slide-in-from-top-2">
                        <div className="flex justify-between items-center">
                          <h4 className="font-bold text-blue-900 text-sm">Configure Ad Campaign</h4>
                          <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-1 rounded-md">Wallet Balance: ₦{walletBalance.toLocaleString()}</span>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-blue-800 mb-1.5 uppercase tracking-wider">Select Platform</label>
                            <select
                              value={boostForm.platform}
                              onChange={e => setBoostForm({ ...boostForm, platform: e.target.value })}
                              className="w-full border border-blue-200 bg-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            >
                              <option value="ALL">All Platforms</option>
                              <option value="TALLYPADI_SEO">TallyPadi SEO & Google</option>
                              <option value="META">Meta Ads (Facebook/IG)</option>
                              <option value="TIKTOK">TikTok Ads</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-blue-800 mb-1.5 uppercase tracking-wider">Select Duration</label>
                            <select
                              value={boostForm.planId}
                              onChange={e => {
                                const plan = adsPlans.find(item => item.id === e.target.value);
                                const currentBudget = Number(boostForm.budget);
                                setBoostForm({
                                  ...boostForm,
                                  planId: e.target.value,
                                  budget: plan && (!currentBudget || currentBudget < plan.price) ? String(plan.price) : boostForm.budget
                                });
                              }}
                              className="w-full border border-blue-200 bg-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            >
                              <option value="">-- Choose a Plan --</option>
                              {adsPlans.map(plan => (
                                <option key={plan.id} value={plan.id}>{plan.label} - ₦{plan.price.toLocaleString()}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-blue-800 mb-1.5 uppercase tracking-wider">Boost Budget</label>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">₦</span>
                            <input
                              type="number"
                              value={boostForm.budget}
                              onChange={e => setBoostForm({ ...boostForm, budget: e.target.value })}
                              placeholder={selectedBoostPlan ? String(selectedBoostPlan.price) : 'Minimum budget'}
                              className="w-full border border-blue-200 bg-white rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end pt-2">
                          <button
                            onClick={() => handleBoostSubmit(product.id)}
                            disabled={boosting || !boostForm.planId}
                            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
                          >
                            {boosting ? <Loader2 size={16} className="animate-spin" /> : <TrendingUp size={16} />}
                            Submit for Review
                          </button>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Product Description</label>
                      <textarea
                        value={editForm.description}
                        onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                        placeholder="Detail about this specific product..."
                        rows={3}
                        className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Colors (Comma Separated)</label>
                        <input
                          type="text"
                          value={editForm.colors}
                          onChange={e => setEditForm({ ...editForm, colors: e.target.value })}
                          placeholder="e.g. Red, Blue, Black"
                          className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Sizes (Comma Separated)</label>
                        <input
                          type="text"
                          value={editForm.sizes}
                          onChange={e => setEditForm({ ...editForm, sizes: e.target.value })}
                          placeholder="e.g. S, M, L, XL or 42, 43, 44"
                          className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        onClick={() => handleSave(product.id)}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold shadow-md hover:bg-black active:scale-95 transition-all disabled:opacity-50"
                      >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Save Details
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
                  })
          )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
