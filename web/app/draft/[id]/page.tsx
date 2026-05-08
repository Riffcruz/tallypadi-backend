'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, useRouter } from 'next/navigation';
import { PackageOpen, Sparkles, Loader2, CheckCircle2, AlertTriangle, Plus, Link as LinkIcon } from 'lucide-react';
import Swal from 'sweetalert2';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

interface DraftItem {
  rawName: string;
  qty: number;
  cost_price: number;
  unit_price: number;
  options: string[]; // Possible fuzzy matched names
}

interface DraftData {
  id: string;
  successCount: number;
  items: DraftItem[];
}

interface InventoryOption {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  price: number;
}

export default function DraftResolutionPage() {
  const { id } = useParams();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DraftData | null>(null);
  const [inventoryOptions, setInventoryOptions] = useState<InventoryOption[]>([]);

  // maps draft item rawName -> selected inventory ID, or 'CREATE_NEW' or 'SKIP'
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    
    const fetchDraft = async () => {
      try {
        const [draftRes, invRes] = await Promise.all([
          axios.get(`${API_URL}/draft/${id}`),
          axios.get(`${API_URL}/draft/${id}/inventory`)
        ]);

        setDraft(draftRes.data);
        setInventoryOptions(invRes.data);

        // Pre-fill resolutions with the first available fuzzy match option if one exists
        const initialResolutions: Record<string, string> = {};
        const draftItems = draftRes.data.items as DraftItem[];
        
        draftItems.forEach(item => {
           if (item.options && item.options.length > 0) {
              const bestMatch = invRes.data.find((inv: InventoryOption) => inv.name === item.options[0]);
              if (bestMatch) {
                 initialResolutions[item.rawName] = bestMatch.id;
              } else {
                 initialResolutions[item.rawName] = 'CREATE_NEW';
              }
           } else {
              initialResolutions[item.rawName] = 'CREATE_NEW';
           }
        });
        
        setResolutions(initialResolutions);

      } catch (err: any) {
        console.error(err);
        if (err.response?.status === 410) {
          Swal.fire({
            title: 'Already Resolved',
            text: 'This draft has already been processed and the items were saved.',
            icon: 'info',
            confirmButtonColor: '#10b981'
          });
          setDraft(null);
        } else {
          Swal.fire('Error', 'This draft link is invalid or has expired.', 'error');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchDraft();
  }, [id]);

  const handleResolve = (rawName: string, value: string) => {
    setResolutions(prev => ({ ...prev, [rawName]: value }));
  };

  const submitResolutions = async () => {
    if (!draft) return;
    
    setSubmitting(true);
    try {
      const payload = Object.entries(resolutions).map(([rawName, value]) => {
         if (value === 'SKIP') return null;
         return {
            rawName,
            createNew: value === 'CREATE_NEW',
            inventoryId: value !== 'CREATE_NEW' ? value : null
         };
      }).filter(Boolean);

      await axios.post(`${API_URL}/draft/${id}/resolve`, { resolutions: payload });

      Swal.fire({
        title: 'Items Saved!',
        text: 'Your inventory has been updated successfully.',
        icon: 'success',
        confirmButtonColor: '#10b981'
      }).then(() => {
        router.push('/'); // Redirect to home/app after resolving
      });

    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'Failed to save items. Please try again.', 'error');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
         <div className="flex flex-col items-center animate-pulse">
            <PackageOpen className="w-12 h-12 text-slate-300 mb-4" />
            <p className="text-slate-500 font-bold">Loading draft...</p>
         </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
         <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center mb-6">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
         </div>
         <h1 className="text-2xl font-black text-slate-900 text-center mb-2">Draft Unavailable</h1>
         <p className="text-slate-500 text-center max-w-sm mb-8">
           This link has expired or the items have already been resolved and saved to your inventory.
         </p>
         <button 
           onClick={() => router.push('/')}
           className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-emerald-500/20"
         >
           Go to Dashboard
         </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24 relative overflow-x-hidden">
       {/* Ambient glow */}
       <div className="fixed -top-24 -left-24 w-96 h-96 bg-emerald-200/35 rounded-full blur-[100px] pointer-events-none z-0" />
       
       <main className="relative z-10 max-w-2xl mx-auto px-4 pt-12 sm:pt-20">
          
          <div className="text-center mb-10 animate-fade-in-up">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black uppercase tracking-widest mb-4">
              <Sparkles className="w-4 h-4" /> Action Required
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight mb-3">
              Resolve Ambiguous Items
            </h1>
            <p className="text-slate-600 font-medium">
              We couldn't automatically match these items from your WhatsApp message because their names were too vague. 
            </p>
            {draft.successCount > 0 && (
               <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
                 <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                 <span className="text-sm font-bold text-emerald-800 text-left">
                   <span className="text-emerald-900">{draft.successCount} items</span> were already saved successfully.
                 </span>
               </div>
            )}
          </div>

          <div className="space-y-6">
            {draft.items.map((item, index) => {
               const currentValue = resolutions[item.rawName] || 'CREATE_NEW';

               return (
                  <div 
                    key={index} 
                    className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm shadow-slate-200/50 hover:border-emerald-200 transition-colors"
                  >
                     <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
                       <div>
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">You typed:</p>
                         <h3 className="text-xl font-black text-slate-900 mb-2">"{item.rawName}"</h3>
                         <div className="flex items-center gap-3">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold text-xs">
                               Qty: {item.qty}
                            </span>
                            {item.unit_price > 0 && (
                               <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold text-xs">
                                 Price: {item.unit_price}
                               </span>
                            )}
                         </div>
                       </div>
                     </div>

                     <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                        <label className="block text-xs font-black text-slate-600 uppercase tracking-widest mb-3">
                          Did you mean...
                        </label>
                        
                        <div className="space-y-2">
                           {item.options.map(optionName => {
                              const inv = inventoryOptions.find(i => i.name === optionName);
                              if (!inv) return null;

                              const isSelected = currentValue === inv.id;

                              return (
                                <label 
                                  key={inv.id}
                                  className={`
                                    flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all
                                    ${isSelected ? 'bg-emerald-50 border-emerald-500 shadow-sm' : 'bg-white border-slate-200 hover:border-emerald-300'}
                                  `}
                                >
                                  <input 
                                    type="radio" 
                                    name={`resolve-${index}`} 
                                    value={inv.id}
                                    checked={isSelected}
                                    onChange={(e) => handleResolve(item.rawName, e.target.value)}
                                    className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-slate-300"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                       <span className="font-bold text-slate-900 truncate">{inv.name}</span>
                                       {inv.sku && (
                                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 font-mono tracking-widest uppercase">
                                             {inv.sku}
                                          </span>
                                       )}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-slate-500 font-semibold mt-0.5">
                                       <span>{inv.stock} in stock</span>
                                    </div>
                                  </div>
                                  {isSelected && <LinkIcon className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                                </label>
                              );
                           })}

                           <label 
                             className={`
                               flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all
                               ${currentValue === 'CREATE_NEW' ? 'bg-emerald-50 border-emerald-500 shadow-sm' : 'bg-white border-slate-200 hover:border-emerald-300'}
                             `}
                           >
                             <input 
                               type="radio" 
                               name={`resolve-${index}`} 
                               value="CREATE_NEW"
                               checked={currentValue === 'CREATE_NEW'}
                               onChange={(e) => handleResolve(item.rawName, e.target.value)}
                               className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-slate-300"
                             />
                             <div className="flex-1 min-w-0">
                               <span className="font-bold text-slate-900">Create new product</span>
                               <p className="text-xs text-slate-500 font-semibold mt-0.5">Will be saved exactly as "{item.rawName}"</p>
                             </div>
                             {currentValue === 'CREATE_NEW' && <Plus className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                           </label>
                           
                           <label 
                             className={`
                               flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all
                               ${currentValue === 'SKIP' ? 'bg-red-50 border-red-500 shadow-sm' : 'bg-white border-slate-200 hover:border-red-200'}
                             `}
                           >
                             <input 
                               type="radio" 
                               name={`resolve-${index}`} 
                               value="SKIP"
                               checked={currentValue === 'SKIP'}
                               onChange={(e) => handleResolve(item.rawName, e.target.value)}
                               className="w-4 h-4 text-red-600 focus:ring-red-500 border-slate-300"
                             />
                             <div className="flex-1 min-w-0">
                               <span className="font-bold text-red-700">Skip this item</span>
                             </div>
                           </label>

                        </div>
                     </div>
                  </div>
               );
            })}
          </div>

          <div className="mt-10 mb-20 flex justify-center sticky bottom-6 z-20">
             <button
                onClick={submitResolutions}
                disabled={submitting}
                className="w-full sm:w-auto px-8 py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-black text-lg rounded-2xl shadow-xl shadow-emerald-500/30 transition-all active:scale-95 flex items-center justify-center gap-2"
             >
               {submitting ? (
                 <>
                   <Loader2 className="w-5 h-5 animate-spin" /> Saving...
                 </>
               ) : (
                 'Save Selected Items'
               )}
             </button>
          </div>

       </main>
    </div>
  );
}
