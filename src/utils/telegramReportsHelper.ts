import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Party, Employee, BusinessSettings, Treasury, Invoice, ExpenseItem, InventoryItem } from '../types';
import { StatementResult } from './statementGenerator';

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
 * Returns fromDate and toDate for common accounting periods
 */
export function getDateRangeForPeriod(
  period: 'this_month' | 'last_30_days' | 'this_year' | 'all'
): { fromDate?: string; toDate?: string; label: string } {
  const today = new Date();
  const todayIso = today.toISOString().split('T')[0];

  if (period === 'this_month') {
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    return {
      fromDate: `${year}-${month}-01`,
      toDate: todayIso,
      label: 'هذا الشهر',
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
 * Generates an official, detailed account statement PDF for Telegram
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
  const address = 'دير البلح - شارع البروك - مفترق الغزالي';
  const logoUrl = settings.logoUrl || '/public/assets/aistudio/image_0bfa29be.png';
  const stampUrl = settings.stampUrl || '/public/assets/aistudio/image_0bfa29be.png';

  const rows = statementResult.rows || [];
  const openingBalance = statementResult.openingBalance || 0;
  const closingBalance = statementResult.closingBalance || 0;
  const totalDebit = statementResult.totalDebit || 0;
  const totalCredit = statementResult.totalCredit || 0;

  const closingLabel =
    closingBalance > 0
      ? `مدين (مستحق على العميل): ${closingBalance.toFixed(2)} ${currency}`
      : closingBalance < 0
      ? `دائن (مستحق للعميل): ${Math.abs(closingBalance).toFixed(2)} ${currency}`
      : `الرصيد خالص (0.00 ${currency})`;

  let tableRowsHtml = '';

  // Opening Balance Row
  if (statementResult.fromDate) {
    tableRowsHtml += `
      <tr style="background-color: #f8fafc; font-weight: bold; border-bottom: 2px solid #cbd5e1;">
        <td style="padding: 7px; text-align: center; border: 1px solid #cbd5e1;">-</td>
        <td style="padding: 7px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace;">${statementResult.fromDate}</td>
        <td style="padding: 7px; text-align: center; border: 1px solid #cbd5e1;">رصيد سابق</td>
        <td style="padding: 7px; text-align: right; border: 1px solid #cbd5e1;">الرصيد الافتتاحي السابق حتى تاريخ ${statementResult.fromDate}</td>
        <td style="padding: 7px; text-align: center; border: 1px solid #cbd5e1; color: #047857;">${openingBalance > 0 ? openingBalance.toFixed(2) : '-'}</td>
        <td style="padding: 7px; text-align: center; border: 1px solid #cbd5e1; color: #b91c1c;">${openingBalance < 0 ? Math.abs(openingBalance).toFixed(2) : '-'}</td>
        <td style="padding: 7px; text-align: center; border: 1px solid #cbd5e1; font-weight: 800; font-family: monospace;">${openingBalance.toFixed(2)}</td>
      </tr>
    `;
  }

  rows.forEach((row, idx) => {
    const isEven = idx % 2 === 0;
    const debitText = row.debit > 0 ? row.debit.toFixed(2) : '-';
    const creditText = row.credit > 0 ? row.credit.toFixed(2) : '-';
    const desc = row.description || row.typeLabel || '';
    const notes = row.invoiceNotes || row.voucherNotes || row.notes || '';
    const fullDesc = notes ? `${desc} <span style="color: #64748b; font-size: 10px;">(${notes})</span>` : desc;

    tableRowsHtml += `
      <tr style="background-color: ${isEven ? '#ffffff' : '#f8fafc'}; border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 6px; text-align: center; border: 1px solid #e2e8f0; font-size: 11px;">${idx + 1}</td>
        <td style="padding: 6px; text-align: center; border: 1px solid #e2e8f0; font-size: 11px; font-family: monospace;">${row.date || ''}</td>
        <td style="padding: 6px; text-align: center; border: 1px solid #e2e8f0; font-size: 11px; font-weight: 600;">${row.referenceNumber || '-'}</td>
        <td style="padding: 6px; text-align: right; border: 1px solid #e2e8f0; font-size: 11px;">${fullDesc}</td>
        <td style="padding: 6px; text-align: center; border: 1px solid #e2e8f0; font-size: 11px; font-weight: 600; color: #047857;">${debitText}</td>
        <td style="padding: 6px; text-align: center; border: 1px solid #e2e8f0; font-size: 11px; font-weight: 600; color: #b91c1c;">${creditText}</td>
        <td style="padding: 6px; text-align: center; border: 1px solid #e2e8f0; font-size: 11px; font-weight: 800; font-family: monospace;">${(row.runningBalance || 0).toFixed(2)}</td>
      </tr>
    `;
  });

  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>كشف حساب - ${displayName}</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
          margin: 0;
          padding: 24px;
          background: #ffffff;
          color: #0f172a;
          direction: rtl;
        }
        .header-card {
          border-bottom: 3px double #0f172a;
          padding-bottom: 14px;
          margin-bottom: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .company-title {
          font-size: 20px;
          font-weight: 900;
          color: #0f172a;
          margin-bottom: 4px;
        }
        .company-sub {
          font-size: 11px;
          color: #475569;
          line-height: 1.5;
        }
        .report-badge {
          background-color: #0f172a;
          color: #ffffff;
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 15px;
          font-weight: bold;
          text-align: center;
        }
        .party-card {
          background-color: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 10px 14px;
          margin-bottom: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 16px;
        }
        th {
          background-color: #0f172a;
          color: #ffffff;
          padding: 8px 6px;
          font-size: 11px;
          font-weight: bold;
          border: 1px solid #0f172a;
          text-align: center;
        }
        .summary-card {
          border: 2px solid #0f172a;
          border-radius: 6px;
          padding: 12px;
          background: #f8fafc;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .stamp-section {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 15px;
          padding-top: 10px;
          border-top: 1px dashed #cbd5e1;
        }
      </style>
    </head>
    <body>
      <div class="header-card">
        <div style="flex: 1;">
          <div class="company-title">${businessName}</div>
          <div class="company-sub">
            ${address}<br/>
            هاتف: ${phone1} | ${phone2}
          </div>
        </div>
        <div style="text-align: center; flex: 1;">
          <div class="report-badge">كشف حساب مالي تفصيلي</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 5px; font-weight: bold;">الفترة: ${periodLabel}</div>
        </div>
        <div style="flex: 1; text-align: left;">
          <img src="${logoUrl}" alt="Logo" style="max-height: 55px; max-width: 160px; object-fit: contain;" onerror="this.style.display='none'"/>
        </div>
      </div>

      <div class="party-card">
        <div>
          <span style="font-size: 12px; color: #64748b;">اسم الحساب / العميل:</span>
          <span style="font-size: 14px; font-weight: 800; color: #1e3a8a; margin-right: 6px;">${displayName}</span>
          ${party.code ? `<span style="font-size: 11px; color: #64748b; margin-right: 8px;">(كود: ${party.code})</span>` : ''}
        </div>
        <div>
          ${party.phone ? `<span style="font-size: 11px; color: #475569; margin-left: 12px;">📱 ${party.phone}</span>` : ''}
          <span style="font-size: 11px; color: #64748b;">تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')}</span>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 32px;">م</th>
            <th style="width: 80px;">التاريخ</th>
            <th style="width: 90px;">رقم السند/الفاتورة</th>
            <th>البيان والشرح التفصيلي</th>
            <th style="width: 85px;">مدين (سحوبات)</th>
            <th style="width: 85px;">دائن (مقبوضات)</th>
            <th style="width: 95px;">الرصيد التراكمي</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>

      <div class="summary-card">
        <div>
          <div style="font-size: 11px; color: #64748b;">إجمالي السحوبات (مدين): <b style="color: #047857; font-size: 13px;">${totalDebit.toFixed(2)} ${currency}</b></div>
          <div style="font-size: 11px; color: #64748b; margin-top: 3px;">إجمالي المقبوضات (دائن): <b style="color: #b91c1c; font-size: 13px;">${totalCredit.toFixed(2)} ${currency}</b></div>
        </div>
        <div style="text-align: left;">
          <div style="font-size: 11px; color: #475569; font-weight: bold;">صافي الرصيد النهائي المستحق:</div>
          <div style="font-size: 15px; font-weight: 900; color: ${closingBalance > 0 ? '#047857' : closingBalance < 0 ? '#b91c1c' : '#0f172a'}; margin-top: 2px;">
            ${closingLabel}
          </div>
        </div>
      </div>

      <div class="stamp-section">
        <div style="font-size: 11px; color: #475569;">
          <b>توقيع ومصادقة الحسابات:</b> ____________________
        </div>
        <div style="text-align: center;">
          <img src="${stampUrl}" alt="Stamp" style="max-height: 70px; max-width: 90px; object-fit: contain; mix-blend-mode: multiply;" onerror="this.style.display='none'"/>
        </div>
        <div style="font-size: 11px; color: #475569;">
          <b>توقيع الطرف / المستلم:</b> ____________________
        </div>
      </div>
    </body>
    </html>
  `;

  const blob = await renderHtmlToPdfBlob(htmlContent);
  const safeName = party.name.replace(/[/\\?%*:|"<>]/g, '_');
  const filename = `كشف_حساب_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`;

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

  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>كشف أرصدة الصناديق والخزائن</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 24px; direction: rtl; }
        .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; margin-top: 14px; }
        th { background: #0f172a; color: white; padding: 8px; font-size: 12px; border: 1px solid #0f172a; text-align: center; }
        .total-box { margin-top: 20px; padding: 14px; background: #f1f5f9; border: 2px solid #0f172a; border-radius: 6px; display: flex; justify-content: space-between; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="header">
        <h2 style="margin: 0; color: #0f172a;">${settings.businessName || 'مطبعة ومكتبة لبنان'}</h2>
        <h3 style="margin: 6px 0 0 0; color: #1e3a8a;">تقرير أرصدة وحركات الصناديق والخزائن البنكية</h3>
        <p style="margin: 4px 0 0 0; font-size: 11px; color: #64748b;">تاريخ التقرير: ${new Date().toLocaleDateString('ar-EG')} - ${new Date().toLocaleTimeString('ar-EG')}</p>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 40px;">م</th>
            <th>اسم الصندوق / الحساب البنكي</th>
            <th style="width: 120px;">النوع</th>
            <th style="width: 100px;">رقم الحساب</th>
            <th style="width: 130px;">الرصيد الفعلي</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div class="total-box">
        <span>إجمالي السيولة النقدية والبنكية في كافة الخزائن:</span>
        <span style="font-size: 16px; color: #047857;">${totalBalance.toFixed(2)} ${currency}</span>
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

  const rowsHtml = todayInvoices
    .map((inv, idx) => {
      const invTotal = inv.totalAmount || (inv as any).total || 0;
      const invPaid = inv.paidAmount || (inv.paymentMethod === 'cash' ? invTotal : 0);
      return `
        <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}; border-bottom: 1px solid #cbd5e1;">
          <td style="padding: 6px; text-align: center; border: 1px solid #cbd5e1;">${idx + 1}</td>
          <td style="padding: 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold;">${inv.invoiceNumber}</td>
          <td style="padding: 6px; text-align: right; border: 1px solid #cbd5e1;">${inv.customerName || 'زبون نقدي'}</td>
          <td style="padding: 6px; text-align: center; border: 1px solid #cbd5e1;">${inv.paymentMethod === 'cash' ? 'نقدي' : inv.paymentMethod === 'credit' ? 'آجل' : 'شبكة/بنك'}</td>
          <td style="padding: 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold;">${invTotal.toFixed(2)}</td>
          <td style="padding: 6px; text-align: center; border: 1px solid #cbd5e1; color: #047857;">${invPaid.toFixed(2)}</td>
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
        body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 24px; direction: rtl; }
        .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; margin-top: 14px; }
        th { background: #0f172a; color: white; padding: 8px; font-size: 11px; border: 1px solid #0f172a; text-align: center; }
        .summary-grid { display: flex; gap: 12px; margin-top: 18px; }
        .stat-box { flex: 1; padding: 10px; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc; text-align: center; }
      </style>
    </head>
    <body>
      <div class="header">
        <h2 style="margin: 0; color: #0f172a;">${settings.businessName || 'مطبعة ومكتبة لبنان'}</h2>
        <h3 style="margin: 6px 0 0 0; color: #1e3a8a;">تقرير فواتير ومبيعات اليوم (${todayIso})</h3>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 35px;">م</th>
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
          <div style="font-size: 11px; color: #64748b;">عدد الفواتير</div>
          <div style="font-size: 16px; font-weight: bold; color: #0f172a;">${todayInvoices.length}</div>
        </div>
        <div class="stat-box">
          <div style="font-size: 11px; color: #64748b;">إجمالي مبيعات اليوم</div>
          <div style="font-size: 16px; font-weight: bold; color: #047857;">${totalSales.toFixed(2)} ${currency}</div>
        </div>
        <div class="stat-box">
          <div style="font-size: 11px; color: #64748b;">المدفوع نقداً/شبكة</div>
          <div style="font-size: 16px; font-weight: bold; color: #1e3a8a;">${paidSales.toFixed(2)} ${currency}</div>
        </div>
        <div class="stat-box">
          <div style="font-size: 11px; color: #64748b;">المتبقي آجل</div>
          <div style="font-size: 16px; font-weight: bold; color: #b91c1c;">${remainingSales.toFixed(2)} ${currency}</div>
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
        body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 24px; direction: rtl; }
        .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; margin-top: 14px; }
        th { background: #0f172a; color: white; padding: 8px; font-size: 11px; border: 1px solid #0f172a; text-align: center; }
      </style>
    </head>
    <body>
      <div class="header">
        <h2 style="margin: 0; color: #0f172a;">${settings.businessName || 'مطبعة ومكتبة لبنان'}</h2>
        <h3 style="margin: 6px 0 0 0; color: #b91c1c;">تقرير النواقص والأصناف التي بلغت حد الطلب</h3>
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

      <div style="margin-top: 20px; padding: 12px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; display: flex; justify-content: space-between;">
        <span>إجمالي عدد الأصناف الناقصة: <b>${lowStock.length} صنف</b></span>
        <span>إجمالي القيمة التقديرية لكافة المخزون: <b>${totalInventoryValuation.toFixed(2)} ${currency}</b></span>
      </div>
    </body>
    </html>
  `;

  const blob = await renderHtmlToPdfBlob(htmlContent);
  const filename = `تقرير_نواقص_المخزون_${new Date().toISOString().slice(0, 10)}.pdf`;
  return { blob, filename };
}
