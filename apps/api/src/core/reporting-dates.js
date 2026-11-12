/**
 * Canonical reporting date range calculation for Toan Trung CRM.
 * Enforces consistent inclusive boundaries, exact N-calendar-day counts,
 * and Asia/Ho_Chi_Minh (UTC+7) timezone across M02, M03, M04, and exports.
 */

function getVietnamDateParts(referenceDate = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.format(referenceDate); // "YYYY-MM-DD"
  const [year, month, day] = parts.split('-').map((v) => parseInt(v, 10));
  return { year, month, day, dateStr: parts };
}

function getCanonicalDateRange(periodDays, referenceDate = new Date(), timezone = 'Asia/Ho_Chi_Minh') {
  const safeDays = Math.max(1, Math.round(periodDays));
  const { dateStr: endDateStr } = getVietnamDateParts(referenceDate);

  // Compute start date by subtracting (safeDays - 1) from endDate in UTC+7
  const endD = new Date(`${endDateStr}T12:00:00+07:00`);
  const startD = new Date(endD.getTime() - (safeDays - 1) * 24 * 60 * 60 * 1000);
  const { dateStr: startDateStr } = getVietnamDateParts(startD);

  const startDateTime = new Date(`${startDateStr}T00:00:00.000+07:00`);
  const endDateTime = new Date(`${endDateStr}T23:59:59.999+07:00`);

  return {
    startDateStr,
    endDateStr,
    startDateTime,
    endDateTime,
    totalCalendarDays: safeDays,
    timezone,
    isTodayIncluded: true,
    isPartialDay: true,
  };
}

function getCustomCanonicalDateRange(fromStr, toStr, timezone = 'Asia/Ho_Chi_Minh') {
  const cleanFrom = fromStr.slice(0, 10);
  const cleanTo = toStr.slice(0, 10);
  const { dateStr: todayStr } = getVietnamDateParts();

  const startDateTime = new Date(`${cleanFrom}T00:00:00.000+07:00`);
  const endDateTime = new Date(`${cleanTo}T23:59:59.999+07:00`);

  const diffMs = endDateTime.getTime() - startDateTime.getTime();
  const totalCalendarDays = Math.max(1, Math.round(diffMs / (24 * 60 * 60 * 1000)));

  return {
    startDateStr: cleanFrom,
    endDateStr: cleanTo,
    startDateTime,
    endDateTime,
    totalCalendarDays,
    timezone,
    isTodayIncluded: cleanTo >= todayStr,
    isPartialDay: cleanTo >= todayStr,
  };
}

module.exports = {
  getVietnamDateParts,
  getCanonicalDateRange,
  getCustomCanonicalDateRange,
};

