import React, { useState, useEffect } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { Printer, X, CheckCircle, QrCode, FileText } from 'lucide-react';
import { PrintHeader, ThermalReceiptHeader } from './common/PrintHeader';
import { ReportSignatures } from './common/ReportSignatures';
import { formatDateDisplay } from '../utils/dateUtils';

const parseThumbnails = (val?: string): string[] => {
  if (!val) return [];
  const trimmed = val.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [val];
};

export const InvoicePrintModal: React.FC = () => {
  const { selectedInvoiceForPrint, setSelectedInvoiceForPrint, directPrintOptions, setDirectPrintOptions, settings } = useAccounting();
  const [printFormat, setPrintFormat] = useState<'a4' | 'a4-custom' | 'thermal'>('thermal'); // Default to thermal for faster POS

  useEffect(() => {
    if (directPrintOptions) {
      setPrintFormat(directPrintOptions.format);
      if (directPrintOptions.autoPrint) {
        // slight delay to ensure rendering is complete before calling print
        const timer = setTimeout(() => {
          window.print();
          // Optional: clear after print dialog closes
          setDirectPrintOptions(null);
          setSelectedInvoiceForPrint(null);
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [directPrintOptions, setDirectPrintOptions, setSelectedInvoiceForPrint]);

  if (!selectedInvoiceForPrint) return null;

  const inv = selectedInvoiceForPrint;
  const isDraftPreview = inv.id === 'draft-pos-preview' || inv.invoiceNumber?.includes('مسودة');

  const handlePrint = () => {
    window.print();
  };

  const formattedCustomerDisplayName = `${inv.customerName || 'عميل كاشير نقدي'}${
    inv.customCustomerText ? ` (${inv.customCustomerText})` : ''
  }${inv.subCustomerName ? ` - زبون فرعي: ${inv.subCustomerName}` : ''}`;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:p-0 print:m-0 print:bg-white print:static print:overflow-visible print-modal-container">
      <div className={`bg-white rounded-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-auto transition-all duration-300 print:border-none print:shadow-none print:max-w-none print:w-full print:rounded-none print:overflow-visible ${
        printFormat === 'thermal' ? 'max-w-[400px]' : 'max-w-[950px]'
      }`}>
        {/* Header Controls (Hidden during print) */}
        <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-600">طريقة العرض والطباعة:</span>
            <div className="bg-slate-200 p-0.5 rounded-lg flex text-xs">
              <button
                onClick={() => setPrintFormat('a4')}
                className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
                  printFormat === 'a4' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                فاتورة ضريبية A4
              </button>
              <button
                onClick={() => setPrintFormat('a4-custom')}
                className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
                  printFormat === 'a4-custom' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                فاتورة A4 (تصميم 2)
              </button>
              <button
                onClick={() => setPrintFormat('thermal')}
                className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
                  printFormat === 'thermal' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                إيصال حراري (80mm)
              </button>
            </div>
          </div>

          {isDraftPreview && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-900 border border-amber-300 rounded-lg font-bold text-xs">
              <FileText className="w-3.5 h-3.5 text-amber-700" />
              <span>مسودة مراجعة الفاتورة قبل الحفظ</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs transition-colors cursor-pointer"
              title="طباعة الفاتورة للعميل لمراجعة البنود والأسعار"
            >
              <Printer className="w-4 h-4" />
              <span>{isDraftPreview ? 'طباعة المسودة للعميل' : 'طباعة الآن'}</span>
            </button>
            <button
              onClick={() => setSelectedInvoiceForPrint(null)}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
              title="إغلاق والعودة لشاشة الكاشير"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Invoice Body: A4 Standard Format */}
        {printFormat === 'a4' ? (
          <div className="p-8 space-y-6 text-slate-800 text-xs font-sans print:p-0">
            {/* Standard or Full Header Banner */}
            <PrintHeader
              title={isDraftPreview ? "فاتورة مبيعات (مسودة مراجعة)" : "فاتورة ضريبية مبسطة"}
              subtitle={isDraftPreview ? "معاينة الفاتورة ومراجعة البنود قبل السداد والاعتماد" : "Simplified Tax Invoice - ZATCA & Official Tax Compliant"}
              docNumber={inv.invoiceNumber}
              docDate={inv.date}
              badge={isDraftPreview ? "مسودة مراجعة للعميل" : "فاتورة مبيعات معتمدة"}
              qrCode={
                <div className="w-18 h-18 bg-slate-50 border border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-600 p-1">
                  <QrCode className="w-12 h-12 text-slate-800" />
                  <span className="text-[7px] font-mono">ZATCA QR</span>
                </div>
              }
            />

            {/* Meta Info */}
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="space-y-1">
                <div><span className="text-slate-500">رقم الفاتورة:</span> <strong className="font-mono text-slate-900">{inv.invoiceNumber}</strong></div>
                <div><span className="text-slate-500">تاريخ الإصدار:</span> <span className="font-mono">{formatDateDisplay(inv.date)}</span></div>
                <div><span className="text-slate-500">طريقة السداد:</span> <strong>{inv.paymentMethod === 'cash' ? 'نقدي' : (inv.paymentMethod === 'card' || inv.paymentMethod === 'bank_transfer') ? (inv.paymentMethod === 'bank_transfer' ? 'تحويل بنكي' : 'بطاقة بنكية / مدى') : 'آجل على الحساب'}</strong></div>
              </div>
              <div className="space-y-1">
                <div><span className="text-slate-500">العميل:</span> <strong className="text-slate-900">{formattedCustomerDisplayName}</strong></div>
                {(inv.customerPhone || inv.subCustomerPhone) && (
                  <div><span className="text-slate-500">هاتف العميل:</span> <span className="font-mono">{inv.customerPhone || inv.subCustomerPhone}</span></div>
                )}
                {inv.customerTaxNumber && (
                  <div><span className="text-slate-500">الرقم الضريبي للعميل:</span> <span className="font-mono">{inv.customerTaxNumber}</span></div>
                )}
                <div>
                  <span className="text-slate-500">حالة السداد:</span>{' '}
                  <span className={`font-bold ${isDraftPreview ? 'text-amber-700' : inv.paidAmount >= inv.totalAmount ? 'text-emerald-700' : 'text-blue-700'}`}>
                    {isDraftPreview
                      ? (inv.paidAmount > 0 ? `مدفوع عربون (${inv.paidAmount}) - مسودة قبل الحفظ` : 'مسودة مراجعة قبل الحفظ والسداد')
                      : (inv.paidAmount >= inv.totalAmount ? 'مدفوعة بالكامل' : inv.paidAmount > 0 ? 'مدفوعة جزئياً' : 'آجل على الحساب')}
                  </span>
                </div>
              </div>
            </div>

            {/* Invoice Notes (ملاحظات الفاتورة تظهر بشكل أفقي قبل جدول الفاتورة) */}
            {inv.notes && (
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 text-xs flex items-start gap-2 shadow-2xs">
                <FileText className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-bold text-amber-950 ml-1.5">ملاحظات الفاتورة:</span>
                  <span className="text-slate-800 font-medium whitespace-pre-wrap">{inv.notes}</span>
                </div>
              </div>
            )}

            {/* Line Items Table */}
            <table className="w-full text-right text-xs border border-slate-200 rounded-lg overflow-hidden">
              <thead className="bg-slate-100 text-slate-800 font-black border-b border-slate-300">
                <tr>
                  <th className="p-2 w-8 text-center font-bold text-slate-900">م</th>
                  <th className="p-2 min-w-[120px]">الصنف</th>
                  <th className="p-2 min-w-[120px]">البيان</th>
                  <th className="p-2 w-14 text-center">الطول</th>
                  <th className="p-2 w-14 text-center">العرض</th>
                  <th className="p-2 w-12 text-center">العدد</th>
                  <th className="p-2 w-16 text-center">الكمية</th>
                  <th className="p-2 w-14 text-center">الوحدة</th>
                  <th className="p-2 w-16 text-left">السعر</th>
                  <th className="p-2 w-14 text-left">الخصم</th>
                  <th className="p-2 w-14 text-left">الضريبة</th>
                  <th className="p-2 w-20 text-left">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-sans">
                {inv.items.map((it, idx) => {
                  const hasDimensions = Boolean(
                    it.hasDimensions || (it.length && it.width && (it.length !== 1 || it.width !== 1 || (it.count && it.count > 1)))
                  );
                  const length = Number(it.length) || 0;
                  const width = Number(it.width) || 0;
                  const count = Number(it.count) || 1;
                  const unit = it.unit || (hasDimensions ? 'م²' : 'حبة');

                  return (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="p-2 text-slate-400 font-mono text-center">{idx + 1}</td>
                      {/* عمود الصنف */}
                      <td className="p-2 font-bold text-slate-900">
                        <div>
                          <span>{it.itemName}</span>
                          {(it.notes || it.description) && (it.notes !== it.itemName) && (
                            <span className="text-slate-600 font-normal text-xs"> / {it.notes || it.description}</span>
                          )}
                        </div>
                        {it.imageThumbnail && (
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            {parseThumbnails(it.imageThumbnail).map((imgStr, imgIdx) => (
                              <img
                                key={imgIdx}
                                src={imgStr}
                                alt="معاينة"
                                className="w-9 h-9 object-cover rounded border border-slate-300 shadow-2xs"
                              />
                            ))}
                          </div>
                        )}
                        {it.attachments && it.attachments.length > 0 && (
                          <div className="text-[10px] text-emerald-800 font-medium mt-1 flex flex-wrap items-center gap-1">
                            <span className="font-bold">📎 مرفقات ({it.attachments.length}):</span>
                            {it.attachments.map((att, aIdx) => (
                              <span key={aIdx} className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded px-1.5 py-0.5 text-[9px] font-mono">
                                {att.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      {/* عمود البيان */}
                      <td className="p-2 text-slate-700 text-xs font-normal">
                        {it.notes || it.description || '-'}
                      </td>
                      <td className="p-2 text-center font-mono font-medium">
                        {hasDimensions && length > 0 ? length : '—'}
                      </td>
                      <td className="p-2 text-center font-mono font-medium">
                        {hasDimensions && width > 0 ? width : '—'}
                      </td>
                      <td className="p-2 text-center font-mono font-medium">
                        {count}
                      </td>
                      <td className="p-2 text-center font-mono font-bold text-blue-900">
                        {it.quantity}
                        {hasDimensions && length > 0 && width > 0 && (
                          <span className="block text-[9px] text-slate-400 font-normal">
                            ({length}×{width}×{count})
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-center text-[11px] text-slate-700 font-medium">
                        {unit}
                      </td>
                      <td className="p-2 text-left font-mono">{it.unitPrice.toFixed(2)}</td>
                      <td className="p-2 text-left font-mono text-rose-600">
                        {it.discount && it.discount > 0 ? it.discount.toFixed(2) : '0.00'}
                      </td>
                      <td className="p-2 text-left font-mono text-indigo-700">
                        {it.tax && it.tax > 0 ? it.tax.toFixed(2) : '0.00'}
                      </td>
                      <td className="p-2 text-left font-mono font-black text-slate-900">
                        {it.total.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Totals Box */}
            <div className="flex justify-end">
              <div className="w-72 space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex justify-between text-slate-600">
                  <span>المجموع الفرعي:</span>
                  <span className="font-mono font-bold">{inv.subtotal.toFixed(2)} {inv.currencySymbol || settings.currency}</span>
                </div>
                {inv.discountTotal > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>الخصم:</span>
                    <span className="font-mono font-bold">-{inv.discountTotal.toFixed(2)} {inv.currencySymbol || settings.currency}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>ضريبة القيمة المضافة ({inv.taxRate}%):</span>
                  <span className="font-mono font-bold text-indigo-700">{inv.taxAmount.toFixed(2)} {inv.currencySymbol || settings.currency}</span>
                </div>
                <div className="flex justify-between text-sm font-black text-slate-900 pt-2 border-t border-slate-300">
                  <span>الإجمالي المستحق:</span>
                  <span className="font-mono text-indigo-700">{inv.totalAmount.toFixed(2)} {inv.currencySymbol || settings.currency}</span>
                </div>
                {inv.currency && inv.currency !== 'ILS' && inv.baseTotalAmount && (
                  <div className="flex justify-between text-[11px] text-amber-800 bg-amber-50 p-1.5 rounded-lg border border-amber-200 font-bold">
                    <span>المعادل بالشيكل (₪):</span>
                    <span className="font-mono">{inv.baseTotalAmount.toFixed(2)} ₪ (سعر الصرف: {inv.exchangeRate})</span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Notice */}
            <div className="text-center pt-6 border-t border-slate-200 text-[10px] text-slate-400 font-light">
              <p>{settings.invoiceFooter}</p>
              <p className="mt-1 font-mono text-[10px] text-slate-400">شكراً لتعاملكم مع {settings.businessName}</p>
            </div>
          </div>
        ) : printFormat === 'a4-custom' ? (
          /* A4 Custom Print Format */
          <div className="p-8 text-slate-800 text-sm font-sans print:p-0" dir="rtl">
            <div className="border-[3px] border-[#2b3a67] p-1 pb-2 min-h-[1050px] flex flex-col relative">
              <div className="border-[2px] border-[#2b3a67] flex-1 flex flex-col p-4 space-y-6">
                
                {/* Header Row */}
                <div className="flex items-center justify-between mt-2">
                  <div className="border border-[#2b3a67] rounded-md px-4 py-2 w-64 text-right flex items-center justify-between bg-[#f0f4f8]">
                    <span className="font-bold text-[#2b3a67]">رقم الفاتورة :</span>
                    <span className="font-mono text-base border-b border-dashed border-slate-400 min-w-[100px] text-center inline-block">{inv.invoiceNumber}</span>
                  </div>
                  
                  <div className="bg-[#2b3a67] text-white px-16 py-3 rounded-xl shadow-sm text-center">
                    <h1 className="text-3xl font-black">{isDraftPreview ? "مسودة فاتورة مبيعات" : "فاتورة مبيعات"}</h1>
                    {isDraftPreview && <p className="text-xs text-amber-200 mt-1">مسودة مراجعة للعميل قبل السداد والاعتماد</p>}
                  </div>

                  <div className="border border-[#2b3a67] rounded-md px-4 py-2 w-64 text-right flex items-center justify-between bg-[#f0f4f8]">
                    <span className="font-bold text-[#2b3a67]">التاريخ :</span>
                    <span className="font-mono text-base border-b border-dashed border-slate-400 min-w-[100px] text-center inline-block">{inv.date}</span>
                  </div>
                </div>

                {/* Info Sections Row */}
                <div className="grid grid-cols-2 gap-8">
                  {/* Seller Info */}
                  <div className="border border-[#2b3a67] rounded-lg flex flex-col overflow-hidden">
                    <div className="bg-[#d2e0ee] text-[#2b3a67] font-bold text-center py-2 border-b border-[#2b3a67] text-lg">
                      بيانات البائع
                    </div>
                    <div className="p-4 space-y-4">
                      <div className="flex items-center">
                        <span className="font-bold text-[#2b3a67] w-28 text-base">اسم المنشأة :</span>
                        <span className="flex-1 border-b border-dashed border-slate-400 min-w-0 font-bold px-2">{settings.businessName}</span>
                      </div>
                      <div className="flex items-center">
                        <span className="font-bold text-[#2b3a67] w-28 text-base">رقم الهاتف :</span>
                        <span className="flex-1 border-b border-dashed border-slate-400 min-w-0 px-2 font-mono font-bold">{settings.phone || '—'}</span>
                      </div>
                      <div className="flex items-center">
                        <span className="font-bold text-[#2b3a67] w-28 text-base">العنوان :</span>
                        <span className="flex-1 border-b border-dashed border-slate-400 min-w-0 px-2 font-bold">{settings.address || '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Customer Info */}
                  <div className="border border-[#2b3a67] rounded-lg flex flex-col overflow-hidden">
                    <div className="bg-[#d2e0ee] text-[#2b3a67] font-bold text-center py-2 border-b border-[#2b3a67] text-lg">
                      بيانات العميل
                    </div>
                    <div className="p-4 space-y-4">
                      <div className="flex items-center">
                        <span className="font-bold text-[#2b3a67] w-28 text-base">اسم العميل :</span>
                        <span className="flex-1 border-b border-dashed border-slate-400 min-w-0 font-bold px-2">{formattedCustomerDisplayName}</span>
                      </div>
                      <div className="flex items-center">
                        <span className="font-bold text-[#2b3a67] w-28 text-base">رقم الهاتف :</span>
                        <span className="flex-1 border-b border-dashed border-slate-400 min-w-0 px-2 font-mono font-bold">
                          {inv.customerPhone || inv.subCustomerPhone || '—'}
                        </span>
                      </div>
                      <div className="flex items-center">
                        <span className="font-bold text-[#2b3a67] w-28 text-base">العنوان :</span>
                        <span className="flex-1 border-b border-dashed border-slate-400 min-w-0 px-2 font-bold">
                          {'—'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Table */}
                <div className="flex-1 flex flex-col">
                  <table className="w-full text-center border-collapse border border-[#2b3a67]">
                    <thead>
                      <tr className="bg-[#d2e0ee] text-[#2b3a67] font-bold text-lg">
                        <th className="border border-[#2b3a67] py-2.5 w-12">م</th>
                        <th className="border border-[#2b3a67] py-2.5 w-48">الصنف</th>
                        <th className="border border-[#2b3a67] py-2.5">البيان</th>
                        <th className="border border-[#2b3a67] py-2.5 w-28">الكمية</th>
                        <th className="border border-[#2b3a67] py-2.5 w-32">سعر الوحدة</th>
                        <th className="border border-[#2b3a67] py-2.5 w-32">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody className="text-base font-bold text-[#2b3a67]">
                      {/* Render exact 10 rows to match the design's fixed height appearance */}
                      {Array.from({ length: Math.max(10, inv.items.length) }).map((_, idx) => {
                        const item = inv.items[idx];
                        return (
                          <tr key={idx} className="h-[2.1rem]">
                            <td className="border border-[#2b3a67] font-mono">{idx + 1}</td>
                            <td className="border border-[#2b3a67] px-3 text-right font-bold truncate">
                              {item ? item.itemName : ''}
                            </td>
                            <td className="border border-[#2b3a67] px-3 text-right font-medium text-sm text-[#1e293b]">
                              {item ? (item.notes || item.description || '') : ''}
                            </td>
                            <td className="border border-[#2b3a67] font-mono">
                              {item ? item.quantity : ''}
                            </td>
                            <td className="border border-[#2b3a67] font-mono">
                              {item ? item.unitPrice.toFixed(2) : ''}
                            </td>
                            <td className="border border-[#2b3a67] font-mono">
                              {item ? item.total.toFixed(2) : ''}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footer and Totals */}
                <div className="grid grid-cols-2 gap-8 items-start mt-2">
                  {/* Totals Box */}
                  <div className="border border-[#2b3a67] rounded-lg flex flex-col overflow-hidden text-base">
                    <div className="flex border-b border-[#2b3a67]">
                      <div className="w-1/2 p-2 font-bold text-center border-l border-[#2b3a67] bg-[#d2e0ee] text-[#2b3a67]">إجمالي المبلغ</div>
                      <div className="w-1/2 p-2 font-mono text-center font-bold text-[#2b3a67]">{inv.subtotal.toFixed(2)}</div>
                    </div>
                    <div className="flex border-b border-[#2b3a67]">
                      <div className="w-1/2 p-2 font-bold text-center border-l border-[#2b3a67] bg-[#d2e0ee] text-[#2b3a67]">الخصم</div>
                      <div className="w-1/2 p-2 font-mono text-center font-bold text-[#2b3a67]">{inv.discountTotal > 0 ? inv.discountTotal.toFixed(2) : ''}</div>
                    </div>
                    <div className="flex border-b border-[#2b3a67]">
                      <div className="w-1/2 p-2 font-bold text-center border-l border-[#2b3a67] bg-[#d2e0ee] text-[#2b3a67]">صافي المبلغ</div>
                      <div className="w-1/2 p-2 font-mono text-center font-bold text-[#2b3a67]">{(inv.subtotal - inv.discountTotal).toFixed(2)}</div>
                    </div>
                    <div className="flex border-b border-[#2b3a67]">
                      <div className="w-1/2 p-2 font-bold text-center border-l border-[#2b3a67] bg-[#d2e0ee] text-[#2b3a67]">قيمة الضريبة (إن وجدت)</div>
                      <div className="w-1/2 p-2 font-mono text-center font-bold text-[#2b3a67]">{inv.taxAmount > 0 ? inv.taxAmount.toFixed(2) : ''}</div>
                    </div>
                    <div className="flex bg-[#2b3a67] text-white">
                      <div className="w-1/2 p-2 font-bold text-center border-l border-[#2b3a67]">المبلغ الإجمالي</div>
                      <div className="w-1/2 p-2 font-mono text-center bg-white text-[#2b3a67] font-black">{inv.totalAmount.toFixed(2)}</div>
                    </div>
                  </div>

                  {/* Notes Box */}
                  <div className="border border-[#2b3a67] rounded-lg flex flex-col overflow-hidden h-[190px]">
                    <div className="bg-[#d2e0ee] text-[#2b3a67] font-bold text-center py-2 border-b border-[#2b3a67] text-lg">
                      ملاحظات
                    </div>
                    <div className="p-4 font-medium text-slate-700 whitespace-pre-wrap flex-1">
                      {inv.notes || ''}
                    </div>
                  </div>
                </div>

                {/* Signatures */}
                <ReportSignatures columns={2} rightLabel="توقيع واستلام العميل" leftLabel="توقيع وختم البائع المعتمد" />
                <div className="text-center font-bold text-[#2b3a67] pt-2 pb-2 text-lg">
                  مع خالص الشكر والتقدير
                </div>

              </div>
            </div>
          </div>
        ) : (
          /* Thermal 80mm Receipt Format (الكاشير الحراري دائماً باللوقو والعناوين والهواتف المكتوبة) */
          <div className="p-6 max-w-xs mx-auto space-y-4 text-slate-900 font-mono text-xs text-center print:p-0">
            <ThermalReceiptHeader receiptTitle={isDraftPreview ? "مسودة مراجعة الفاتورة" : "فاتورة ضريبية مبسطة"} />

            {isDraftPreview && (
              <div className="border border-dashed border-amber-600 bg-amber-50 text-amber-950 font-bold p-1 rounded text-[11px]">
                *** مسودة مراجعة الحساب قبل السداد ***
              </div>
            )}

            <div className="border-t border-b border-dashed border-slate-400 py-2 space-y-1 text-[11px] text-right">
              <div className="flex justify-between">
                <span>رقم الفاتورة:</span>
                <span className="font-bold">{inv.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>التاريخ والوقت:</span>
                <span>{formatDateDisplay(inv.date)}</span>
              </div>
              <div className="flex justify-between">
                <span>العميل:</span>
                <span className="font-bold">{formattedCustomerDisplayName}</span>
              </div>
              {(inv.customerPhone || inv.subCustomerPhone) && (
                <div className="flex justify-between">
                  <span>هاتف العميل:</span>
                  <span>{inv.customerPhone || inv.subCustomerPhone}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>حالة السداد:</span>
                <span className="font-bold">
                  {isDraftPreview
                    ? 'مسودة قبل الحفظ'
                    : inv.paymentMethod === 'cash'
                    ? 'نقدي'
                    : inv.paymentMethod === 'bank_transfer'
                    ? 'تحويل بنكي'
                    : inv.paymentMethod === 'card'
                    ? 'شبكة مدى'
                    : 'آجل على الحساب'}
                </span>
              </div>
            </div>

            {/* Invoice Notes before items (ملاحظات الفاتورة أفقية قبل جدول الفاتورة) */}
            {inv.notes && (
              <div className="bg-amber-50 border border-amber-300 rounded p-1.5 text-right text-[10px] font-sans">
                <span className="font-bold text-amber-900 block">📝 ملاحظات الفاتورة:</span>
                <span className="text-slate-800 font-medium">{inv.notes}</span>
              </div>
            )}

            <div className="space-y-2 text-right text-[11px]">
              {inv.items.map((it, idx) => {
                const hasDimensions = Boolean(
                  it.hasDimensions || (it.length && it.width && (it.length !== 1 || it.width !== 1 || (it.count && it.count > 1)))
                );
                return (
                  <div key={idx} className="border-b border-dotted border-slate-300 pb-1">
                    <div className="flex justify-between font-bold text-slate-900">
                      <span className="max-w-[190px] leading-tight">
                        {it.itemName}
                        {(it.notes || it.description) && (it.notes !== it.itemName) && (
                          <span className="text-slate-600 font-normal text-[10px]"> / {it.notes || it.description}</span>
                        )}
                      </span>
                      <span className="font-mono">{it.total.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-[9px] text-slate-400 font-light font-mono mt-0.5">
                      <span>
                        {hasDimensions
                          ? `[${it.length}×${it.width}م × ${it.count || 1} = ${it.quantity} ${it.unit || 'م²'}] `
                          : `الكمية: ${it.quantity} ${it.unit || 'حبة'} `
                        }× {it.unitPrice.toFixed(2)}
                        {it.discount && it.discount > 0 ? ` (خصم: ${it.discount})` : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-dashed border-slate-400 pt-2 space-y-1 text-right text-[11px]">
              <div className="flex justify-between">
                <span>المجموع غير شامل:</span>
                <span>{(inv.subtotal - inv.discountTotal).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>ضريبة القيمة المضافة 15%:</span>
                <span>{inv.taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-black text-sm border-t border-slate-800 pt-1">
                <span>الإجمالي الصافي:</span>
                <span>{inv.totalAmount.toFixed(2)} {inv.currencySymbol || settings.currency}</span>
              </div>
              {inv.currency && inv.currency !== 'ILS' && inv.baseTotalAmount && (
                <div className="flex justify-between text-[10px] text-slate-600 font-bold pt-0.5">
                  <span>المعادل بالشيكل:</span>
                  <span>{inv.baseTotalAmount.toFixed(2)} ₪</span>
                </div>
              )}
            </div>

            <div className="flex flex-col items-center justify-center pt-2">
              <QrCode className="w-24 h-24 text-slate-900" />
              <p className="text-[9px] text-slate-400 font-light mt-1">{settings.invoiceFooter}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
