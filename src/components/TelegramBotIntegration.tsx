import React, { useEffect, useRef } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { TelegramService, TelegramIncomingAction } from '../services/TelegramService';
import { generateAccountStatement } from '../utils/statementGenerator';
import {
  fuzzyMatchParties,
  fuzzyMatchEmployees,
  getDateRangeForPeriod,
  parseCustomDateRange,
  generateStatementPdfBlob,
  generateTreasuryReportPdfBlob,
  generateSalesReportPdfBlob,
  generateInventoryReportPdfBlob,
} from '../utils/telegramReportsHelper';
import { Party, Employee } from '../types';

interface SessionState {
  step:
    | 'idle'
    | 'awaiting_customer_name'
    | 'awaiting_supplier_name'
    | 'awaiting_employee_name'
    | 'awaiting_custom_period';
  targetPartyId?: string;
  pendingDateRange?: { fromDate: string; toDate: string; label: string };
  lastActivity: number;
}

export const TelegramBotIntegration: React.FC = () => {
  const {
    settings,
    parties,
    journalEntries,
    invoices,
    purchases,
    purchaseReturns,
    salesReturns,
    vouchers,
    printOrders,
    debtClearings,
    treasuries,
    inventory,
    expenses,
    employees,
    updateSettings,
  } = useAccounting();

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const partiesRef = useRef(parties);
  partiesRef.current = parties;

  const invoicesRef = useRef(invoices);
  invoicesRef.current = invoices;

  const purchasesRef = useRef(purchases);
  purchasesRef.current = purchases;

  const purchaseReturnsRef = useRef(purchaseReturns);
  purchaseReturnsRef.current = purchaseReturns;

  const salesReturnsRef = useRef(salesReturns);
  salesReturnsRef.current = salesReturns;

  const vouchersRef = useRef(vouchers);
  vouchersRef.current = vouchers;

  const printOrdersRef = useRef(printOrders);
  printOrdersRef.current = printOrders;

  const journalEntriesRef = useRef(journalEntries);
  journalEntriesRef.current = journalEntries;

  const debtClearingsRef = useRef(debtClearings);
  debtClearingsRef.current = debtClearings;

  const treasuriesRef = useRef(treasuries);
  treasuriesRef.current = treasuries;

  const inventoryRef = useRef(inventory);
  inventoryRef.current = inventory;

  const expensesRef = useRef(expenses);
  expensesRef.current = expenses;

  const employeesRef = useRef(employees);
  employeesRef.current = employees;

  // Session state per chat ID to manage multi-step conversations
  const sessionsRef = useRef<Map<string, SessionState>>(new Map());

  const getSession = (chatId: string): SessionState => {
    let session = sessionsRef.current.get(chatId);
    if (!session || Date.now() - session.lastActivity > 30 * 60 * 1000) {
      session = { step: 'idle', lastActivity: Date.now() };
      sessionsRef.current.set(chatId, session);
    }
    session.lastActivity = Date.now();
    return session;
  };

  const updateSession = (chatId: string, updates: Partial<SessionState>) => {
    const session = getSession(chatId);
    Object.assign(session, updates, { lastActivity: Date.now() });
    sessionsRef.current.set(chatId, session);
  };

  const isEnabled = settings.telegramConfig?.enabled;
  const botToken = settings.telegramConfig?.botToken;

  useEffect(() => {
    if (!isEnabled || !botToken) return;

    // Send Main Reports Menu
    const sendMainMenu = async (chatId: string) => {
      updateSession(chatId, { step: 'idle', targetPartyId: undefined, pendingDateRange: undefined });
      const facilityName = settingsRef.current.businessName || 'مطبعة ومكتبة لبنان';

      const menuText = `
🏢 <b>مرحباً بك في المساعد المحاسبي الذكي</b>
📌 <b>${facilityName}</b>

يرجى اختيار التقرير المطلوب من القائمة التفاعلية:
      `.trim();

      await TelegramService.sendMessage(menuText, settingsRef.current, {
        chatId,
        replyMarkup: {
          inline_keyboard: [
            [
              { text: '👤 كشف حساب عميل', callback_data: 'menu_customer_statement' },
              { text: '🏢 كشف حساب مورد', callback_data: 'menu_supplier_statement' },
            ],
            [
              { text: '💰 كشف حركة الصناديق', callback_data: 'menu_treasury_report' },
              { text: '📊 مبيعات وفواتير اليوم', callback_data: 'menu_sales_report' },
            ],
            [
              { text: '📦 نواقص المخزون', callback_data: 'menu_inventory_report' },
              { text: '📑 ملخص المصروفات', callback_data: 'menu_expenses_report' },
            ],
            [
              { text: '👷 كشف حساب موظف', callback_data: 'menu_employee_statement' },
              { text: '🔄 تحديث القائمة', callback_data: 'menu_main' },
            ],
          ],
        },
      });
    };

    // Ask to confirm party match
    const sendPartyConfirmation = async (
      chatId: string,
      matches: { party: Party; score: number }[],
      type: 'customer' | 'supplier',
      customRange?: { fromDate: string; toDate: string; label: string }
    ) => {
      const best = matches[0].party;
      const currency = (settingsRef.current as any).currency || '₪';
      const typeLabel = type === 'customer' ? 'العميل' : 'المورد';
      const bal = best.balance || 0;
      const balText =
        bal > 0
          ? `${bal.toFixed(2)} ${currency} (مدين / مطلوب منه)`
          : bal < 0
          ? `${Math.abs(bal).toFixed(2)} ${currency} (دائن / مستحق له)`
          : `0.00 ${currency} (خالص)`;

      if (customRange) {
        updateSession(chatId, { pendingDateRange: customRange });
      }

      const text = `
🔍 <b>نتيجة البحث عن ${typeLabel}:</b>
هل تقصد: <b>${best.name}</b>؟
📌 الرصيد الحالي: <b>${balText}</b>
${best.phone ? `📱 الهاتف: <code>${best.phone}</code>` : ''}
${customRange ? `📅 الفترة المحددة: <b>${customRange.label}</b>` : ''}
      `.trim();

      const inlineKeyboard: any[][] = [
        [{ text: `✅ نعم، أقصد: ${best.name}`, callback_data: `confirm_party_${best.id}` }],
      ];

      // Add close alternative matches if available
      if (matches.length > 1) {
        const alt1 = matches[1].party;
        inlineKeyboard.push([{ text: `🔍 أقصد: ${alt1.name}`, callback_data: `confirm_party_${alt1.id}` }]);
      }
      if (matches.length > 2) {
        const alt2 = matches[2].party;
        inlineKeyboard.push([{ text: `🔍 أقصد: ${alt2.name}`, callback_data: `confirm_party_${alt2.id}` }]);
      }

      inlineKeyboard.push([
        { text: '❌ لا، كتابة اسم آخر', callback_data: `retry_search_${type}` },
        { text: '🏠 القائمة الرئيسية', callback_data: 'menu_main' },
      ]);

      await TelegramService.sendMessage(text, settingsRef.current, {
        chatId,
        replyMarkup: { inline_keyboard: inlineKeyboard },
      });
    };

    // Send period selection buttons for statement (including custom from-to date selection)
    const sendPeriodSelection = async (chatId: string, party: Party) => {
      const currency = (settingsRef.current as any).currency || '₪';
      const promptText = `
✅ <b>تم تحديد الحساب:</b>
<b>${party.name}</b> (الرصيد: ${(party.balance || 0).toFixed(2)} ${currency})

📅 <b>يرجى اختيار الفترة الزمنية لكشف الحساب:</b>
      `.trim();

      await TelegramService.sendMessage(promptText, settingsRef.current, {
        chatId,
        replyMarkup: {
          inline_keyboard: [
            [
              { text: '📅 اليوم فقط', callback_data: `period_today_${party.id}` },
              { text: '📅 هذا الشهر', callback_data: `period_this_month_${party.id}` },
            ],
            [
              { text: '🗓️ آخر 30 يوم', callback_data: `period_last_30_days_${party.id}` },
              { text: '📆 السنة الحالية', callback_data: `period_this_year_${party.id}` },
            ],
            [
              { text: '♾️ كافة الحركات', callback_data: `period_all_${party.id}` },
              { text: '🎯 تحديد فترة مخصصة (من - إلى)', callback_data: `period_custom_${party.id}` },
            ],
            [{ text: '🔙 رجوع للقائمة', callback_data: 'menu_main' }],
          ],
        },
      });
    };

    // Dispatch statement PDF (matching the exact on-screen format with nested item sub-tables)
    const dispatchStatementPdf = async (
      chatId: string,
      partyId: string,
      period:
        | 'today'
        | 'this_month'
        | 'last_month'
        | 'last_30_days'
        | 'this_year'
        | 'all'
        | { fromDate: string; toDate: string; label: string }
    ) => {
      const party = partiesRef.current.find(p => p.id === partyId);
      if (!party) {
        await TelegramService.sendMessage('❌ لم يتم العثور على الحساب المحدد.', settingsRef.current, { chatId });
        return;
      }

      const { fromDate, toDate, label: periodLabel } =
        typeof period === 'object' ? period : getDateRangeForPeriod(period);

      await TelegramService.sendMessage(
        `⏳ <b>جاري تجهيز كشف الحساب التفصيلي بالبنود الكاملة...</b>\nالطرف: <b>${party.name}</b>\nالفترة: <b>${periodLabel}</b>\nيرجى الانتظار لحظات معدودة.`,
        settingsRef.current,
        { chatId }
      );

      try {
        const parentParty = party.parentCustomerId
          ? partiesRef.current.find(p => p.id === party.parentCustomerId) || null
          : null;

        const statementResult = generateAccountStatement({
          party,
          fromDate,
          toDate,
          invoices: invoicesRef.current,
          purchases: purchasesRef.current,
          purchaseReturns: purchaseReturnsRef.current,
          salesReturns: salesReturnsRef.current,
          vouchers: vouchersRef.current,
          printOrders: printOrdersRef.current,
          journalEntries: journalEntriesRef.current,
          debtClearings: debtClearingsRef.current,
        });

        const { blob, filename } = await generateStatementPdfBlob({
          party,
          parentParty,
          statementResult,
          settings: settingsRef.current,
          periodLabel,
        });

        const currency = (settingsRef.current as any).currency || '₪';
        const closingBal = statementResult.closingBalance || 0;
        const balLabel =
          closingBal > 0
            ? `مدين: ${closingBal.toFixed(2)} ${currency}`
            : closingBal < 0
            ? `دائن: ${Math.abs(closingBal).toFixed(2)} ${currency}`
            : `خالص (0.00)`;

        const caption = `
📄 <b>كشف حساب تفصيلي: ${party.name}</b>
📅 الفترة: ${periodLabel}
➕ إجمالي السحوبات (مدين): ${statementResult.totalDebit.toFixed(2)} ${currency}
➖ إجمالي المقبوضات (دائن): ${statementResult.totalCredit.toFixed(2)} ${currency}
🎯 صافي الرصيد النهائي: <b>${balLabel}</b>
        `.trim();

        await TelegramService.sendDocument(blob, filename, caption, chatId, botToken);

        // Offer next actions
        await TelegramService.sendMessage('هل ترغب في طلب كشف آخر أو تقرير جديد؟', settingsRef.current, {
          chatId,
          replyMarkup: {
            inline_keyboard: [
              [
                { text: '👤 كشف عميل آخر', callback_data: 'menu_customer_statement' },
                { text: '🏢 كشف مورد آخر', callback_data: 'menu_supplier_statement' },
              ],
              [{ text: '🏠 القائمة الرئيسية', callback_data: 'menu_main' }],
            ],
          },
        });
      } catch (err: any) {
        console.error('Failed to generate statement PDF for Telegram:', err);
        await TelegramService.sendMessage(
          '❌ حدث خطأ أثناء تجهيز ملف الـ PDF لكشف الحساب. يرجى المحاولة مرة أخرى.',
          settingsRef.current,
          { chatId }
        );
      }
    };

    // Dispatch Treasury Report
    const dispatchTreasuryReport = async (chatId: string) => {
      const activeTreasuries = treasuriesRef.current;
      const currency = (settingsRef.current as any).currency || '₪';
      const totalLiquidity = activeTreasuries.reduce((sum, t) => sum + (t.balance || 0), 0);

      const summaryLines = activeTreasuries
        .map(t => `• <b>${t.name}</b>: ${(t.balance || 0).toFixed(2)} ${t.currency || currency}`)
        .join('\n');

      const message = `
💰 <b>أرصدة الصناديق والخزائن البنكية الحالية:</b>
${summaryLines}

━━━━━━━━━━━━━━━
💵 <b>إجمالي السيولة النقدية:</b> <b>${totalLiquidity.toFixed(2)} ${currency}</b>
⏳ جاري إرسال التقرير التفصيلي بصيغة PDF...
      `.trim();

      await TelegramService.sendMessage(message, settingsRef.current, { chatId });

      try {
        const { blob, filename } = await generateTreasuryReportPdfBlob({
          treasuries: activeTreasuries,
          settings: settingsRef.current,
        });

        await TelegramService.sendDocument(
          blob,
          filename,
          `كشف حركة وأرصدة الصناديق والخزائن - إجمالي السيولة: ${totalLiquidity.toFixed(2)} ${currency}`,
          chatId,
          botToken
        );
      } catch (err) {
        console.error('Treasury report PDF error:', err);
      }
    };

    // Dispatch Sales Report
    const dispatchSalesReport = async (chatId: string) => {
      const todayIso = new Date().toISOString().split('T')[0];
      const todayInvoices = invoicesRef.current.filter(inv => inv.date && inv.date.startsWith(todayIso));
      const currency = (settingsRef.current as any).currency || '₪';

      const totalSales = todayInvoices.reduce((sum, inv) => sum + (inv.totalAmount || (inv as any).total || 0), 0);
      const paidSales = todayInvoices.reduce(
        (sum, inv) => sum + (inv.paidAmount || (inv.paymentMethod === 'cash' ? inv.totalAmount : 0) || 0),
        0
      );
      const remainingSales = Math.max(0, totalSales - paidSales);

      const msg = `
📊 <b>تقرير مبيعات اليوم (${todayIso}):</b>
🧾 عدد الفواتير الصادرة اليوم: <b>${todayInvoices.length} فاتورة</b>
💰 إجمالي قيمة المبيعات: <b>${totalSales.toFixed(2)} ${currency}</b>
💵 المحصل نقداً وشبكة: <b>${paidSales.toFixed(2)} ${currency}</b>
⏳ المتبقي ذمم آجلة: <b>${remainingSales.toFixed(2)} ${currency}</b>

⏳ جاري إنشاء ملف تقرير الفواتير التفصيلي PDF...
      `.trim();

      await TelegramService.sendMessage(msg, settingsRef.current, { chatId });

      try {
        const { blob, filename } = await generateSalesReportPdfBlob({
          invoices: invoicesRef.current,
          settings: settingsRef.current,
        });

        await TelegramService.sendDocument(
          blob,
          filename,
          `تقرير مبيعات اليوم (${todayIso}) - الإجمالي: ${totalSales.toFixed(2)} ${currency}`,
          chatId,
          botToken
        );
      } catch (err) {
        console.error('Sales report PDF error:', err);
      }
    };

    // Dispatch Inventory Report
    const dispatchInventoryReport = async (chatId: string) => {
      const items = inventoryRef.current;
      const lowStock = items.filter(it => it.category !== 'copy_scan' && it.stockQuantity <= it.minAlertQuantity);
      const currency = (settingsRef.current as any).currency || '₪';
      const totalValuation = items.reduce((sum, it) => sum + it.stockQuantity * (it.purchasePrice || 0), 0);

      const preview = lowStock
        .slice(0, 5)
        .map(it => `• <b>${it.name}</b>: رصيد <code>${it.stockQuantity}</code> (حد الطلب: ${it.minAlertQuantity})`)
        .join('\n');

      const msg = `
📦 <b>تقرير تنبيهات ونواقص المخزون:</b>
⚠️ عدد الأصناف التي بلغت حد الطلب: <b>${lowStock.length} صنف</b>
💎 إجمالي القيمة التقديرية لكافة المخزون: <b>${totalValuation.toFixed(2)} ${currency}</b>

${preview ? `<b>أبرز النواقص:</b>\n${preview}\n${lowStock.length > 5 ? `... وغيرها (${lowStock.length - 5}) صنف آخر.` : ''}` : '✅ جميع الأصناف بحالة ممتازة وفوق حد الأمان.'}

⏳ جاري إرسال كشف النواقص الكامل PDF...
      `.trim();

      await TelegramService.sendMessage(msg, settingsRef.current, { chatId });

      try {
        const { blob, filename } = await generateInventoryReportPdfBlob({
          inventory: items,
          settings: settingsRef.current,
        });

        await TelegramService.sendDocument(
          blob,
          filename,
          `تقرير النواقص وتنبيهات المخزون (${lowStock.length} صنف ناقص)`,
          chatId,
          botToken
        );
      } catch (err) {
        console.error('Inventory report PDF error:', err);
      }
    };

    // Dispatch Expenses Report
    const dispatchExpensesReport = async (chatId: string) => {
      const allExpenses = expensesRef.current;
      const currency = (settingsRef.current as any).currency || '₪';
      const currentMonthIso = new Date().toISOString().slice(0, 7);

      const thisMonthExpenses = allExpenses.filter(e => e.date && e.date.startsWith(currentMonthIso));
      const totalAmount = thisMonthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

      // Group by category
      const categoriesMap: Record<string, number> = {};
      thisMonthExpenses.forEach(e => {
        const cat = e.categoryName || 'مصروفات عامة';
        categoriesMap[cat] = (categoriesMap[cat] || 0) + (e.amount || 0);
      });

      const catLines = Object.entries(categoriesMap)
        .map(([cat, amt]) => `• ${cat}: <b>${amt.toFixed(2)} ${currency}</b>`)
        .join('\n');

      const msg = `
📑 <b>تقرير المصروفات لشهر (${currentMonthIso}):</b>
💰 إجمالي المصروفات: <b>${totalAmount.toFixed(2)} ${currency}</b>
عدد الحركات: <b>${thisMonthExpenses.length}</b>

<b>توزيع المصروفات حسب التصنيف:</b>
${catLines || 'لا توجد حركات مصروفات مسجلة لهذا الشهر.'}
      `.trim();

      await TelegramService.sendMessage(msg, settingsRef.current, {
        chatId,
        replyMarkup: {
          inline_keyboard: [[{ text: '🏠 القائمة الرئيسية', callback_data: 'menu_main' }]],
        },
      });
    };

    // Start Central Polling
    TelegramService.startPolling(settingsRef.current, async (action: TelegramIncomingAction) => {
      const { type, text, data, chatId } = action;
      const session = getSession(chatId);

      // Handle chatId setup / recognition
      if (!settingsRef.current.telegramConfig?.defaultChatId && text === 'مرحبا') {
        await TelegramService.sendMessage(
          `مرحباً بك! لقد تم التعرف على معرف الدردشة الخاص بك بنجاح:\n<code>${chatId}</code>\nتم ربطه بالبرنامج تلقائياً.`,
          settingsRef.current,
          { chatId }
        );
        updateSettings({
          telegramConfig: {
            ...settingsRef.current.telegramConfig,
            botToken,
            defaultChatId: chatId,
            enabled: true,
          },
        });
        await sendMainMenu(chatId);
        return;
      }

      // ==========================================
      // 1. CALLBACK QUERY ACTIONS (Button clicks)
      // ==========================================
      if (type === 'callback' && data) {
        if (data === 'menu_main') {
          await sendMainMenu(chatId);
          return;
        }

        if (data === 'menu_customer_statement' || data === 'retry_search_customer') {
          updateSession(chatId, { step: 'awaiting_customer_name', targetPartyId: undefined, pendingDateRange: undefined });
          await TelegramService.sendMessage(
            '👤 <b>طلب كشف حساب عميل:</b>\nيرجى كتابة اسم العميل (أو جزء منه أو رقمه):',
            settingsRef.current,
            {
              chatId,
              replyMarkup: {
                inline_keyboard: [[{ text: '❌ إلغاء ورجوع', callback_data: 'menu_main' }]],
              },
            }
          );
          return;
        }

        if (data === 'menu_supplier_statement' || data === 'retry_search_supplier') {
          updateSession(chatId, { step: 'awaiting_supplier_name', targetPartyId: undefined, pendingDateRange: undefined });
          await TelegramService.sendMessage(
            '🏢 <b>طلب كشف حساب مورد:</b>\nيرجى كتابة اسم المورد (أو جزء منه أو كوده):',
            settingsRef.current,
            {
              chatId,
              replyMarkup: {
                inline_keyboard: [[{ text: '❌ إلغاء ورجوع', callback_data: 'menu_main' }]],
              },
            }
          );
          return;
        }

        if (data === 'menu_treasury_report') {
          await dispatchTreasuryReport(chatId);
          return;
        }

        if (data === 'menu_sales_report') {
          await dispatchSalesReport(chatId);
          return;
        }

        if (data === 'menu_inventory_report') {
          await dispatchInventoryReport(chatId);
          return;
        }

        if (data === 'menu_expenses_report') {
          await dispatchExpensesReport(chatId);
          return;
        }

        if (data === 'menu_employee_statement') {
          updateSession(chatId, { step: 'awaiting_employee_name' });
          await TelegramService.sendMessage(
            '👷 <b>طلب كشف حساب موظف:</b>\nيرجى كتابة اسم الموظف:',
            settingsRef.current,
            {
              chatId,
              replyMarkup: {
                inline_keyboard: [[{ text: '❌ إلغاء ورجوع', callback_data: 'menu_main' }]],
              },
            }
          );
          return;
        }

        // Confirming party from suggestion buttons
        if (data.startsWith('confirm_party_')) {
          const partyId = data.replace('confirm_party_', '');
          const party = partiesRef.current.find(p => p.id === partyId);
          if (party) {
            // Check if there was already a pending custom date range
            if (session.pendingDateRange) {
              const pendingRange = session.pendingDateRange;
              updateSession(chatId, { step: 'idle', pendingDateRange: undefined });
              await dispatchStatementPdf(chatId, party.id, pendingRange);
            } else {
              updateSession(chatId, { step: 'idle' });
              await sendPeriodSelection(chatId, party);
            }
          } else {
            await TelegramService.sendMessage('❌ تعذر العثور على الطرف المحدد.', settingsRef.current, { chatId });
          }
          return;
        }

        // Prompting for custom date range (من - إلى)
        if (data.startsWith('period_custom_')) {
          const targetPartyId = data.replace('period_custom_', '');
          const party = partiesRef.current.find(p => p.id === targetPartyId);
          if (party) {
            updateSession(chatId, { step: 'awaiting_custom_period', targetPartyId });
            await TelegramService.sendMessage(
              `🎯 <b>تحديد فترة مخصصة لكشف الحساب:</b>\nالحساب: <b>${party.name}</b>\n\nيرجى كتابة أو إرسال تاريخ البداية والنهاية، مثلاً:\n<code>2026-10-01 إلى 2026-11-01</code>\nأو:\n<code>01-11-2026</code> (ليوم واحد فقط)\nأو:\n<code>من 01-10-2026 الى 31-10-2026</code>`,
              settingsRef.current,
              {
                chatId,
                replyMarkup: {
                  inline_keyboard: [
                    [
                      { text: '📅 اليوم فقط', callback_data: `period_today_${party.id}` },
                      { text: '📅 هذا الشهر', callback_data: `period_this_month_${party.id}` },
                    ],
                    [{ text: '❌ إلغاء ورجوع', callback_data: 'menu_main' }],
                  ],
                },
              }
            );
          }
          return;
        }

        // Period selection for PDF generation
        if (data.startsWith('period_')) {
          let periodType: 'today' | 'this_month' | 'last_30_days' | 'this_year' | 'all' = 'all';
          let targetPartyId = '';

          if (data.startsWith('period_today_')) {
            periodType = 'today';
            targetPartyId = data.replace('period_today_', '');
          } else if (data.startsWith('period_this_month_')) {
            periodType = 'this_month';
            targetPartyId = data.replace('period_this_month_', '');
          } else if (data.startsWith('period_last_30_days_')) {
            periodType = 'last_30_days';
            targetPartyId = data.replace('period_last_30_days_', '');
          } else if (data.startsWith('period_this_year_')) {
            periodType = 'this_year';
            targetPartyId = data.replace('period_this_year_', '');
          } else if (data.startsWith('period_all_')) {
            periodType = 'all';
            targetPartyId = data.replace('period_all_', '');
          }

          if (targetPartyId) {
            await dispatchStatementPdf(chatId, targetPartyId, periodType);
          }
          return;
        }
      }

      // ==========================================
      // 2. TEXT MESSAGE ACTIONS (Commands & Input)
      // ==========================================
      const cleanText = (text || '').trim();

      // Basic menu triggers
      if (
        cleanText === '/start' ||
        cleanText === 'مرحبا' ||
        cleanText === 'القائمة' ||
        cleanText === 'التقارير' ||
        cleanText === 'اوامر' ||
        cleanText === 'أوامر' ||
        cleanText === '/menu' ||
        cleanText === '/help'
      ) {
        await sendMainMenu(chatId);
        return;
      }

      // Direct shortcuts
      if (cleanText === 'الصناديق' || cleanText === 'الخزينة' || cleanText === 'الرصيد') {
        await dispatchTreasuryReport(chatId);
        return;
      }

      if (cleanText === 'المبيعات' || cleanText === 'مبيعات اليوم') {
        await dispatchSalesReport(chatId);
        return;
      }

      if (cleanText === 'المخزون' || cleanText === 'النواقص') {
        await dispatchInventoryReport(chatId);
        return;
      }

      // Handling user typing custom dates (من - إلى)
      if (session.step === 'awaiting_custom_period' && session.targetPartyId) {
        const customRange = parseCustomDateRange(cleanText);
        if (customRange) {
          const partyId = session.targetPartyId;
          updateSession(chatId, { step: 'idle', targetPartyId: undefined });
          await dispatchStatementPdf(chatId, partyId, customRange);
          return;
        } else {
          await TelegramService.sendMessage(
            `⚠️ <b>تعذر فهم التاريخين المدخلين:</b> "<code>${cleanText}</code>"\n\nيرجى كتابتها بهذا الشكل:\n<code>2026-10-01 إلى 2026-11-01</code>\nأو:\n<code>01-11-2026</code> (ليوم واحد)\nأو اختيار فترة سريعة أدناه:`,
            settingsRef.current,
            {
              chatId,
              replyMarkup: {
                inline_keyboard: [
                  [
                    { text: '📅 اليوم فقط', callback_data: `period_today_${session.targetPartyId}` },
                    { text: '📅 هذا الشهر', callback_data: `period_this_month_${session.targetPartyId}` },
                  ],
                  [{ text: '🏠 إلغاء ورجوع للقائمة', callback_data: 'menu_main' }],
                ],
              },
            }
          );
          return;
        }
      }

      // 3. Flexible statement detection: 'كشف قوافل غزة', 'كشف حساب ...', 'طلب كشف ...', or direct party names
      const isStatementPrefix = /^(طلب\s+)?كشف(\s+حساب)?(\s+(عميل|مورد))?\s+/i.test(cleanText);
      const isSupplierSpecific = /مورد/i.test(cleanText);

      if (isStatementPrefix || session.step === 'awaiting_customer_name' || session.step === 'awaiting_supplier_name') {
        const rawQuery = isStatementPrefix
          ? cleanText.replace(/^(طلب\s+)?كشف(\s+حساب)?(\s+(عميل|مورد))?\s+/i, '').trim()
          : cleanText;

        const embeddedRange = parseCustomDateRange(rawQuery);
        let query = rawQuery;
        if (embeddedRange) {
          query = rawQuery
            .replace(/(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})|(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})/g, '')
            .replace(/\b(من|إلى|الى|تاريخ|فترة|يوم)\b/g, '')
            .trim();
        }

        const filterType = isSupplierSpecific || session.step === 'awaiting_supplier_name'
          ? 'supplier'
          : session.step === 'awaiting_customer_name'
          ? 'customer'
          : 'all';

        const matches = fuzzyMatchParties(query, partiesRef.current, filterType);

        if (matches.length > 0) {
          await sendPartyConfirmation(
            chatId,
            matches,
            matches[0].party.type === 'supplier' ? 'supplier' : 'customer',
            embeddedRange || undefined
          );
          return;
        } else if (session.step !== 'idle') {
          await TelegramService.sendMessage(
            `❌ عذراً، لم يتم العثور على أي حساب يطابق الاسم "<b>${query}</b>".\nيرجى كتابة الاسم بصيغة أخرى، أو استخدام القائمة:`,
            settingsRef.current,
            {
              chatId,
              replyMarkup: {
                inline_keyboard: [
                  [{ text: '👤 كشف حساب عميل', callback_data: 'menu_customer_statement' }],
                  [{ text: '🏢 كشف حساب مورد', callback_data: 'menu_supplier_statement' }],
                  [{ text: '🏠 القائمة الرئيسية', callback_data: 'menu_main' }],
                ],
              },
            }
          );
          return;
        }
      }

      // Check if user directly typed a party name during idle state (e.g. 'قوافل غزة')
      if (cleanText.length >= 2) {
        const directMatches = fuzzyMatchParties(cleanText, partiesRef.current, 'all');
        if (directMatches.length > 0 && directMatches[0].score >= 50) {
          await sendPartyConfirmation(
            chatId,
            directMatches,
            directMatches[0].party.type === 'supplier' ? 'supplier' : 'customer'
          );
          return;
        }
      }

      // Default fallback: prompt with main menu
      await TelegramService.sendMessage(
        `لم أتمكن من التعرف على الأمر "<b>${cleanText}</b>". يمكنك استخدام القائمة التفاعلية أدناه:`,
        settingsRef.current,
        {
          chatId,
          replyMarkup: {
            inline_keyboard: [
              [
                { text: '👤 كشف حساب عميل', callback_data: 'menu_customer_statement' },
                { text: '🏢 كشف حساب مورد', callback_data: 'menu_supplier_statement' },
              ],
              [
                { text: '💰 كشف الصناديق', callback_data: 'menu_treasury_report' },
                { text: '📊 مبيعات اليوم', callback_data: 'menu_sales_report' },
              ],
              [{ text: '🏠 عرض كافة التقارير', callback_data: 'menu_main' }],
            ],
          },
        }
      );
    });

    return () => {
      TelegramService.stopPolling();
    };
  }, [isEnabled, botToken]);

  return null;
};
