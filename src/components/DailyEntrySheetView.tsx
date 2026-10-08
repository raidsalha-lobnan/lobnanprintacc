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
  X,
  Link2,
  ArrowDownToLine,
  Lock,
  ExternalLink
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
    dailyEntrySheets,
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
  }, [selectedDate, dailyEntrySheets]);

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

  // Helper to find the treasury from the preceding row or closest previous row with a treasury
  const getPrecedingTreasury = (beforeIndex: number, currentRows: DailyEntryRow[]) => {
    for (let i = beforeIndex - 1; i >= 0; i--) {
      if (currentRows[i]?.treasuryId) {
        return {
          id: currentRows[i].treasuryId,
          name: currentRows[i].treasuryName || ''
        };
      }
    }
    return {
      id: defaultTreasury?.id || '',
      name: defaultTreasury?.name || ''
    };
  };

  // Handle changing cell values with automatic inheritance and cascading
  const handleUpdateRow = (rowId: string, updates: Partial<DailyEntryRow>) => {
    setIsSaved(false);
    setRows(prev => {
      const rowIndex = prev.findIndex(r => r.id === rowId);
      if (rowIndex === -1) return prev;

      // 1. If treasury was explicitly changed on this row:
      if (updates.treasuryId) {
        return prev.map((r, i) => {
          if (r.id === rowId) {
            return { ...r, ...updates };
          }
          // Automatically propagate to all subsequent rows that are empty / not yet filled
          if (i > rowIndex) {
            const isRowEmpty = (!r.customerName || !r.customerName.trim()) &&
                               (!r.itemName || !r.itemName.trim()) &&
                               (!r.requiredAmount || Number(r.requiredAmount) === 0) &&
                               (!r.paidAmount || Number(r.paidAmount) === 0);
            if (isRowEmpty) {
              return {
                ...r,
                treasuryId: updates.treasuryId!,
                treasuryName: updates.treasuryName || ''
              };
            }
          }
          return r;
        });
      }

      // 2. If entering data into a row (idx > 0) that still has the default/empty treasury,
      // automatically inherit what was selected in the preceding row!
      if (rowIndex > 0 && !updates.treasuryId) {
        const preceding = getPrecedingTreasury(rowIndex, prev);
        const currentRow = prev[rowIndex];
        if (preceding.id && (!currentRow.treasuryId || currentRow.treasuryId === defaultTreasury?.id)) {
          updates.treasuryId = preceding.id;
          updates.treasuryName = preceding.name;
        }
      }

      return prev.map(r => {
        if (r.id !== rowId) return r;
        return { ...r, ...updates };
      });
    });
  };

  // Helper to recalculate serial numbers keeping the exact same serial for all items of the same customer
  const recalculateSerialNumbers = (currentRows: DailyEntryRow[]): DailyEntryRow[] => {
    let seq = 0;
    let prevRow: DailyEntryRow | null = null;

    return currentRows.map((r, idx) => {
      const isContinuation = idx > 0 && Boolean(r.isAdditionalItem);
      if (!isContinuation) {
        seq += 1;
      }
      const assignedSerial = isContinuation && prevRow ? prevRow.serialNumber : seq;
      const updated: DailyEntryRow = {
        ...r,
        serialNumber: assignedSerial
      };
      prevRow = updated;
      return updated;
    });
  };

  // Helper to find customer group info for a specific row index
  const getRowCustomerGroupInfo = (rowIndex: number, currentRows: DailyEntryRow[]) => {
    const currentRow = currentRows[rowIndex];
    if (!currentRow) {
      return {
        isMultiItem: false,
        isLast: true,
        itemIndexInGroup: 0,
        groupCount: 1,
        totalGroupRequired: 0,
        lastItemOfGroup: currentRow
      };
    }

    const targetSerial = currentRow.serialNumber;
    const groupIndices: number[] = [];
    currentRows.forEach((r, idx) => {
      if (r.serialNumber === targetSerial) {
        groupIndices.push(idx);
      }
    });

    const isMultiItem = groupIndices.length > 1;
    const isLast = groupIndices[groupIndices.length - 1] === rowIndex;
    const itemIndexInGroup = groupIndices.indexOf(rowIndex);
    const totalGroupRequired = groupIndices.reduce((sum, i) => sum + Number(currentRows[i]?.requiredAmount || 0), 0);
    const lastItemOfGroup = currentRows[groupIndices[groupIndices.length - 1]];

    return {
      isMultiItem,
      isLast,
      itemIndexInGroup,
      groupCount: groupIndices.length,
      totalGroupRequired,
      lastItemOfGroup
    };
  };

  // Add sub-item for the SAME customer in the same invoice (زر + في الزاوية السفلية لاسم الصنف)
  // وظيفة هذا الزر: إضافة أكثر من صنف لنفس الزبون، تجميع المبالغ، تجميد آلية الدفع واعتمادها لآخر بند فقط، ونفس الرقم المتسلسل
  const handleAddCustomerSubItem = (index: number) => {
    setIsSaved(false);
    setRows(prev => {
      const parent = prev[index];
      if (!parent) return prev;

      const targetSerial = parent.serialNumber;
      // Find the last row in this customer group
      let lastGroupIdx = index;
      for (let i = index; i < prev.length; i++) {
        if (prev[i].serialNumber === targetSerial) {
          lastGroupIdx = i;
        } else {
          break;
        }
      }

      const lastRow = prev[lastGroupIdx];
      // Create new sub-item row for the same customer
      const newSubRow: DailyEntryRow = {
        id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        serialNumber: targetSerial, // نفس الرقم المتسلسل للزبون دون تجديد التسلسل!
        customerId: parent.customerId,
        customerName: parent.customerName || '',
        subCustomerId: parent.subCustomerId,
        subCustomerName: parent.subCustomerName || '',
        itemName: '',
        itemId: undefined,
        notes: '',
        requiredAmount: 0,
        paidAmount: lastRow.paidAmount || 0, // آلية الدفع تنتقل وتعتمد لآخر بند
        treasuryId: lastRow.treasuryId || parent.treasuryId,
        treasuryName: lastRow.treasuryName || parent.treasuryName,
        parentRowId: parent.parentRowId || parent.id,
        isAdditionalItem: true,
        isApproved: false
      };

      // تجمد آلية الدفع في الأسطر السابقة لنفس الزبون (قيمة المدفوع تصبح 0 وتجمد لتعمل فقط في آخر بند)
      const updatedPrev = prev.map((r, i) => {
        if (r.serialNumber === targetSerial) {
          return {
            ...r,
            paidAmount: 0
          };
        }
        return r;
      });

      const nextRows = [
        ...updatedPrev.slice(0, lastGroupIdx + 1),
        newSubRow,
        ...updatedPrev.slice(lastGroupIdx + 1)
      ];

      return recalculateSerialNumbers(nextRows);
    });

    posSound.beep(1100, 0.05);
    setStatusMessage({
      type: 'info',
      text: `تمت إضافة بند جديد لنفس الزبون بنفس الرقم المتسلسل! آلية الدفع تعتمد بآخر بند.`
    });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  // Helper to update customer name across the whole customer group
  const handleUpdateCustomerForGroup = (serialNumber: number, customerName: string, customerId?: string) => {
    setIsSaved(false);
    setRows(prev => prev.map(r => {
      if (r.serialNumber === serialNumber) {
        return {
          ...r,
          customerName,
          customerId
        };
      }
      return r;
    }));
  };

  // Helper to update subCustomer name across the whole customer group
  const handleUpdateSubCustomerForGroup = (serialNumber: number, subCustomerName: string, subCustomerId?: string) => {
    setIsSaved(false);
    setRows(prev => prev.map(r => {
      if (r.serialNumber === serialNumber) {
        return {
          ...r,
          subCustomerName,
          subCustomerId
        };
      }
      return r;
    }));
  };

  // Helper to update treasury across the customer group
  const handleUpdateTreasuryForGroup = (serialNumber: number, treasuryId: string, treasuryName: string) => {
    setIsSaved(false);
    setRows(prev => prev.map(r => {
      if (r.serialNumber === serialNumber) {
        return {
          ...r,
          treasuryId,
          treasuryName
        };
      }
      return r;
    }));
  };

  // Add a new row at the end - automatically inherits what was selected in the row before it
  const handleAddRow = () => {
    setIsSaved(false);
    setRows(prev => {
      const nextSerial = prev.length > 0 ? Math.max(...prev.map(r => r.serialNumber || 0)) + 1 : 1;
      const preceding = getPrecedingTreasury(prev.length, prev);
      const newRow = createEmptyDailyEntryRow(nextSerial, preceding.id, preceding.name);
      return recalculateSerialNumbers([...prev, newRow]);
    });
  };

  // Insert a row directly below an existing row - inherits from the row directly above it
  const handleInsertRowBelow = (index: number) => {
    setIsSaved(false);
    setRows(prev => {
      const current = prev[index];
      const preceding = (current?.treasuryId)
        ? { id: current.treasuryId, name: current.treasuryName || '' }
        : getPrecedingTreasury(index + 1, prev);
      const newRow = createEmptyDailyEntryRow(
        index + 2,
        preceding.id,
        preceding.name
      );
      const next = [...prev.slice(0, index + 1), newRow, ...prev.slice(index + 1)];
      return recalculateSerialNumbers(next);
    });
  };

  // Apply a row's treasury to all rows below it with confirmation toast
  const handleApplyTreasuryToSubsequent = (fromIndex: number) => {
    const sourceRow = rows[fromIndex];
    if (!sourceRow || !sourceRow.treasuryId) return;

    setIsSaved(false);
    setRows(prev => prev.map((r, i) => {
      if (i >= fromIndex) {
        return {
          ...r,
          treasuryId: sourceRow.treasuryId,
          treasuryName: sourceRow.treasuryName || ''
        };
      }
      return r;
    }));

    setStatusMessage({
      type: 'info',
      text: `تم تعميم "${sourceRow.treasuryName || 'الصندوق المحدد'}" على كافة الأسطر التالية بنجاح.`
    });
    setTimeout(() => setStatusMessage(null), 2500);
  };

  // Deletion Confirmation States
  const [rowToDelete, setRowToDelete] = useState<DailyEntryRow | null>(null);
  const [showDeleteDayConfirm, setShowDeleteDayConfirm] = useState<boolean>(false);

  // Prompt row deletion with confirmation
  const promptDeleteRow = (row: DailyEntryRow) => {
    setRowToDelete(row);
  };

  // Execute row deletion after confirmation
  const executeDeleteRow = (rowId: string) => {
    setIsSaved(false);
    setRows(prev => {
      const filtered = prev.filter(r => r.id !== rowId);
      if (filtered.length === 0) {
        return [createEmptyDailyEntryRow(1, defaultTreasury?.id, defaultTreasury?.name)];
      }
      return recalculateSerialNumbers(filtered);
    });
    setRowToDelete(null);
    setStatusMessage({
      type: 'info',
      text: 'تم حذف السطر بنجاح.'
    });
    setTimeout(() => setStatusMessage(null), 2500);
  };

  // Delete entire day sheet with confirmation
  const executeDeleteDaySheet = () => {
    deleteDailyEntrySheet(selectedDate);
    const initialRows: DailyEntryRow[] = [
      createEmptyDailyEntryRow(1, defaultTreasury?.id, defaultTreasury?.name),
      createEmptyDailyEntryRow(2, defaultTreasury?.id, defaultTreasury?.name),
      createEmptyDailyEntryRow(3, defaultTreasury?.id, defaultTreasury?.name),
      createEmptyDailyEntryRow(4, defaultTreasury?.id, defaultTreasury?.name),
      createEmptyDailyEntryRow(5, defaultTreasury?.id, defaultTreasury?.name)
    ];
    setRows(initialRows);
    setSheetNotes('');
    setIsSaved(true);
    setShowDeleteDayConfirm(false);
    setStatusMessage({
      type: 'success',
      text: `تم حذف كشف الإدخال اليومي لتاريخ ${selectedDate} بالكامل.`
    });
    setTimeout(() => setStatusMessage(null), 3000);
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
      return recalculateSerialNumbers(filtered);
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

  // Transfer this day's entries directly to Drafts screen in dedicated invoice review mode
  const handleTransferToDrafts = () => {
    // 1. First save current sheet
    saveDailyEntrySheet(selectedDate, rows, sheetNotes);
    setIsSaved(true);

    // 2. Convert to multi drafts (with multi-item customer grouping)
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

    // 3. Load existing drafts from localStorage and prepend
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MULTI_DRAFTS);
      const existingDrafts = saved ? JSON.parse(saved) : [];
      // Combine: Put new drafts first so the user starts with the first new invoice
      const combined = [...newDrafts, ...existingDrafts.filter((d: any) => !newDrafts.some(n => n.id === d.id))];
      localStorage.setItem(STORAGE_KEY_MULTI_DRAFTS, JSON.stringify(combined));

      // Set flags to open directly in dedicated_invoice review mode at index 0
      localStorage.setItem('accounting_drafts_open_dedicated', 'true');
      localStorage.setItem('accounting_drafts_active_index', '0');
    } catch (err) {
      console.error('Failed to merge drafts:', err);
    }

    posSound.cash();
    setStatusMessage({
      type: 'success',
      text: `تم ترحيل ${newDrafts.length} فاتورة بنجاح! جاري الانتقال لشاشة مراجعة واعتماد الفواتير الفردية...`
    });

    // 4. Navigate to excel_drafts
    setTimeout(() => {
      setActiveTab('excel_drafts');
    }, 700);
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
              title="ترحيل حركات كشف اليوم كمسودات فواتير والانتقال لشاشة مراجعة واعتماد الفواتير بالتتابع"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {totals.pendingCount > 0
                  ? `ترحيل إلى مسودات الفواتير (${totals.pendingCount}) 🚀`
                  : totals.validRowsCount > 0 && totals.approvedCount === totals.validRowsCount
                  ? 'كافة الفواتير معتمدة ومحفوظة ✔'
                  : 'ترحيل إلى مسودات الفواتير 🚀'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowDeleteDayConfirm(true)}
              disabled={!recordedDates.includes(selectedDate) && rows.every(r => !r.customerName && !r.itemName && Number(r.requiredAmount) === 0)}
              className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="حذف كشف هذا اليوم بالكامل مع تأكيد الحذف"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>حذف كشف اليوم</span>
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

      {/* APPROVED ROWS HIGHLIGHT BANNER */}
      {totals.approvedCount > 0 && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-2.5 px-3.5 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-emerald-950 shadow-2xs print:hidden">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              تم اعتماد وحفظ <strong className="font-mono text-emerald-800 text-sm font-black">{totals.approvedCount}</strong> أسطر كفواتير مبيعات رسمية (مظللة باللون الأخضر المميز)
              {totals.pendingCount > 0 && (
                <span className="text-slate-600 font-normal mr-2">
                  (يتبقى <strong className="font-mono text-slate-800 font-bold">{totals.pendingCount}</strong> بانتظار الاعتماد)
                </span>
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('invoices')}
            className="text-emerald-800 hover:text-emerald-950 underline flex items-center gap-1 text-xs cursor-pointer font-black"
          >
            <span>عرض الفواتير المعتمدة ➔</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

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
                <th className="py-2 px-2.5 w-44 border-l border-slate-200">
                  <div className="flex items-center justify-between">
                    <span>الصندوق</span>
                    <span className="text-[9px] font-normal text-blue-700 bg-blue-50 border border-blue-200 px-1 py-0.5 rounded flex items-center gap-0.5" title="يرتبط تلقائياً بالسطر السابق، والسطر الجديد يرث ما اختير في السطر الذي قبله">
                      <Link2 className="w-2.5 h-2.5" />
                      <span>يرث السابق</span>
                    </span>
                  </div>
                </th>
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

                const groupInfo = getRowCustomerGroupInfo(idx, rows);
                const isApproved = Boolean(row.isApproved);

                return (
                  <tr
                    key={row.id}
                    className={`transition-colors ${
                      isApproved
                        ? 'bg-emerald-50/90 border-r-4 border-r-emerald-600 hover:bg-emerald-100/70 shadow-2xs text-slate-900'
                        : row.isAdditionalItem
                        ? 'bg-indigo-50/20 hover:bg-indigo-50/40 border-r-4 border-r-indigo-400'
                        : idx % 2 === 0
                        ? 'bg-white'
                        : 'bg-slate-50/50'
                    }`}
                  >
                    {/* 1. رقم مسلسل (مشترك لكافة أصناف نفس الزبون دون تجديد) */}
                    <td className="py-1 px-1 text-center font-mono font-bold text-slate-700 border-l border-slate-200">
                      <div className="flex flex-col items-center justify-center">
                        <span className="font-black text-xs text-slate-800">{row.serialNumber}</span>
                        {row.isAdditionalItem && (
                          <span className="text-[8.5px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1 rounded-sm mt-0.5" title="صنف إضافي لنفس الزبون">
                            تابع
                          </span>
                        )}
                        {isApproved && (
                          <span className="mt-0.5 px-1 py-0.2 rounded text-[8px] font-black bg-emerald-600 text-white flex items-center gap-0.5 shadow-2xs" title={`معتمد بالفاتورة: ${row.approvedInvoiceNumber || ''}`}>
                            <Check className="w-2 h-2" />
                            <span>معتمد</span>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 2. اسم الزبون الرئيسي */}
                    <td className="p-1 border-l border-slate-200">
                      <div className="relative">
                        <CustomerCellInput
                          value={row.customerName}
                          parties={parties}
                          onChange={(name, custId) => {
                            if (groupInfo.isMultiItem) {
                              handleUpdateCustomerForGroup(row.serialNumber, name, custId);
                            } else {
                              handleUpdateRow(row.id, {
                                customerName: name,
                                customerId: custId
                              });
                            }
                          }}
                        />
                        {row.isAdditionalItem && (
                          <div className="text-[8.5px] text-indigo-600 font-bold px-1 mt-0.5 flex items-center gap-0.5">
                            <span>نفس الزبون (مسلسل #{row.serialNumber})</span>
                          </div>
                        )}
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
                            onChange={e => {
                              if (groupInfo.isMultiItem) {
                                handleUpdateSubCustomerForGroup(row.serialNumber, e.target.value);
                              } else {
                                handleUpdateRow(row.id, { subCustomerName: e.target.value });
                              }
                            }}
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
                          onChange={e => {
                            if (groupInfo.isMultiItem) {
                              handleUpdateSubCustomerForGroup(row.serialNumber, e.target.value);
                            } else {
                              handleUpdateRow(row.id, { subCustomerName: e.target.value });
                            }
                          }}
                          placeholder="الزبون الفرعي إن وجد..."
                          className="w-full px-2 py-1 bg-white border border-slate-200 hover:border-slate-400 focus:border-blue-500 rounded text-xs text-slate-800 outline-none"
                        />
                      )}
                    </td>

                    {/* 4. الصنف + زر (+) في الزاوية السفلية لإضافة صنف آخر لنفس الزبون */}
                    <td className="p-1 border-l border-slate-200">
                      <div className="flex flex-col gap-1">
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
                        {/* زر + في الزاوية السفلية لاسم الصنف في البنود */}
                        <div className="flex items-center justify-between text-[10px] px-0.5 print:hidden">
                          <button
                            type="button"
                            onClick={() => handleAddCustomerSubItem(idx)}
                            className="px-1.5 py-0.5 rounded text-[9.5px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200/90 flex items-center gap-1 transition shadow-2xs cursor-pointer active:scale-95"
                            title="إضافة صنف آخر لنفس الزبون (نفس الفاتورة والمسلسل، تجميع المبالغ، وتعتمد آلية الدفع بآخر بند)"
                          >
                            <Plus className="w-2.5 h-2.5 text-blue-600 stroke-[3]" />
                            <span>+ صنف لنفس الزبون</span>
                          </button>
                          {groupInfo.isMultiItem && (
                            <span className="text-[9px] text-slate-500 font-medium">
                              بند {groupInfo.itemIndexInGroup + 1} من {groupInfo.groupCount}
                            </span>
                          )}
                        </div>
                      </div>
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

                    {/* 6. المبلغ المطلوب (يجمع لكافة بنود نفس الزبون) */}
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
                      {groupInfo.isMultiItem && groupInfo.isLast && (
                        <div className="text-[9px] text-blue-700 font-bold mt-0.5 bg-blue-50 border border-blue-200/60 rounded px-1 py-0.2" title="إجمالي المطلوب لكافة بنود هذا الزبون في هذه الفاتورة">
                          مجموع: {groupInfo.totalGroupRequired.toFixed(2)} ₪
                        </div>
                      )}
                    </td>

                    {/* 7. المدفوع (يجمد في الأسطر السابقة ويعتمد في آخر بند لنفس الزبون فقط) */}
                    <td className="p-1 border-l border-slate-200 text-center">
                      {groupInfo.isMultiItem && !groupInfo.isLast ? (
                        <div
                          className="w-full text-center px-1 py-1 bg-slate-100 text-slate-400 border border-slate-200 rounded font-mono text-[10.5px] flex items-center justify-center gap-1 cursor-not-allowed select-none"
                          title="آلية الدفع مجمدة تلقائياً: تعتمد وتحدد في آخر بند لنفس الزبون لتغطية إجمالي الفاتورة"
                        >
                          <Lock className="w-2.5 h-2.5 text-slate-400" />
                          <span>يعتمد بآخر بند</span>
                        </div>
                      ) : (
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
                            onKeyDown={e => {
                              if (e.key === 'Enter' && idx === rows.length - 1) {
                                e.preventDefault();
                                handleAddRow();
                              }
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
                              handleUpdateRow(row.id, { paidAmount: groupInfo.totalGroupRequired });
                            }}
                            disabled={groupInfo.totalGroupRequired <= 0}
                            className="px-1.5 py-1 bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-800 rounded text-[10px] font-bold border border-slate-200 transition shrink-0 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed print:hidden"
                            title="تسجيل سداد كامل المبلغ المطلوب للفاتورة"
                          >
                            كامل
                          </button>
                        </div>
                      )}
                    </td>

                    {/* 8. الصندوق (يجمد في الأسطر السابقة ويعتمد في آخر بند لنفس الزبون) */}
                    <td className="p-1 border-l border-slate-200">
                      {groupInfo.isMultiItem && !groupInfo.isLast ? (
                        <div
                          className="w-full px-1.5 py-1 bg-slate-100 text-slate-500 border border-slate-200 rounded text-xs truncate flex items-center justify-between cursor-not-allowed select-none"
                          title="الصندوق موحد لكافة بنود نفس الزبون ويعتمد من آخر بند"
                        >
                          <span className="truncate text-[11px] font-medium">{groupInfo.lastItemOfGroup?.treasuryName || 'موحد مع الأخير'}</span>
                          <Lock className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <select
                            value={row.treasuryId || defaultTreasury?.id || ''}
                            onChange={e => {
                              const tId = e.target.value;
                              const tObj = treasuries.find(t => t.id === tId);
                              if (groupInfo.isMultiItem) {
                                handleUpdateTreasuryForGroup(row.serialNumber, tId, tObj?.name || '');
                              } else {
                                handleUpdateRow(row.id, {
                                  treasuryId: tId,
                                  treasuryName: tObj?.name || ''
                                });
                              }
                            }}
                            onKeyDown={e => {
                              // Pressing Enter in the last cell of the last row automatically creates a new row!
                              if (e.key === 'Enter' && idx === rows.length - 1) {
                                e.preventDefault();
                                handleAddRow();
                              }
                            }}
                            className="w-full px-1.5 py-1 bg-white border border-slate-200 hover:border-slate-400 focus:border-blue-500 rounded text-xs text-slate-800 outline-none cursor-pointer"
                            title="اختيار الصندوق أو الخزنة (يرثه السطر التالي والجديد تلقائياً)"
                          >
                            {treasuries.map(t => (
                              <option key={t.id} value={t.id}>
                                {t.name} ({t.currency})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleApplyTreasuryToSubsequent(idx)}
                            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition shrink-0 cursor-pointer print:hidden"
                            title="تعميم هذا الصندوق تلقائياً على هذا السطر وكافة الأسطر التالية"
                          >
                            <ArrowDownToLine className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* 9. إجراءات السطر */}
                    <td className="p-1 text-center print:hidden">
                      <div className="flex items-center justify-center gap-1">
                        {isApproved && (
                          <button
                            type="button"
                            onClick={() => setActiveTab('invoices')}
                            className="p-1 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100 rounded transition cursor-pointer"
                            title={`عرض الفاتورة المعتمدة (${row.approvedInvoiceNumber || ''}) في قائمة الفواتير`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleInsertRowBelow(idx)}
                          className="p-1 text-slate-400 hover:text-blue-600 rounded transition cursor-pointer"
                          title="إدراج سطر عادي جديد أسفل هذا السطر"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => promptDeleteRow(row)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                          title="حذف هذا السطر مع تأكيد الحذف"
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
            <span>إضافة سطر جديد (يرث الصندوق تلقائياً)</span>
          </button>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-[11px] text-slate-600">
            <span className="flex items-center gap-1.5 font-medium">
              <Plus className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>زر <strong>(+ صنف لنفس الزبون)</strong> أسفل اسم الصنف يضيف أصناف لنفس الزبون بنفس المسلسل، مع تجميع المبالغ وتجميد الدفع لآخر بند.</span>
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>الأسطر المعتمدة تظلل بلون أخضر مميز فور اعتماد الفاتورة.</span>
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

        {/* Card 4: Approval Status */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-500 font-bold block">حالة الاعتماد والفواتير</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <strong className="text-lg font-mono font-black text-emerald-700">
                {totals.approvedCount} معتمد
              </strong>
              <span className="text-xs text-slate-400 font-bold">
                ({totals.pendingCount} معلق)
              </span>
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-5 h-5" />
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
            {(Object.entries(totals.treasuryBreakdown) as [string, { name: string; amount: number; count: number }][]).map(([tKey, tData]) => (
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

      {/* 6. CONFIRM DELETE ROW MODAL */}
      {rowToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95" dir="rtl">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-sm">تأكيد حذف السطر</h3>
                <p className="text-xs text-slate-500 font-bold">السطر رقم {rowToDelete.serialNumber}</p>
              </div>
            </div>
            
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              هل أنت متأكد من رغبتك في حذف هذا السطر
              {rowToDelete.customerName ? ` الخاص بالزبون (${rowToDelete.customerName})` : ''}
              {rowToDelete.itemName ? ` والصنف (${rowToDelete.itemName})` : ''}
              {Number(rowToDelete.requiredAmount) > 0 ? ` بمبلغ (${Number(rowToDelete.requiredAmount).toFixed(2)} ₪)` : ''}
              ؟ لا يمكن التراجع عن هذه العملية بعد التأكيد.
            </p>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRowToDelete(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => executeDeleteRow(rowToDelete.id)}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-xs transition cursor-pointer"
              >
                نعم، تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. CONFIRM DELETE ENTIRE DAY SHEET MODAL */}
      {showDeleteDayConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95" dir="rtl">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-sm">تأكيد حذف كشف اليوم بالكامل</h3>
                <p className="text-xs text-slate-500 font-mono font-bold">تاريخ: {selectedDate}</p>
              </div>
            </div>
            
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              هل أنت متأكد من حذف كشف الإدخال اليومي ليوم ({selectedDate}) بالكامل؟ سيتم مسح جميع الحركات والأسطر المسجلة لهذا اليوم نهائياً.
            </p>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteDayConfirm(false)}
                className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={executeDeleteDaySheet}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-xs transition cursor-pointer"
              >
                نعم، تأكيد الحذف النهائي
              </button>
            </div>
          </div>
        </div>
      )}
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
