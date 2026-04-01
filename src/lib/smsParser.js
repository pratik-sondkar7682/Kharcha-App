/**
 * SMS Parser — Multi-tier parsing engine for Indian bank SMS
 * Tier 1: Bank-specific regex patterns (~70% of SMS)
 * Tier 2: Generic transaction patterns (~20% more)
 * Tier 3: Unparsed queue (remaining ~10%)
 */

import { extractDateFromSMS, toISODate } from './dateParser';
import { normalizeMerchant } from './merchantNormalizer';

/**
 * Patterns strictly indicating non-transactions (reminders, OTPs, failed payloads)
 */
const IGNORE_PATTERNS = [
    /will\s+be(?:\s+auto)?\s*(?:debited|deducted|charged)/i,
    /due\s*(?:on|by|date)?/i,
    /upcoming\s+(?:payment|emi|bill)/i,
    /declined/i,
    /failed/i,
    /otp|one\s*time\s*password/i,
    /requested\s+money/i,
    /limit\s*exhausted/i,
    /unsuccessful/i,
    /not\s+successful/i,
    /reminder/i
];

/**
 * Unified amount extractor — handles Rs, Rs., INR, ₹ with or without commas
 * @param {string} text
 * @returns {number|null}
 */
function extractAmount(text) {
    // Multiple patterns for amount extraction
    const patterns = [
        /(?:Rs\.?\s*|INR\s*|₹\s*)([0-9,]+\.?\d{0,2})/i,
        /(?:debited|credited|paid|received|sent|charged)\s*(?:by\s+)?(?:Rs\.?\s*|INR\s*|₹\s*)([0-9,]+\.?\d{0,2})/i,
        /(?:Rs\.?\s*|INR\s*|₹\s*)([0-9,]+\.?\d{0,2})\s*(?:has been|is|was)?/i,
        /of\s+(?:Rs\.?\s*|INR\s*|₹\s*)([0-9,]+\.?\d{0,2})/i,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            const amount = parseFloat(match[1].replace(/,/g, ''));
            if (!isNaN(amount) && amount > 0) return amount;
        }
    }
    return null;
}

/**
 * Extract balance from SMS
 * @param {string} text
 * @returns {number|null}
 */
function extractBalance(text) {
    const patterns = [
        /(?:bal(?:ance)?|avl\.?\s*bal|available\s+bal)\s*[:\s]*(?:Rs\.?\s*|INR\s*|₹\s*)?([0-9,]+\.?\d{0,2})/i,
        /(?:bal)\s*(?:Rs\.?\s*|INR\s*|₹\s*)([0-9,]+\.?\d{0,2})/i,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            const balance = parseFloat(match[1].replace(/,/g, ''));
            if (!isNaN(balance) && balance >= 0) return balance;
        }
    }
    return null;
}

/**
 * Extract account number (last 4 digits) from SMS
 */
function extractAccount(text) {
    const patterns = [
        /a\/?c\s*(?:no\.?\s*)?(?:XX|xx|X{2,}|\*{2,})(\d{4})/i,
        /account\s*(?:no\.?\s*)?(?:XX|xx|X{2,}|\*{2,})(\d{4})/i,
        /(?:card|ac)\s*(?:XX|xx|X{2,}|\*{2,})(\d{4})/i,
        /(?:XX|xx|X{2,}|\*{2,})(\d{4})/,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return `XX${match[1]}`;
    }
    return null;
}

/**
 * Extract UPI reference number
 */
function extractUPIRef(text) {
    const patterns = [
        /UPI\s*[:\s]\s*(\d{9,16})/i,                           // "UPI:642920796196" or "UPI 642920796196"
        /UPI\s*(?:Ref|ref)\s*(?:No\.?\s*)?[:\s]*(\d{9,16})/i,  // "UPI Ref No: ..."
        /Refno\s+(\d{9,16})/i,                                  // "Refno 608083000402" (SBI UPI)
        /Ref\s*(?:no\.?\s*)?[:\s]*(\d{9,16})/i,                // "Ref no: ..."
        /Txn\s*(?:ID|Id|id)\s*[:\s]*([A-Za-z0-9]{9,})/i,      // "Txn ID: ..."
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return match[1];
    }
    return null;
}

// ==================== TIER 1: Bank-specific patterns ====================

