import React from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { OfficialStamp } from './OfficialStamp';

interface ReportSignaturesProps {
  columns?: 2 | 3;
  rightLabel?: string;
  centerLabel?: string;
  leftLabel?: string;
}

export const ReportSignatures: React.FC<ReportSignaturesProps> = ({
  columns = 3,
  rightLabel = 'إعداد وتدقيق المحاسب',
  centerLabel = 'توقيع العميل / المستلم',
  leftLabel = 'المدير المالي والاعتماد',
}) => {
  const { settings } = useAccounting();

  return (
    <div className={`pt-6 border-t border-slate-300 grid gap-6 text-center text-xs mt-6 ${columns === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
      {/* Right Column */}
      <div className="space-y-6 flex flex-col items-center justify-end">
        <span className="font-bold text-slate-700 block mb-auto">{rightLabel}</span>
        <div className="border-b border-dashed border-slate-400 w-48 mx-auto mt-10"></div>
        <span className="text-[11px] text-slate-400 block font-mono">{columns === 2 ? 'المستلم المعتمد' : 'التوقيع والتاريخ'}</span>
      </div>

      {/* Center Column (Only if columns === 3) */}
      {columns === 3 && (
        <div className="space-y-6 flex flex-col items-center justify-end">
          <span className="font-bold text-slate-700 block mb-auto">{centerLabel}</span>
          <div className="border-b border-dashed border-slate-400 w-36 mx-auto mt-10"></div>
          <span className="text-[11px] text-slate-400 block font-mono">المستلم المعتمد</span>
        </div>
      )}

      {/* Left Column - Official Stamp & Signature */}
      <div className="space-y-2 flex flex-col items-center justify-end">
        <span className="font-bold text-slate-700 block mb-auto">{leftLabel}</span>
        
        <div className="min-h-[4.2cm] flex items-center justify-center relative">
          {settings.stampUrl ? (
            <div className="relative flex items-center justify-center">
              <OfficialStamp size="3.5cm" />
              {settings.signatureUrl && (
                <img
                  src={settings.signatureUrl}
                  alt="Signature"
                  className="absolute bottom-1 max-h-12 max-w-[120px] object-contain mix-blend-multiply opacity-85 pointer-events-none"
                />
              )}
            </div>
          ) : settings.signatureUrl ? (
            <img
              src={settings.signatureUrl}
              alt="Signature"
              className="max-h-16 max-w-[140px] object-contain mix-blend-multiply opacity-90"
            />
          ) : (
            <div className="border-b border-dashed border-slate-400 w-48 mx-auto mt-10"></div>
          )}
        </div>
        
        <span className="text-[11px] text-slate-400 block font-mono mt-2">الختم والتوقيع المعتمد</span>
      </div>
    </div>
  );
};
