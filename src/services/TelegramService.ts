import { BusinessSettings } from '../types';

let lastUpdateId = 0;
let pollingInterval: any = null;

export const TelegramService = {
  sendMessage: async (text: string, settings: BusinessSettings) => {
    if (!settings.telegramConfig?.enabled || !settings.telegramConfig?.botToken || !settings.telegramConfig?.defaultChatId) {
      return;
    }
    
    try {
      await fetch(`https://api.telegram.org/bot${settings.telegramConfig.botToken}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: settings.telegramConfig.defaultChatId,
          text,
          parse_mode: 'HTML',
        }),
      });
    } catch (error) {
      console.error('Error sending Telegram message:', error);
    }
  },

  sendDocument: async (blob: Blob, filename: string, caption: string, chatId: string, botToken: string) => {
    try {
      const formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('document', blob, filename);
      if (caption) formData.append('caption', caption);

      await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
        method: 'POST',
        body: formData,
      });
    } catch (error) {
      console.error('Error sending document to Telegram:', error);
    }
  },

  startPolling: (
    settings: BusinessSettings,
    onCommand: (command: string, text: string, chatId: string, botToken: string) => void
  ) => {
    if (!settings.telegramConfig?.enabled || !settings.telegramConfig?.botToken) {
      if (pollingInterval) clearInterval(pollingInterval);
      return;
    }

    if (pollingInterval) clearInterval(pollingInterval);

    const token = settings.telegramConfig.botToken;

    const poll = async () => {
      if (!navigator.onLine) return;
      try {
        const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`);
        const data = await response.json();
        
        if (data.ok && data.result.length > 0) {
          for (const update of data.result) {
            lastUpdateId = update.update_id;
            
            if (update.message && update.message.text) {
              const text = update.message.text;
              const chatId = update.message.chat.id.toString();
              
              // Call the handler
              onCommand(text, text, chatId, token);
            }
          }
        }
      } catch (error: any) {
        if (error?.message !== 'Failed to fetch') {
          console.error('Telegram polling error:', error);
        }
      }
    };

    pollingInterval = setInterval(poll, 3000);
  },

  stopPolling: () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }
};
