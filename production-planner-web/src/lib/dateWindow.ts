/**
 * Production Day Logic for Agney Polysoft India Pvt Ltd (IM-MES)
 * Production day runs 06:00 to 05:59 the next day.
 * Timezone: Asia/Kolkata (IST).
 */

/**
 * Returns the effective production date for any given timestamp.
 * If current hour is before 06:00, it belongs to yesterday's production day.
 */
export function getProductionDate(dateInput: Date | string | number = new Date()): Date {
  const d = new Date(dateInput);
  if (d.getHours() < 6) {
    d.setDate(d.getDate() - 1);
  }
  d.setHours(6, 0, 0, 0);
  return d;
}

/**
 * Formats a Date object to YYYY-MM-DD
 */
export function formatISODate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Returns the string representation (YYYY-MM-DD) of the current production day.
 */
export function getCurrentProductionDayStr(): string {
  return formatISODate(getProductionDate(new Date()));
}

/**
 * Validates whether a given plan_date (YYYY-MM-DD) is within the allowable
 * print/label generation window: [productionDay(now) - 1, productionDay(now) + 1]
 * i.e., yesterday, today, or tomorrow.
 */
export function isWithinPrintWindow(planDateStr: string, referenceDate: Date = new Date()): boolean {
  const currentProdDate = getProductionDate(referenceDate);

  const yesterday = new Date(currentProdDate);
  yesterday.setDate(yesterday.getDate() - 1);

  const tomorrow = new Date(currentProdDate);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const yesterdayStr = formatISODate(yesterday);
  const tomorrowStr = formatISODate(tomorrow);

  return planDateStr >= yesterdayStr && planDateStr <= tomorrowStr;
}

/**
 * Returns human-readable label for a plan date relative to the active production day.
 */
export function getRelativeDayLabel(planDateStr: string): string {
  const currentProdDate = getProductionDate(new Date());
  const currentStr = formatISODate(currentProdDate);

  const yesterday = new Date(currentProdDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatISODate(yesterday);

  const tomorrow = new Date(currentProdDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatISODate(tomorrow);

  if (planDateStr === currentStr) return 'Today (Current)';
  if (planDateStr === yesterdayStr) return 'Yesterday';
  if (planDateStr === tomorrowStr) return 'Tomorrow (Staging)';
  if (planDateStr < yesterdayStr) return 'Past Plan (Read-Only)';
  return 'Future Plan (Read-Only)';
}
