/**
 * Merchant Normalizer — Cleans cryptic UPI/bank merchant names
 * Strips prefixes like RAZORPAY*, PAY*, UPI- and extracts core merchant names
 */

// Known prefixes to strip
const STRIP_PREFIXES = [
    /^RAZORPAY\*/i,
    /^RAZORPAY_/i,
    /^PAY\*/i,
    /^PAY_/i,
    /^UPI-/i,
    /^UPI\//i,
    /^PAYU\*/i,
    /^PAYU_/i,
    /^CASHFREE\*/i,
    /^INSTAMOJO\*/i,
    /^BILLDESK\*/i,
    /^CCAVENUE\*/i,
    /^PHONEPE\*/i,
    /^GPAY\*/i,
    /^BHARATPE\*/i,
];

// Known suffixes to strip
const STRIP_SUFFIXES = [
    /@ybl$/i,
    /@paytm$/i,
    /@upi$/i,
    /@ok\w+$/i,
    /@axl$/i,
    /@icici$/i,
    /@hdfc$/i,
    /@sbi$/i,
    /@idfcfirst$/i,
    /\d{5,}$/,      // Trailing numeric IDs
    /-\d{6,}$/,     // Trailing reference numbers
];

// Known merchant aliases — maps cryptic names to clean names
const DEFAULT_ALIASES = {
    'SWIGGY': 'Swiggy',
    'ZOMATO': 'Zomato',
    'AMAZON': 'Amazon',
    'AMAZON SELLER SVCS': 'Amazon',
    'AMAZON PAY': 'Amazon Pay',
    'FLIPKART': 'Flipkart',
    'MYNTRA': 'Myntra',
    'AJIO': 'Ajio',
    'MEESHO': 'Meesho',
    'UBER': 'Uber',
    'OLA': 'Ola',
    'RAPIDO': 'Rapido',
    'IRCTC': 'IRCTC',
    'IRCTC_WEB': 'IRCTC',
    'IRCTCWEB': 'IRCTC',
    'NETFLIX': 'Netflix',
    'HOTSTAR': 'JioHotstar',
    'JIOHOTSTAR': 'JioHotstar',
    'SPOTIFY': 'Spotify',
    'DISNEY': 'Disney+ Hotstar',
    'YOUTUBE': 'YouTube',
    'GOOGLE': 'Google',
    'GPAY': 'Google Pay',
    'PHONEPE': 'PhonePe',
    'PAYTM': 'Paytm',
    'BIGBASKET': 'BigBasket',
    'BLINKIT': 'Blinkit',
    'ZEPTO': 'Zepto',
    'DUNZO': 'Dunzo',
    'JIO': 'Jio',
    'AIRTEL': 'Airtel',
    'VI': 'Vi',
    'VODAFONE': 'Vodafone',
    'BOOKMYSHOW': 'BookMyShow',
    'PVR': 'PVR',
    'INOX': 'Inox',
    'NYKAA': 'Nykaa',
    'DOMINOS': "Domino's",
    'MCDONALDS': "McDonald's",
    'STARBUCKS': 'Starbucks',
    'PHARMEASY': 'PharmEasy',
    'MEDPLUS': 'MedPlus',
    '1MG': '1mg',
    'APOLLO': 'Apollo',
    'PRACTO': 'Practo',
    'UDEMY': 'Udemy',
    'COURSERA': 'Coursera',
    'DMART': 'DMart',
    'CRED': 'CRED',
    'SLICE': 'Slice',
    // Pluxee/Sodexo: parser already extracts the real merchant from the SMS, no alias needed
    'GOOGLECLOUD': 'Google Cloud',
    'GOOGLEGOOG': 'Google',
    'YOUTUBEGOOG': 'YouTube',
    'PYU*FLIPKAR': 'Flipkart',
    'PYU*ZOMATO': 'Zomato',
    'FL': 'Flipkart',
    'CASHFREE*FL': 'Flipkart',
    'AVENUE SUPE': 'Avenue Supermarts (DMart)',
    'BIGTREE ENTERTA': 'PVR Inox',
    'BIGTREE': 'PVR Inox',
};

const SHORT_ALIAS_PATTERNS = Object.entries(DEFAULT_ALIASES)
    .filter(([key]) => key.length <= 3)
    .map(([key, value]) => ({ re: new RegExp(`\\b${key}\\b`, 'i'), value }));

/**
 * Normalize a merchant name — strip prefixes/suffixes, apply aliases.
 * @param {string} rawName - Raw merchant name from SMS
 * @param {Object} [userAliases={}] - User-defined alias overrides
 * @returns {string} - Clean, human-readable merchant name
 */
export function normalizeMerchant(rawName, userAliases = {}) {
    if (!rawName) return 'Unknown';

    let name = rawName.trim();

    // Strip known prefixes
    for (const prefix of STRIP_PREFIXES) {
        name = name.replace(prefix, '');
    }

    // Strip known suffixes
    for (const suffix of STRIP_SUFFIXES) {
        name = name.replace(suffix, '');
    }

    // Clean up formatting
    name = name.trim()
        .replace(/[_\-]+/g, ' ')         // Replace underscores/hyphens with spaces
        .replace(/\s+/g, ' ')            // Collapse multiple spaces
        .trim();

    // Check if it's a phone number (P2P transfer)
    if (/^\d{10}$/.test(name.replace(/[\s\-]/g, ''))) {
        return `UPI Transfer (${name.slice(-4)})`;
    }

    // Apply user aliases first (highest priority)
    const upperName = name.toUpperCase();
    if (userAliases[upperName]) return userAliases[upperName];

    // Apply default aliases
    if (DEFAULT_ALIASES[upperName]) return DEFAULT_ALIASES[upperName];

    // Partial match on default aliases (require word boundary for short keys to avoid false matches)
    for (const { re, value } of SHORT_ALIAS_PATTERNS) {
        if (re.test(upperName)) return value;
    }
    for (const [key, value] of Object.entries(DEFAULT_ALIASES)) {
        if (key.length > 3) {
            if (upperName.includes(key)) return value;
        }
    }

    // Title case the name if no alias found
    if (name.length > 0) {
        name = name.split(' ')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ');
    }

    return name || 'Unknown';
}
