import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  CalendarCheck,
  Calendar,
  Plus,
  Trash2,
  Save,
  Send,
  Printer,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Wallet,
  Building2,
  Coins,
  Search,
  FileSpreadsheet,
  Check,
  Copy,
  Layers,
  HelpCircle,
  RefreshCw,
  X
} from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import { DailyEntryRow, DailyEntrySheet, Party, InventoryItem, Treasury } from '../types';
import {
  createEmptyDailyEntryRow,
  convertDailyEntryRowsToDrafts,
  calculateDailyEntryTotals
} from '../services/dailyEntryService';
import { normalizeArabicText } from '../services/liveSheetService';
import { posSound } from '../utils/audio';

const STORAGE_KEY_MULTI_DRAFTS = 'accounting_pending_multi_draft_invoices_v5';

export const DailyEntrySheetView: React.FC = () => {
  const {
    parties = [],
    inventory = [],
    treasuries = [],
    settings,
    setActiveTab,
    getDailyEntrySheet,
    saveDailyEntrySheet,
    deleteDailyEntrySheet,
    getAllDailyEntryDates
  } = useAccounting();

  // Current selected business date (YYYY-MM-DD)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Rows state for the selected day
  const [rows, setRows] = useState<DailyEntryRow[]>([]);
  const [sheetNotes, setSheetNotes] = useState<string>('');
  const [isSaved, setIsSaved] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Default treasury (usually cash)
  const defaultTreasury = useMemo(() => {
    return treasuries.find(t => t.type === 'cash' || t.name?.includes('نقدي')) || treasuries[0];
  }, [treasuries]);

  // Load sheet for selected date
  useEffect(() => {
    const sheet = getDailyEntrySheet(selectedDate);
    if (sheet && sheet.rows && sheet.rows.length > 0) {
      setRows(sheet.rows);
      setSheetNotes(sheet.notes || '');
    } else {
      // Create initial 5 blank rows for quick input
      const initialRows: DailyEntryRow[] = [
        createEmptyDailyEntryRow(1, defaultTreasury?.id, defaultTreasury?.name),
        createEmptyDailyEntryRow(2, defaultTreasury?.id, defaultTreasury?.name),
        createEmptyDailyEntryRow(3, defaultTreasury?.id, defaultTreasury?.name),
        createEmptyDailyEntryRow(4, defaultTreasury?.id, defaultTreasury?.name),
        createEmptyDailyEntryRow(5, defaultTreasury?.id, defaultTreasury?.name)
      ];
      setRows(initialRows);
      setSheetNotes('');
    }
    setIsSaved(true);
  }, [selectedDate]);

  // Available dates that have recorded entries
  const recordedDates = useMemo(() => {
    return getAllDailyEntryDates();
  }, [getAllDailyEntryDates, isSaved]);

  // Auto-save debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      // Only save if there's at least one non-empty row or notes
      const hasContent = rows.some(r => 
        (r.customerName && r.customerName.trim().length > 0) || 
        (r.itemName && r.itemName.trim().length > 0) || 
        Number(r.requiredAmount) > 0 || 
        Number(r.paidAmount) > 0
      );
      if (hasContent) {
        saveDailyEntrySheet(selectedDate, rows, sheetNotes);
        setIsSaved(true);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [rows, sheetNotes, selectedDate]);

  // Handle changing cell values
  const handleUpdateRow = (rowId: string, updates: Partial<DailyEntryRow>) => {
    setIsSaved(false);
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      return { ...r, ...updates };
    }));
  };

  // Add a new row at the end
  const handleAddRow = () => {
    setIsSaved(false);
    setRows(prev => {
      const nextSerial = prev.length > 0 ? Math.max(...prev.map(r => r.serialNumber || 0)) + 1 : 1;
      const lastRow = prev[prev.length - 1];
      const treasuryId = lastRow?.treasuryId || defaultTreasury?.id || '';
      const treasuryName = lastRow?.treasuryName || defaultTreasury?.name || '';
      return [...prev, createEmptyDailyEntryRow(nextSerial, treasuryId, treasuryName)];
    });
  };

  // Insert a row directly below an existing row
  const handleInsertRowBelow = (index: number) => {
    setIsSaved(false);
    setRows(prev => {
      const current = prev[index];
      const newRow = createEmptyDailyEntryRow(
        index + 2,
        current?.treasuryId || defaultTreasury?.id,
        current?.treasuryName || defaultTreasury?.name
      );
      const next = [...prev.slice(0, index + 1), newRow, ...prev.slice(index + 1)];
      // Re-index serial numbers
      return next.map((r, i) => ({ ...r, serialNumber: i + 1 }));
    });
  };

  // Delete a row
  const handleDeleteRow = (rowId: string) => {
    setIsSaved(false);
    setRows(prev => {
      const filtered = prev.filter(r => r.id !== rowId);
      if (filtered.length === 0) {
        return [createEmptyDailyEntryRow(1, defaultTreasury?.id, defaultTreasury?.name)];
      }
      return filtered.map((r, i) => ({ ...r, serialNumber: i + 1 }));
    });
  };

  // Clear empty rows
  const handleCleanEmptyRows = () => {
    setRows(prev => {
      const filtered = prev.filter(r => 
        (r.customerName && r.customerName.trim().length > 0) || 
        (r.itemName && r.itemName.trim().length > 0) || 
        Number(r.requiredAmount) > 0 || 
        Number(r.paidAmount) > 0
      );
      if (filtered.length === 0) {
        return [createEmptyDailyEntryRow(1, defaultTreasury?.id, defaultTreasury?.name)];
      }
      return filtered.map((r, i) => ({ ...r, serialNumber: i + 1 }));
    });
  };

  // Save explicitly
  const handleSaveExplicit = () => {
    saveDailyEntrySheet(selectedDate, rows, sheetNotes);
    setIsSaved(true);
    setStatusMessage({
      type: 'success',
      text: `تم حفظ كشف الإدخال اليومي ليوم ${selectedDate} بنجاح!`
    });
    posSound.beep(1200, 0.08);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  // Transfer this day's entries directly to Drafts screen
  const handleTransferToDrafts = () => {
    // 1. First save current sheet
    saveDailyEntrySheet(selectedDate, rows, sheetNotes);
    setIsSaved(true);

    // 2. Convert to multi drafts
    const newDrafts = convertDailyEntryRowsToDrafts(
      selectedDate,
      rows,
      parties,
      inventory,
      treasuries
    );

    if (newDrafts.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'لا توجد حركات صالحة للترحيل في كشف اليوم! يرجى إدخال اسم الزبون أو الصنف والمبلغ المطلوب.'
      });
      setTimeout(() => setStatusMessage(null), 4000);
      return;
    }

    // 3. Load existing drafts from localStorage and prepend/append
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MULTI_DRAFTS);
      const existingDrafts = saved ? JSON.parse(saved) : [];
      // Combine, filtering out any duplicate IDs
      const combined = [...newDrafts, ...existingDrafts.filter((d: any) => !newDrafts.some(n => n.id === d.id))];
      localStorage.setItem(STORAGE_KEY_MULTI_DRAFTS, JSON.stringify(combined));
    } catch (err) {
      console.error('Failed to merge drafts:', err);
    }

    posSound.cash();
    setStatusMessage({
      type: 'success',
      text: `تم ترحيل ${newDrafts.length} حركة كمسودات فواتير بنجاح! جاري الانتقال لشاشة المسودات...`
    });

    // 4. Navigate to excel_drafts
    setTimeout(() => {
      setActiveTab('excel_drafts');
    }, 900);
  };

  // Date Navigation
  const changeDateByDays = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const totals = useMemo(() => calculateDailyEntryTotals(rows), [rows]);

  return (
    <div className="space-y-3 font-sans pb-16 print:p-0 print:space-y-0" dir="rtl">
      {/* 1. TOP HEADER & DATE CONTROLS */}
      <div className="bg-white border border-slate-300 rounded-2xl p-3 sm:p-4 shadow-sm print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          
          {/* Title & Badge */}
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  كشف إدخال يومي
                </h1>
                <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-200">
                  حركات يوم العمل
                </span>
                {isSaved ? (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 font-bold">
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>محفوظ</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 font-bold animate-pulse">
                    <Clock className="w-3 h-3" />
                    <span>تعديلات غير محفوظة</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                جدول إدخال الحركات اليومية المباشرة للزبائن والأصناف والتحصيل وترحيلها لمسودات الفواتير
              </p>
            </div>
          </div>

          {/* Date Selector & Fast Nav */}
          <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 p-1.5 rounded-xl">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1 mr-1">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span>تاريخ يوم العمل:</span>
            </span>

            <button
              type="button"
              onClick={() => changeDateByDays(-1)}
              className="p-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 transition cursor-pointer"
              title="اليوم السابق"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-600"
            />

            <button
              type="button"
              onClick={() => changeDateByDays(1)}
              className="p-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 transition cursor-pointer"
              title="اليوم التالي"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
              className="px-2 py-1 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition cursor-pointer"
            >
              اليوم الحالي
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSaveExplicit}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              title="حفظ بيانات الكشف الآن"
            >
              <Save className="w-3.5 h-3.5" />
              <span>حفظ الكشف</span>
            </button>

            <button
              type="button"
              onClick={handleTransferToDrafts}
              className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition cursor-pointer"
              title="ترحيل جميع حركات كشف اليوم كمسودات فواتير في شاشة المسودات"
            >
              <Send className="w-3.5 h-3.5" />
              <span>ترحيل إلى مسودات الفواتير 🚀</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl transition cursor-pointer"
              title="طباعة كشف هذا اليوم"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>

        </div>

        {/* Existing Dates Pills Bar */}
        {recordedDates.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-[11px] text-slate-400 font-bold shrink-0">
              أيام مسجلة سابقة:
            </span>
            {recordedDates.slice(0, 10).map(d => {
              const isCurrent = d === selectedDate;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSelectedDate(d)}
                  className={`px-2.5 py-0.5 rounded-lg text-[11px] font-mono font-bold transition shrink-0 cursor-pointer ${
                    isCurrent
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* STATUS TOAST MESSAGE */}
      {statusMessage && (
        <div
          className={`p-3 rounded-xl border flex items-center justify-between text-xs font-bold animate-in fade-in duration-200 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : statusMessage.type === 'error'
              ? 'bg-rose-50 text-rose-900 border-rose-200'
              : 'bg-blue-50 text-blue-900 border-blue-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            {statusMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
            <span>{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="p-1 text-slate-400 hover:text-slate-600 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* PRINT-ONLY HEADER */}
      <div className="hidden print:block text-center pb-3 border-b border-slate-900 mb-3">
        <h2 className="text-xl font-black text-slate-900">{settings.appTitle || 'كشف إدخال يومي'}</h2>
        <div className="text-sm font-bold text-slate-700 mt-1 flex items-center justify-center gap-4">
          <span>كشف حركات يوم العمل: <strong className="font-mono">{selectedDate}</strong></span>
          <span>عدد الحركات: <strong className="font-mono">{totals.validRowsCount}</strong></span>
          <span>إجمالي المطلوب: <strong className="font-mono">{totals.totalRequired.toFixed(2)} ₪</strong></span>
          <span>إجمالي المدفوع: <strong className="font-mono">{totals.totalPaid.toFixed(2)} ₪</strong></span>
        </div>
      </div>

      {/* 2. THE MAIN DAILY ENTRY TABLE */}
      <div className="bg-white border border-slate-300 rounded-2xl shadow-sm overflow-hidden">
        {/* Table Toolbar */}
        <div className="bg-slate-800 text-white px-3 py-2 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold">
              جدول إدخال الحركات (عدد الأسطر: {rows.length})
            </span>
            <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded font-mono">
              الصالح للترحيل: {totals.validRowsCount}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCleanEmptyRows}
              className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[11px] font-bold transition cursor-pointer"
              title="حذف الأسطر الفارغة"
            >
              مسح الأسطر الفارغة
            </button>
            <button
              type="button"
              onClick={handleAddRow}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-bold flex items-center gap-1 transition cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة سطر (+)</span>
            </button>
          </div>
        </div>

        {/* The Responsive Table Container */}
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-800 font-black border-b border-slate-300 text-[11px]">
                <th className="py-2 px-2 text-center w-10 border-l border-slate-200">#</th>
                <th className="py-2 px-3 w-48 border-l border-slate-200">اسم الزبون الرئيسي</th>
                <th className="py-2 px-3 w-36 border-l border-slate-200">الزبون الفرعي</th>
                <th className="py-2 px-3 w-48 border-l border-slate-200">الصنف</th>
                <th className="py-2 px-3 min-w-[140px] border-l border-slate-200">ملاحظات</th>
                <th className="py-2 px-2.5 text-center w-28 border-l border-slate-200">المبلغ المطلوب</th>
                <th className="py-2 px-2.5 text-center w-28 border-l border-slate-200">المدفوع</th>
                <th className="py-2 px-3 w-36 border-l border-slate-200">الصندوق</th>
                <th className="py-2 px-2 text-center w-14 print:hidden">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.map((row, idx) => {
                const reqVal = Number(row.requiredAmount || 0);
                const paidVal = Number(row.paidAmount || 0);
                const isPaidFull = reqVal > 0 && paidVal >= reqVal;
                const isPartial = reqVal > 0 && paidVal > 0 && paidVal < reqVal;
                const isCredit = reqVal > 0 && paidVal === 0;

                // Match customer if exists
                const matchedCust = parties.find(p => 
                  p.id === row.customerId || 
                  p.name.trim().toLowerCase() === row.customerName.trim().toLowerCase()
                );
                const subCustList = matchedCust?.subCustomers || [];

                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-blue-50/40 transition-colors ${
                      idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                    }`}
                  >
                    {/* 1. رقم مسلسل */}
                    <td className="py-1 px-1 text-center font-mono font-bold text-slate-500 border-l border-slate-200">
                      {idx + 1}
                    </td>

                    {/* 2. اسم الزبون الرئيسي */}
                    <td className="p-1 border-l border-slate-200">
                      <div className="relative">
                        <CustomerCellInput
                          value={row.customerName}
                          parties={parties}
                          onChange={(name, custId) => {
                            handleUpdateRow(row.id, {
                              customerName: name,
                              customerId: custId
                            });
                          }}
                        />
                      </div>
                    </td>

                    {/* 3. الزبون الفرعي */}
                    <td className="p-1 border-l border-slate-200">
                      {subCustList.length > 0 ? (
                        <div className="relative">
                          <input
                            type="text"
                            list={`sub-list-${row.id}`}
                            value={row.subCustomerName || ''}
                            onChange={e => handleUpdateRow(row.id, { subCustomerName: e.target.value })}
                            placeholder="اختر أو اكتب الزبون الفرعي..."
                            className="w-full px-2 py-1 bg-white border border-slate-200 hover:border-slate-400 focus:border-blue-500 rounded text-xs text-slate-800 outline-none"
                          />
                          <datalist id={`sub-list-${row.id}`}>
                            {subCustList.map(s => (
                              <option key={s.id} value={s.name}>
                                {s.name} {s.phone ? `(${s.phone})` : ''}
                              </option>
                            ))}
                          </datalist>
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={row.subCustomerName || ''}
                          onChange={e => handleUpdateRow(row.id, { subCustomerName: e.target.value })}
                          placeholder="الزبون الفرعي إن وجد..."
                          className="w-full px-2 py-1 bg-white border border-slate-200 hover:border-slate-400 focus:border-blue-500 rounded text-xs text-slate-800 outline-none"
                        />
                      )}
                    </td>

                    {/* 4. الصنف */}
                    <td className="p-1 border-l border-slate-200">
                      <ItemCellInput
                        value={row.itemName}
                        inventory={inventory}
                        onChange={(name, itemId, itemPrice) => {
                          const updates: Partial<DailyEntryRow> = {
                            itemName: name,
                            itemId: itemId
                          };
                          // If price available and requiredAmount is currently 0, auto-fill it
                          if (itemPrice && Number(row.requiredAmount || 0) === 0) {
                            updates.requiredAmount = itemPrice;
                          }
                          handleUpdateRow(row.id, updates);
                        }}
                      />
                    </td>

                    {/* 5. ملاحظات */}
                    <td className="p-1 border-l border-slate-200">
                      <input
                        type="text"
                        value={row.notes || ''}
                        onChange={e => handleUpdateRow(row.id, { notes: e.target.value })}
                        placeholder="بيان، مقاسات، تفاصيل..."
                        className="w-full px-2 py-1 bg-white border border-slate-200 hover:border-slate-400 focus:border-blue-500 rounded text-xs text-slate-800 outline-none"
                      />
                    </td>

                    {/* 6. المبلغ المطلوب */}
                    <td className="p-1 border-l border-slate-200 text-center">
                      <div className="relative flex items-center">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={row.requiredAmount === 0 ? '' : row.requiredAmount}
                          onChange={e => {
                            const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                            handleUpdateRow(row.id, { requiredAmount: isNaN(val) ? 0 : val });
                          }}
                          placeholder="0.00"
                          className="w-full text-center px-1.5 py-1 bg-white border border-slate-200 hover:border-slate-400 focus:border-blue-500 rounded font-mono font-bold text-slate-900 outline-none"
                        />
                        <span className="text-[10px] text-slate-400 font-mono pl-1 select-none pointer-events-none">₪</span>
                      </div>
                    </td>

                    {/* 7. المدفوع */}
                    <td className="p-1 border-l border-slate-200 text-center">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={row.paidAmount === 0 ? '' : row.paidAmount}
                          onChange={e => {
                            const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                            handleUpdateRow(row.id, { paidAmount: isNaN(val) ? 0 : val });
                          }}
                          placeholder="0.00"
                          className={`w-full text-center px-1 py-1 bg-white border rounded font-mono font-bold outline-none ${
                            isPaidFull
                              ? 'border-emerald-300 text-emerald-800 bg-emerald-50/30'
                              : isPartial
                              ? 'border-amber-300 text-amber-800 bg-amber-50/30'
                              : 'border-slate-200 text-slate-900'
                          }`}
                        />
                        {/* Quick Full-Pay Button */}
                        <button
                          type="button"
                          onClick={() => {
                            handleUpdateRow(row.id, { paidAmount: reqVal });
                          }}
                          disabled={reqVal <= 0}
                          className="px-1.5 py-1 bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-800 rounded text-[10px] font-bold border border-slate-200 transition shrink-0 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed print:hidden"
                          title="تسجيل سداد كامل المبلغ المطلوب"
                        >
                          كامل
                        </button>
                      </div>
                    </td>

                    {/* 8. الصندوق */}
                    <td className="p-1 border-l border-slate-200">
                      <select
                        value={row.treasuryId || defaultTreasury?.id || ''}
                        onChange={e => {
                          const tId = e.target.value;
                          const tObj = treasuries.find(t => t.id === tId);
                          handleUpdateRow(row.id, {
                            treasuryId: tId,
                            treasuryName: tObj?.name || ''
                          });
                        }}
                        onKeyDown={e => {
                          // Pressing Enter or Tab in the last cell of the last row automatically creates a new row!
                          if (e.key === 'Enter' && idx === rows.length - 1) {
                            e.preventDefault();
                            handleAddRow();
                          }
                        }}
                        className="w-full px-1.5 py-1 bg-white border border-slate-200 hover:border-slate-400 focus:border-blue-500 rounded text-xs text-slate-800 outline-none cursor-pointer"
                      >
                        {treasuries.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.currency})
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* 9. إجراءات السطر */}
                    <td className="p-1 text-center print:hidden">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleInsertRowBelow(idx)}
                          className="p-1 text-slate-400 hover:text-blue-600 rounded transition cursor-pointer"
                          title="إدراج سطر أسفل هذا السطر"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(row.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                          title="حذف هذا السطر"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Table Footer with Totals */}
            <tfoot>
              <tr className="bg-slate-100 font-black border-t-2 border-slate-400 text-slate-900 text-xs">
                <td colSpan={5} className="py-2.5 px-3 text-left">
                  الإجمالي العام لكشف اليوم ({selectedDate}):
                </td>
                <td className="py-2.5 px-2 text-center font-mono text-sm text-slate-900">
                  {totals.totalRequired.toFixed(2)} ₪
                </td>
                <td className="py-2.5 px-2 text-center font-mono text-sm text-emerald-800">
                  {totals.totalPaid.toFixed(2)} ₪
                </td>
                <td colSpan={2} className="py-2.5 px-3 text-slate-600 text-[11px]">
                  المتبقي/الآجل: <strong className="font-mono text-rose-700 font-bold">{totals.totalRemaining.toFixed(2)} ₪</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Bottom Bar inside Table */}
        <div className="bg-slate-50 p-2.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs print:hidden">
          <button
            type="button"
            onClick={handleAddRow}
            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة سطر جديد (Enter في آخر صندوق)</span>
          </button>

          <div className="flex items-center gap-3">
            <span className="text-slate-500 text-[11px]">
              ملاحظة: يتم حفظ البيانات تلقائياً، والترحيل ينقل الحركات لشاشة المسودات للاعتماد السريع.
            </span>
          </div>
        </div>
      </div>

      {/* 3. SUMMARY CARDS & TREASURY BREAKDOWN */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 print:hidden">
        {/* Card 1: Total Required */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-500 font-bold block">إجمالي المطلوب (المبيعات)</span>
            <strong className="text-lg font-mono font-black text-slate-900 mt-0.5 block">
              {totals.totalRequired.toLocaleString('ar-SA')} ₪
            </strong>
          </div>
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
            <Coins className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Total Paid */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-500 font-bold block">إجمالي المقبوض (المدفوع)</span>
            <strong className="text-lg font-mono font-black text-emerald-700 mt-0.5 block">
              {totals.totalPaid.toLocaleString('ar-SA')} ₪
            </strong>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <Wallet className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Total Remaining */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-500 font-bold block">إجمالي الآجل (الذمم المتبقية)</span>
            <strong className="text-lg font-mono font-black text-rose-700 mt-0.5 block">
              {totals.totalRemaining.toLocaleString('ar-SA')} ₪
            </strong>
          </div>
          <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Valid Entries Count */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-500 font-bold block">عدد العمليات الصالحة</span>
            <strong className="text-lg font-mono font-black text-slate-900 mt-0.5 block">
              {totals.validRowsCount} <span className="text-xs text-slate-400 font-normal">من {totals.rowsCount}</span>
            </strong>
          </div>
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
            <Layers className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 4. TREASURIES BREAKDOWN BAR */}
      {Object.keys(totals.treasuryBreakdown).length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs print:hidden">
          <div className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-blue-600" />
            <span>توزيع المقبوضات حسب الصناديق والبنوك لليوم:</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {Object.entries(totals.treasuryBreakdown).map(([tKey, tData]) => (
              <div
                key={tKey}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 flex items-center gap-2 text-xs"
              >
                <span className="font-bold text-slate-700">{tData.name}:</span>
                <strong className="font-mono text-emerald-800 font-black">
                  {tData.amount.toFixed(2)} ₪
                </strong>
                <span className="text-[10px] text-slate-400 font-mono">({tData.count} حركات)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. NOTES ON DAILY SHEET */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs print:hidden">
        <label className="text-xs font-bold text-slate-700 block mb-1">
          ملاحظات عامة على كشف يوم العمل ({selectedDate}):
        </label>
        <textarea
          rows={2}
          value={sheetNotes}
          onChange={e => {
            setIsSaved(false);
            setSheetNotes(e.target.value);
          }}
          placeholder="أية ملاحظات إدارية أو توجيهات خاصة بهذا اليوم..."
          className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 outline-none focus:bg-white focus:border-blue-500"
        />
      </div>
    </div>
  );
};

// ==========================================
// SUB-COMPONENTS FOR CELL AUTOCOMPLETES
// ==========================================

const CustomerCellInput: React.FC<{
  value: string;
  parties: Party[];
  onChange: (customerName: string, customerId?: string) => void;
}> = ({ value, parties, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filteredParties = useMemo(() => {
    const q = normalizeArabicText(value);
    if (!q) return parties.filter(p => p.type === 'customer' || p.type === 'both').slice(0, 15);
    return parties
      .filter(p => p.type === 'customer' || p.type === 'both')
      .filter(p => {
        const pNorm = normalizeArabicText(p.name);
        const codeNorm = normalizeArabicText(p.code || '');
        const phoneNorm = normalizeArabicText(p.phone || '');
        return pNorm.includes(q) || codeNorm.includes(q) || phoneNorm.includes(q);
      })
      .slice(0, 15);
  }, [parties, value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative w-full">
      <input
        type="text"
        value={value}
        onFocus={() => setIsOpen(true)}
        onChange={e => {
          onChange(e.target.value, undefined);
          setIsOpen(true);
        }}
        placeholder="ابحث أو اكتب اسم الزبون..."
        className="w-full px-2 py-1 bg-white border border-slate-200 hover:border-slate-400 focus:border-blue-500 rounded text-xs font-bold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400"
      />

      {isOpen && (
        <div className="absolute top-full right-0 w-64 bg-white border border-blue-400 rounded-xl shadow-xl z-50 max-h-56 overflow-y-auto p-1 font-sans text-right mt-1">
          <div className="text-[10px] font-bold text-slate-500 px-2 py-1 bg-slate-50 rounded-t flex justify-between">
            <span>العملاء المقترحون ({filteredParties.length}):</span>
          </div>
          {filteredParties.length === 0 ? (
            <div className="p-2 text-center text-[11px] text-slate-400">
              زبون جديد (سيتم إدراجه كاسم مباشر)
            </div>
          ) : (
            filteredParties.map((p, idx) => (
              <button
                key={`cust-${p.id || idx}`}
                type="button"
                onClick={() => {
                  onChange(p.name, p.id);
                  setIsOpen(false);
                }}
                className="w-full text-right p-1.5 hover:bg-blue-50 rounded-lg flex items-center justify-between text-xs border-b border-slate-100 last:border-0 cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-slate-900 block truncate">{p.name}</span>
                  {p.phone && <span className="text-[10px] text-slate-400 font-mono">{p.phone}</span>}
                </div>
                {p.subCustomers && p.subCustomers.length > 0 && (
                  <span className="text-[9px] bg-slate-100 text-slate-600 px-1 py-0.5 rounded font-bold shrink-0">
                    {p.subCustomers.length} فروع
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

const ItemCellInput: React.FC<{
  value: string;
  inventory: InventoryItem[];
  onChange: (itemName: string, itemId?: string, itemPrice?: number) => void;
}> = ({ value, inventory, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filteredItems = useMemo(() => {
    const q = normalizeArabicText(value);
    if (!q) return inventory.slice(0, 15);
    return inventory
      .filter(i => {
        const nameNorm = normalizeArabicText(i.name);
        const codeNorm = normalizeArabicText(i.code);
        return nameNorm.includes(q) || codeNorm.includes(q);
      })
      .slice(0, 15);
  }, [inventory, value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative w-full">
      <input
        type="text"
        value={value}
        onFocus={() => setIsOpen(true)}
        onChange={e => {
          onChange(e.target.value, undefined, undefined);
          setIsOpen(true);
        }}
        placeholder="الصنف أو الخدمة..."
        className="w-full px-2 py-1 bg-white border border-slate-200 hover:border-slate-400 focus:border-blue-500 rounded text-xs font-bold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400"
      />

      {isOpen && (
        <div className="absolute top-full right-0 w-64 bg-white border border-blue-400 rounded-xl shadow-xl z-50 max-h-56 overflow-y-auto p-1 font-sans text-right mt-1">
          <div className="text-[10px] font-bold text-slate-500 px-2 py-1 bg-slate-50 rounded-t flex justify-between">
            <span>الأصناف المتوفرة ({filteredItems.length}):</span>
          </div>
          {filteredItems.length === 0 ? (
            <div className="p-2 text-center text-[11px] text-slate-400">
              صنف/خدمة مخصصة جديدة
            </div>
          ) : (
            filteredItems.map((inv, idx) => (
              <button
                key={`item-${inv.id || idx}`}
                type="button"
                onClick={() => {
                  onChange(inv.name, inv.id, inv.sellingPrice);
                  setIsOpen(false);
                }}
                className="w-full text-right p-1.5 hover:bg-blue-50 rounded-lg flex items-center justify-between text-xs border-b border-slate-100 last:border-0 cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-slate-900 block truncate">{inv.name}</span>
                  <span className="text-[10px] text-slate-400 font-mono">{inv.code}</span>
                </div>
                <div className="text-left font-mono font-bold text-emerald-700 text-xs shrink-0">
                  {inv.sellingPrice} ₪
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};
