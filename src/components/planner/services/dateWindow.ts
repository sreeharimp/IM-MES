import { addDays, subDays, format, parseISO } from 'date-fns';

/**
 * Returns the production day as a Date object for a given timestamp.
 * Agney Polysoft production day runs 06:00:00 to 05:59:59 next morning.
 */
export function getProductionDay(timestamp: Date = new Date()): Date {
  const currentHour = timestamp.getHours();
  // If before 06:00, it belongs to yesterday's production day
  if (currentHour < 6) {
    return subDays(new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate()), 1);
  }
  return new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate());
}

/**
 * Returns production day string in YYYY-MM-DD format.
 */
export function getCurrentProductionDayStr(timestamp: Date = new Date()): string {
  return format(getProductionDay(timestamp), 'yyyy-MM-dd');
}

/**
 * Returns the active 3-day print window: [T-1, T, T+1] where T is current production day.
 */
export function getPrintWindow(currentDateStr?: string): {
  yesterday: string;
  today: string;
  tomorrow: string;
} {
  const currentProdDay = currentDateStr
    ? parseISO(currentDateStr)
    : getProductionDay(new Date());

  return {
    yesterday: format(subDays(currentProdDay, 1), 'yyyy-MM-dd'),
    today: format(currentProdDay, 'yyyy-MM-dd'),
    tomorrow: format(addDays(currentProdDay, 1), 'yyyy-MM-dd'),
  };
}

/**
 * Checks if a given plan date is within the printable window [T-1, T, T+1].
 */
export function isWithinPrintWindow(planDateStr: string, currentTimestamp: Date = new Date()): boolean {
  if (!planDateStr) return false;
  const { yesterday, today, tomorrow } = getPrintWindow(getCurrentProductionDayStr(currentTimestamp));
  return planDateStr === yesterday || planDateStr === today || planDateStr === tomorrow;
}

/**
 * Returns relative human label: 'Yesterday', 'Today', 'Tomorrow', or formatted date.
 */
export function getRelativeDayLabel(dateStr: string, currentTimestamp: Date = new Date()): string {
  const { yesterday, today, tomorrow } = getPrintWindow(getCurrentProductionDayStr(currentTimestamp));
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  if (dateStr === tomorrow) return 'Tomorrow';
  return dateStr;
}
