'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, Radio, Zap } from 'lucide-react';

interface Props {
  isPolling?: boolean;
  lastUpdated?: string | Date | null;
  intervalSec?: number;
  onRefresh?: () => void | Promise<void>;
  label?: string;
  subLabel?: string;
  size?: 'sm' | 'md' | 'lg';
  showEqualizer?: boolean;
  className?: string;
}

export function RealtimeLiveMotionIndicator({
  isPolling = false,
  lastUpdated,
  intervalSec = 15,
  onRefresh,
  label = 'Realtime Live',
  subLabel,
  size = 'md',
  showEqualizer = true,
  className = '',
}: Props) {
  const [countdown, setCountdown] = useState(intervalSec);

  // Countdown timer from intervalSec down to 0, resets on poll or interval
  useEffect(() => {
    setCountdown(intervalSec);
    const timer = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? intervalSec : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [intervalSec, lastUpdated]);

  const formattedLastUpdated = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : null;

  if (size === 'sm') {
    return (
      <div
        className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-300/80 text-emerald-800 text-[11px] font-bold shadow-2xs ${className}`}
        title={`Tự động cập nhật mỗi ${intervalSec}s • Lần cuối: ${formattedLastUpdated || 'Vừa xong'}`}
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="truncate">{isPolling ? 'Đang cập nhật...' : label}</span>
        <span className="font-mono text-[10px] text-emerald-600 bg-white/70 px-1 py-0.2 rounded border border-emerald-200">
          {countdown}s
        </span>
      </div>
    );
  }

  return (
    <div
      className={`group relative inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50/70 to-emerald-50/50 border border-emerald-300/80 hover:border-emerald-400 text-emerald-900 shadow-2xs transition-all ${className}`}
    >
      {/* Live Pulsing Beacon Radar */}
      <div className="relative flex items-center justify-center shrink-0">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-600 shadow-xs" />
        </span>
      </div>

      {/* Dynamic Traffic Equalizer Bars */}
      {showEqualizer && (
        <div className="flex items-end gap-0.5 h-4 px-0.5 shrink-0" title="Luồng tín hiệu Realtime đang truyền nhận">
          <span className="w-1 bg-emerald-500 rounded-xs animate-equalizer-1" />
          <span className="w-1 bg-teal-500 rounded-xs animate-equalizer-2" />
          <span className="w-1 bg-emerald-600 rounded-xs animate-equalizer-3" />
          <span className="w-1 bg-teal-600 rounded-xs animate-equalizer-4" />
        </div>
      )}

      {/* Main Labels */}
      <div className="flex flex-col min-w-0 leading-tight">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-extrabold text-emerald-900 tracking-tight">
            {isPolling ? 'Đang đồng bộ Realtime...' : label}
          </span>
          <span className="font-mono text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded-md border border-emerald-200/60 shadow-3xs">
            {isPolling ? (
              <RefreshCw className="w-2.5 h-2.5 animate-spin inline-block text-emerald-700" />
            ) : (
              `${countdown}s`
            )}
          </span>
        </div>
        {(subLabel || formattedLastUpdated) && (
          <span className="text-[10px] text-emerald-700/80 truncate">
            {subLabel || `Lần cuối: ${formattedLastUpdated}`}
          </span>
        )}
      </div>

      {/* Manual instant refresh button */}
      {onRefresh && (
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={isPolling}
          className="ml-1 p-1 rounded-lg text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100/70 active:scale-95 transition-all"
          title="Bấm để quét dữ liệu Realtime mới nhất ngay lập tức"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isPolling ? 'animate-spin' : ''}`} />
        </button>
      )}

      {/* Sweeping bottom progress line */}
      <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-emerald-200/40 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 animate-sweep-15s rounded-full" />
      </div>
    </div>
  );
}

