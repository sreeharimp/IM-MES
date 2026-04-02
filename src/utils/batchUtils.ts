// Batch ID format: {company_prefix}{product_code}{YY}{month_letter}{DD}
// e.g., APBT26C29 = AP + BT + 2026 year + C(March) + 29

const COMPANY_PREFIX = 'AP';
const MONTH_LETTERS = 'ABCDEFGHIJKL'; // A=Jan, B=Feb, C=Mar...

/**
 * Returns the "batch date" for a given timestamp.
 * A batch day runs from 06:00 to 05:59 the next day.
 * If current time is before 06:00, the batch date is yesterday.
 */
export function getBatchDate(now: Date = new Date()): Date {
  const d = new Date(now);
  // If before 6 AM, roll back to previous day
  if (d.getHours() < 6) {
    d.setDate(d.getDate() - 1);
  }
  d.setHours(6, 0, 0, 0);
  return d;
}

/**
 * Get the 6 AM start of the current batch window (today or yesterday if before 6am)
 */
export function getCurrentBatchStart(): Date {
  return getBatchDate(new Date());
}

/**
 * Generate a batch ID from product code and a date
 * Format: AP{productCode}{YY}{monthLetter}{DD}
 * e.g., APBT26C29
 */
export function genBatchId(productCode: string, date: Date = getBatchDate()): string {
  const yy = String(date.getFullYear()).slice(2);
  const mm = MONTH_LETTERS[date.getMonth()];
  const dd = String(date.getDate()).padStart(2, '0');
  return `${COMPANY_PREFIX}${productCode}${yy}${mm}${dd}`;
}

/**
 * Returns the ISO date string for a batch (YYYY-MM-DD) based on the batch window
 */
export function getBatchDateStr(date: Date = getBatchDate()): string {
  return date.toISOString().split('T')[0];
}

/**
 * Returns consistent batch ID and date string for a given product and time
 */
export function getBatchSummary(productCode: string, now: Date = new Date()): { batchId: string, batchDateStr: string } {
  const batchDateObj = getBatchDate(now);
  return {
    batchId: genBatchId(productCode, batchDateObj),
    batchDateStr: getBatchDateStr(batchDateObj)
  };
}

/**
 * Parse batch ID into colored segments for display
 * Returns: { company, product, year, month, day }
 */
export function parseBatchId(batchId: string): { company: string; product: string; year: string; month: string; day: string } | null {
  // APBT26C29 → company=AP, product=BT, year=26, month=C, day=29
  if (!batchId || batchId.length < 7) return null;
  const company = batchId.slice(0, 2);          // AP
  const rest = batchId.slice(2);                // BT26C29
  const yearIdx = rest.search(/\d/);
  if (yearIdx === -1) return null;
  const product = rest.slice(0, yearIdx);       // BT
  const afterProduct = rest.slice(yearIdx);      // 26C29
  const year = afterProduct.slice(0, 2);        // 26
  const month = afterProduct.slice(2, 3);       // C
  const day = afterProduct.slice(3);            // 29
  return { company, product, year, month, day };
}