const BANK_PATTERNS = [
    // SBI UPI Debit
    {
        bank: 'SBI',
        pattern: /(?:SBI|State Bank).*a\/c\s*XX(\d{4})\s*debited\s*(?:by\s+)?(?:Rs\.?\s*|INR\s*|₹\s*)([0-9,]+\.?\d{0,2}).*(?:credited to|to)\s+([A-Za-z0-9\s\._\-]+?)(?:\.|,|\s+UPI)/i,
        extract: (m) => ({ type: 'debit', account: `XX${m[1]}`, amount: parseFloat(m[2].replace(/,/g, '')), merchant: m[3].trim(), bank: 'SBI' }),
    },
    // SBI Credit (now captures sender/transfer source)
    {
        bank: 'SBI',
        pattern: /(?:SBI|State Bank).*a\/c\s*X?X?(\d{4}).*credited\s*(?:by|with)?\s*(?:Rs\.?\s*|INR\s*|₹\s*)([0-9,]+\.?\d{0,2}).*?(?:transfer from|from)\s+([A-Za-z0-9\s\._\-]+?)(?:\s+Ref|$)/i,
        extract: (m) => ({ type: 'credit', account: `XX${m[1]}`, amount: parseFloat(m[2].replace(/,/g, '')), merchant: m[3].trim(), bank: 'SBI' }),
    },
    // SBI Credit Fallback (Received)
    {
        bank: 'SBI',
        pattern: /(?:SBI|State Bank).*a\/c\s*X?X?(\d{4})\s*credited\s*(?:by|with)?\s*(?:Rs\.?\s*|INR\s*|₹\s*)([0-9,]+\.?\d{0,2})/i,
        extract: (m) => ({ type: 'credit', account: `XX${m[1]}`, amount: parseFloat(m[2].replace(/,/g, '')), merchant: 'Received', bank: 'SBI' }),
    },
    // SBI UPI short format — "Dear UPI user A/C X6963 debited by 75.00 on date 21Mar26 trf to NAME"
    {
        bank: 'SBI',
        pattern: /Dear\s+UPI\s+user\s+A\/C\s+X?(\d{4})\s+debited\s+by\s+([0-9,]+\.?\d{0,2})\s+on\s+date\s+\S+\s+trf\s+to\s+(.+?)(?:\s+Refno|\s+If\s+not|$)/i,
        extract: (m) => ({ type: 'debit', account: `XX${m[1]}`, amount: parseFloat(m[2].replace(/,/g, '')), merchant: m[3].trim(), bank: 'SBI' }),
    },
    // SBI Credit Card Spend
    {
        bank: 'SBI',
        pattern: /Transaction\s*of\s*(?:Rs\.?\s*|INR|₹)\s*([0-9,]+\.?\d{0,2})\s*occurred\s*on\s*SBI\s*Card\s*ending\s*(\d{4})\s*at\s+(.+?)\s*on\s*[\d\/]+/i,
        extract: (m) => ({ 
            type: 'debit', 
            account: `XX${m[2]}`, 
            amount: parseFloat(m[1].replace(/,/g, '')), 
            merchant: m[3].trim(), 
            bank: 'SBI',
            category: 'credit_card'
        }),
    },
    // HDFC Debit
    {
        bank: 'HDFC',
        pattern: /(?:INR|Rs\.?\s*|₹\s*)([0-9,]+\.?\d{0,2})\s*debited\s*from\s*(?:A\/c|a\/c|Ac)\s*(?:XX|xx|\*{2,})(\d{4}).*?(?:towards|to|for)\s+(?:UPI[\/\-])?([A-Za-z0-9\s\._\-@]+?)(?:\.\s|,\s|Avl)/i,
        extract: (m) => ({ type: 'debit', account: `XX${m[2]}`, amount: parseFloat(m[1].replace(/,/g, '')), merchant: m[3].trim(), bank: 'HDFC' }),
    },
    // HDFC Credit
    {
        bank: 'HDFC',
        pattern: /(?:INR|Rs\.?\s*|₹\s*)([0-9,]+\.?\d{0,2})\s*credited\s*to\s*(?:A\/c|a\/c|Ac)\s*(?:XX|xx|\*{2,})(\d{4})/i,
        extract: (m) => ({ type: 'credit', account: `XX${m[2]}`, amount: parseFloat(m[1].replace(/,/g, '')), merchant: 'Received', bank: 'HDFC' }),
    },
    // HDFC Credit Card Spend
    {
        bank: 'HDFC',
        pattern: /spent\s*(?:Rs\.?\s*|INR\s*|₹\s*)([0-9,]+\.?\d{0,2})\s*(?:on|at)\s+HDFC\s*Bank\s*Credit\s*Card\s*(?:XX|xx|\*{2,})(\d{4})\s*at\s+(.+?)\s*on\s*[\d\-]+/i,
        extract: (m) => ({ 
            type: 'debit', 
            account: `XX${m[2]}`, 
            amount: parseFloat(m[1].replace(/,/g, '')), 
            merchant: m[3].trim(), 
            bank: 'HDFC',
            category: 'credit_card'
        }),
    },
    // ICICI "debited from" — AutoPay/Mandate: "Rs X debited from ICICI Bank Savings Account XX681 ... towards MERCHANT"
    {
        bank: 'ICICI',
        pattern: /(?:Rs\.?\s*|INR\s*)([0-9,]+\.?\d{0,2})\s*debited\s+from\s+ICICI\s+Bank\s+(?:Savings\s+)?Account\s+(?:XX|xx|\*+)(\d{3,6})\s+on\s+[\d\-\w]+\s+towards\s+(.+?)(?:\s+for\s|\s*$)/i,
        extract: (m) => ({
            type: 'debit',
            account: `XX${m[2]}`,
            amount: parseFloat(m[1].replace(/,/g, '')),
            merchant: m[3].trim(),
            bank: 'ICICI'
        }),
    },
    // ICICI short format — "ICICI Bank Acc XX681 debited Rs. X on DATE Info..." (ATM/BillPay/NEFT)
    {
        bank: 'ICICI',
        pattern: /ICICI\s+Bank\s+Acc?\s+(?:XX|xx|\*+)(\d{3,6})\s+debited\s+(?:Rs\.?\s*|INR\s*)([0-9,]+\.?\d{0,2})\s+on\s+[\d\-\w]+\s+(.+?)(?:\.\s*Av|\s*\.?\s*To\s+dispute)/i,
        extract: (m) => {
            const info = m[3].trim();
            // Detect ATM withdrawals: NFS*CASH WDL, ATM*...
            const isATM = /NFS\*|ATM\*/i.test(info);
            const merchant = isATM ? 'ATM Withdrawal' : info;
            // CC bill payments (InfoBIL*, INFT*) are real bank debits — let categorizer
            // handle them (will match 'rent' via keyword). NOT internal_transfer.
            return {
                type: 'debit',
                account: `XX${m[1]}`,
                amount: parseFloat(m[2].replace(/,/g, '')),
                merchant,
                bank: 'ICICI',
                category: null
            };
        },
    },
    // ICICI Debit (UPI/NEFT) — account may be XX681 (3 digits) or XX1234 (4 digits)
    {
        bank: 'ICICI',
        pattern: /(?:ICICI).*(?:A\/c|Acct?|Account)\s*(?:XX|xx|\*{2,})(\d{3,6})\s*(?:is\s+)?debited\s*(?:with|for)?\s*(?:Rs\.?\s*|INR\s*|₹\s*)([0-9,]+\.?\d{0,2})/i,
        extract: (m) => {
            const payeeMatch = m.input.match(/;\s*(?:Mr\.?\s+|Mrs\.?\s+|Ms\.?\s+|Dr\.?\s+)?([A-Z0-9][A-Z0-9 &._\-]{1,40}?)\s+credited/i);
            const merchant = payeeMatch ? payeeMatch[1].trim() : '';
            return { type: 'debit', account: `XX${m[1]}`, amount: parseFloat(m[2].replace(/,/g, '')), merchant, bank: 'ICICI' };
        },
    },
    // ICICI Credit (NEFT/UPI received) — handles both "credited Rs" and "credited:Rs"
    {
        bank: 'ICICI',
        pattern: /(?:ICICI).*(?:A\/c|Acct?|Account)\s*(?:XX|xx|\*{2,})(\d{3,6})\s*(?:is\s+)?credited:?\s*(?:with|for)?\s*(?:Rs\.?\s*|INR\s*|₹\s*)([0-9,]+\.?\d{0,2})/i,
        extract: (m) => {
            const senderMatch = m.input.match(/;\s*(?:Mr\.?\s+|Mrs\.?\s+|Ms\.?\s+|Dr\.?\s+)?([A-Z0-9][A-Z0-9 &._\-]{1,40}?)\s+debited/i);
            const merchant = senderMatch ? senderMatch[1].trim() : 'Received';
            return { type: 'credit', account: `XX${m[1]}`, amount: parseFloat(m[2].replace(/,/g, '')), merchant, bank: 'ICICI' };
        },
    },
    // ICICI Credit Card — foreign currency "USD/EUR/GBP X spent using ICICI Bank Card XX on DATE on MERCHANT"
    {
        bank: 'ICICI',
        pattern: /([A-Z]{3})\s+([0-9,]+\.?\d{0,2})\s+spent\s+using\s+ICICI\s+Bank\s+Card\s+(?:XX|xx|\*{2,})(\d{3,6})\s+on\s+\d{1,2}-\w+-\d{2,4}\s+on\s+(.+?)(?:\.\s|\s+Avl|\s+Avail|\s+If\s+not|\s+Call)/i,
        extract: (m) => ({
            type: 'debit',
            account: `XX${m[3]}`,
            amount: parseFloat(m[2].replace(/,/g, '')),
            merchant: m[4].trim(),
            bank: 'ICICI',
            category: 'credit_card',
            currency: m[1],
        }),
    },
    // ICICI Credit Card — "INR X spent using ICICI Bank Card XX on DATE on MERCHANT"
    {
        bank: 'ICICI',
        pattern: /(?:INR|Rs\.?)\s*([0-9,]+\.?\d{0,2})\s*spent\s+using\s+ICICI\s+Bank\s+Card\s+(?:XX|xx|\*{2,})(\d{3,6})\s+on\s+\d{1,2}-\w+-\d{2,4}\s+on\s+(.+?)(?:\.|,|\s+Avl|\s+Avail|\s+Call)/i,
        extract: (m) => ({
            type: 'debit',
            account: `XX${m[2]}`,
            amount: parseFloat(m[1].replace(/,/g, '')),
            merchant: m[3].trim(),
            bank: 'ICICI',
            category: 'credit_card'
        }),
    },
    // ICICI Credit Card — "Rs X spent on ICICI Bank Card XX on DATE at MERCHANT"
    {
        bank: 'ICICI',
        pattern: /(?:INR|Rs\.?)\s*([0-9,]+\.?\d{0,2})\s*spent\s+on\s+ICICI\s+Bank\s+Card\s+(?:XX|xx|\*{2,})(\d{3,6})\s+on\s+\d{1,2}-\w+-\d{2,4}\s+at\s+(.+?)(?:\.\s|\s+Avl|\s+Avail|\s+To\s|\s+Call)/i,
        extract: (m) => ({
            type: 'debit',
            account: `XX${m[2]}`,
            amount: parseFloat(m[1].replace(/,/g, '')),
            merchant: m[3].trim(),
            bank: 'ICICI',
            category: 'credit_card'
        }),
    },
    // Old-style ICICI (sender ICICIB/ICICIT, body says "Dear Customer, Acct/Acc XX...")
    {
        bank: 'ICICI',
        pattern: /(?:Dear\s+(?:Customer|Valued\s+Customer)|ICICI\s+Bank\s+Acc?\b).*?\bAcc?(?:t|ount)?\s+(?:XX|xx|\*+)(\d{3,6})\s+(?:is\s+)?debited\s+with\s+(?:Rs\.?\s*|INR\s*|₹\s*)([0-9,]+\.?\d{0,2})/i,
        extract: (m) => {
            const payeeMatch = m.input.match(/(?:to|towards|VIN\*)\s*([A-Z0-9][A-Za-z0-9 &._\-*]{1,40}?)(?:\s*\.|,|\s+(?:Avb|Avl|Available|Call))/i);
            return { type: 'debit', account: `XX${m[1]}`, amount: parseFloat(m[2].replace(/,/g, '')), merchant: payeeMatch ? payeeMatch[1].trim() : '', bank: 'ICICI' };
        },
    },
    // Old-style ICICI credit (Dear Customer, Acct XX681 is credited with Rs X from NAME)
    {
        bank: 'ICICI',
        pattern: /(?:Dear\s+(?:Customer|Valued\s+Customer)|ICICI\s+Bank\s+Acc?\b|We\s+have\s+credited).*?\bAcc?(?:t|ount)?\s+(?:XX+)?(\d{3,6})\s+(?:is\s+)?credited\s+with\s+(?:Rs\.?\s*|INR\s*|₹\s*)([0-9,]+\.?\d{0,2})/i,
        extract: (m) => {
            const fromMatch = m.input.match(/from\s+([A-Z0-9][A-Za-z0-9 &._\-]{1,40}?)(?:\s*\.|,|\s+UPI|\s+Ref|\s*$)/i);
            return { type: 'credit', account: `XX${m[1]}`, amount: parseFloat(m[2].replace(/,/g, '')), merchant: fromMatch ? fromMatch[1].trim() : 'Received', bank: 'ICICI' };
        },
    },
    // Axis Bank CC multi-line: "Spent\nINR 237\nAxis Bank Card no. XX8217\nDATE TIME IST\nMERCHANT\nAvl Limit"
    {
        bank: 'Axis',
        pattern: /Spent\s+(?:INR|Rs\.?)\s*([0-9,]+\.?\d{0,2})\s+Axis\s+Bank\s+Card\s+no\.\s+(?:XX|xx|\*+)(\d{3,6})\s+[\d\-]+\s+[\d:]+\s+IST\s+(.+?)\s+(?:Avl|Avail|Not)/i,
        extract: (m) => ({
            type: 'debit',
            account: `XX${m[2]}`,
            amount: parseFloat(m[1].replace(/,/g, '')),
            merchant: m[3].trim(),
            bank: 'Axis',
            category: 'credit_card'
        }),
    },
    // Axis Bank CC multi-line (old format): "Spent\nCard no. XX8217\nINR 816\nDATE TIME\nMERCHANT\nAvl"
    {
        bank: 'Axis',
        pattern: /Spent\s+Card\s+no\.\s+(?:XX|xx|\*+)(\d{3,6})\s+(?:INR|Rs\.?)\s*([0-9,]+\.?\d{0,2})\s+[\d\-]+\s+[\d:]+\s+(.+?)\s+(?:Avl|Avail)/i,
        extract: (m) => ({
            type: 'debit',
            account: `XX${m[1]}`,
            amount: parseFloat(m[2].replace(/,/g, '')),
            merchant: m[3].trim(),
            bank: 'Axis',
            category: 'credit_card'
        }),
    },
    // Axis Bank CC: "Transaction of INR X on Axis Bank Credit Card no. XX8217 at MERCHANT"
    {
        bank: 'Axis',
        pattern: /Transaction\s+of\s+(?:INR|Rs\.?)\s*([0-9,]+\.?\d{0,2})\s+on\s+Axis\s+Bank\s+Credit\s+Card\s+(?:no\.)?\s*(?:XX|xx|\*+)(\d{3,6})\s+on\s+[\d\-]+\s+[\d:]+\s+IST\s+at\s+(.+?)(?:\s+has\b|\s+Avl|\.|$)/i,
        extract: (m) => ({ 
            type: 'debit', 
            account: `XX${m[2]}`, 
            amount: parseFloat(m[1].replace(/Gre/, '')), 
            merchant: m[3].trim(), 
            bank: 'Axis',
            category: 'credit_card'
        }),
    },
    // IDFC FASTag: "INR X toll paid from IDFC FIRST Bank Tag ... at TOLL PLAZA on DD/MM/YYYY"
    {
        bank: 'IDFC',
        pattern: /(?:INR|Rs\.?)\s*([0-9,]+\.?\d{0,2})\s+toll\s+paid\s+from\s+IDFC.*?at\s+(.+?)(?:\s+on\s+\d{1,2}[\/\-]|\s*$|\.)/i,
        extract: (m) => ({ type: 'debit', account: '', amount: parseFloat(m[1].replace(/,/g, '')), merchant: m[2].trim(), bank: 'IDFC', category: 'transport' }),
    },
    // IDFC FASTag credit (reload): "IDFC FIRST Bank FASTag credited with INR X"
    {
        bank: 'IDFC',
        pattern: /IDFC.*?FASTag.*?credited\s+with\s+(?:INR|Rs\.?)\s*([0-9,]+\.?\d{0,2})/i,
        extract: (m) => ({ type: 'credit', account: '', amount: parseFloat(m[1].replace(/,/g, '')), merchant: 'FASTag Reload', bank: 'IDFC' }),
    },
    // Pluxee (Sodexo) Meal Card — "Rs X spent from Pluxee Meal wallet, card no.xx1330 on DATE at MERCHANT"
    {
        bank: 'Pluxee',
        pattern: /(?:Rs\.?|INR)\s*([0-9,]+\.?\d{0,2})\s+spent\s+from\s+Pluxee\s+\S+\s+wallet,\s+card\s+no\.?(?:xx|XX|\*+)(\d{3,6})\s+on\s+[\d\-\/\s:]+at\s+(.+?)(?:\s*\.\s*Avl|\s*Not\s+you|$)/i,
        extract: (m) => ({ type: 'debit', account: `XX${m[2]}`, amount: parseFloat(m[1].replace(/,/g, '')), merchant: m[3].trim(), bank: 'Pluxee' }),
    },
    // Pluxee — "Rs X deducted from your Pluxee Card xxxx1330 towards MERCHANT"
    {
        bank: 'Pluxee',
        pattern: /(?:Rs\.?|INR)\s*([0-9,]+\.?\d{0,2})\s+deducted\s+from\s+your\s+Pluxee\s+Card\s+(?:xxxx|XX|\*+)(\d{3,6})\s+towards\s+(.+?)(?:\.\s*Pluxee|$)/i,
        extract: (m) => ({ type: 'debit', account: `XX${m[2]}`, amount: parseFloat(m[1].replace(/,/g, '')), merchant: m[3].trim(), bank: 'Pluxee' }),
    },
    // Pluxee catch-all — any Pluxee SMS with amount and merchant "at MERCHANT" or "to MERCHANT"
    {
        bank: 'Pluxee',
        pattern: /(?:Rs\.?|INR)\s*([0-9,]+\.?\d{0,2})\s+.*?(?:Pluxee|Sodexo).*?(?:at|to)\s+([A-Za-z0-9\s&'.\-]+?)(?:\s*\.\s*|\s*Not\s+you|$)/i,
        extract: (m) => ({ type: 'debit', account: '', amount: parseFloat(m[1].replace(/,/g, '')), merchant: m[2].trim(), bank: 'Pluxee' }),
    },
    // Axis Bank Card (existing - kept for non-credit-card formats)
    {
        bank: 'Axis',
        pattern: /AXIS\s*BANK\s*Card\s*(?:XX|xx|\*{2,})(\d{4}).*?(?:used|transaction)\s*(?:for|of)\s*(?:Rs\.?\s*|INR\s*|₹\s*)([0-9,]+\.?\d{0,2})\s*(?:at|on)\s+([A-Za-z0-9\s\._\-]+?)(?:\s+on\s|\.|$)/i,
        extract: (m) => ({ type: 'debit', account: `XX${m[1]}`, amount: parseFloat(m[2].replace(/,/g, '')), merchant: m[3].trim(), bank: 'Axis', category: 'credit_card' }),
    },
    // Kotak Debit
    {
        bank: 'Kotak',
        pattern: /(?:Rs\.?\s*|INR\s*|₹\s*)([0-9,]+\.?\d{0,2})\s*debited\s*from\s*(?:Kotak).*?(?:AC|A\/c)\s*(?:XX|xx|\*{2,})(\d{4})\s*(?:to)\s+([A-Za-z0-9\s\._\-\/]+?)(?:\s+on\s|\.\s|UPI|$)/i,
        extract: (m) => ({ type: 'debit', account: `XX${m[2]}`, amount: parseFloat(m[1].replace(/,/g, '')), merchant: m[3].trim(), bank: 'Kotak' }),
    },
    // Kotak Credit Card Spend
    {
        bank: 'Kotak',
        pattern: /Transaction\s*of\s*(?:Rs\.?\s*|INR|₹)\s*([0-9,]+\.?\d{0,2})\s*on\s*Kotak\s*Bank\s*Credit\s*Card\s*(?:XX|xx|\*{2,})(\d{4})\s*at\s+(.+?)\s*on\s*[\d\/]+/i,
        extract: (m) => ({ 
            type: 'debit', 
            account: `XX${m[2]}`, 
            amount: parseFloat(m[1].replace(/,/g, '')), 
            merchant: m[3].trim(), 
            bank: 'Kotak',
            category: 'credit_card'
        }),
    },
    // Canara Bank Debit — "An amount of INR X has been DEBITED to your account XXXX2901 on DATE"
    {
        bank: 'Canara',
        pattern: /An\s+amount\s+of\s+(?:INR|Rs\.?)\s*([0-9,]+\.?\d{0,2})\s+has\s+been\s+DEBITED\s+to\s+your\s+account\s+(?:XXXX|XX)(\d{3,6})/i,
        extract: (m) => ({ type: 'debit', account: `XX${m[2]}`, amount: parseFloat(m[1].replace(/,/g, '')), merchant: '', bank: 'Canara' }),
    },
    // Canara Bank Credit — "An amount of INR X has been CREDITED to your account XXXX2901 on DATE"
    {
        bank: 'Canara',
        pattern: /An\s+amount\s+of\s+(?:INR|Rs\.?)\s*([0-9,]+\.?\d{0,2})\s+has\s+been\s+CREDITED\s+to\s+your\s+account\s+(?:XXXX|XX)(\d{3,6})/i,
        extract: (m) => ({ type: 'credit', account: `XX${m[2]}`, amount: parseFloat(m[1].replace(/,/g, '')), merchant: 'Received', bank: 'Canara' }),
    },
    // Canara Bank UPI — "Rs.X paid thru A/C XX2901 on DATE to MERCHANT, UPI Ref"
    {
        bank: 'Canara',
        pattern: /(?:Rs\.?\s*|INR\s*)([0-9,]+\.?\d{0,2})\s*paid\s+thru\s+A\/C\s+(?:XX)(\d{3,6})\s+on\s+[\d\-]+\s+[\d:]+\s+to\s+(.+?),\s*UPI/i,
        extract: (m) => ({ type: 'debit', account: `XX${m[2]}`, amount: parseFloat(m[1].replace(/,/g, '')), merchant: m[3].trim(), bank: 'Canara' }),
    },
    // Paytm Payment Bank
    {
        bank: 'Paytm',
        pattern: /(?:Rs\.?\s*|INR\s*|₹\s*)([0-9,]+\.?\d{0,2})\s*paid\s*to\s+([A-Za-z0-9\s\._\-]+?)\s*(?:via|from|\.)/i,
        extract: (m) => ({ type: 'debit', account: '', amount: parseFloat(m[1].replace(/,/g, '')), merchant: m[2].trim(), bank: 'Paytm' }),
    },
    // ── Generic Credit Card Spend patterns (no bank name required) ──
    // "Your Card XX1234 spent INR 999 at AMAZON on 02-Mar"
    {
        bank: 'Generic',
        pattern: /(?:Your\s+)?(?:Credit\s+)?Card\s+(?:no\.?\s*)?(?:XX|xx|\*+)(\d{3,6})\s+(?:spent|charged|used)\s+(?:INR|Rs\.?)\s*([0-9,]+\.?\d{0,2})\s+(?:at|on)\s+(.+?)(?:\s+on\s+[\d\-\w]+)?(?:\.\s*|\s+Avl|\s+Avail|$)/i,
        extract: (m) => ({
            type: 'debit',
            account: `XX${m[1]}`,
            amount: parseFloat(m[2].replace(/,/g, '')),
            merchant: m[3].trim(),
            bank: '',
            category: 'credit_card'
        }),
    },
    // "INR 999 spent on/using Card XX1234 at MERCHANT on DATE"
    {
        bank: 'Generic',
        pattern: /(?:INR|Rs\.?)\s*([0-9,]+\.?\d{0,2})\s+(?:spent|charged)\s+(?:on|using|at)\s+(?:your\s+)?(?:Credit\s+)?Card\s+(?:no\.?\s*)?(?:XX|xx|\*+)(\d{3,6})\s+(?:at|on)\s+(.+?)(?:\s+on\s+[\d\-\w]+)?(?:\.\s*|\s+Avl|\s+Avail|$)/i,
        extract: (m) => ({
            type: 'debit',
            account: `XX${m[2]}`,
            amount: parseFloat(m[1].replace(/,/g, '')),
            merchant: m[3].trim(),
            bank: '',
            category: 'credit_card'
        }),
    },
    // "Transaction of Rs X on Card ending/no 1234 at MERCHANT"
    {
        bank: 'Generic',
        pattern: /Transaction\s+of\s+(?:Rs\.?\s*|INR\s*|₹\s*)([0-9,]+\.?\d{0,2})\s+(?:on|using)\s+(?:your\s+)?(?:Credit\s+)?Card\s+(?:ending|no\.?)\s*(\d{3,6})\s+at\s+(.+?)(?:\s+on\s+[\d\/\-\w]+)?(?:\.\s*|\s+Avl|\s+Avail|$)/i,
        extract: (m) => ({
            type: 'debit',
            account: `XX${m[2]}`,
            amount: parseFloat(m[1].replace(/,/g, '')),
            merchant: m[3].trim(),
            bank: '',
            category: 'internal_transfer'
        }),
    },
    // "Alert: Rs X spent on your BANK Credit Card XX1234 at MERCHANT" (catch-all for any bank name)
    {
        bank: 'Generic',
        pattern: /(?:INR|Rs\.?)\s*([0-9,]+\.?\d{0,2})\s+spent\s+(?:on|using)\s+(?:your\s+)?(?:\w+\s+)?(?:\w+\s+)?Credit\s+Card\s+(?:no\.?\s*)?(?:XX|xx|\*+)(\d{3,6})\s+(?:at|on)\s+(.+?)(?:\s+on\s+[\d\/\-\w]+)?(?:\.\s*|\s+Avl|\s+Avail|$)/i,
        extract: (m) => ({
            type: 'debit',
            account: `XX${m[2]}`,
            amount: parseFloat(m[1].replace(/,/g, '')),
            merchant: m[3].trim(),
            bank: '',
            category: 'credit_card'
        }),
    },
    // ── End generic CC patterns ──

    // Generic "sent" pattern (many banks)
    {
        bank: 'Generic',
        pattern: /(?:sent|paid)\s*(?:Rs\.?\s*|INR\s*|₹\s*)([0-9,]+\.?\d{0,2})\s*(?:to)\s+([A-Za-z0-9\s\._\-]+?)(?:\s+from|\.|,|$)/i,
        extract: (m) => ({ type: 'debit', account: '', amount: parseFloat(m[1].replace(/,/g, '')), merchant: m[2].trim(), bank: '' }),
    },
    // Generic "received" pattern
    {
        bank: 'Generic',
        pattern: /(?:received|got)\s*(?:Rs\.?\s*|INR\s*|₹\s*)([0-9,]+\.?\d{0,2})\s*(?:from)\s+([A-Za-z0-9\s\._\-]+?)(?:\.|,|$)/i,
        extract: (m) => ({ type: 'credit', account: '', amount: parseFloat(m[1].replace(/,/g, '')), merchant: m[2].trim(), bank: '' }),
    },
];

// ==================== TIER 2: Generic patterns ====================

/**
 * Try generic parsing — any SMS with an amount + debit/credit keyword.
 * Extracts merchant names from common patterns across ALL banks.
 */
function genericParse(body) {
    const amount = extractAmount(body);
    if (!amount) return null;

    // Determine type
    let type = 'unknown';
    if (/debit|debited|spent|paid|sent|charged|used|purchase|withdrawn/i.test(body)) {
        type = 'debit';
    } else if (/credit|credited|received|deposited|added/i.test(body)) {
        type = 'credit';
    }

    if (type === 'unknown') return null;

    // ── Merchant extraction patterns (bank-agnostic) ──
    // Try multiple common SMS merchant patterns in priority order
    let merchant = '';

    const merchantPatterns = [
        // "at MERCHANT" — most common CC/debit pattern
        /\bat\s+([A-Za-z0-9][A-Za-z0-9 &._\-']{1,40}?)(?:\s+on\s+[\d\/\-\w]+|\.\s*|,\s*|\s+Avl|\s+Avail|\s+Ref|\s*$)/i,
        // "to MERCHANT" — UPI/NEFT/IMPS
        /\bto\s+([A-Za-z0-9][A-Za-z0-9 &._\-@]{1,40}?)(?:\s+on\s+|\.\s*|,\s*|\s+UPI|\s+Ref|\s+via|\s*$)/i,
        // "towards MERCHANT" — mandate/autopay
        /\btowards\s+([A-Za-z0-9][A-Za-z0-9 &._\-]{1,40}?)(?:\s+for\s+|\s+on\s+|\.\s*|,\s*|\s+UPI|\s+Ref|\s*$)/i,
        // "credited to MERCHANT" / "debited from ... to MERCHANT"
        /(?:credited|transferred)\s+to\s+([A-Za-z0-9][A-Za-z0-9 &._\-]{1,40}?)(?:\.\s*|,\s*|\s+Ref|\s*$)/i,
        // "from MERCHANT" (for credits/received)
        /(?:received|from)\s+([A-Za-z0-9][A-Za-z0-9 &._\-]{1,40}?)(?:\.\s*|,\s*|\s+Ref|\s+on\s+|\s*$)/i,
        // "paid to MERCHANT"
        /paid\s+to\s+([A-Za-z0-9][A-Za-z0-9 &._\-]{1,40}?)(?:\s+via|\s+from|\.\s*|,\s*|\s*$)/i,
        // "for MERCHANT" / "for purchase at MERCHANT"
        /\bfor\s+(?:purchase\s+(?:at|of)\s+)?([A-Za-z0-9][A-Za-z0-9 &._\-]{1,40}?)(?:\.\s*|,\s*|\s+Ref|\s+on\s+|\s*$)/i,
        // "VPA merchant@bank" — extract the part before @
        /(?:VPA|vpa|UPI)\s*[:\s]\s*([A-Za-z0-9._\-]+)@/i,
    ];

    for (const pattern of merchantPatterns) {
        const match = body.match(pattern);
        if (match) {
            let extracted = match[1].trim();
            // Skip if extracted text is just a number, date, or common non-merchant word
            if (/^\d+$/.test(extracted)) continue;
            if (/^(on|the|your|our|a|an|for|in|of|to|from|by|via|ref|date|bank|account|rs|inr)$/i.test(extracted)) continue;
            // Skip if it looks like an account reference
            if (/^(?:XX|xx|\*{2,})\d+/.test(extracted)) continue;
            merchant = extracted;
            break;
        }
    }

    // Detect CC transactions generically
    let category = null;
    if (/\bcredit\s*card\b|\bcard\s+(?:no\.?\s*)?(?:XX|xx|\*+)\d+|\bavl\s*\.?\s*l(?:i?mt|imit)\b|\bspent\s+(?:using|on)\s+.*card/i.test(body)) {
        category = 'credit_card';
    }

    return {
        type,
        amount,
        merchant,
        account: extractAccount(body),
        bank: '',
        category,
        tier: 2,
    };
}

// ==================== Main Parser Function ====================

/**
 * Helper to detect internal transfers (self, own accounts, etc.)
 */
function isInternalTransfer(body, merchant, identity = {}) {
    const text = (body + ' ' + (merchant || '')).toUpperCase();

    // Explicit keywords
    if (/SELF|OWN ACCOUNT|OWN A\/C|LINKED ACCOUNT|LINKED A\/C|TRANSFER TO SELF/i.test(text)) return true;

    // Identity matching — catch transfers to/from user's own name.
    // Banks often abbreviate names in many ways:
    //   "PRATIK SONDKAR" stored → SMS shows "PRATIK SURESH S" (middle name inserted, surname initial only)
    //   "PRATIK SURESH SONDKAR" stored → SMS shows "PRATIK S" or "PRATIK SONDKAR"
    // Strategy: first name must match + any stored word must prefix-match any SMS word (or vice versa)
    if (identity.fullName && merchant) {
        const storedWords = identity.fullName.toUpperCase().split(/\s+/).filter(w => w.length > 0);
        const merchantWords = merchant.toUpperCase().split(/\s+/).filter(w => w.length > 0);
        if (storedWords.length >= 1 && merchantWords.length >= 1) {
            // First name must always match exactly
            const firstNameMatch = storedWords[0] === merchantWords[0];
            if (firstNameMatch) {
                if (storedWords.length === 1) return true; // single-word name, first match is enough
                // Any stored word (including surname) must prefix-match any SMS word
                const otherMatch = storedWords.slice(1).some(sw =>
                    merchantWords.some(mw => sw.startsWith(mw) || mw.startsWith(sw))
                );
                if (otherMatch) return true;
            }
        }
    }

    return false;
}

/**
 * Parse an SMS body into a structured transaction object.
 * @param {string} body - SMS body text
 * @param {string} [sender] - SMS sender ID
 * @param {number} [timestamp] - SMS timestamp in ms
 * @param {Object} [userAliases] - User-defined merchant aliases
 * @param {Object} [userIdentity] - { fullName: string }
 * @returns {{ transaction: Object|null, tier: number, raw: string }}
 */
export function parseSMS(body, sender = '', timestamp = null, userAliases = {}, userIdentity = {}) {
    if (!body) return { transaction: null, tier: 0, raw: body };

    const cleanBody = body.replace(/\r\n/g, ' ').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

    // TIER 0: Pre-filter to block explicit non-transactions (reminders, OTPs, balance queries)
    if (IGNORE_PATTERNS.some(pattern => pattern.test(cleanBody))) {
        return { transaction: null, tier: -1, raw: body };
    }

    // TIER 1: Try bank-specific patterns
    for (const bp of BANK_PATTERNS) {
        const match = cleanBody.match(bp.pattern);
        if (match) {
            const extracted = bp.extract(match);
            const dateResult = extractDateFromSMS(cleanBody);

            const transaction = {
                id: generateId(),
                type: extracted.type,
                amount: extracted.amount,
                merchant: normalizeMerchant(extracted.merchant, userAliases),
                rawMerchant: extracted.merchant,
                account: extracted.account || extractAccount(cleanBody),
                bank: extracted.bank || bp.bank,
                date: dateResult ? toISODate(dateResult.date) : (timestamp ? toISODate(new Date(timestamp)) : toISODate(new Date())),
                balance: extractBalance(cleanBody),
                upiRef: extractUPIRef(cleanBody),
                category: extracted.category || (isInternalTransfer(cleanBody, extracted.merchant, userIdentity) ? 'internal_transfer' : null),
                tier: 1,
                rawSMS: body,
                createdAt: new Date().toISOString(),
            };

            return { transaction, tier: 1, raw: body };
        }
    }

    // TIER 2: Generic parsing
    const generic = genericParse(cleanBody);
    if (generic) {
        const dateResult = extractDateFromSMS(cleanBody);

        const transaction = {
            id: generateId(),
            type: generic.type,
            amount: generic.amount,
            merchant: normalizeMerchant(generic.merchant, userAliases) || 'Unknown',
            rawMerchant: generic.merchant,
            account: generic.account || extractAccount(cleanBody),
            bank: generic.bank,
            date: dateResult ? toISODate(dateResult.date) : (timestamp ? toISODate(new Date(timestamp)) : toISODate(new Date())),
            balance: extractBalance(cleanBody),
            upiRef: extractUPIRef(cleanBody),
            category: generic.category || (isInternalTransfer(cleanBody, generic.merchant, userIdentity) ? 'internal_transfer' : null),
            tier: 2,
            rawSMS: body,
            createdAt: new Date().toISOString(),
        };

        return { transaction, tier: 2, raw: body };
    }

    // TIER 3: Unparsed — return null transaction
    return { transaction: null, tier: 3, raw: body };
}

/**
 * Parse multiple SMS messages at once.
 * @param {Object[]} messages 
 * @param {Object} userAliases 
 * @param {Object} userIdentity 
 */
export function parseBulkSMS(messages, userAliases = {}, userIdentity = {}) {
    const parsed = [];
    const unparsed = [];
    const stats = { tier1: 0, tier2: 0, tier3: 0, total: 0 };

    for (const msg of messages) {
        stats.total++;
        const body = typeof msg === 'string' ? msg : msg.body;
        const sender = typeof msg === 'string' ? '' : msg.sender;
        const timestamp = typeof msg === 'string' ? null : msg.timestamp;

        const result = parseSMS(body, sender, timestamp, userAliases, userIdentity);

        if (result.transaction) {
            parsed.push(result.transaction);
            stats[`tier${result.tier}`]++;
        } else {
            unparsed.push(body);
            stats.tier3++;
        }
    }

    return { parsed, unparsed, stats };
}

/**
 * Generate a unique ID for a transaction.
 */
function generateId() {
    return `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
