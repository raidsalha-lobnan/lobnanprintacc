import React from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { Building2, Phone, MapPin, Hash, FileSpreadsheet } from 'lucide-react';
import { BusinessSettings } from '../../types';

interface PrintHeaderProps {
  title?: string;
  subtitle?: string;
  docNumber?: string;
  docDate?: string;
  badge?: string;
  badgeColor?: string;
  extraMeta?: React.ReactNode;
  rightAction?: React.ReactNode;
  qrCode?: React.ReactNode;
  overrideSettings?: Partial<BusinessSettings>;
  className?: string;
  showBorder?: boolean;
}

/**
 * PrintHeader Component
 * 
 * القواعد الصارمة المعتمدة بحسب طلب المستخدم:
 * 1. في حال تم رفع "هيدر كامل" (headerImageUrl / letterheadUrl): يتم اعتماده كترويسة رسمية كاملة لكل الكشوفات والأوراق المطبوعة.
 * 2. في حال عدم رفع هيدر: يتم استخدام اللوقو (logoUrl / logo) مع اسم المنشأة والبيانات الرسمية والضريبية (العناوين والهواتف المتعددة).
 * 3. الكاشير الحراري: له مكون خاص ThermalReceiptHeader يستخدم دائماً اللوقو والبيانات المكتوبة (العناوين والهواتف).
 */
