/**
 * Standard Batch Code Generation for Agney Polysoft India Pvt Ltd
 * Format: AP + ProductCode(2) + YY + MonthLetter(A-L) + DD
 * e.g., APBT26C29 = AP + BT + 2026 + C(March) + 29
 */

const COMPANY_PREFIX = 'AP';
const MONTH_LETTERS = 'ABCDEFGHIJKL'; // A=Jan, B=Feb, C=Mar...

export function generateBatchCode(productCode: string, date: Date = new Date()): string {
  const code = (productCode || 'XX').trim().toUpperCase().slice(0, 2);
  const yy = String(date.getFullYear()).slice(2);
  const mm = MONTH_LETTERS[date.getMonth()] || 'A';
  const dd = String(date.getDate()).padStart(2, '0');
  return `${COMPANY_PREFIX}${code}${yy}${mm}${dd}`;
}

export function parseBatchCode(batchCode: string): {
  company: string;
  product: string;
  year: string;
  month: string;
  day: string;
} | null {
  if (!batchCode || batchCode.length < 7) return null;
  const company = batchCode.slice(0, 2);
  const rest = batchCode.slice(2);
  const yearIdx = rest.search(/\d/);
  if (yearIdx === -1) return null;
  const product = rest.slice(0, yearIdx);
  const afterProduct = rest.slice(yearIdx);
  const year = afterProduct.slice(0, 2);
  const month = afterProduct.slice(2, 3);
  const day = afterProduct.slice(3);
  return { company, product, year, month, day };
}
