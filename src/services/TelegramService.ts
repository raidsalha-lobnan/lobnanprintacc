import { BusinessSettings } from '../types';

let lastUpdateId = 0;
let pollingTimeout: any = null;
let isPollingActive = false;

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
      TelegramService.stopPolling();
      return;
    }

    TelegramService.stopPolling();
    isPollingActive = true;
    const token = settings.telegramConfig.botToken;

    const scheduleNext = (delayMs: number) => {
      if (!isPollingActive) return;
      pollingTimeout = setTimeout(poll, delayMs);
    };

    const poll = async () => {
      if (!isPollingActive) return;
      if (!navigator.onLine) {
        scheduleNext(10000);
        return;
      }

      try {
        const response = await fetch(
          `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=10`
        );

        if (response.status === 409) {
          // Conflict: another tab or instance is polling, back off to avoid console spam
          scheduleNext(25000);
          return;
        }

        if (!response.ok) {
          scheduleNext(15000);
          return;
        }

        const data = await response.json();
        
        if (data.ok && Array.isArray(data.result) && data.result.length > 0) {
          for (const update of data.result) {
            lastUpdateId = update.update_id;
            
            if (update.message && update.message.text) {
              const text = update.message.text;
              const chatId = update.message.chat.id.toString();
              onCommand(text, text, chatId, token);
            }
          }
        }
        scheduleNext(3000);
      } catch (error: any) {
        scheduleNext(15000);
      }
    };

    scheduleNext(1000);
  },

  stopPolling: () => {
    isPollingActive = false;
    if (pollingTimeout) {
      clearTimeout(pollingTimeout);
      pollingTimeout = null;
    }
  }
};
