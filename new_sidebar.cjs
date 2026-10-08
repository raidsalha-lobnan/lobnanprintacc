const fs = require('fs');
const file = 'src/components/pos/PosDailyInvoicesSidebar.tsx';

const newContent = `import React, { useState, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { Invoice, PosInvoiceWorkflowStatus, PaymentMethod, Treasury } from '../../types';
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Banknote,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  Printer,
  Edit3,
  Coins,
  ArrowDownLeft,
  X,
  Check,
  Building,
  User,
  Plus,
  History,
  Calendar
} from 'lucide-react';
import { InvoiceStatusHistoryModal } from './InvoiceStatusHistoryModal';
import { posSound } from '../../utils/audio';
import {
  WORKFLOW_STATUS_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  getInvoiceWorkflowStatusMeta,
  getInvoicePaymentStatusMeta,
  computeInvoicePaymentStatus,
  isInvoiceAccountingEligible
} from '../../utils/invoiceStatusUtils';

export type DailyInvoiceFilterTab =
  | 'all'
  | 'new'
  | 'quotation'
  | 'design'
  | 'pending_approval'
  | 'print_external'
  | 'print_internal'
  | 'ready'
  | 'delivered'
  | 'other'
  | 'paid'
  | 'unpaid_or_credit';

interface PosDailyInvoicesSidebarProps {
  onSelectInvoiceToLoad: (inv: Invoice) => void;
  onPrintInvoice: (inv: Invoice) => void;
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
}

export const PosDailyInvoicesSidebar: React.FC<PosDailyInvoicesSidebarProps> = ({
  onSelectInvoiceToLoad,
  onPrintInvoice,
  isOpen = true,
  onClose,
  className = ''
}) => {
  const {
    invoices,
    updateInvoice,
    createPaymentVoucher,
    treasuries,
    currencies,
    settings
  } = useAccounting();

  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [activeFilterTab, setActiveFilterTab] = useState<DailyInvoiceFilterTab>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Additional Collection Modal State
  const [collectingInvoice, setCollectingInvoice] = useState<Invoice | null>(null);
  const [collectionAmount, setCollectionAmount] = useState<string>('');
  const [collectionMethod, setCollectionMethod] = useState<'cash' | 'bank_transfer'>('cash');
  const [collectionCurrencyCode, setCollectionCurrencyCode] = useState<string>(settings.baseCurrencyCode || 'ILS');
  const [collectionTreasuryCode, setCollectionTreasuryCode] = useState<string>('1101');
  const [collectionNotes, setCollectionNotes] = useState<string>('');
  const [isSuccessMessage, setIsSuccessMessage] = useState<string>('');

  // Status Change Modal / Popover
  const [statusChangingInvoice, setStatusChangingInvoice] = useState<Invoice | null>(null);
  const [targetStatusForModal, setTargetStatusForModal] = useState<PosInvoiceWorkflowStatus | undefined>(undefined);

  const handleOpenStatusModal = (inv: Invoice, targetStatus?: PosInvoiceWorkflowStatus) => {
    setStatusChangingInvoice(inv);
    setTargetStatusForModal(targetStatus);
  };

  const todayInvoices = useMemo(() => {
    return invoices
      .filter(inv => inv.date === selectedDate)
      .sort((a, b) => (b.invoiceNumber || '').localeCompare(a.invoiceNumber || ''));
  }, [invoices, selectedDate]);

  // Tab counters
  const counts = useMemo(() => {
    const res: Record<DailyInvoiceFilterTab, number> = {
      all: todayInvoices.length,
      new: 0,
      quotation: 0,
      design: 0,
      pending_approval: 0,
      print_external: 0,
      print_internal: 0,
      ready: 0,
      delivered: 0,
      other: 0,
      paid: 0,
      unpaid_or_credit: 0
    };

    todayInvoices.forEach(inv => {
      const wf = inv.workflowStatus || 'new';
      
      const pStatus = inv.paymentStatus || computeInvoicePaymentStatus({
        paymentMethod: inv.paymentMethod,
        totalAmount: inv.totalAmount,
        paidAmount: inv.paidAmount,
        remainingAmount: inv.remainingAmount,
        cashPaidAmount: inv.cashPaidAmount,
        bankPaidAmount: inv.bankPaidAmount
      });
      const isPaid = pStatus === 'paid_cash' || pStatus === 'paid_bank' || pStatus === 'paid_cash_bank' || (inv.remainingAmount <= 0 && inv.paidAmount > 0);
      
      if (isPaid) {
        res.paid++;
      } else {
        res.unpaid_or_credit++;
      }

      if (wf === 'new') res.new++;
      else if (wf === 'quotation') res.quotation++;
      else if (wf === 'design' || wf === 'in_progress_design') res.design++;
      else if (wf === 'pending_approval') res.pending_approval++;
      else if (wf === 'print_external' || wf === 'in_progress_external') res.print_external++;
      else if (wf === 'print_internal' || wf === 'in_progress_internal' || wf === 'in_progress') res.print_internal++;
      else if (wf === 'ready') res.ready++;
      else if (wf === 'delivered') res.delivered++;
      else res.other++;
    });

    return res;
  }, [todayInvoices]);

  const filteredInvoices = useMemo(() => {
    return todayInvoices.filter(inv => {
      // Search
      if (searchQuery) {
        const lowerQ = searchQuery.toLowerCase();
        const matches = 
          inv.invoiceNumber?.toLowerCase().includes(lowerQ) ||
          inv.customerName?.toLowerCase().includes(lowerQ) ||
          inv.subCustomerName?.toLowerCase().includes(lowerQ) ||
          inv.totalAmount.toString().includes(lowerQ);
        if (!matches) return false;
      }

      // Tabs
      const wf = inv.workflowStatus || 'new';
      switch (activeFilterTab) {
        case 'new':
          return wf === 'new';
        case 'quotation':
          return wf === 'quotation';
        case 'design':
          return wf === 'design' || wf === 'in_progress_design';
        case 'pending_approval':
          return wf === 'pending_approval';
        case 'print_external':
          return wf === 'print_external' || wf === 'in_progress_external';
        case 'print_internal':
          return wf === 'print_internal' || wf === 'in_progress_internal' || wf === 'in_progress';
        case 'ready':
          return wf === 'ready';
        case 'delivered':
          return wf === 'delivered';
        case 'other':
          return ['deferred', 'paused', 'editing', 'cancelled'].includes(wf);
        case 'paid': {
          const pStatus = inv.paymentStatus || computeInvoicePaymentStatus({
            paymentMethod: inv.paymentMethod,
            totalAmount: inv.totalAmount,
            paidAmount: inv.paidAmount,
            remainingAmount: inv.remainingAmount,
            cashPaidAmount: inv.cashPaidAmount,
            bankPaidAmount: inv.bankPaidAmount
          });
          return pStatus === 'paid_cash' || pStatus === 'paid_bank' || pStatus === 'paid_cash_bank' || (inv.remainingAmount <= 0 && inv.paidAmount > 0);
        }
        case 'unpaid_or_credit':
          return inv.remainingAmount > 0 || inv.paidAmount === 0;
        case 'all':
        default:
          return true;
      }
    });
  }, [todayInvoices, activeFilterTab, searchQuery]);

  // Handle Changing Workflow Status
  const handleChangeStatus = (inv: Invoice, newStatus: PosInvoiceWorkflowStatus) => {
    updateInvoice(inv.id, {
      workflowStatus: newStatus
    });
    posSound.playSuccessBeep();
    setStatusChangingInvoice(null);
  };

  // Open Additional Collection Modal
  const handleOpenCollection = (inv: Invoice) => {
    setCollectingInvoice(inv);
    const rem = inv.remainingAmount > 0 ? inv.remainingAmount : 0;
    setCollectionAmount(rem > 0 ? String(rem) : '');
    setCollectionMethod('cash');
    setCollectionCurrencyCode(inv.currency || settings.baseCurrencyCode || 'ILS');
    setCollectionTreasuryCode('1101');
    setCollectionNotes(\`دفعة تحصيل إضافية لفاتورة رقم \${inv.invoiceNumber}\`);
  };

  // Execute Additional Collection
  const handleExecuteCollection = () => {
    if (!collectingInvoice) return;

    const amountNum = parseFloat(collectionAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('الرجاء إدخال مبلغ تحصيل صحيح');
      return;
    }

    const newPaid = Number(((collectingInvoice.paidAmount || 0) + amountNum).toFixed(2));
    const newRemaining = Math.max(0, Number((collectingInvoice.totalAmount - newPaid).toFixed(2)));
    const newStatus = newRemaining === 0 ? 'paid' : 'partial';

    // Update invoice
    updateInvoice(collectingInvoice.id, {
      paidAmount: newPaid,
      remainingAmount: newRemaining,
      status: newStatus
    });

    // Create payment voucher receipt (سند قبض رسمي)
    const partyId = collectingInvoice.customerId || 'pt-cust-1';
    const partyName = collectingInvoice.customerName || 'عميل كاشير نقدي';

    createPaymentVoucher({
      voucherNumber: \`RCT-ADD-\${Date.now().toString().slice(-5)}\`,
      type: 'receipt',
      date: selectedDate,
      partyId,
      partyName,
      amount: amountNum,
      paymentMethod: collectionMethod,
      accountCode: collectionTreasuryCode,
      description: \`سند قبض وتحصيل دفعة لفاتورة #\${collectingInvoice.invoiceNumber} - \${collectionNotes}\`,
      referenceInvoiceId: collectingInvoice.id,
      currency: collectionCurrencyCode,
      subCustomerId: collectingInvoice.subCustomerId,
      subCustomerName: collectingInvoice.subCustomerName,
      treasuryAccountCode: collectionTreasuryCode
    });

    posSound.playSuccessBeep();
    setIsSuccessMessage(\`تم تحصيل \${amountNum.toFixed(2)} بنجاح للفاتورة #\${collectingInvoice.invoiceNumber}!\`);
    
    setTimeout(() => {
      setIsSuccessMessage('');
      setCollectingInvoice(null);
    }, 1200);
  };

  const getWorkflowBadge = (wf?: PosInvoiceWorkflowStatus) => {
    const meta = getInvoiceWorkflowStatusMeta(wf);
    return {
      label: meta.label,
      bg: \`\${meta.bgColor} \${meta.color} \${meta.borderColor}\`,
      isAccounting: meta.isAccounting,
      description: meta.description
    };
  };

  if (!isOpen) return null;

  return (
    <div className={\`flex flex-col h-full bg-[#f8fafc] text-slate-800 \${className}\`} dir="rtl">
      {/* Header */}
      <div className="bg-[#1f4a7c] text-white p-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-amber-300" />
          <h3 className="font-bold text-sm">سجل الفواتير والمبيعات</h3>
          <div className="flex items-center bg-[#153358] rounded px-2 py-1 ml-2 border border-blue-400/30">
            <Calendar className="w-4 h-4 text-blue-200 ml-1.5" />
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-transparent text-white text-xs font-mono focus:outline-none cursor-pointer"
            />
          </div>
          <span className="text-xs bg-blue-600 px-2 py-0.5 rounded-full font-bold">
            {filteredInvoices.length} فواتير
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-blue-200 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-slate-200 p-2 shrink-0">
        <div className="flex flex-col gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute right-2.5 top-2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="ابحث برقم الفاتورة، العميل، أو المبلغ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-3 pr-9 py-1.5 border border-slate-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Quick Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-1">
            <button
              onClick={() => setActiveFilterTab('all')}
              className={\`px-3 py-1 rounded text-[11px] font-bold whitespace-nowrap transition-colors \${activeFilterTab === 'all' ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}\`}
            >
              الكل ({counts.all})
            </button>
            <button
              onClick={() => setActiveFilterTab('unpaid_or_credit')}
              className={\`px-3 py-1 rounded text-[11px] font-bold whitespace-nowrap transition-colors flex items-center gap-1 \${activeFilterTab === 'unpaid_or_credit' ? 'bg-rose-100 text-rose-800 ring-1 ring-rose-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}\`}
            >
              <AlertCircle className="w-3.5 h-3.5" /> ذمم وآجل ({counts.unpaid_or_credit})
            </button>
            <button
              onClick={() => setActiveFilterTab('paid')}
              className={\`px-3 py-1 rounded text-[11px] font-bold whitespace-nowrap transition-colors flex items-center gap-1 \${activeFilterTab === 'paid' ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}\`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> مسددة ({counts.paid})
            </button>
            <div className="w-px h-4 bg-slate-300 mx-1 shrink-0"></div>
            <button
              onClick={() => setActiveFilterTab('new')}
              className={\`px-3 py-1 rounded text-[11px] font-bold whitespace-nowrap transition-colors \${activeFilterTab === 'new' ? 'bg-indigo-100 text-indigo-800 ring-1 ring-indigo-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}\`}
            >
              جديدة ({counts.new})
            </button>
            <button
              onClick={() => setActiveFilterTab('ready')}
              className={\`px-3 py-1 rounded text-[11px] font-bold whitespace-nowrap transition-colors \${activeFilterTab === 'ready' ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}\`}
            >
              جاهزة للتسليم ({counts.ready})
            </button>
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto bg-white p-2">
        {filteredInvoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-3">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
              <FileText className="w-8 h-8 text-slate-300" />
            </div>
            <p className="font-bold text-sm">لا توجد فواتير مطابقة للبحث أو الفلتر في هذا اليوم</p>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold">
                <tr>
                  <th className="p-2 whitespace-nowrap">رقم الفاتورة</th>
                  <th className="p-2 whitespace-nowrap">العميل / الفرعي</th>
                  <th className="p-2 whitespace-nowrap">طريقة / صندوق السداد</th>
                  <th className="p-2 whitespace-nowrap text-center">الإجمالي</th>
                  <th className="p-2 whitespace-nowrap text-center">المدفوع</th>
                  <th className="p-2 whitespace-nowrap text-center">المتبقي</th>
                  <th className="p-2 whitespace-nowrap">ملاحظة السداد</th>
                  <th className="p-2 whitespace-nowrap text-center">حالة الطلب</th>
                  <th className="p-2 whitespace-nowrap text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map((inv) => {
                  const wfMeta = getWorkflowBadge(inv.workflowStatus);
                  const pMeta = getInvoicePaymentStatusMeta(
                    inv.paymentStatus || computeInvoicePaymentStatus({
                      paymentMethod: inv.paymentMethod,
                      totalAmount: inv.totalAmount,
                      paidAmount: inv.paidAmount,
                      remainingAmount: inv.remainingAmount,
                      cashPaidAmount: inv.cashPaidAmount,
                      bankPaidAmount: inv.bankPaidAmount
                    })
                  );

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-2 font-mono font-black text-blue-900 align-middle">
                        #{inv.invoiceNumber}
                      </td>
                      <td className="p-2 align-middle">
                        <div className="font-bold text-slate-800">{inv.customerName || 'عميل نقدي'}</div>
                        {inv.subCustomerName && (
                          <div className="text-[10px] text-slate-500 font-semibold flex items-center gap-1 mt-0.5">
                            <User className="w-3 h-3" /> {inv.subCustomerName}
                          </div>
                        )}
                      </td>
                      <td className="p-2 align-middle text-[11px]">
                        <div className="font-semibold text-slate-700">{inv.paymentMethod === 'cash' ? 'نقدي' : inv.paymentMethod === 'card' ? 'بطاقة/بنكي' : inv.paymentMethod === 'credit' ? 'آجل/ذمم' : 'متعدد'}</div>
                        {inv.cashierAccountId && (
                          <div className="text-slate-500 mt-0.5">{treasuries.find(t => t.id === inv.cashierAccountId)?.name || inv.cashierAccountId}</div>
                        )}
                      </td>
                      <td className="p-2 text-center align-middle font-mono font-bold text-slate-800">
                        {inv.totalAmount.toFixed(2)}
                      </td>
                      <td className="p-2 text-center align-middle font-mono font-bold text-emerald-700">
                        {inv.paidAmount.toFixed(2)}
                      </td>
                      <td className="p-2 text-center align-middle font-mono font-black text-rose-700">
                        {inv.remainingAmount > 0 ? inv.remainingAmount.toFixed(2) : '-'}
                      </td>
                      <td className="p-2 align-middle text-[10px] text-slate-600 max-w-[120px] truncate" title={inv.notes}>
                        {inv.notes || '-'}
                      </td>
                      <td className="p-2 text-center align-middle">
                        <div className="flex flex-col items-center gap-1">
                           <span className={\`text-[10px] font-black px-2 py-0.5 rounded border \${wfMeta.bg} whitespace-nowrap\`}>
                            {wfMeta.label}
                           </span>
                           <span className={\`text-[10px] font-black px-2 py-0.5 rounded border \${pMeta.bgColor} \${pMeta.color} \${pMeta.borderColor} whitespace-nowrap\`}>
                            {pMeta.label}
                           </span>
                        </div>
                      </td>
                      <td className="p-2 align-middle">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => onSelectInvoiceToLoad(inv)}
                            className="p-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition-colors"
                            title="تعديل / عرض الفاتورة في الكاشير"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onPrintInvoice(inv)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors"
                            title="طباعة الفاتورة"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenCollection(inv)}
                            disabled={inv.remainingAmount <= 0}
                            className={\`p-1.5 rounded transition-colors \${inv.remainingAmount > 0 ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}\`}
                            title="تحصيل دفعة إضافية"
                          >
                            <Coins className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenStatusModal(inv)}
                            className="p-1.5 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded transition-colors"
                            title="تغيير حالة أمر الشغل"
                          >
                            <History className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Status Change & Audit History Modal */}
      {statusChangingInvoice && (
        <InvoiceStatusHistoryModal
          invoice={statusChangingInvoice}
          isOpen={!!statusChangingInvoice}
          onClose={() => {
            setStatusChangingInvoice(null);
            setTargetStatusForModal(undefined);
          }}
          initialTargetStatus={targetStatusForModal}
        />
      )}

      {/* Additional Collection Modal */}
      {collectingInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 p-5 w-full max-w-md text-xs text-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">
                    تحصيل إضافي لفاتورة #{collectingInvoice.invoiceNumber}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    العميل: {collectingInvoice.customerName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCollectingInvoice(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            {/* Financial Overview Card */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 grid grid-cols-3 gap-2 text-center font-mono">
              <div>
                <span className="text-[10px] text-slate-500 block">إجمالي الفاتورة:</span>
                <span className="font-bold text-slate-900">
                  {collectingInvoice.totalAmount.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">المدفوع سابقاً:</span>
                <span className="font-bold text-emerald-700">
                  {collectingInvoice.paidAmount.toFixed(2)}
                </span>
              </div>
              <div className="bg-rose-50 rounded-lg p-1 border border-rose-200">
                <span className="text-[10px] text-rose-600 block font-bold">المتبقي المطلوب:</span>
                <span className="font-black text-rose-700">
                  {collectingInvoice.remainingAmount.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Collection Fields */}
            <div className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  مبلغ الدفعة الإضافية المراد تحصيلها الآن:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={collectingInvoice.remainingAmount}
                    value={collectionAmount}
                    onChange={e => setCollectionAmount(e.target.value)}
                    placeholder="أدخل المبلغ..."
                    className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono font-black text-sm text-emerald-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setCollectionAmount(String(collectingInvoice.remainingAmount))}
                    className="px-3 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    سداد كامل المتبقي
                  </button>
                </div>
              </div>

              {/* Payment Method & Currency */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">طريقة السداد:</label>
                  <select
                    value={collectionMethod}
                    onChange={e => setCollectionMethod(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold"
                  >
                    <option value="cash">نقدي (Cash)</option>
                    <option value="bank_transfer">تحويل بنكي / مدى</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">عملة السداد:</label>
                  <select
                    value={collectionCurrencyCode}
                    onChange={e => setCollectionCurrencyCode(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold"
                  >
                    {currencies.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.name} ({c.symbol})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Treasury Account (الصندوق / البنك) */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  إيداع في الصندوق / الحساب البنكي (حسب العملة):
                </label>
                <select
                  value={collectionTreasuryCode}
                  onChange={e => setCollectionTreasuryCode(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold"
                >
                  {treasuries.map(t => (
                    <option key={t.id} value={t.accountCode}>
                      {t.name} - رصيد: {t.balance.toFixed(2)} ({t.currency || '₪'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">ملاحظات التحصيل:</label>
                <input
                  type="text"
                  value={collectionNotes}
                  onChange={e => setCollectionNotes(e.target.value)}
                  placeholder="ملاحظات اختيارية..."
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5"
                />
              </div>
            </div>

            {/* Success Alert */}
            {isSuccessMessage && (
              <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 p-2.5 rounded-xl font-bold text-center flex items-center justify-center gap-1.5">
                <Check className="w-4 h-4" />
                <span>{isSuccessMessage}</span>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setCollectingInvoice(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleExecuteCollection}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>تأكيد التحصيل والإيداع</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
`;

fs.writeFileSync(file, newContent);
