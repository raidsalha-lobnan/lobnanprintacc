import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Party, Employee, BusinessSettings, Treasury, Invoice, ExpenseItem, InventoryItem } from '../types';
import { StatementResult } from './statementGenerator';
import masterSnapshot from '../../master_drive_database_snapshot.json';

const defaultLobnanBanner = (masterSnapshot as any)?.settings?.headerImageUrl || '';

/**
 * Normalizes Arabic text for flexible, error-tolerant comparison
 */
export function normalizeArabicText(str: string): string {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // Remove tashkeel/diacritics
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئ]/g, 'ي')
    .replace(/[\s\-_/\\,.]+/g, ' ');
}

/**
 * Calculates Levenshtein edit distance between two strings
 */
function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Fuzzy matches user query against party records (customers/suppliers)
 */
export function fuzzyMatchParties(
  rawQuery: string,
  parties: Party[],
  typeFilter?: 'customer' | 'supplier' | 'all'
): { party: Party; score: number }[] {
  const query = normalizeArabicText(rawQuery);
  if (!query || query.length < 1) return [];

  const filteredParties = parties.filter(p => {
    if (!typeFilter || typeFilter === 'all') return true;
    if (typeFilter === 'customer') {
      return p.type === 'customer' || p.type === 'both' || !p.type;
    }
    if (typeFilter === 'supplier') {
      return p.type === 'supplier' || p.type === 'both';
    }
    return true;
  });

  const scored: { party: Party; score: number }[] = [];

  for (const party of filteredParties) {
    const normName = normalizeArabicText(party.name || '');
    const normCompany = normalizeArabicText((party as any).companyName || '');
    const normCode = normalizeArabicText(party.code || '');
    const normPhone = (party.phone || '').replace(/\D/g, '');
    const cleanQueryPhone = query.replace(/\D/g, '');

    let score = 0;

    // 1. Exact phone match or exact code match
    if (cleanQueryPhone.length >= 4 && normPhone.includes(cleanQueryPhone)) {
      score = 100;
    } else if (normCode && normCode === query) {
      score = 100;
    }
    // 2. Exact normalized name match
    else if (normName === query || normCompany === query) {
      score = 95;
    }
    // 3. Name starts with query
    else if (normName.startsWith(query) || normCompany.startsWith(query)) {
      score = 90;
    }
    // 4. Substring containment
    else if (normName.includes(query) || normCompany.includes(query)) {
      score = 80;
    } else {
      // 5. Token overlap
      const queryTokens = query.split(' ').filter(Boolean);
      const nameTokens = normName.split(' ').filter(Boolean);
      let matchCount = 0;
      for (const qTok of queryTokens) {
        if (nameTokens.some(nTok => nTok.includes(qTok) || qTok.includes(nTok))) {
          matchCount++;
        }
      }
      if (queryTokens.length > 0 && matchCount > 0) {
        score = 60 + (matchCount / queryTokens.length) * 25;
      } else {
        // 6. Levenshtein distance for typos
        const dist = levenshteinDistance(query, normName.slice(0, Math.max(query.length, 10)));
        const maxLen = Math.max(query.length, normName.length);
        if (maxLen > 0 && dist <= 3) {
          score = Math.max(0, 60 - dist * 15);
        }
      }
    }

    if (score >= 40) {
      scored.push({ party, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Fuzzy matches user query against employee records
 */
export function fuzzyMatchEmployees(
  rawQuery: string,
  employees: Employee[]
): { employee: Employee; score: number }[] {
  const query = normalizeArabicText(rawQuery);
  if (!query || query.length < 1) return [];

  const scored: { employee: Employee; score: number }[] = [];

  for (const emp of employees) {
    const normName = normalizeArabicText(emp.name || '');
    const normCode = normalizeArabicText(emp.code || '');
    const normPhone = (emp.phone || '').replace(/\D/g, '');
    const cleanQueryPhone = query.replace(/\D/g, '');

    let score = 0;

    if (cleanQueryPhone.length >= 4 && normPhone.includes(cleanQueryPhone)) {
      score = 100;
    } else if (normCode && normCode === query) {
      score = 100;
    } else if (normName === query) {
      score = 95;
    } else if (normName.startsWith(query)) {
      score = 90;
    } else if (normName.includes(query)) {
      score = 80;
    } else {
      const dist = levenshteinDistance(query, normName.slice(0, Math.max(query.length, 10)));
      if (dist <= 3) {
        score = Math.max(0, 60 - dist * 15);
      }
    }

    if (score >= 40) {
      scored.push({ employee: emp, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Converts Eastern Arabic numerals (٠-٩) to standard Western Arabic numerals (0-9)
 */
export function convertEasternArabicDigits(str: string): string {
  if (!str) return '';
  return str.replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
}

/**
 * Parses user input to extract custom date range (fromDate & toDate)
 * Supports formats like: YYYY-MM-DD to YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, etc.
 */
export function parseCustomDateRange(
  rawInput: string
): { fromDate: string; toDate: string; label: string } | null {
  if (!rawInput) return null;
  const input = convertEasternArabicDigits(rawInput).trim();

  // Match dates like 2026-11-01, 2026/11/01, 01-11-2026, 01/11/2026
  const dateRegex = /(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})|(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})/g;
  const matches = input.match(dateRegex);

  if (!matches || matches.length === 0) return null;

  const toIso = (dateStr: string): string => {
    const parts = dateStr.split(/[-/.]/);
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      const y = parts[0];
      const m = parts[1].padStart(2, '0');
      const d = parts[2].padStart(2, '0');
      return `${y}-${m}-${d}`;
    } else {
      // DD-MM-YYYY
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const y = parts[2];
      return `${y}-${m}-${d}`;
    }
  };

  const isoDates = matches.map(toIso);
  let fromDate = isoDates[0];
  let toDate = isoDates.length > 1 ? isoDates[1] : isoDates[0];

  if (fromDate > toDate) {
    const temp = fromDate;
    fromDate = toDate;
    toDate = temp;
  }

  const formatDisplay = (iso: string) => {
    const parts = iso.split('-');
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  };

  const label =
    fromDate === toDate
      ? `يوم (${formatDisplay(fromDate)})`
      : `من ${formatDisplay(fromDate)} إلى ${formatDisplay(toDate)}`;

  return { fromDate, toDate, label };
}

/**
 * Returns fromDate and toDate for common accounting periods
 */
export function getDateRangeForPeriod(
  period: 'today' | 'this_month' | 'last_month' | 'last_30_days' | 'this_year' | 'all'
): { fromDate?: string; toDate?: string; label: string } {
  const today = new Date();
  const todayIso = today.toISOString().split('T')[0];

  const formatDisplay = (iso: string) => {
    const parts = iso.split('-');
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  };

  if (period === 'today') {
    return {
      fromDate: todayIso,
      toDate: todayIso,
      label: `اليوم (${formatDisplay(todayIso)})`,
    };
  }

  if (period === 'this_month') {
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    return {
      fromDate: `${year}-${month}-01`,
      toDate: todayIso,
      label: 'هذا الشهر',
    };
  }

  if (period === 'last_month') {
    const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const year = prevMonthDate.getFullYear();
    const month = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(year, prevMonthDate.getMonth() + 1, 0).getDate();
    return {
      fromDate: `${year}-${month}-01`,
      toDate: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
      label: 'الشهر الماضي',
    };
  }

  if (period === 'last_30_days') {
    const past = new Date(today);
    past.setDate(past.getDate() - 30);
    return {
      fromDate: past.toISOString().split('T')[0],
      toDate: todayIso,
      label: 'آخر 30 يوم',
    };
  }

  if (period === 'this_year') {
    const year = today.getFullYear();
    return {
      fromDate: `${year}-01-01`,
      toDate: todayIso,
      label: 'السنة الحالية',
    };
  }

  return {
    fromDate: undefined,
    toDate: todayIso,
    label: 'كافة الحركات',
  };
}

/**
 * Formats full customer display name with parent customer if applicable
 */
export function getPartyFullDisplayName(party: Party, parentParty?: Party | null): string {
  if (!party) return '';
  if (party.isSubCustomer && parentParty) {
    return `${parentParty.name} / ${party.name}`;
  }
  if ((party as any).parentCustomerName) {
    return `${(party as any).parentCustomerName} / ${party.name}`;
  }
  return party.name;
}

/**
 * Converts an HTML string into a PDF Blob via an offscreen render iframe
 */
export async function renderHtmlToPdfBlob(htmlContent: string): Promise<Blob> {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '-9999px';
  iframe.style.width = '850px';
  iframe.style.height = '1200px';
  iframe.style.border = 'none';
  iframe.style.zIndex = '-1000';
  document.body.appendChild(iframe);

  try {
    const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!iframeDoc) throw new Error('Could not access iframe document');

    iframeDoc.open();
    iframeDoc.write(htmlContent);
    iframeDoc.close();

    // Allow CSS, web fonts, and layout to settle
    await new Promise(resolve => setTimeout(resolve, 600));

    const contentHeight = Math.max(
      iframeDoc.body.scrollHeight,
      iframeDoc.documentElement.scrollHeight,
      800
    );
    iframe.style.height = `${contentHeight + 50}px`;

    const canvas = await html2canvas(iframeDoc.body, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 850,
    });

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfPageWidth = pdf.internal.pageSize.getWidth();
    const pdfPageHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pdfPageWidth;
    const imgHeight = (canvas.height * pdfPageWidth) / canvas.width;

    // Multi-page slicing if content exceeds single A4 page
    let heightLeft = imgHeight;
    let position = 0;
    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pdfPageHeight;

    while (heightLeft > 5) {
      position = position - pdfPageHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfPageHeight;
    }

    return pdf.output('blob');
  } finally {
    try {
      document.body.removeChild(iframe);
    } catch {}
  }
}

/**
 * Formats standard ISO date (YYYY-MM-DD) into DD-MM-YYYY format
 */
function formatToDdMmYyyy(dateStr?: string): string {
  if (!dateStr) return 'بداية التعامل';
  const clean = dateStr.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
}

/**
 * Generates an official, detailed account statement PDF for Telegram
 * 100% matched to the on-screen statement with item breakdown tables and bottom summary cards
 */
export async function generateStatementPdfBlob(params: {
  party: Party;
  parentParty?: Party | null;
  statementResult: StatementResult;
  settings: BusinessSettings;
  periodLabel: string;
}): Promise<{ blob: Blob; filename: string }> {
  const { party, parentParty, statementResult, settings, periodLabel } = params;

  const displayName = getPartyFullDisplayName(party, parentParty);
  const currency = (settings as any).currency || '₪';
  const businessName = settings.businessName || 'مطبعة ومكتبة لبنان';
  const phone1 = '00972594299942';
  const phone2 = '00972597080014';
  const address1 = 'دير البلح - شارع البروك';
  const address2 = 'الشيخ رضوان - مفترق الغزالي';
  const headerImageUrl = settings.headerImageUrl || (settings as any).letterheadUrl || defaultLobnanBanner;

  const isCustomer = party.type !== 'supplier';
  const rows = statementResult.rows || [];
  const openingBalance = statementResult.openingBalance || 0;
  const closingBalance = statementResult.closingBalance || 0;
  const totalDebit = statementResult.totalDebit || 0;
  const totalCredit = statementResult.totalCredit || 0;

  const displayFromDate = statementResult.fromDate ? formatToDdMmYyyy(statementResult.fromDate) : 'بداية التعامل';
  const displayToDate = statementResult.toDate ? formatToDdMmYyyy(statementResult.toDate) : formatToDdMmYyyy(new Date().toISOString());

  let tableRowsHtml = '';

  // Opening Balance Row - ONLY displayed if openingBalance !== 0
  if (openingBalance !== 0) {
    tableRowsHtml += `
      <tr style="background-color: #f8fafc; font-weight: bold; border-bottom: 2px solid #cbd5e1;">
        <td style="padding: 5px 4px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace;">-</td>
        <td style="padding: 5px 4px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace;">${displayFromDate}</td>
        <td style="padding: 5px 8px; text-align: right; border: 1px solid #cbd5e1; font-weight: bold; color: #475569;">
          رصيد سابق - رصيد الحساب الافتتاحي السابق (ما قبل تاريخ ${displayFromDate})
        </td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; color: #b91c1c; font-family: monospace;">
          ${openingBalance > 0 ? openingBalance.toFixed(2) : '-'}
        </td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; color: #047857; font-family: monospace;">
          ${openingBalance < 0 ? Math.abs(openingBalance).toFixed(2) : '-'}
        </td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: 800; font-family: monospace;">
          ${openingBalance.toFixed(2)}
        </td>
      </tr>
    `;
  }

  // Transaction Rows + Item Sub-Tables (Matches image_71096944.png 1:1)
  rows.forEach((row, idx) => {
    const isEven = idx % 2 === 0;
    const debitText = row.debit > 0 ? row.debit.toFixed(2) : '-';
    const creditText = row.credit > 0 ? row.credit.toFixed(2) : '-';
    const typeLabel =
      row.typeLabel ||
      (row.type === 'invoice'
        ? 'فاتورة مبيعات'
        : row.type === 'receipt'
        ? 'سند قبض'
        : row.type === 'payment'
        ? 'سند صرف'
        : row.type === 'purchase'
        ? 'فاتورة مشتريات'
        : row.type === 'sales_return'
        ? 'مردودات مبيعات'
        : row.type === 'purchase_return'
        ? 'مردودات مشتريات'
        : row.type === 'clearance'
        ? 'مقاصة ديون'
        : 'حركة مالية');

    let note = '';
    if (row.type === 'invoice') {
      if (row.invoiceNotes) {
        note = row.invoiceNotes;
        if (row.subCustomerName) note += ` [الزبون الفرعي: ${row.subCustomerName}]`;
      } else if (row.subCustomerName) {
        note = `[الزبون الفرعي: ${row.subCustomerName}]`;
      } else if (row.description) {
        const cleaned = row.description
          .replace(/^فاتورة مبيعات\s*(\([^)]*\))?\s*(-\s*)?/, '')
          .replace(/-\s*إجمالي\s*[\d,.]+/gi, '')
          .replace(/إجمالي\s*[\d,.]+/gi, '')
          .replace(/-\s*total\s*[\d,.]+/gi, '')
          .trim();
        note = cleaned;
      }
    } else if (row.type === 'receipt' || row.type === 'payment') {
      const rawNote = row.voucherNotes || row.description || '';
      note = rawNote.replace(/^(سند قبض|سند صرف)\s*(نقدية|شيك|تحويل)?\s*(-\s*)?/, '').trim();
    } else {
      note = row.description || '';
    }
    const cleanNote = note.trim();

    const titleParts = [typeLabel];
    if (row.referenceNumber && row.referenceNumber !== 'OPENING') {
      titleParts.push(row.referenceNumber);
    }
    if (cleanNote) {
      titleParts.push(cleanNote);
    }
    const fullTitle = titleParts.join(' - ');

    // Main Transaction Row
    tableRowsHtml += `
      <tr style="background-color: ${isEven ? '#ffffff' : '#fcfdfd'}; border-bottom: 1px solid #cbd5e1;">
        <td style="padding: 5px 4px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; font-family: monospace; width: 32px;">${idx + 1}</td>
        <td style="padding: 5px 4px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace; font-size: 11px; width: 85px;">${row.date || ''}</td>
        <td style="padding: 5px 8px; text-align: right; border: 1px solid #cbd5e1; font-weight: bold; color: #0f172a;">${fullTitle}</td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; color: #be123c; font-family: monospace; width: 85px;">${debitText}</td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; color: #047857; font-family: monospace; width: 85px;">${creditText}</td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: 800; font-family: monospace; width: 95px; background-color: #f8fafc;">${(row.runningBalance || 0).toFixed(2)}</td>
      </tr>
    `;

    // Inner Sub-Table for Invoice Items (Matches image_71096944.png 1:1)
    if (row.items && row.items.length > 0) {
      let itemRowsHtml = '';
      row.items.forEach((it, iIdx) => {
        const itemNote = it.notes || it.description;
        const itemFullDesc = itemNote && itemNote !== it.itemName ? `${it.itemName} / ${itemNote}` : it.itemName;

        itemRowsHtml += `
          <tr style="background-color: #ffffff; border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 3px 4px; text-align: center; border-left: 1px solid #cbd5e1; font-weight: bold; font-family: monospace; width: 28px;">${iIdx + 1}</td>
            <td style="padding: 3px 8px; text-align: right; border-left: 1px solid #cbd5e1; font-weight: bold; color: #334155;">${itemFullDesc}</td>
            <td style="padding: 3px 4px; text-align: center; border-left: 1px solid #cbd5e1; font-family: monospace; width: 45px;">${it.length != null && it.length !== 0 ? it.length : '-'}</td>
            <td style="padding: 3px 4px; text-align: center; border-left: 1px solid #cbd5e1; font-family: monospace; width: 45px;">${it.width != null && it.width !== 0 ? it.width : '-'}</td>
            <td style="padding: 3px 4px; text-align: center; border-left: 1px solid #cbd5e1; font-family: monospace; width: 40px; font-weight: bold;">${it.count || 1}</td>
            <td style="padding: 3px 4px; text-align: center; border-left: 1px solid #cbd5e1; font-family: monospace; width: 45px; font-weight: bold; color: #1e3a8a;">${it.quantity}</td>
            <td style="padding: 3px 6px; text-align: center; border-left: 1px solid #cbd5e1; font-family: monospace; width: 55px;">${it.unitPrice.toFixed(2)}</td>
            <td style="padding: 3px 6px; text-align: center; font-family: monospace; width: 65px; font-weight: bold;">${it.total.toFixed(2)}</td>
          </tr>
        `;
      });

      tableRowsHtml += `
        <tr style="background-color: #ffffff;">
          <td colspan="6" style="padding: 0; border: 1px solid #cbd5e1;">
            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
              <thead>
                <tr style="background-color: #f1f5f9; color: #1e293b; border-bottom: 1px solid #cbd5e1; font-weight: bold;">
                  <th style="width: 28px; text-align: center; border-left: 1px solid #cbd5e1; padding: 4px;">م</th>
                  <th style="text-align: right; border-left: 1px solid #cbd5e1; padding: 4px 8px;">الصنف والبيان</th>
                  <th style="width: 45px; text-align: center; border-left: 1px solid #cbd5e1; padding: 4px;">الطول</th>
                  <th style="width: 45px; text-align: center; border-left: 1px solid #cbd5e1; padding: 4px;">العرض</th>
                  <th style="width: 40px; text-align: center; border-left: 1px solid #cbd5e1; padding: 4px;">العدد</th>
                  <th style="width: 45px; text-align: center; border-left: 1px solid #cbd5e1; padding: 4px;">الكمية</th>
                  <th style="width: 55px; text-align: center; border-left: 1px solid #cbd5e1; padding: 4px;">السعر</th>
                  <th style="width: 65px; text-align: center; padding: 4px;">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                ${itemRowsHtml}
              </tbody>
            </table>
          </td>
        </tr>
      `;
    }
  });

  // Table Footer Row
  const footerRowHtml = `
    <tr style="background-color: #f1f5f9; font-weight: bold; border-top: 2px solid #cbd5e1;">
      <td colspan="3" style="text-align: left; padding: 6px 12px; border: 1px solid #cbd5e1; font-size: 12px; color: #0f172a;">
        الإجمالي العام للحركات بالفترة:
      </td>
      <td style="text-align: center; font-weight: 800; color: #b91c1c; padding: 6px; border: 1px solid #cbd5e1; font-size: 12px; font-family: monospace;">
        ${totalDebit.toFixed(2)}
      </td>
      <td style="text-align: center; font-weight: 800; color: #047857; padding: 6px; border: 1px solid #cbd5e1; font-size: 12px; font-family: monospace;">
        ${totalCredit.toFixed(2)}
      </td>
      <td style="text-align: center; font-weight: 800; font-family: monospace; padding: 6px; border: 1px solid #cbd5e1; font-size: 12px; color: #0f172a; background-color: #e2e8f0;">
        ${currency} ${closingBalance.toFixed(2)}
      </td>
    </tr>
  `;

  // Top Header Banner (Official Lobnan Print Banner)
  let headerBannerHtml = '';
  if (headerImageUrl) {
    headerBannerHtml = `
      <div style="width: 100%; text-align: center; margin-bottom: 6px;">
        <img src="${headerImageUrl}" alt="مطبعة لبنان" style="width: 100%; max-height: 155px; object-fit: contain; display: block; margin: 0 auto;" />
      </div>
    `;
  } else {
    headerBannerHtml = `
      <div style="width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; background: #ffffff; display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="background: #0f172a; color: white; width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 900;">
            ل
          </div>
          <div>
            <div style="font-size: 20px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px;">${businessName}</div>
            <div style="font-size: 10px; font-weight: bold; color: #475569; font-family: monospace;">LOBNAN PRINT & LIBRARY</div>
          </div>
        </div>
        <div style="text-align: left; font-size: 10.5px; color: #334155; line-height: 1.5;">
          <div>📍 ${address1} | ${address2}</div>
          <div style="font-family: monospace; font-weight: bold;">📱 ${phone1} | ${phone2}</div>
        </div>
      </div>
    `;
  }

  // 4 Bottom Summary Cards (Matches image_71096944.png 1:1)
  const balanceStatus = isCustomer
    ? closingBalance > 0
      ? 'مدين'
      : closingBalance < 0
      ? 'دائن'
      : 'متزن'
    : closingBalance > 0
    ? 'دائن'
    : closingBalance < 0
    ? 'مدين'
    : 'متزن';

  const bottomCardsHtml = `
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 10px; font-size: 11px; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">
      <!-- Card 1: رصيد سابق -->
      <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 4px; text-align: center; font-weight: bold;">
        <span style="color: #64748b; font-size: 10px;">رصيد سابق:</span>
        <span style="color: #0f172a; margin-right: 4px; font-family: monospace; font-size: 11.5px; font-weight: 800;">${openingBalance.toFixed(2)} ${currency}</span>
      </div>

      <!-- Card 2: إجمالي مدين -->
      <div style="background: #ffffff; border: 1px solid #fca5a5; border-radius: 4px; padding: 6px 4px; text-align: center; font-weight: bold;">
        <span style="color: #991b1b; font-size: 10px;">إجمالي مدين:</span>
        <span style="color: #b91c1c; margin-right: 4px; font-family: monospace; font-size: 11.5px; font-weight: 800;">${totalDebit.toFixed(2)} ${currency}</span>
      </div>

      <!-- Card 3: إجمالي دائن -->
      <div style="background: #ffffff; border: 1px solid #86efac; border-radius: 4px; padding: 6px 4px; text-align: center; font-weight: bold;">
        <span style="color: #166534; font-size: 10px;">إجمالي دائن:</span>
        <span style="color: #047857; margin-right: 4px; font-family: monospace; font-size: 11.5px; font-weight: 800;">${totalCredit.toFixed(2)} ${currency}</span>
      </div>

      <!-- Card 4: الإجمالي -->
      <div style="background: ${closingBalance > 0 ? '#fffbeb' : '#ffffff'}; border: 1px solid #fcd34d; border-radius: 4px; padding: 6px 4px; text-align: center; font-weight: bold;">
        <span style="color: #92400e; font-size: 10px;">الإجمالي:</span>
        <span style="color: #b45309; margin-right: 4px; font-family: monospace; font-size: 11.5px; font-weight: 800;">${Math.abs(closingBalance).toFixed(2)} ${currency}</span>
        <span style="color: #92400e; font-size: 9.5px;">(${balanceStatus})</span>
      </div>
    </div>
  `;

  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>كشف حساب - ${displayName}</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          margin: 0;
          padding: 12px;
          background: #ffffff;
          color: #0f172a;
          direction: rtl;
        }
        .report-outer-container {
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 14px 16px;
          background: #ffffff;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 0;
        }
        th {
          background-color: #f1f5f9;
          color: #0f172a;
          padding: 6px 4px;
          font-size: 11.5px;
          font-weight: bold;
          border: 1px solid #94a3b8;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="report-outer-container">
        <!-- 1. Header Banner -->
        ${headerBannerHtml}

        <!-- 2. Statement Title & Period -->
        <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; margin-top: 4px;">
          <div style="font-size: 16px; font-weight: 900; color: #0f172a; line-height: 1.4;">
            ${isCustomer ? 'كشف حساب عميل تفصيلي:' : 'كشف حساب مورد تفصيلي:'} <span style="color: ${isCustomer ? '#1e3a8a' : '#881337'};">${displayName}</span>
          </div>
          <div style="font-size: 12px; color: #475569; font-weight: 600; margin-top: 4px;">
            من تاريخ: <span style="font-family: monospace;">${displayFromDate}</span> إلى تاريخ: <span style="font-family: monospace;">${displayToDate}</span>
          </div>
        </div>

        <!-- 3. Main Detailed Table -->
        <table style="border: 1px solid #94a3b8; font-size: 11.5px;">
          <thead>
            <tr style="background-color: #f1f5f9; color: #0f172a; font-weight: bold; border-bottom: 2px solid #94a3b8;">
              <th style="width: 32px; text-align: center; border: 1px solid #94a3b8;">م</th>
              <th style="width: 85px; text-align: center; border: 1px solid #94a3b8; font-family: monospace;">التاريخ</th>
              <th style="text-align: center; border: 1px solid #94a3b8; padding: 6px 8px;">البيان والشرح والتفاصيل الكاملة</th>
              <th style="width: 85px; text-align: center; border: 1px solid #94a3b8; background-color: #ffe4e6; color: #be123c;">${isCustomer ? 'مدين (عليه)' : 'مدين (المسدد)'}</th>
              <th style="width: 85px; text-align: center; border: 1px solid #94a3b8; background-color: #dcfce7; color: #15803d;">${isCustomer ? 'دائن (له)' : 'دائن (التوريدات)'}</th>
              <th style="width: 95px; text-align: center; border: 1px solid #94a3b8; background-color: #e2e8f0; color: #0f172a;">الرصيد التراكمي</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
          <tfoot>
            ${footerRowHtml}
          </tfoot>
        </table>

        <!-- 4. Bottom 4 Summary Cards -->
        ${bottomCardsHtml}
      </div>
    </body>
    </html>
  `;

  const blob = await renderHtmlToPdfBlob(htmlContent);
  const safeName = party.name.replace(/[/\\?%*:|"<>]/g, '_');
  const filename = `كشف_حساب_${safeName}_${displayFromDate}_إلى_${displayToDate}.pdf`;

  return { blob, filename };
}


/**
 * Generates an official treasury status & movements report as PDF
 */
export async function generateTreasuryReportPdfBlob(params: {
  treasuries: Treasury[];
  settings: BusinessSettings;
}): Promise<{ blob: Blob; filename: string }> {
  const { treasuries, settings } = params;
  const currency = settings.currency || '₪';
  const totalBalance = treasuries.reduce((sum, t) => sum + (t.balance || 0), 0);

  const rowsHtml = treasuries
    .map((t, idx) => {
      const typeLabel =
        t.type === 'cash_box'
          ? 'صندوق نقدي'
          : t.type === 'bank_account' || t.type === 'bank_app'
          ? 'حساب بنكي'
          : 'محفظة إلكترونية';
      return `
        <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}; border-bottom: 1px solid #cbd5e1;">
          <td style="padding: 8px; text-align: center; border: 1px solid #cbd5e1;">${idx + 1}</td>
          <td style="padding: 8px; text-align: right; border: 1px solid #cbd5e1; font-weight: bold;">${t.name}</td>
          <td style="padding: 8px; text-align: center; border: 1px solid #cbd5e1;">${typeLabel}</td>
          <td style="padding: 8px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace;">${t.accountCode || '-'}</td>
          <td style="padding: 8px; text-align: center; border: 1px solid #cbd5e1; font-weight: 800; color: ${(t.balance || 0) >= 0 ? '#047857' : '#b91c1c'}; font-size: 13px;">
            ${(t.balance || 0).toFixed(2)} ${t.currency || currency}
          </td>
        </tr>
      `;
    })
    .join('');

  const headerImageUrl = settings.headerImageUrl || (settings as any).letterheadUrl || defaultLobnanBanner;
  const headerBannerHtml = headerImageUrl
    ? `<div style="width: 100%; text-align: center; margin-bottom: 8px;"><img src="${headerImageUrl}" alt="مطبعة لبنان" style="width: 100%; max-height: 140px; object-fit: contain; display: block; margin: 0 auto;" /></div>`
    : `<div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px;"><h2 style="margin: 0; color: #0f172a;">${settings.businessName || 'مطبعة ومكتبة لبنان'}</h2></div>`;

  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>كشف أرصدة الصناديق والخزائن</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 12px; direction: rtl; }
        .report-outer-container { border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px 16px; background: #ffffff; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
        th { background: #f1f5f9; color: #0f172a; padding: 6px 4px; font-size: 11.5px; border: 1px solid #94a3b8; text-align: center; font-weight: bold; }
        .total-box { margin-top: 14px; padding: 10px 14px; background: #f8fafc; border: 1px solid #0f172a; border-radius: 6px; display: flex; justify-content: space-between; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="report-outer-container">
        ${headerBannerHtml}
        <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 6px; margin-bottom: 10px;">
          <h3 style="margin: 0; color: #1e3a8a; font-size: 15px; font-weight: 900;">تقرير أرصدة وحركات الصناديق والخزائن البنكية</h3>
          <p style="margin: 4px 0 0 0; font-size: 11px; color: #64748b;">تاريخ التقرير: ${new Date().toLocaleDateString('ar-EG')} - ${new Date().toLocaleTimeString('ar-EG')}</p>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 35px;">م</th>
              <th>اسم الصندوق / الحساب البنكي</th>
              <th style="width: 110px;">النوع</th>
              <th style="width: 100px;">رقم الحساب</th>
              <th style="width: 120px;">الرصيد الفعلي</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="total-box">
          <span>إجمالي السيولة النقدية والبنكية في كافة الخزائن:</span>
          <span style="font-size: 15px; color: #047857; font-family: monospace;">${totalBalance.toFixed(2)} ${currency}</span>
        </div>
      </div>
    </body>
    </html>
  `;

  const blob = await renderHtmlToPdfBlob(htmlContent);
  const filename = `تقرير_الخزائن_${new Date().toISOString().slice(0, 10)}.pdf`;
  return { blob, filename };
}

/**
 * Generates today's sales report as PDF
 */
export async function generateSalesReportPdfBlob(params: {
  invoices: Invoice[];
  settings: BusinessSettings;
}): Promise<{ blob: Blob; filename: string }> {
  const { invoices, settings } = params;
  const currency = settings.currency || '₪';
  const todayIso = new Date().toISOString().split('T')[0];

  const todayInvoices = invoices.filter(inv => inv.date && inv.date.startsWith(todayIso));
  const totalSales = todayInvoices.reduce((sum, inv) => sum + (inv.totalAmount || (inv as any).total || 0), 0);
  const paidSales = todayInvoices.reduce((sum, inv) => sum + (inv.paidAmount || (inv.paymentMethod === 'cash' ? inv.totalAmount : 0) || 0), 0);
  const remainingSales = Math.max(0, totalSales - paidSales);

  const headerImageUrl = settings.headerImageUrl || (settings as any).letterheadUrl || defaultLobnanBanner;
  const headerBannerHtml = headerImageUrl
    ? `<div style="width: 100%; text-align: center; margin-bottom: 8px;"><img src="${headerImageUrl}" alt="مطبعة لبنان" style="width: 100%; max-height: 140px; object-fit: contain; display: block; margin: 0 auto;" /></div>`
    : `<div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px;"><h2 style="margin: 0; color: #0f172a;">${settings.businessName || 'مطبعة ومكتبة لبنان'}</h2></div>`;

  const rowsHtml = todayInvoices
    .map((inv, idx) => {
      const invTotal = inv.totalAmount || (inv as any).total || 0;
      const invPaid = inv.paidAmount || (inv.paymentMethod === 'cash' ? invTotal : 0);
      return `
        <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}; border-bottom: 1px solid #cbd5e1;">
          <td style="padding: 6px; text-align: center; border: 1px solid #cbd5e1;">${idx + 1}</td>
          <td style="padding: 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; font-family: monospace;">${inv.invoiceNumber}</td>
          <td style="padding: 6px; text-align: right; border: 1px solid #cbd5e1; font-weight: bold;">${inv.customerName || 'زبون نقدي'}</td>
          <td style="padding: 6px; text-align: center; border: 1px solid #cbd5e1;">${inv.paymentMethod === 'cash' ? 'نقدي' : inv.paymentMethod === 'credit' ? 'آجل' : 'شبكة/بنك'}</td>
          <td style="padding: 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; font-family: monospace;">${invTotal.toFixed(2)}</td>
          <td style="padding: 6px; text-align: center; border: 1px solid #cbd5e1; color: #047857; font-family: monospace;">${invPaid.toFixed(2)}</td>
        </tr>
      `;
    })
    .join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>تقرير مبيعات اليوم</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 12px; direction: rtl; }
        .report-outer-container { border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px 16px; background: #ffffff; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11.5px; }
        th { background: #f1f5f9; color: #0f172a; padding: 6px 4px; font-size: 11px; border: 1px solid #94a3b8; text-align: center; font-weight: bold; }
        .summary-grid { display: flex; gap: 8px; margin-top: 14px; }
        .stat-box { flex: 1; padding: 8px; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc; text-align: center; }
      </style>
    </head>
    <body>
      <div class="report-outer-container">
        ${headerBannerHtml}
        <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 6px; margin-bottom: 10px;">
          <h3 style="margin: 0; color: #1e3a8a; font-size: 15px; font-weight: 900;">تقرير فواتير ومبيعات اليوم (${todayIso})</h3>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 32px;">م</th>
              <th style="width: 90px;">رقم الفاتورة</th>
              <th>اسم العميل</th>
              <th style="width: 80px;">طريقة الدفع</th>
              <th style="width: 85px;">الإجمالي (${currency})</th>
              <th style="width: 85px;">المدفوع (${currency})</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="6" style="text-align: center; padding: 14px; color: #64748b;">لا توجد فواتير مبيعات مسجلة اليوم</td></tr>'}
          </tbody>
        </table>

        <div class="summary-grid">
          <div class="stat-box">
            <div style="font-size: 10px; color: #64748b;">عدد الفواتير</div>
            <div style="font-size: 15px; font-weight: bold; color: #0f172a;">${todayInvoices.length}</div>
          </div>
          <div class="stat-box">
            <div style="font-size: 10px; color: #64748b;">إجمالي مبيعات اليوم</div>
            <div style="font-size: 15px; font-weight: bold; color: #047857; font-family: monospace;">${totalSales.toFixed(2)} ${currency}</div>
          </div>
          <div class="stat-box">
            <div style="font-size: 10px; color: #64748b;">المدفوع نقداً/شبكة</div>
            <div style="font-size: 15px; font-weight: bold; color: #1e3a8a; font-family: monospace;">${paidSales.toFixed(2)} ${currency}</div>
          </div>
          <div class="stat-box">
            <div style="font-size: 10px; color: #64748b;">المتبقي آجل</div>
            <div style="font-size: 15px; font-weight: bold; color: #b91c1c; font-family: monospace;">${remainingSales.toFixed(2)} ${currency}</div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const blob = await renderHtmlToPdfBlob(htmlContent);
  const filename = `تقرير_مبيعات_اليوم_${todayIso}.pdf`;
  return { blob, filename };
}

/**
 * Generates low stock inventory report as PDF
 */
export async function generateInventoryReportPdfBlob(params: {
  inventory: InventoryItem[];
  settings: BusinessSettings;
}): Promise<{ blob: Blob; filename: string }> {
  const { inventory, settings } = params;
  const currency = settings.currency || '₪';
  const lowStock = inventory.filter(it => it.category !== 'copy_scan' && it.stockQuantity <= it.minAlertQuantity);
  const totalInventoryValuation = inventory.reduce((sum, it) => sum + (it.stockQuantity * (it.purchasePrice || 0)), 0);

  const headerImageUrl = settings.headerImageUrl || (settings as any).letterheadUrl || defaultLobnanBanner;
  const headerBannerHtml = headerImageUrl
    ? `<div style="width: 100%; text-align: center; margin-bottom: 8px;"><img src="${headerImageUrl}" alt="مطبعة لبنان" style="width: 100%; max-height: 140px; object-fit: contain; display: block; margin: 0 auto;" /></div>`
    : `<div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px;"><h2 style="margin: 0; color: #0f172a;">${settings.businessName || 'مطبعة ومكتبة لبنان'}</h2></div>`;


  const rowsHtml = lowStock
    .map((it, idx) => `
      <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}; border-bottom: 1px solid #cbd5e1;">
        <td style="padding: 6px; text-align: center; border: 1px solid #cbd5e1;">${idx + 1}</td>
        <td style="padding: 6px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace;">${it.code || '-'}</td>
        <td style="padding: 6px; text-align: right; border: 1px solid #cbd5e1; font-weight: bold;">${it.name}</td>
        <td style="padding: 6px; text-align: center; border: 1px solid #cbd5e1; color: #b91c1c; font-weight: bold;">${it.stockQuantity}</td>
        <td style="padding: 6px; text-align: center; border: 1px solid #cbd5e1;">${it.minAlertQuantity}</td>
        <td style="padding: 6px; text-align: center; border: 1px solid #cbd5e1;">${it.sellingPrice?.toFixed(2)} ${currency}</td>
      </tr>
    `)
    .join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>تقرير النواقص وتنبيهات المخزون</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 12px; direction: rtl; }
        .report-outer-container { border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px 16px; background: #ffffff; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11.5px; }
        th { background: #f1f5f9; color: #0f172a; padding: 6px 4px; font-size: 11px; border: 1px solid #94a3b8; text-align: center; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="report-outer-container">
        ${headerBannerHtml}
        <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 6px; margin-bottom: 10px;">
          <h3 style="margin: 0; color: #b91c1c; font-size: 15px; font-weight: 900;">تقرير النواقص والأصناف التي بلغت حد الطلب</h3>
          <p style="margin: 4px 0 0 0; font-size: 11px; color: #64748b;">تاريخ التقرير: ${new Date().toLocaleDateString('ar-EG')}</p>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 35px;">م</th>
              <th style="width: 80px;">كود الصنف</th>
              <th>اسم الصنف</th>
              <th style="width: 85px;">الرصيد الحالي</th>
              <th style="width: 85px;">حد الطلب</th>
              <th style="width: 85px;">سعر البيع</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="6" style="text-align: center; padding: 14px; color: #047857; font-weight: bold;">جميع الأصناف متوفرة ولا يوجد نواقص حالياً</td></tr>'}
          </tbody>
        </table>

        <div style="margin-top: 14px; padding: 10px 14px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; display: flex; justify-content: space-between; font-size: 12px;">
          <span>إجمالي عدد الأصناف الناقصة: <b style="color: #b91c1c;">${lowStock.length} صنف</b></span>
          <span>إجمالي القيمة التقديرية لكافة المخزون: <b style="font-family: monospace;">${totalInventoryValuation.toFixed(2)} ${currency}</b></span>
        </div>
      </div>
    </body>
    </html>
  `;

  const blob = await renderHtmlToPdfBlob(htmlContent);
  const filename = `تقرير_نواقص_المخزون_${new Date().toISOString().slice(0, 10)}.pdf`;
  return { blob, filename };
}