export const PrintHeader: React.FC<PrintHeaderProps> = ({
  title,
  subtitle,
  docNumber,
  docDate,
  badge,
  badgeColor = 'bg-slate-900 text-white',
  extraMeta,
  rightAction,
  qrCode,
  overrideSettings,
  className = '',
  showBorder = true,
}) => {
  const { settings: contextSettings } = useAccounting();
  const settings: any = { ...contextSettings, ...(overrideSettings || {}) };

  const headerImageUrl = settings.headerImageUrl || settings.letterheadUrl || settings.headerImage || '';
  const logoUrl = settings.logoUrl || settings.logo || '';
  const businessName = settings.businessName || settings.name || 'المنشأة التجارية';

  const hasFullHeader = Boolean(headerImageUrl && headerImageUrl.trim());
  const hasLogo = Boolean(logoUrl && logoUrl.trim());

  // Addresses list (supports multiple addresses or single address string)
  const addressesList = (
    settings.addresses && settings.addresses.length > 0
      ? settings.addresses
      : settings.address
      ? [settings.address]
      : []
  ).filter((a: any) => a && a.trim());

  // Phones list (supports multiple phones or single phone string)
  const phonesList = (
    settings.phones && settings.phones.length > 0
      ? settings.phones
      : settings.phone
      ? [settings.phone]
      : []
  ).filter((p: any) => p && p.trim());

  // CASE 1: Full Header Image is Uploaded (اعتماد الهيدر الكامل)
  if (hasFullHeader) {
    return (
      <div className={`print-header w-full mb-4 print:mb-3 print:block ${className}`} data-component="print-header">
        {/* Full Header Banner Image */}
        <div className="w-full overflow-hidden rounded-lg border border-slate-200/60 print:border-none print:rounded-none bg-white">
          <img
            src={headerImageUrl}
            alt={businessName || 'ترويسة رسمية'}
            className="w-full max-h-40 sm:max-h-48 md:max-h-56 object-contain object-center print:max-h-44 mx-auto block"
          />
        </div>

        {/* Sub-bar for document identification (Title, date, number, badge) */}
        {(title || badge || docNumber || docDate || extraMeta || qrCode) && (
          <div className={`mt-2 pt-2 flex flex-wrap items-center justify-between gap-2 text-xs ${showBorder ? 'border-b-2 border-slate-900 pb-2.5' : ''}`}>
            <div>
              {title && (
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">{title}</h2>
                  {badge && (
                    <span className={`px-2.5 py-0.5 rounded text-[11px] font-bold ${badgeColor}`}>
                      {badge}
                    </span>
                  )}
                </div>
              )}
              {subtitle && <p className="text-[11px] text-slate-600 mt-0.5">{subtitle}</p>}
            </div>

            <div className="flex items-center gap-3 mr-auto text-left font-mono">
              {extraMeta}
              <div className="text-[11px] text-slate-700 text-left space-y-0.5">
                {docNumber && (
                  <div>
                    <span className="text-slate-500 font-sans">الرقم: </span>
                    <strong className="text-slate-900">{docNumber}</strong>
                  </div>
                )}
                {docDate && (
                  <div>
                    <span className="text-slate-500 font-sans">التاريخ: </span>
                    <span>{docDate}</span>
                  </div>
                )}
              </div>
              {qrCode}
              {rightAction}
            </div>
          </div>
        )}
      </div>
    );
  }

  // CASE 2: Standard Header (Logo + Company Name + Official Tax Data + Multiple Addresses & Phones)
  return (
    <div className={`print-header w-full mb-4 print:mb-3 print:block ${showBorder ? 'border-b-2 border-slate-900 pb-4' : ''} ${className}`} data-component="print-header">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        {/* Right side: Logo and Company Info */}
        <div className="flex items-start gap-3.5 flex-1 min-w-0">
          {hasLogo ? (
            <div className="shrink-0 w-20 h-20 sm:w-24 sm:h-24 bg-white border border-slate-200 rounded-xl p-1.5 flex items-center justify-center shadow-2xs overflow-hidden">
              <img
                src={logoUrl}
                alt={businessName}
                className="w-full h-full object-contain object-center"
              />
            </div>
          ) : (
            <div className="shrink-0 w-16 h-16 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex flex-col items-center justify-center font-bold text-xs p-1 shadow-2xs">
              <Building2 className="w-6 h-6 mb-0.5 text-blue-600" />
              <span className="text-[9px] text-center leading-tight truncate max-w-full">
                {settings.logoText || 'النور'}
              </span>
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-snug">
              {businessName}
            </h1>
            {settings.businessNameEn && (
              <p className="text-[10px] text-slate-400 font-light font-mono -mt-0.5">{settings.businessNameEn}</p>
            )}
            {(settings.activityType || settings.description) && (
              <p className="text-xs text-slate-600 font-medium mt-0.5">
                {settings.activityType || settings.description}
              </p>
            )}

            {/* Official Registration & Tax Numbers */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-700 font-mono mt-1.5">
              {(settings.taxNumber && settings.showTaxNumberInPrints !== false) && (
                <span className="inline-flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-bold">
                  <Hash className="w-3 h-3 text-slate-500" />
                  <span>الرقم الضريبي: {settings.taxNumber}</span>
                </span>
              )}
              {((settings.crNumber || settings.commercialRegister) && settings.showCrNumberInPrints !== false) && (
                <span className="inline-flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                  <span>س.ت: {settings.crNumber || settings.commercialRegister}</span>
                </span>
              )}
            </div>

            {/* Multiple Phone Numbers (أرقام الهواتف المتعددة) */}
            {phonesList.length > 0 && (
              <div className="flex items-start gap-1.5 text-[11px] text-slate-700 mt-1">
                <Phone className="w-3 h-3 text-slate-500 shrink-0 mt-0.5" />
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 font-mono">
                  {phonesList.map((p: any, idx: number) => (
                    <span key={idx} className="after:content-['|'] last:after:content-none after:mr-2 after:text-slate-300">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Multiple Addresses (العناوين المتعددة) */}
            {addressesList.length > 0 && (
              <div className="flex items-start gap-1.5 text-[11px] text-slate-600 mt-1">
                <MapPin className="w-3 h-3 text-slate-500 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-0.5">
                  {addressesList.map((addr: any, idx: number) => (
                    <span key={idx} className="leading-tight">
                      {addressesList.length > 1 ? `• ${addr}` : addr}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Left side: Document Title / Badges / QR Code */}
        <div className="text-left shrink-0 flex flex-col items-end sm:min-w-[200px]">
          {title && (
            <div className="text-right sm:text-left mb-1.5">
              <div className={`inline-block font-black text-sm px-3.5 py-1.5 rounded-lg shadow-xs ${badgeColor}`}>
                {title}
              </div>
            </div>
          )}

          {subtitle && (
            <p className="text-[10px] text-slate-400 font-light font-medium mb-1 text-left">{subtitle}</p>
          )}

          <div className="text-[11px] text-slate-600 font-mono space-y-0.5 text-left">
            {docNumber && (
              <div>
                <span className="text-slate-400 font-sans">الرقم: </span>
                <strong className="text-slate-900 font-bold">{docNumber}</strong>
              </div>
            )}
            {docDate && (
              <div>
                <span className="text-slate-400 font-sans">التاريخ: </span>
                <span>{docDate}</span>
              </div>
            )}
            {extraMeta}
          </div>

          {qrCode && <div className="mt-2">{qrCode}</div>}
          {rightAction && <div className="mt-2">{rightAction}</div>}
        </div>
      </div>
    </div>
  );
};

/**
 * ThermalReceiptHeader Component
 * 
 * مخصص لطابعات الكاشير الحراري (80mm / 58mm).
 * بحسب توجيه المستخدم:
 * "ماعدا الكاشير الحراري تكون باللوقو والعناوين والهواتف المكتوبة وفي حال عدم رفع هيدر يتم استخدام اللوقو مع اسم المنشألة والبيانات للمنشأة"
 * 
 * أي أن الكاشير الحراري لا يعتمد البانر العريض، بل يعتمد دائماً اللوقو + اسم المنشأة + العناوين والهواتف المكتوبة.
 */
interface ThermalReceiptHeaderProps {
  overrideSettings?: Partial<BusinessSettings>;
  receiptTitle?: string;
  className?: string;
}

export const ThermalReceiptHeader: React.FC<ThermalReceiptHeaderProps> = ({
  overrideSettings,
  receiptTitle,
  className = ''
}) => {
  const { settings: contextSettings } = useAccounting();
  const settings = { ...contextSettings, ...(overrideSettings || {}) };

  const hasLogo = Boolean(settings.logoUrl && settings.logoUrl.trim());

  const addressesList = (
    settings.addresses && settings.addresses.length > 0
      ? settings.addresses
      : settings.address
      ? [settings.address]
      : []
  ).filter(a => a && a.trim());

  const phonesList = (
    settings.phones && settings.phones.length > 0
      ? settings.phones
      : settings.phone
      ? [settings.phone]
      : []
  ).filter(p => p && p.trim());

  return (
    <div className={`text-center space-y-1.5 pb-2 border-b border-dashed border-slate-400 font-mono ${className}`}>
      {/* Logo on Thermal Receipt */}
      {hasLogo && (
        <div className="flex justify-center mb-1">
          <img
            src={settings.logoUrl}
            alt={settings.businessName}
            className="max-h-14 max-w-[140px] object-contain filter grayscale contrast-125"
          />
        </div>
      )}

      <h2 className="font-black text-base text-slate-950 leading-tight">
        {settings.businessName || settings.name || 'نقطة البيع'}
      </h2>

      {settings.businessNameEn && (
        <p className="text-[10px] text-slate-600">{settings.businessNameEn}</p>
      )}

      {receiptTitle && (
        <div className="inline-block bg-slate-900 text-white font-bold text-[11px] px-2 py-0.5 rounded my-1">
          {receiptTitle}
        </div>
      )}

      {/* Tax and CR */}
      <div className="text-[10px] font-bold text-slate-900">
        {(settings.taxNumber && settings.showTaxNumberInPrints !== false) && <div>الرقم الضريبي: {settings.taxNumber}</div>}
        {(settings.crNumber && settings.showCrNumberInPrints !== false) && <div>سجل تجاري: {settings.crNumber}</div>}
      </div>

      {/* Multiple Phones on Thermal */}
      {phonesList.length > 0 && (
        <div className="text-[10px] text-slate-800 space-y-0.5">
          {phonesList.map((ph, idx) => (
            <div key={idx}>هاتف: {ph}</div>
          ))}
        </div>
      )}

      {/* Multiple Addresses on Thermal */}
      {addressesList.length > 0 && (
        <div className="text-[10px] text-slate-700 space-y-0.5 pt-0.5">
          {addressesList.map((addr, idx) => (
            <div key={idx}>{addr}</div>
          ))}
        </div>
      )}
    </div>
  );
};
