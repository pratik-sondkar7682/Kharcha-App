/**
 * Categorizer — Keyword-based transaction categorization
 * Supports 10+ categories with user override learning
 */

import { CATEGORIES } from '../theme';

// Keyword dictionary for auto-categorization
const CATEGORY_KEYWORDS = {
    food: [
        'swiggy', 'zomato', 'dominos', 'domino', 'mcdonalds', 'mcdonald',
        'starbucks', 'cafe', 'coffee', 'restaurant', 'pizza', 'burger',
        'biryani', 'kfc', 'subway', 'dunkin', 'baskin', 'haldiram',
        'barbeque', 'food', 'dine', 'dining', 'eatery', 'bakery',
        'chaayos', 'chai', 'tea', 'juice', 'shake', 'ice cream',
        'wok', 'maggi', 'paneer', 'rolls', 'momos', 'pani puri',
        'eatsure', 'faasos', 'behrouz', 'oven story', 'box8',
        'breakfast', 'chicken', 'hospi', 'sturmfrei',
        'chakra', 'mess', 'canteen', 'tiffin', 'dabba', 'thali',
    ],
    groceries: [
        'bigbasket', 'blinkit', 'zepto', 'dmart', 'grocery', 'kirana',
        'reliance fresh', 'more megastore', 'star bazaar', 'nature basket',
        'jiomart', 'grofers', 'milkbasket', 'country delight', 'licious',
        'freshtohome', 'meatigo', 'vegetables', 'fruits', 'ration',
        'provision', 'supermarket',
    ],
    shopping: [
        'amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'nykaa',
        'tatacliq', 'snapdeal', 'shopclues', 'firstcry', 'mall',
        'store', 'shop', 'retail', 'lifestyle', 'westside', 'zara',
        'h&m', 'decathlon', 'croma', 'reliance digital', 'vijay sales',
        'purplle', 'sugar', 'mamaearth', 'boat', 'noise', 'markfed',
        'avenue supe', 'dmart', 'supermart', 'mobile', 'corner mobi',
    ],
    transport: [
        'uber', 'ola', 'rapido', 'petrol', 'diesel', 'fuel', 'hp ',
        'bharat petroleum', 'iocl', 'ioc ', 'bpcl', 'shell',
        'metro', 'irctc', 'railway', 'train', 'bus', 'redbus',
        'parking', 'toll', 'fastag', 'paytmfastag', 'nhai',
        'blueSmart', 'meru', 'auto', 'rickshaw', 'cab', 'taxi',
        'flight', 'airline', 'indigo', 'spicejet', 'air india',
        'vistara', 'goair', 'cleartrip', 'makemytrip',
    ],
    bills: [
        'electricity', 'electric', 'bescom', 'tata power', 'adani',
        'broadband', 'internet', 'wifi', 'jio', 'airtel', 'vi ',
        'vodafone', 'bsnl', 'recharge', 'prepaid', 'postpaid',
        'gas', 'lpg', 'indane', 'bharat gas', 'hp gas',
        'water', 'water bill', 'dth', 'tata sky', 'dish tv',
        'd2h', 'sun direct', 'municipal', 'society', 'maintenance',
        'insurance', 'premium', 'lic ', 'policy',
        'google cloud', 'googlecloud', 'aws', 'azure',
    ],
    health: [
        'pharmacy', 'pharma', 'medical', 'medicine', 'hospital', 'clinic',
        'apollo', 'medplus', 'medlife', '1mg', 'practo', 'netmeds',
        'lab', 'diagnostic', 'pathology', 'dr.', 'doctor', 'dental',
        'dentist', 'optical', 'lenskart', 'eye', 'ayurvedic',
        'healthify', 'cult.fit', 'cultfit',
    ],
    entertainment: [
        'netflix', 'hotstar', 'jiohotstar', 'spotify', 'pvr', 'inox', 'bookmyshow',
        'prime video', 'amazon prime', 'disney', 'zee5', 'sonyliv',
        'jiocinema', 'youtube', 'yt premium', 'gaana', 'wynk',
        'xbox', 'playstation', 'steam', 'gaming', 'game',
        'concert', 'event', 'ticket', 'cinema', 'theatre', 'movie',
        'apple music', 'audible', 'bigtree',
    ],
    transfers: [
        'neft', 'imps', 'rtgs', 'fund transfer', 'self transfer', 'a/c transfer',
        // P2P transfer indicators (merchant name-based)
        'transferred to', 'transferred from', 'sent to', 'received from',
        'sent via', 'money sent', 'money received',
    ],
    rent: [
        'rent', 'emi', 'loan', 'housing', 'mortgage', 'instalment',
        'installment', 'bajaj finserv', 'hdfc ltd', 'lic housing',
        'home loan', 'car loan', 'personal loan', 'credit card payment',
        'cred', 'slice', 'cc bill', 'card bill', 'card payment',
        'infobil', 'inft',  // ICICI CC bill payment codes
    ],
    education: [
        'school', 'college', 'university', 'udemy', 'coursera',
        'fees', 'tuition', 'coaching', 'byjus', 'unacademy',
        'vedantu', 'whitehat', 'allen', 'aakash', 'fiitjee',
        'exam', 'test series', 'book', 'stationery',
    ],
    hardware: [
        'hardware', 'hardw', 'cement', 'plywood', 'paint', 'asian paints',
        'berger', 'nerolac', 'pipe', 'electric wire', 'plumber', 'carpenter',
    ],
    atm: [
        'atm wd', 'atm wdl', 'atm wtdl', 'atm withdrawal', 'cash withdrawal',
        'cash wd', 'cash wdl',
    ],
};

