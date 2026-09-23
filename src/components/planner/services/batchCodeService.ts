/**
 * Generates Batch Code.
 * Format: AP + product code (2 uppercase chars) + YY (2-digit year) + month-letter (A-L) + DD (2-digit day)
 * e.g., APBT26C29 (AP + BT + 26 + C for March + 29)
 */
const MONTH_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

export function generateBatchCode(productIdentifier: string, date: Date = new Date()): string {
  const prefix = 'AP';
  
  // Clean and sanitize product identifier (up to 2 chars, no padding)
  let pCode = (productIdentifier || 'XX').trim().toUpperCase();
  if (pCode.length > 2) {
    pCode = pCode.substring(0, 2);
  } else if (pCode.length === 0) {
    pCode = 'XX';
  }

  const yy = String(date.getFullYear()).slice(-2);
  const monthLetter = MONTH_LETTERS[date.getMonth()] || 'A';
  const dd = String(date.getDate()).padStart(2, '0');

  return `${prefix}${pCode}${yy}${monthLetter}${dd}`;
}

export function parseBatchCode(batchCode: string): {
  isValid: boolean;
  prefix: string;
  productCode: string;
  year: number | null;
  month: number | null;
  day: number | null;
} {
  const regex = /^AP([A-Z0-9]{1,2})(\d{2})([A-L])(\d{2})$/;
  const match = (batchCode || '').trim().toUpperCase().match(regex);

  if (!match) {
    return {
      isValid: false,
      prefix: 'AP',
      productCode: '',
      year: null,
      month: null,
      day: null,
    };
  }

  const [, pCode, yy, monthLetter, dd] = match;
  const monthIndex = MONTH_LETTERS.indexOf(monthLetter);
  const fullYear = 2000 + parseInt(yy, 10);
  const day = parseInt(dd, 10);

  return {
    isValid: true,
    prefix: 'AP',
    productCode: pCode,
    year: fullYear,
    month: monthIndex + 1,
    day,
  };
}
