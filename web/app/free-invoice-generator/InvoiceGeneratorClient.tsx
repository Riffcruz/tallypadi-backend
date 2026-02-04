'use client';

import React, { useState, useRef, ChangeEvent, useEffect } from 'react';
import { Plus, Trash2, Download, Upload, RefreshCw } from 'lucide-react';
import { generatePdf } from '../../utils/generatePdf';

export default function InvoiceGeneratorClient() {
  const [logo, setLogo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [invoiceData, setInvoiceData] = useState({
    documentTitle: 'INVOICE',
    invoiceNumber: 'INV-001',
    themeColor: '#10b981',
    date: new Date().toISOString().split('T')[0],
    dueDate: '',
    currency: 'NGN',
    businessName: '',
    businessEmail: '',
    businessPhone: '',
    businessAddress: '',
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    customerAddress: '',
    notes: '',
  });

  const [items, setItems] = useState([
    { id: 1, description: 'Service or Product Name', quantity: 1, price: 0 },
  ]);

  const [taxRate, setTaxRate] = useState(0);

  // Check for saved logo on mount (1 hour expiration)
  useEffect(() => {
    const savedLogo = localStorage.getItem('invoice_logo');
    const savedTimestamp = localStorage.getItem('invoice_logo_timestamp');

    if (savedLogo && savedTimestamp) {
      const now = Date.now();
      const expirationTime = 60 * 60 * 1000; // 1 hour

      if (now - parseInt(savedTimestamp) < expirationTime) {
        setLogo(savedLogo);
      } else {
        localStorage.removeItem('invoice_logo');
        localStorage.removeItem('invoice_logo_timestamp');
      }
    }
  }, []);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setInvoiceData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setLogo(result);
        localStorage.setItem('invoice_logo', result);
        localStorage.setItem('invoice_logo_timestamp', Date.now().toString());
      };
      reader.readAsDataURL(file);
    }
  };

  const handleItemChange = (id: number, field: string, value: string | number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { id: Date.now(), description: '', quantity: 1, price: 0 },
    ]);
  };

  const removeItem = (id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const calculateSubtotal = () => {
    return items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  };

  const calculateTax = () => {
    return calculateSubtotal() * (taxRate / 100);
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateTax();
  };

  const handleDownload = async () => {
    try {
        await generatePdf({
            ...invoiceData,
            items,
            logo,
            subtotal: calculateSubtotal(),
            tax: calculateTax(),
            total: calculateTotal(),
            taxRate,
            themeColor: invoiceData.themeColor
        });
    } catch (e) {
        console.error("Error generating PDF", e);
        alert("Failed to generate PDF. Please try again.");
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-8 items-start">
      {/* Form Section */}
      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-xl border border-slate-200">
        <div className="space-y-6">
          
          {/* Header & Logo */}
          <div className="flex flex-col md:flex-row gap-6 items-start">
             <div className="flex-1 w-full">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Upload Logo</label>
                <div 
                    className="border-2 border-dashed border-slate-300 rounded-xl p-4 flex flex-col items-center justify-center text-slate-400 hover:bg-slate-50 cursor-pointer transition h-32"
                    onClick={() => fileInputRef.current?.click()}
                >
                    {logo ? (
                        <img src={logo} alt="Logo" className="h-full object-contain" />
                    ) : (
                        <>
                            <Upload size={24} className="mb-2" />
                            <span className="text-xs">Click to upload</span>
                        </>
                    )}
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/*"
                        onChange={handleLogoUpload}
                    />
                </div>
                {logo && (
                    <button 
                        onClick={() => {
                            setLogo(null);
                            localStorage.removeItem('invoice_logo');
                            localStorage.removeItem('invoice_logo_timestamp');
                        }} 
                        className="text-xs text-red-500 mt-2 hover:underline"
                    >
                        Remove Logo
                    </button>
                )}
                
                <div className="mt-6">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Theme Color</label>
                    <div className="flex items-center gap-3">
                        <input
                            type="color"
                            name="themeColor"
                            value={invoiceData.themeColor}
                            onChange={handleInputChange}
                            className="h-10 w-10 p-1 rounded cursor-pointer border border-slate-200"
                        />
                        <span className="text-xs text-slate-500 uppercase">{invoiceData.themeColor}</span>
                    </div>
                </div>
             </div>
             <div className="flex-1 w-full space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Type</label>
                         <select
                            name="documentTitle"
                            value={invoiceData.documentTitle}
                            onChange={handleInputChange}
                            className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-black font-bold"
                        >
                            <option value="INVOICE">INVOICE</option>
                            <option value="RECEIPT">RECEIPT</option>
                            <option value="QUOTATION">QUOTATION</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Number #</label>
                        <input
                            type="text"
                            name="invoiceNumber"
                            value={invoiceData.invoiceNumber}
                            onChange={handleInputChange}
                            className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-black font-medium placeholder-slate-400"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Currency</label>
                        <select
                            name="currency"
                            value={invoiceData.currency}
                            onChange={handleInputChange}
                            className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-black"
                        >
                            <option value="NGN">NGN (₦)</option>
                            <option value="USD">USD ($)</option>
                            <option value="GBP">GBP (£)</option>
                            <option value="EUR">EUR (€)</option>
                            <option value="GHS">GHS (₵)</option>
                            <option value="KES">KES (KSh)</option>
                            <option value="ZAR">ZAR (R)</option>
                        </select>
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date</label>
                        <input
                            type="date"
                            name="date"
                            value={invoiceData.date}
                            onChange={handleInputChange}
                            className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-black placeholder-slate-400"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Due Date</label>
                        <input
                            type="date"
                            name="dueDate"
                            value={invoiceData.dueDate}
                            onChange={handleInputChange}
                            className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-black placeholder-slate-400"
                        />
                    </div>
                 </div>
             </div>
          </div>

          <hr className="border-slate-100" />

          {/* From / To */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-900 uppercase">From (Your Business)</h4>
                <input
                    type="text"
                    name="businessName"
                    placeholder="Business Name"
                    value={invoiceData.businessName}
                    onChange={handleInputChange}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm text-black placeholder-slate-400"
                />
                 <input
                    type="email"
                    name="businessEmail"
                    placeholder="Email Address"
                    value={invoiceData.businessEmail}
                    onChange={handleInputChange}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm text-black placeholder-slate-400"
                />
                 <input
                    type="text"
                    name="businessPhone"
                    placeholder="Phone Number"
                    value={invoiceData.businessPhone}
                    onChange={handleInputChange}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm text-black placeholder-slate-400"
                />
                 <textarea
                    name="businessAddress"
                    placeholder="Address"
                    value={invoiceData.businessAddress}
                    onChange={handleInputChange}
                    rows={2}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm resize-none text-black placeholder-slate-400"
                />
            </div>
            <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-900 uppercase">Bill To (Client)</h4>
                <input
                    type="text"
                    name="customerName"
                    placeholder="Client Name"
                    value={invoiceData.customerName}
                    onChange={handleInputChange}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm placeholder-slate-400"
                />
                 <input
                    type="email"
                    name="customerEmail"
                    placeholder="Email Address"
                    value={invoiceData.customerEmail}
                    onChange={handleInputChange}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm placeholder-slate-400"
                />
                 <input
                    type="text"
                    name="customerPhone"
                    placeholder="Phone Number"
                    value={invoiceData.customerPhone}
                    onChange={handleInputChange}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm placeholder-slate-400"
                />
                 <textarea
                    name="customerAddress"
                    placeholder="Address"
                    value={invoiceData.customerAddress}
                    onChange={handleInputChange}
                    rows={2}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm resize-none placeholder-slate-400"
                />
            </div>
          </div>

          {/* Items */}
          <div>
            <h4 className="text-sm font-bold text-slate-900 uppercase mb-3">Items</h4>
            <div className="space-y-3">
                {items.map((item) => (
                    <div key={item.id} className="flex gap-2 items-start">
                        <div className="flex-grow">
                            <input
                                type="text"
                                placeholder="Description"
                                value={item.description}
                                onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                                className="w-full p-2 border border-slate-200 rounded-lg text-sm placeholder-slate-400"
                            />
                        </div>
                        <div className="w-20">
                             <input
                                type="number"
                                placeholder="Qty"
                                value={item.quantity}
                                onChange={(e) => handleItemChange(item.id, 'quantity', Number(e.target.value))}
                                className="w-full p-2 border border-slate-200 rounded-lg text-sm text-center placeholder-slate-400"
                                min="1"
                            />
                        </div>
                        <div className="w-28">
                             <input
                                type="number"
                                placeholder="Price"
                                value={item.price}
                                onChange={(e) => handleItemChange(item.id, 'price', Number(e.target.value))}
                                className="w-full p-2 border border-slate-200 rounded-lg text-sm text-right placeholder-slate-400"
                                min="0"
                            />
                        </div>
                        <button 
                            onClick={() => removeItem(item.id)}
                            className="p-2 text-slate-400 hover:text-red-500 transition"
                            title="Remove Item"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                ))}
            </div>
            <button 
                onClick={addItem}
                className="mt-3 flex items-center gap-2 text-sm font-bold text-emerald-600 hover:text-emerald-500"
            >
                <Plus size={16} /> Add Item
            </button>
          </div>

          {/* Totals */}
          <div className="flex justify-end pt-4 border-t border-slate-100">
             <div className="w-64 space-y-2">
                <div className="flex justify-between text-sm text-slate-600">
                    <span>Subtotal</span>
                    <span>{calculateSubtotal().toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-sm text-slate-600">
                    <span>Tax (%)</span>
                    <input 
                        type="number" 
                        value={taxRate} 
                        onChange={(e) => setTaxRate(Number(e.target.value))}
                        className="w-16 p-1 border border-slate-200 rounded text-right"
                    />
                </div>
                 <div className="flex justify-between text-lg font-bold text-slate-900 border-t border-slate-200 pt-2">
                    <span>Total</span>
                    <span>{invoiceData.currency} {calculateTotal().toLocaleString()}</span>
                </div>
             </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Notes / Terms</label>
            <textarea
                name="notes"
                value={invoiceData.notes}
                onChange={handleInputChange}
                className="w-full p-3 border border-slate-200 rounded-lg text-sm resize-none text-black placeholder-slate-400"
                rows={3}
                placeholder="e.g. Thanks for your business!"
            />
          </div>

        </div>
      </div>

      {/* Preview Section (Sticky) */}
      <div className="lg:sticky lg:top-24">
        <div className="bg-slate-800 text-white rounded-2xl p-6 shadow-2xl">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                <RefreshCw size={20} className="text-emerald-400" /> Live Preview
            </h3>
            
            {/* Simple HTML Preview */}
            <div className="bg-white text-slate-900 p-6 rounded-lg text-sm min-h-[500px] flex flex-col shadow-inner">
                 <div className="flex justify-between items-start mb-8">
                     <div>
                        {logo ? <img src={logo} className="h-12 object-contain mb-2" /> : <div className="text-2xl font-bold" style={{ color: invoiceData.themeColor }}>{invoiceData.businessName || 'Business Name'}</div>}
                        <div className="text-slate-500 text-xs mt-1 whitespace-pre-line">{invoiceData.businessAddress}</div>
                     </div>
                     <div className="text-right">
                         <div className="text-2xl font-light text-slate-400">{invoiceData.documentTitle}</div>
                         <div className="font-bold text-slate-700">#{invoiceData.invoiceNumber}</div>
                         <div className="text-slate-500 text-xs">{invoiceData.date}</div>
                     </div>
                 </div>

                 <div className="mb-8">
                     <div className="text-xs font-bold text-slate-400 uppercase mb-1">Bill To</div>
                     <div className="font-bold">{invoiceData.customerName || 'Customer Name'}</div>
                     <div className="text-slate-500 text-xs">{invoiceData.customerEmail}</div>
                 </div>

                 <table className="w-full mb-8">
                     <thead className="border-b-2" style={{ borderColor: invoiceData.themeColor }}>
                         <tr>
                             <th className="text-left py-2 font-bold" style={{ color: invoiceData.themeColor }}>Item</th>
                             <th className="text-center py-2 font-bold" style={{ color: invoiceData.themeColor }}>Qty</th>
                             <th className="text-right py-2 font-bold" style={{ color: invoiceData.themeColor }}>Price</th>
                             <th className="text-right py-2 font-bold" style={{ color: invoiceData.themeColor }}>Total</th>
                         </tr>
                     </thead>
                     <tbody>
                         {items.map(item => (
                             <tr key={item.id} className="border-b border-slate-50">
                                 <td className="py-2">{item.description || 'Item'}</td>
                                 <td className="py-2 text-center">{item.quantity}</td>
                                 <td className="py-2 text-right">{item.price.toLocaleString()}</td>
                                 <td className="py-2 text-right">{(item.quantity * item.price).toLocaleString()}</td>
                             </tr>
                         ))}
                     </tbody>
                 </table>

                 <div className="mt-auto pt-6 border-t border-slate-100 flex justify-end">
                     <div className="text-right space-y-1">
                         <div className="flex justify-between w-40 text-slate-500"><span>Subtotal:</span> <span>{calculateSubtotal().toLocaleString()}</span></div>
                         <div className="flex justify-between w-40 text-slate-500"><span>Tax ({taxRate}%):</span> <span>{calculateTax().toLocaleString()}</span></div>
                         <div className="flex justify-between w-40 font-bold text-lg mt-2" style={{ color: invoiceData.themeColor }}><span>Total:</span> <span>{invoiceData.currency} {calculateTotal().toLocaleString()}</span></div>
                     </div>
                 </div>
            </div>

            <button 
                onClick={handleDownload}
                className="w-full mt-6 bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-4 rounded-xl shadow-lg transition transform hover:scale-[1.02] flex items-center justify-center gap-2"
            >
                <Download size={20} /> Download PDF
            </button>
            <p className="text-center text-slate-400 text-xs mt-4">
                100% Free • No Watermark • Secure
            </p>
        </div>
      </div>
    </div>
  );
}
