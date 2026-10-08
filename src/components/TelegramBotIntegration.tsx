import React, { useEffect } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { TelegramService } from '../services/TelegramService';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export const TelegramBotIntegration: React.FC = () => {
  const { settings, parties, journalEntries, invoices, vouchers, updateSettings } = useAccounting();

  useEffect(() => {
    TelegramService.startPolling(settings, async (command, text, chatId, botToken) => {
      console.log('Received Telegram command:', command);
      
      if (!settings.telegramConfig?.defaultChatId && text === 'مرحبا') {
         TelegramService.sendMessage("مرحباً! لقد تم التعرف على معرف الدردشة الخاص بك: " + chatId + "\nيرجى حفظه.", {
           ...settings,
           telegramConfig: { ...settings.telegramConfig, botToken, defaultChatId: chatId, enabled: true }
         });
         
         updateSettings({
           telegramConfig: {
             ...settings.telegramConfig,
             botToken,
             defaultChatId: chatId,
             enabled: true
           }
         });
      }

      if (text.startsWith('كشف حساب ')) {
        const nameToSearch = text.replace('كشف حساب ', '').trim();
        
        const party = parties.find(p => p.name.includes(nameToSearch) || p.companyName?.includes(nameToSearch));
        if (!party) {
          TelegramService.sendMessage("لم يتم العثور على عميل أو مورد باسم: <b>" + nameToSearch + "</b>", settings);
          return;
        }

        TelegramService.sendMessage("جاري تجهيز كشف حساب <b>" + party.name + "</b>...", settings);

        try {
          const htmlContent = `
            <html dir="rtl">
            <head>
              <meta charset="UTF-8">
              <style>
                body { font-family: Tahoma, Arial, sans-serif; padding: 20px; }
                h1 { color: #1e3a8a; text-align: center; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
                th { background-color: #f1f5f9; }
                .balance { font-size: 18px; font-weight: bold; margin-top: 20px; text-align: left; }
              </style>
            </head>
            <body>
              <h1>كشف حساب: ${party.name}</h1>
              <p>رقم الحساب: ${party.code}</p>
              <table>
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>البيان</th>
                    <th>مدين (عليك)</th>
                    <th>دائن (لك)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>${new Date().toLocaleDateString('ar-SA')}</td>
                    <td>الرصيد الحالي</td>
                    <td>${party.balance > 0 ? party.balance : 0}</td>
                    <td>${party.balance < 0 ? Math.abs(party.balance) : 0}</td>
                  </tr>
                </tbody>
              </table>
              <div class="balance">
                صافي الرصيد: ${Math.abs(party.balance)} ${settings.currency} ${party.balance > 0 ? 'مدين (عليك)' : party.balance < 0 ? 'دائن (لك)' : ''}
              </div>
            </body>
            </html>
          `;

          const iframe = document.createElement('iframe');
          iframe.style.position = 'absolute';
          iframe.style.top = '-9999px';
          iframe.style.width = '800px';
          iframe.style.height = '1000px'; // Give it some height
          document.body.appendChild(iframe);
          
          const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
          if (iframeDoc) {
             iframeDoc.open();
             iframeDoc.write(htmlContent);
             iframeDoc.close();
          }
          
          const html2canvas = (await import('html2canvas')).default;
          // Wait a bit for iframe to render
          await new Promise(resolve => setTimeout(resolve, 500));
          const canvas = await html2canvas(iframeDoc!.body, { scale: 2 });
          document.body.removeChild(iframe);

          const imgData = canvas.toDataURL('image/png');
          const pdf = new jsPDF('p', 'mm', 'a4');
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
          
          pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
          const pdfBlob = pdf.output('blob');
          
          await TelegramService.sendDocument(pdfBlob, "statement_" + party.name + ".pdf", "كشف حساب " + party.name, chatId, botToken);
          
        } catch (error) {
          console.error('Error generating PDF:', error);
          TelegramService.sendMessage("حدث خطأ أثناء إنشاء كشف الحساب.", settings);
        }
      }
    });

    return () => {
      TelegramService.stopPolling();
    };
  }, [settings, parties, updateSettings]); 

  return null;
};