/**
 * Categorize a transaction based on merchant name.
 * @param {Object} txn - Transaction with merchant field
 * @param {Object} [userOverrides={}] - User-defined category overrides { merchantKey: category }
 * @returns {string} - Category key (e.g., 'food', 'shopping')
 */
export function categorize(txn, userOverrides = {}) {

    // Now check merchant name keywords
    const merchant = (txn.merchant || txn.rawMerchant || '').toLowerCase();
    
    // Check user overrides first (highest priority)
    const merchantKey = merchant.trim();
    if (merchantKey && userOverrides[merchantKey]) return userOverrides[merchantKey];

    // Check keyword matching (Move BEFORE generic UPI detection to fix JioHotstar/Flipkart issues)
    if (merchant && merchant !== 'unknown') {
        for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
            for (const keyword of keywords) {
                if (merchant.includes(keyword.toLowerCase())) {
                    return category;
                }
            }
        }
    }

    // ── Raw SMS detection ──────────────
    // This catches transactions where the parser couldn't extract a merchant name
    const rawSMSStr = (txn.rawSMS || '').toLowerCase();

    // ── Credit card detection FIRST (before UPI) ──
    // CC SMS can contain "UPI:ref" numbers, so CC check must take priority.
    // ALL credit card transactions → internal_transfer (unaccounted), never counted as spend.

    // Credit card payment acknowledgment (credit SMS, not real income)
    if (txn.type === 'credit') {
        const hasCreditCard = /credit\s*card|cc\s*bill|card\s*outstanding/.test(rawSMSStr);
        const hasPaymentContext = /payment|received|outstanding|avail|paid|thank/.test(rawSMSStr);
        if (hasCreditCard && hasPaymentContext) {
            return 'internal_transfer';
        }
    }

    // Credit card spend or bill payment → always unaccounted (not real spend from bank)
    if (txn.type === 'debit') {
        // Note: CRED, Slice are CC bill payment apps — those are real bank debits, NOT CC spends.
        // They should categorize as 'rent' (via keyword match above), not 'internal_transfer'.
        const ccMerchantMatch = /credit\s*card|cc\s*bill|card\s*outstanding|hdfc\s*card|sbi\s*card|icici\s*card|axis\s*card|kotak\s*card|rbl\s*card|amex|uni\s*card|onecard/i.test(merchant);
        const ccRawSMSMatch = /credit\s*card|cc\s*bill|card\s*outstanding|hdfc\s*card|sbi\s*card|icici\s*card|axis\s*card|kotak\s*card|rbl\s*card|amex/i.test(rawSMSStr) ||
            /\bcard\s*(?:no\.?\s*)?(?:XX|xx|\*+)\d+/i.test(rawSMSStr) ||   // "Card XX1234" or "Card no. XX1234"
            /\bspent\s+(?:using|on)\s+.*card/i.test(rawSMSStr) ||           // "spent using card" / "spent on card"
            /\bcard\s+(?:ending|no\.?)\s*\d+/i.test(rawSMSStr) ||           // "Card ending 1234"
            /\bavl\s*\.?\s*l(?:i?mt|imit)\b/i.test(rawSMSStr);             // "Avl Lmt" = credit card indicator

        if (ccMerchantMatch || ccRawSMSMatch) {
            return 'internal_transfer';
        }
    }
    // ── End credit card detection ──

    // ATM / Cash withdrawal detection
    const isATM = /\batm\s*(?:wd|wdl|wtdl|withdrawal|cash)\b/i.test(rawSMSStr) ||
        /\bcash\s*(?:wd|wdl|withdrawal)\b/i.test(rawSMSStr) ||
        /\batm\b.*\b(?:debited|withdrawn|withdrawal)\b/i.test(rawSMSStr) ||
        /\b(?:debited|withdrawn)\b.*\batm\b/i.test(rawSMSStr);
    if (isATM) return 'atm';

    // UPI / IMPS transfers — only classify as 'transfers' when merchant is unknown/empty
    // (i.e., P2P person-to-person transfers). If merchant name exists, let AI categorize it.
    if (!merchant || merchant === 'unknown' || merchant === 'received') {
        const isUPITransfer = /\bupi\b/.test(rawSMSStr) ||
            /\bimps\b/.test(rawSMSStr) ||
            /@[a-z]{2,}/.test(rawSMSStr);                         // @ybl, @oksbi etc.
        if (isUPITransfer) return 'transfers';
    }
    // ────────────────────────────────────────────────────────────────────────

    // VPA / phone number merchant fallback
    if (merchant && /^[6-9]\d{9}$/.test(merchant.trim())) return 'transfers';

    return 'uncategorized';
}


/**
 * Categorize multiple transactions.
 * @param {Object[]} transactions
 * @param {Object} [userOverrides={}]
 * @returns {Object[]} - Transactions with category field set
 */
export function categorizeAll(transactions, userOverrides = {}) {
    return transactions.map(txn => ({
        ...txn,
        // Preserve internal_transfer set by parser (identity-based self-transfer detection)
        // but re-categorize if category is null, empty, or 'uncategorized'
        category: (txn.category && txn.category !== 'uncategorized')
            ? txn.category
            : categorize(txn, userOverrides),
    }));
}

/**
 * Get category metadata (label, icon, color) for a category key.
 * @param {string} categoryKey
 * @returns {Object} - { label, icon, color }
 */
export function getCategoryMeta(categoryKey) {
    return CATEGORIES[categoryKey] || CATEGORIES.uncategorized;
}
