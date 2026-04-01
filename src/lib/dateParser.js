/**
 * Date Parser — Handles 10+ Indian bank date formats
 * Normalizes to a consistent Date object
 */

const MONTH_MAP = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parse a date string from Indian bank SMS into a Date object.
 * Supports formats like: 24Mar25, 24-03-2025, 24/03/25, Mar 24 2025,
 * 24MAR2025, 24-Mar-25, 2025-03-24, 24 Mar, 2025, etc.
 * @param {string} dateStr - The raw date string from SMS
 * @returns {Date|null} - Parsed date or null if unparsable
 */
export function parseDate(dateStr) {
    if (!dateStr) return null;

    const s = dateStr.trim();
    let m;

    // Format: 24Mar25 or 24MAR2025 or 24Mar2025
    m = s.match(/^(\d{1,2})\s*([A-Za-z]{3})\s*(\d{2,4})$/);
    if (m) return buildDate(m[1], m[2], m[3]);

    // Format: 24-03-2025 or 24/03/2025 or 24.03.2025
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m) return buildDate(m[1], m[2], m[3], true);

    // Format: 2025-03-24 (ISO)
    m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (m) return buildDate(m[3], m[2], m[1], true);

    // Format: Mar 24 2025 or Mar 24, 2025
    m = s.match(/^([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{2,4})$/);
    if (m) return buildDate(m[2], m[1], m[3]);

    // Format: 24 Mar, 2025 or 24 Mar 2025
    m = s.match(/^(\d{1,2})\s+([A-Za-z]{3}),?\s+(\d{2,4})$/);
    if (m) return buildDate(m[1], m[2], m[3]);

    // Format: 24-Mar-25 or 24-Mar-2025
    m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
    if (m) return buildDate(m[1], m[2], m[3]);

    // Format: 24/Mar/25
    m = s.match(/^(\d{1,2})\/([A-Za-z]{3})\/(\d{2,4})$/);
    if (m) return buildDate(m[1], m[2], m[3]);

    // --- Year-less formats (Default to current year) ---
    const currentYear = new Date().getFullYear();

    // Format: 24-Mar or 24 Mar or 24Mar
    m = s.match(/^(\d{1,2})\s*-?\s*([A-Za-z]{3})$/);
    if (m) return buildDate(m[1], m[2], currentYear);

    // Format: Mar 24
    m = s.match(/^([A-Za-z]{3})\s+(\d{1,2})$/);
    if (m) return buildDate(m[2], m[1], currentYear);

    // Format: 24/03 or 24-03
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
    if (m) return buildDate(m[1], m[2], currentYear, true);

    return null;
}

/**
 * Build a Date object from day, month (number or name), year.
 */
function buildDate(day, month, year, monthIsNumber = false) {
    let d = parseInt(day, 10);
    let y = parseInt(typeof year === 'string' ? year : String(year), 10);
    let mo;

    if (monthIsNumber || /^\d+$/.test(month)) {
        mo = parseInt(month, 10) - 1; // 0-indexed
    } else {
        const key = month.toLowerCase().substring(0, 3);
        mo = MONTH_MAP[key];
        if (mo === undefined) return null;
    }

    // Handle 2-digit years
    if (y < 100) {
        y += y < 50 ? 2000 : 1900;
    }

    // Validate ranges
    if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;

    const date = new Date(y, mo, d);
    // Verify the date is valid (handles cases like Feb 30)
    if (date.getDate() !== d || date.getMonth() !== mo) return null;

    return date;
}

// Patterns ordered by specificity (most specific first) — defined at module scope to avoid recompilation
const DATE_PATTERNS = [
    // 24-Mar-2025, 24-Mar-25
    /\b(\d{1,2}-[A-Za-z]{3}-\d{2,4})\b/,
    // 24Mar25, 24MAR2025
    /\b(\d{1,2}[A-Za-z]{3}\d{2,4})\b/,
    // 24-03-2025, 24/03/2025
    /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/,
    // 2025-03-24 (ISO)
    /\b(\d{4}-\d{1,2}-\d{1,2})\b/,
    // Mar 24, 2025
    /\b([A-Za-z]{3}\s+\d{1,2},?\s+\d{2,4})\b/,
    // 24 Mar 2025, 24 Mar, 2025
    /\b(\d{1,2}\s+[A-Za-z]{3},?\s+\d{2,4})\b/,
    // --- Year-less patterns ---
    // 24-Mar, 24/Mar
    /\b(\d{1,2}-[A-Za-z]{3})\b/,
    /\b(\d{1,2}\s+[A-Za-z]{3})\b/,
    // 24/03
    /\b(\d{1,2}[\/\-]\d{1,2})\b/,
    // Mar 24
    /\b([A-Za-z]{3}\s+\d{1,2})\b/,
];

/**
 * Extract a date from an SMS body string.
 * Tries multiple regex patterns to find date within SMS text.
 * @param {string} smsBody - Full SMS text
 * @returns {{ date: Date, raw: string } | null}
 */
export function extractDateFromSMS(smsBody) {
    if (!smsBody) return null;

    const datePatterns = DATE_PATTERNS;

    for (const pattern of datePatterns) {
        const match = smsBody.match(pattern);
        if (match) {
            const parsed = parseDate(match[1]);
            if (parsed) {
                return { date: parsed, raw: match[1] };
            }
        }
    }

    return null;
}

/**
 * Format a Date to a display string: "24 Mar 2025"
 */
export function formatDate(date) {
    if (!date) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Format a Date to ISO-like string for storage: "2025-03-24"
 */
export function toISODate(date) {
    if (!date) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
