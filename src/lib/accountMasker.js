/**
 * Account Masker — Strips/masks sensitive account information
 * Ensures only last 4 digits of account numbers are stored
 */

/**
 * Mask account numbers in text — replace full numbers with XX1234 format.
 * @param {string} text - SMS body or any text containing account numbers
 * @returns {string} - Text with masked account numbers
 */
export function maskAccountNumbers(text) {
    if (!text) return text;

    // Replace sequences like XXXX1234, ****1234, XX1234 — keep last 4
    let masked = text.replace(/[Xx\*]{2,}\d{4,}/g, (match) => {
        const lastFour = match.slice(-4);
        return `XX${lastFour}`;
    });

    // Replace full account numbers (8-18 digit sequences that look like accounts)
    // Be careful not to replace amounts, dates, or UPI refs
    masked = masked.replace(/\b(?:a\/?c\s*(?:no\.?\s*)?)\d{8,18}\b/gi, (match) => {
        const digits = match.replace(/[^\d]/g, '');
        return `A/c XX${digits.slice(-4)}`;
    });

    return masked;
}

/**
 * Strip raw SMS text for safe storage — remove sensitive data.
 * @param {string} rawSMS - Original SMS text
 * @returns {string} - Sanitized SMS safe for storage
 */
export function sanitizeForStorage(rawSMS) {
    if (!rawSMS) return '';
    return maskAccountNumbers(rawSMS);
}

/**
 * Format an account identifier for display.
 * @param {string} account - Account like "XX1234" or "1234567890"
 * @returns {string} - Display format like "••1234"
 */
export function formatAccountDisplay(account) {
    if (!account) return '';
    const lastFour = account.replace(/[^\d]/g, '').slice(-4);
    if (!lastFour) return account;
    return `••${lastFour}`;
}
