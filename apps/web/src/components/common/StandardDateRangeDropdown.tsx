'use client';

import React, { useState } from 'react';
import { Calendar, CheckCircle2, ChevronDown } from 'lucide-react';

export type StandardDatePreset =
  | 'ALL'
  | 'TODAY'
  | '7D'
  | '30D'
  | '90D'
  | 'THIS_MONTH'
  | 'CUSTOM';

export interface StandardDateRangeDropdownProps {
  preset: StandardDatePreset;
  customStartDate?: string;
  customEndDate?: string;
  onChangePreset: (preset: StandardDatePreset) => void;
  onChangeCustomRange?: (startDate: string, endDate: string) => void;
  include90Days?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

export function StandardDateRangeDropdown({
  preset,
  customStartDate = '',
  customEndDate = '',
  onChangePreset,
  onChangeCustomRange,
  include90Days = true,
  className = '',
  size = 'md',
}: StandardDateRangeDropdownProps) {
  const [open, setOpen] = useState(false);
  const [localStart, setLocalStart] = useState(customStartDate);
  const [localEnd, setLocalEnd] = useState(customEndDate);

  const isCustomActive = preset === 'CUSTOM' || Boolean(customStartDate || customEndDate);
  const isFiltered = preset !== 'ALL' || isCustomActive;

  const handleSelectPreset = (p: StandardDatePreset) => {
    onChangePreset(p);
    setLocalStart('');
    setLocalEnd('');
    if (onChangeCustomRange) {
      onChangeCustomRange('', '');
    }
    setOpen(false);
  };

  const handleApplyCustom = () => {
    if (onChangeCustomRange) {
      onChangeCustomRange(localStart, localEnd);
    }
    onChangePreset('CUSTOM');
    setOpen(false);
  };

  const handleReset = () => {
    handleSelectPreset('ALL');
  };

  // Label text formatting
  const getLabel = () => {
    if (preset === 'CUSTOM' && (customStartDate || customEndDate)) {
      const s = customStartDate ? new Date(`${customStartDate}T00:00:00`).toLocaleDateString('vi-VN') : '...';
      const e = customEndDate ? new Date(`${customEndDate}T00:00:00`).toLocaleDateString('vi-VN') : '...';
      return `${s} → ${e}`;
    }
    switch (preset) {
      case 'TODAY':
        return 'Mốc thời gian: Hôm nay';
      case '7D':
        return 'Mốc thời gian: 7 ngày qua';
      case '30D':
        return 'Mốc thời gian: 30 ngày qua';
      case '90D':
        return 'Mốc thời gian: 90 ngày qua';
      case 'THIS_MONTH':
        return 'Mốc thời gian: Tháng này';
      case 'ALL':
      default:
        return 'Mốc thời gian: Tất cả';
    }
  };

  return (
    <div className={`relative inline-block text-left ${className}`}>
      {/* Trigger Button */}
      <div className="inline-flex items-center rounded-2xl border border-slate-200/90 bg-white hover:bg-slate-50 transition shadow-2xs">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className={`${
            size === 'sm' ? 'h-9 px-3.5 text-xs' : 'h-11 px-4 text-xs sm:text-sm'
          } font-bold inline-flex items-center gap-2.5 transition text-slate-800 ${
            isFiltered ? 'bg-blue-50/70 text-[#1E3A8A] rounded-2xl' : ''
          }`}
          title="Chọn mốc thời gian"
        >
          <Calendar className={`${size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-[#1E3A8A] shrink-0`} />
          <span className="font-semibold">{getLabel()}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
              open ? 'rotate-180 text-[#1E3A8A]' : ''
            }`}
          />
        </button>

        {isFiltered && (
          <button
            type="button"
            onClick={handleReset}
            className="h-9 px-2.5 text-xs font-bold text-rose-500 hover:text-rose-700 border-l border-slate-200/80 transition"
            title="Đặt lại mốc thời gian mặc định"
          >
            ×
          </button>
        )}
      </div>

      {/* Popover Dropdown (Exact match to LeadsWorkspace / user screenshot) */}
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 mt-2 w-80 sm:w-88 rounded-2xl bg-white border border-slate-200 shadow-xl p-4 z-40 space-y-3.5 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between pb-1 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-[#1E3A8A]" />
                <span>Chọn nhanh mốc thời gian</span>
              </span>
              {isFiltered && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-[11px] font-semibold text-rose-600 hover:underline"
                >
                  Đặt lại mặc định
                </button>
              )}
            </div>

            {/* Quick Presets Grid */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSelectPreset('ALL')}
                className={`h-9 px-3 rounded-xl text-xs font-bold text-left transition flex items-center justify-between col-span-2 ${
                  preset === 'ALL' && !customStartDate && !customEndDate
                    ? 'bg-[#1E3A8A] text-white shadow-xs'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span>Tất cả thời gian</span>
                {preset === 'ALL' && !customStartDate && !customEndDate && (
                  <CheckCircle2 className="w-4 h-4 text-white" />
                )}
              </button>

              {[
                { id: 'TODAY' as const, label: 'Hôm nay' },
                { id: '7D' as const, label: '7 ngày qua' },
                { id: '30D' as const, label: '30 ngày qua' },
                ...(include90Days ? [{ id: '90D' as const, label: '90 ngày qua' }] : []),
                { id: 'THIS_MONTH' as const, label: 'Tháng này' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelectPreset(opt.id)}
                  className={`h-9 px-3 rounded-xl text-xs font-semibold text-left transition flex items-center justify-between ${
                    preset === opt.id
                      ? 'bg-[#1E3A8A] text-white shadow-xs font-bold'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>{opt.label}</span>
                  {preset === opt.id && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                </button>
              ))}
            </div>

            {/* Custom Date Range Section */}
            <div className="pt-2.5 border-t border-slate-100 space-y-2.5">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Hoặc tra theo khoảng ngày cụ thể
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Từ ngày
                  </label>
                  <input
                    type="date"
                    value={localStart}
                    onChange={(e) => setLocalStart(e.target.value)}
                    className="w-full h-8 px-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-[#1E3A8A]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Đến ngày
                  </label>
                  <input
                    type="date"
                    value={localEnd}
                    onChange={(e) => setLocalEnd(e.target.value)}
                    className="w-full h-8 px-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-[#1E3A8A]"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleApplyCustom}
                  className="h-8 px-4 rounded-xl bg-[#1E3A8A] hover:bg-blue-800 text-white text-xs font-bold transition shadow-xs"
                >
                  Xong
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

