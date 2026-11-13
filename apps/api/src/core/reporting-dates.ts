export interface CanonicalDateRange {
  startDateStr: string;   // YYYY-MM-DD
  endDateStr: string;     // YYYY-MM-DD
  startDateTime: Date;    // Start of startDateStr in Asia/Ho_Chi_Minh (00:00:00.000)
  endDateTime: Date;      // End of endDateStr in Asia/Ho_Chi_Minh (23:59:59.999)
  totalCalendarDays: number;
  timezone: string;
  isTodayIncluded: boolean;
  isPartialDay: boolean;
}

const impl = require('./reporting-dates.js');

export const getVietnamDateParts: (referenceDate?: Date) => {
  year: number;
  month: number;
  day: number;
  dateStr: string;
} = impl.getVietnamDateParts;

export const formatVietnamDate: (date?: Date | string | null) => string = impl.formatVietnamDate;

export const formatVietnamDateTime: (date?: Date | string | null) => string = impl.formatVietnamDateTime;

export const getCanonicalDateRange: (
  periodDays: number,
  referenceDate?: Date,
  timezone?: string,
) => CanonicalDateRange = impl.getCanonicalDateRange;

export const getCustomCanonicalDateRange: (
  fromStr?: string,
  toStr?: string,
  timezone?: string,
) => CanonicalDateRange = impl.getCustomCanonicalDateRange;
