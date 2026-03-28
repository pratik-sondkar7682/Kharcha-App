/**
 * SMS Pre-Filter — Rejects non-transaction SMS before parsing
 * Filters out: OTPs, promotions, balance inquiries, failed transactions,
 * login alerts, KYC notifications, credit card statements
 */

// Patterns that indicate NON-transaction SMS — reject these
const REJECT_PATTERNS = [
    /\bOTP\b/i,
    /\bone.?time.?pass/i,
    /do not share/i,
    /don't share/i,
    /never share/i,
    /\boffer\b.*\bexpir/i,
    /\boffer\b.*\bvalid\b/i,
    /\bdiscount\b.*\buse\b.*\bcode\b/i,
    /\bcoupon\b/i,
    /\bcashback\b.*\bcredited\b.*\bwallet\b/i,
    /total\s+due.*min\s*\.?\s*due/i,
    /minimum\s+amount\s+due/i,
    /statement\s+(is\s+)?ready/i,
    /\bfailed\b/i,
    /\bdeclined\b/i,
    /\brunsuccessful\b/i,
    /\bnot\s+processed\b/i,
    /balance\s*(is|:)?\s*(rs|inr|₹)?\s*[\d,]+/i,
    /\bavailable\s+balance\b.*\benquiry\b/i,
    /bal\s*enq/i,
    /\blogin\b.*\balert\b/i,
    /\blogged\s+in\b/i,
    /linked.*aadhaar/i,
    /\bkyc\b.*\bupdat/i,
    /\bpan\b.*\blink/i,
    /\bupgrade\b.*\bapp\b/i,
    /\bdownload\b.*\bapp\b/i,
    /dear\s+customer.*\bvisit\b/i,
    /\bemi\b.*\bapproved\b/i,
    /\bpre-?approved\b/i,
    /\bcredit\s+limit\b.*\bincreased\b/i,
    /\breward\s+points?\b/i,
    // Additional patterns for common non-transaction bank SMS
    /\bdue\s+(on|by|date)\b/i,
    /\bpayment\s+due\b/i,
    /\bamt\s+due\b/i,
    /\bmin\s*(imum)?\s*due\b/i,
    /\byour\s+emi\b/i,
    /\bemi\s+of\s+(rs|inr|₹)/i,
    /\bcard\s+(is\s+)?(blocked|unblocked|activated|deactivated)/i,
    /\bblock(ed)?\s+your\s+card\b/i,
    /\bmissed\s+payment\b/i,
    /\bpayment\s+missed\b/i,
    /\baccount\s+statement\b/i,
    /\bmonthly\s+statement\b/i,
    /\byono\b/i,
    /\bnet\s*banking\b.*\blogin\b/i,
    /\bmobile\s*banking\b.*\bregistered\b/i,
    /\bregistered\b.*\bmobile\s*number\b/i,
    /\bpassword\b.*\bchanged\b/i,
    /\bpin\s+(changed|generated|set)\b/i,
    /\bnominee\b/i,
    /\bfixed\s+deposit\b.*\bmaturing\b/i,
    /\bfd\b.*\bmaturing\b/i,
    /\bcheque\b.*\bbounced?\b/i,
    /\bcheque\b.*\bcleared?\b/i,
    /\b(auto|si)\s*debit\b.*\bscheduled\b/i,
    /will\s+be\s+(?:auto)?debited\b/i,
    // URL shorteners and bank promo domains (never in real transaction alerts)
    /bit\.ly|tinyurl|surl\.li/i,
    /axbk\.in|indusbnk\.in|idfcfs\.in|go\.hdfc|yesbnk\.in/i,
    // "Valid till" = offer/promotional
    /valid\s+till\b/i,
    /valid\s+upto\b/i,
    /\bT&C\b/i,
    // EMI conversion / promotional
    /eligible\s+for\s+conversion/i,
    /convert\s+(?:now|your|into|spends)/i,
    /flexi\s*emi/i,
    /\bconversion\s+into\s+emi\b/i,
    // Cashback credited (notification, not a real transaction)
    /congratulations.*cashback/i,
    /cashback.*(?:has been|been)\s+credited/i,
    // CC payment acknowledgments (duplicate of debit SMS from bank account)
    /payment.*received\s+on\s+your.*credit\s*card/i,
    // Auto-debit reminders (not actual debits)
    /will\s+be\s+auto\s+debited\s+via/i,
    /please\s+maintain\s+sufficient\s+limit/i,
    // Offer language
    /\bcashback\s+(up\s+to|upto)\b/i,
    /get\s+up\s+to\s+(rs|inr|₹)/i,
    /\binstant\s+cashback\b/i,
    /\bmin\w*\.?\s*spends?\b/i,
    /\bshop\s+with\b/i,
    /\bshop\s+now\b/i,
    /\buse\s+your\s+(hdfc|sbi|axis|icici|kotak)\b/i,
    /\bclick\s+here\b/i,
    /\bvisit\s+https?\b/i,
    /\bavail\s+now\b/i,
    /\bknow\s+more\b/i,
    /\bgive\s+a\s+missed\s+call\b/i,
    /\bparticipate\b/i,
];

