import React, { useEffect, useRef } from 'react';
import { useAccounting } from '../context/AccountingContext';
import {
  getCachedDriveToken,
  executeHourlyDriveBackupFlow
} from '../services/googleDriveBackupService';

const STORAGE_KEY_AUTO_BACKUP = 'lobnan_drive_auto_backup_enabled';
const STORAGE_KEY_RETENTION = 'lobnan_drive_retention_confirmed';
const STORAGE_KEY_LAST_TIME = 'lobnan_drive_last_backup_time';
const STORAGE_KEY_LAST_INFO = 'lobnan_drive_last_backup_info';
const ONE_HOUR_MS = 60 * 60 * 1000; // 1 hour

export const GoogleDriveAutoBackupWorker: React.FC = () => {
  const accounting = useAccounting();
  const isRunningRef = useRef(false);

  useEffect(() => {
    const checkAndRunHourlyBackup = async () => {
      if (isRunningRef.current) return;

      const autoEnabled = true; // MANDATORY BY DEFAULT
      if (!autoEnabled) return;

      const token = getCachedDriveToken();
      if (!token) {
        // Not connected or token not yet in memory
        return;
      }

      const lastTimeStr = localStorage.getItem(STORAGE_KEY_LAST_TIME);
      const lastTime = lastTimeStr ? parseInt(lastTimeStr, 10) : 0;
      const now = Date.now();

      // Check if 1 hour has elapsed since last backup
      if (now - lastTime < ONE_HOUR_MS) {
        return;
      }

      try {
        isRunningRef.current = true;
        const retentionConfirmed = true; // MANDATORY 7-DAY RETENTION ENFORCED

        // Prepare full backup snapshot
        const fullBackup = {
          version: '2.0',
          systemName: 'برنامج الأيهم المحاسبي - مطبعة ومكتبة لبنان',
          exportedAt: new Date().toISOString(),
          exportedBy: accounting.currentUser?.fullName || accounting.currentUser?.username || 'النسخ الاحتياطي التلقائي الدوري (كل ساعة)',
          settings: accounting.settings,
          companies: accounting.companies,
          branches: accounting.branches,
          warehouses: accounting.warehouses,
          warehouseOperations: accounting.warehouseOperations,
          users: accounting.users,
          roles: accounting.roles,
          accounts: accounting.accounts,
          journalEntries: accounting.journalEntries,
          inventory: accounting.inventory,
          stockMovements: accounting.stockMovements,
          parties: accounting.parties,
          employees: accounting.employees,
          employeeAdvances: accounting.employeeAdvances,
          employeeDeductions: accounting.employeeDeductions,
          employeeIncentives: accounting.employeeIncentives,
          payrollSheets: accounting.payrollSheets,
          printOrders: accounting.printOrders,
          invoices: accounting.invoices,
          purchases: accounting.purchases,
          purchaseReturns: accounting.purchaseReturns,
          salesReturns: accounting.salesReturns,
          vouchers: accounting.vouchers,
          treasuries: accounting.treasuries,
          debtClearings: accounting.debtClearings,
          expenses: accounting.expenses
        };

        const result = await executeHourlyDriveBackupFlow(token, fullBackup, {
          retentionDays: 7,
          autoCleanOld: retentionConfirmed
        });

        if (result.success) {
          localStorage.setItem(STORAGE_KEY_LAST_TIME, now.toString());
          localStorage.setItem(STORAGE_KEY_LAST_INFO, JSON.stringify(result));
          console.log('✓ Google Drive hourly backup succeeded:', result.fileName, `(Deleted ${result.deletedOldBackupsCount} backups older than 7 days)`);
        } else {
          console.warn('Google Drive hourly backup failed:', result.error);
        }
      } catch (err) {
        console.warn('Hourly backup worker error:', err);
      } finally {
        isRunningRef.current = false;
      }
    };

    // Check once upon mount (after 10 seconds to allow app and auth to settle)
    const initialTimeout = setTimeout(checkAndRunHourlyBackup, 10000);

    // Check every 1 minute
    const interval = setInterval(checkAndRunHourlyBackup, 60000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [accounting]);

  return null;
};
