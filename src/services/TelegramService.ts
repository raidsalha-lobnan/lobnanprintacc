import { BusinessSettings } from '../types';

let lastUpdateId = 0;
let pollingTimeout: any = null;
let isPollingActive = false;

const currentTabId = typeof window !== 'undefined'
  ? (window.name || (window.name = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`))
  : 'server';

export const TelegramService = {
  sendMessage: async (text: string, settings: BusinessSettings): Promise<boolean> => {
    if (!settings.telegramConfig?.enabled || !settings.telegramConfig?.botToken || !settings.telegramConfig?.defaultChatId) {
      return false;
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${settings.telegramConfig.botToken}/sendMessage`, {
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

      return response.ok;
    } catch (error) {
      console.warn('Error sending Telegram message:', error);
      return false;
    }
  },

  sendDocument: async (blob: Blob, filename: string, caption: string, chatId?: string, botToken?: string) => {
    const targetChatId = chatId || '';
    const targetToken = botToken || '';
    if (!targetToken || !targetChatId) return;

    try {
      const formData = new FormData();
      formData.append('chat_id', targetChatId);
      formData.append('document', blob, filename);
      if (caption) formData.append('caption', caption);

      await fetch(`https://api.telegram.org/bot${targetToken}/sendDocument`, {
        method: 'POST',
        body: formData,
      });
    } catch (error) {
      console.warn('Error sending document to Telegram:', error);
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

    const isTabLeader = (): boolean => {
      try {
        const raw = localStorage.getItem('telegram_polling_leader');
        if (!raw) return true;
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.tabId || Date.now() - parsed.time > 15000) return true;
        return parsed.tabId === currentTabId;
      } catch {
        return true;
      }
    };

    const claimLeadership = () => {
      try {
        localStorage.setItem('telegram_polling_leader', JSON.stringify({ tabId: currentTabId, time: Date.now() }));
      } catch {}
    };

    const poll = async () => {
      if (!isPollingActive) return;
      if (!settings.telegramConfig?.enabled || !settings.telegramConfig?.botToken) {
        TelegramService.stopPolling();
        return;
      }
      if (!navigator.onLine) {
        scheduleNext(15000);
        return;
      }

      // Multi-tab coordination: only the leader tab polls Telegram getUpdates
      if (!isTabLeader()) {
        scheduleNext(10000);
        return;
      }
      claimLeadership();

      try {
        const response = await fetch(
          `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=10`
        ).catch(() => null);

        if (!response) {
          scheduleNext(15000);
          return;
        }

        if (response.status === 409) {
          // Conflict: another bot instance or webhook is active. Stop polling to prevent console spam.
          TelegramService.stopPolling();
          return;
        }

        if (!response.ok) {
          scheduleNext(20000);
          return;
        }

        const data = await response.json().catch(() => null);
        
        if (data && data.ok && Array.isArray(data.result) && data.result.length > 0) {
          for (const update of data.result) {
            lastUpdateId = update.update_id;
            
            if (update.message && update.message.text) {
              const text = update.message.text;
              const chatId = update.message.chat.id.toString();
              onCommand(text, text, chatId, token);
            }
          }
        }
        scheduleNext(4000);
      } catch {
        scheduleNext(20000);
      }
    };

    scheduleNext(1500);
  },

  stopPolling: () => {
    isPollingActive = false;
    if (pollingTimeout) {
      clearTimeout(pollingTimeout);
      pollingTimeout = null;
    }
    try {
      const raw = localStorage.getItem('telegram_polling_leader');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.tabId === currentTabId) {
          localStorage.removeItem('telegram_polling_leader');
        }
      }
    } catch {}
  }
};