// Patterns that indicate REFUND/REVERSAL — parse but mark as refund
const REFUND_PATTERNS = [
    /\breversed?\b/i,
    /\breversal\b/i,
    /\brefund\b/i,
    /\brefunded\b/i,
    /\bchargeback\b/i,
];

/**
 * Known bank sender IDs (6-char alphanumeric format: XX-BANKNAME)
 * Only SMS from these senders will be processed.
 */
const BANK_SENDER_PATTERNS = [
    // Major banks & CC Issuers
    /^[A-Z]{2}-[A-Z]*(?:SBI|HDFC|ICICI|AXIS|KOTAK|PNB|BOB|YES|CANARA|UNION|IDBI|IDFC|INDUS|FEDER|BAND|RBL|CITI|AMEX|HSBC|SCB|BOI|CBI|IOB|UCO|MAHB|J&KBK)/i,
    // Payment banks / wallets / Fintech
    /^[A-Z]{2}-(?:PAYTM|PHONPE|GPAY|AMAZON|AIRTEL|JIOPAY|FREERC|SLICE|UNI|ONECRD|CRED|POSTPE)/i,
    // Generic bank patterns
    /^[A-Z]{2}-[A-Z]*(?:BANK|BK|BNK|CRD|CARD)\b/i,
    // 5-6 digit numeric senders (some banks use these)
    /^\d{5,6}$/,
];

/**
 * Check if an SMS sender ID looks like a bank/financial institution.
 * @param {string} sender - SMS sender ID
 * @returns {boolean}
 */
export function isBankSender(sender) {
    if (!sender) return false;
    const s = sender.trim().toUpperCase();

    // Never process 10-digit phone numbers (personal SMS)
    if (/^\+?\d{10,13}$/.test(s.replace(/[\s\-]/g, ''))) return false;

    return BANK_SENDER_PATTERNS.some(pattern => pattern.test(s));
}

/**
 * Strong transaction indicators — banks sometimes append promotional postscripts
 * (EMI conversion offers, missed call offers) to genuine transaction alerts.
 * If any of these match, skip reject-pattern filtering entirely.
 */
const STRONG_TRANSACTION_PATTERNS = [
    // "Rs X spent on/using <BANK> Bank Card/Credit Card XX..."
    /(?:rs\.?|inr|₹)\s*[\d,]+\.?\d{0,2}\s+spent\s+(?:on|using)\s+\w+\s+Bank/i,
    // "Spent INR X Axis Bank Card no. XX..."
    /Spent\s+(?:INR|Rs\.?)\s*[\d,]+\s+\w+\s+Bank\s+Card/i,
    // "Rs X debited from ... Account XX... towards ..."  (mandate/autopay with Avl/balance info)
    /(?:rs\.?|inr|₹)\s*[\d,]+.*\bdebited\b.*\b(?:account|acc)\b.*(?:XX|\*+)\d{3,6}.*towards/i,
    // Any CC spend with "Avl Lmt" or "Available Limit" — definitive transaction marker
    /(?:avl\s*\.?\s*lmt|avl\s*\.?\s*limit|available\s*limit)\s*[:\s]*(?:rs\.?|inr|₹)\s*[\d,]+/i,
];

/**
 * Pre-filter an SMS to determine if it should be processed.
 * @param {string} body - SMS body text
 * @param {string} [sender] - SMS sender ID (optional)
 * @returns {{ shouldProcess: boolean, isRefund: boolean, rejectReason: string|null }}
 */
export function preFilterSMS(body, sender) {
    if (!body || body.trim().length < 10) {
        return { shouldProcess: false, isRefund: false, rejectReason: 'Too short' };
    }

    // Check sender if provided
    if (sender && !isBankSender(sender)) {
        return { shouldProcess: false, isRefund: false, rejectReason: 'Non-bank sender' };
    }

    // Strong transaction override — banks sometimes append promo postscripts to real
    // transaction SMS (e.g. "give a missed call for EMI"). Don't reject those.
    const isStrongTransaction = STRONG_TRANSACTION_PATTERNS.some(p => p.test(body));

    // Check reject patterns (skip if confirmed strong transaction)
    if (!isStrongTransaction) {
        for (const pattern of REJECT_PATTERNS) {
            if (pattern.test(body)) {
                return { shouldProcess: false, isRefund: false, rejectReason: `Matched reject: ${pattern.source}` };
            }
        }
    }

    // Must contain some amount indicator to be a transaction
    const hasAmount = /(?:rs\.?|inr|₹)\s*[\d,]+\.?\d{0,2}/i.test(body) ||
        /(?:debited|credited|paid|received|sent|charged)\s*(?:rs\.?|inr|₹)?\s*[\d,]+/i.test(body);

    if (!hasAmount) {
        return { shouldProcess: false, isRefund: false, rejectReason: 'No amount found' };
    }

    // Check if it's a refund
    const isRefund = REFUND_PATTERNS.some(pattern => pattern.test(body));

    return { shouldProcess: true, isRefund, rejectReason: null };
}
