import { Party } from '../types';

/**
 * دالة توليد الرقم التسلسلي الآلي للعملاء والموردين
 * - يصدر الرقم تلقائياً من البرنامج بنظام تسلسلي يبدأ من 0001 (مثل CUST-0001 للعملاء و SUPP-0001 للموردين)
 * - غير قابل للتعديل أو التكرار نهائياً
 */
export function generateSequentialPartyCode(
  type: 'customer' | 'supplier' | 'both',
  existingParties: Array<{ code?: string; type?: string; isSubCustomer?: boolean }>,
  isSubCustomer?: boolean
): string {
  const prefix = isSubCustomer ? 'SUB' : (type === 'supplier' ? 'SUPP' : 'CUST');

  // جمع كل الأكواد القائمة وتطبيعها
  const existingSet = new Set(
    existingParties
      .map(p => (p.code || '').trim().toLowerCase())
      .filter(Boolean)
  );

  // استخراج أعلى رقم تسلسلي مسجل لهذا الرمز
  let maxNumber = 0;
  const regex = new RegExp(`^${prefix}[-_]?(\\d+)$`, 'i');

  existingParties.forEach(p => {
    const code = (p.code || '').trim();
    if (!code) return;

    const match = code.match(regex);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNumber) {
        maxNumber = num;
      }
    }
  });

  // البدء من الرقم التالي (أو 1)
  let nextNumber = Math.max(1, maxNumber + 1);
  let candidate = `${prefix}-${String(nextNumber).padStart(4, '0')}`;

  // حلقة فحص صارمة لضمان عدم التكرار نهائياً
  while (existingSet.has(candidate.toLowerCase())) {
    nextNumber++;
    candidate = `${prefix}-${String(nextNumber).padStart(4, '0')}`;
  }

  return candidate;
}

/**
 * البحث عن العميل أو المورد بواسطة الرقم التسلسلي أو جزء منه
 * يدعم البحث بـ: CUST-0001 أو 0001 أو 1
 */
export function findPartyByCodeOrNumber(parties: Party[], query: string): Party | undefined {
  const clean = query.trim().toLowerCase();
  if (!clean) return undefined;

  // تطابق مباشر مع الكود
  const directMatch = parties.find(p => p.code && p.code.toLowerCase() === clean);
  if (directMatch) return directMatch;

  // تطابق مع الرقم المجرد (مثلا لو كتب 1 أو 2)
  const numericOnly = clean.replace(/\D/g, '');
  if (numericOnly) {
    const num = parseInt(numericOnly, 10);
    return parties.find(p => {
      if (!p.code) return false;
      const match = p.code.match(/\d+/);
      if (match) {
        return parseInt(match[0], 10) === num;
      }
      return false;
    });
  }

  return undefined;
}
