/**
 * SMS Reader — Android SMS reading module
 * Uses react-native-get-sms-android for reading SMS from phone inbox
 * 
 * NOTE: This module only works on Android. On iOS, it will return empty results
 * and the app will rely on manual entry.
 * 
 * For actual native SMS reading, we need to install react-native-get-sms-android
 * and configure Android permissions. For now, this module provides the interface
 * and uses a mock implementation that can be swapped with the real library.
 */

import { Platform, PermissionsAndroid } from 'react-native';
import { preFilterSMS, isBankSender } from './preFilter';
import { parseSMS, parseBulkSMS } from './smsParser';
import { categorizeAll } from './categorizer';
import { deduplicateTransactions } from './deduplicator';
import { sanitizeForStorage } from './accountMasker';
import { insertTransactions, getTransactions, getTransactionHashFields, getUserOverrides, getSetting, saveSetting, getMerchantCache, setMerchantCache, removeDuplicateTransactions, applyMerchantCacheToTransactions } from './database';
import { enrichMerchantsBatch } from './aiCategorizer';

/**
 * Request SMS permission on Android.
 * @returns {boolean} - Whether permission was granted
 */
export async function requestSMSPermission() {
    if (Platform.OS !== 'android') return false;

    try {
        const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.READ_SMS,
            {
                title: 'Kharcha needs SMS access',
                message:
                    'Kharcha reads only bank transaction SMS (sender IDs like VM-HDFCBK) ' +
                    'to automatically track your expenses. We NEVER read personal messages. ' +
                    'All data stays on your phone — nothing is uploaded.',
                buttonPositive: 'Allow',
                buttonNegative: 'Deny',
            }
        );

        return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
        console.warn('SMS permission request error:', err);
        return false;
    }
}

/**
 * Check if SMS permission is already granted.
 * @returns {boolean}
 */
export async function hasSMSPermission() {
    if (Platform.OS !== 'android') return false;

    try {
        return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
    } catch {
        return false;
    }
}

/**
 * Read SMS messages from the phone inbox.
 * Filters to only bank/financial SMS.
 * 
 * NOTE: In production, this uses react-native-get-sms-android.
 * For development/testing, this returns sample data.
 * 
 * @param {Object} [options] - { maxCount, minDate }
 * @returns {Object[]} - Array of { body, sender, timestamp }
 */
export async function readSMSFromPhone(options = {}) {
    // On web: SMS reading is not supported. Return empty — caller must enable demo mode explicitly.
    if (Platform.OS === 'web') return [];

    if (Platform.OS !== 'android') return [];

    const hasPermission = await hasSMSPermission();
    if (!hasPermission) {
        console.warn('SMS permission not granted');
        return [];
    }

    try {
        // react-native-get-sms-android uses CommonJS exports (no .default)
        const SmsModule = require('react-native-get-sms-android');
        const SmsAndroid = SmsModule.default || SmsModule;

        if (!SmsAndroid || typeof SmsAndroid.list !== 'function') {
            console.error('react-native-get-sms-android native module not available. ' +
                'Make sure you are running the custom Kharcha build (not Expo Go).');
            return [];
        }

        const filter = {
            box: 'inbox',
            ...(options.minDate ? { minDate: options.minDate } : {}),
        };

        const messages = await new Promise((resolve, reject) => {
            SmsAndroid.list(
                JSON.stringify(filter),
                (fail) => reject(new Error(fail)),
                (count, smsList) => resolve(JSON.parse(smsList))
            );
        });

        return messages
            .filter(msg => isBankSender(msg.address))
            .map(msg => ({
                body: msg.body,
                sender: msg.address,
                timestamp: msg.date,
            }));
    } catch (err) {
        console.error('SMS read failed:', err);
        return [];
    }
}


/**
 * Full SMS sync pipeline:
 * Read SMS → Pre-filter → Parse → Deduplicate → Categorize → Store
 * @param {Object} [options]
 * @param {Function} [onProgress] - Optional callback (progress, statusText)
 * @returns {{ newCount: number, duplicateCount: number, unparsedCount: number, total: number }}
 */
// Yields to the UI thread so progress updates render before heavy sync work starts
const tick = () => new Promise(r => setTimeout(r, 0));

export async function syncSMS(options = {}, onProgress) {
    const notify = async (progress, status) => {
        if (onProgress) onProgress(progress, status);
        await tick(); // let UI render the update before blocking work begins
    };

    // Captured at START so any SMS that arrive during the sync are included
    // on the next incremental pass (avoids a race with late-arriving messages).
    const syncStartedAt = Date.now();

    await notify(5, 'Reading SMS from phone...');
    // Step 1: Read SMS from phone
    const rawMessages = await readSMSFromPhone(options);

    if (rawMessages.length === 0) {
        await notify(100, 'No new messages found.');
        await saveSetting('last_synced_at', String(syncStartedAt));
        return { newCount: 0, duplicateCount: 0, unparsedCount: 0, total: 0 };
    }

    await notify(10, `Filtering ${rawMessages.length} messages...`);
    // Step 2: Pre-filter (remove OTPs, promos, etc.)
    console.time('[sync] preFilter');
    const filtered = rawMessages.filter(msg => {
        const result = preFilterSMS(msg.body, msg.sender);
        return result.shouldProcess;
    });
    console.timeEnd('[sync] preFilter');

    await notify(20, `Parsing ${filtered.length} bank messages...`);
    // Step 3: Parse
    const userAliases = {};
    const name = await getSetting('user_full_name');
    const userIdentity = { fullName: name };
    console.time('[sync] parseBulkSMS');
    const { parsed, unparsed, stats } = parseBulkSMS(filtered, userAliases, userIdentity);
    console.timeEnd('[sync] parseBulkSMS');

    await notify(25, `Categorizing ${parsed.length} transactions...`);
    // Step 4: Structural categorization only — CC, ATM, UPI P2P, internal transfers.
    const userOverrides = await getUserOverrides();
    console.time('[sync] categorizeAll');
    const categorized = categorizeAll(parsed, userOverrides);
    console.timeEnd('[sync] categorizeAll');

    // Step 5: collect merchants for background enrichment (AI moved to background)
    const STRUCTURAL_CATEGORIES = new Set(['internal_transfer', 'credit_card', 'atm', 'transfers']);
    const forAI = categorized.filter(t =>
        t.rawMerchant && t.rawMerchant !== 'Received' && !STRUCTURAL_CATEGORIES.has(t.category)
    );
    const uniqueMerchants = [...new Set(forAI.map(t => t.rawMerchant).filter(Boolean))];

    await notify(90, 'Sanitizing data...');
    const sanitized = categorized.map(txn => ({
        ...txn,
        rawSMS: sanitizeForStorage(txn.rawSMS),
    }));

    await notify(95, 'Deduplicating...');
    console.time('[sync] dedup');
    const existing = await getTransactionHashFields();
    const { unique, duplicates, ambiguous } = deduplicateTransactions(sanitized, existing);
    console.timeEnd('[sync] dedup');

    await notify(98, 'Saving to database...');
    // Step 7: Store unique transactions + ambiguous (mark for review)
    const toStore = [...unique, ...ambiguous.map(t => ({ ...t, note: '⚠️ Possible duplicate — please review' }))];
    const inserted = await insertTransactions(toStore);

    await notify(100, 'Sync complete!');
    await saveSetting('last_synced_at', String(syncStartedAt));
    return {
        newCount: inserted,
        duplicateCount: duplicates.length,
        unparsedCount: unparsed.length,
        ambiguousCount: ambiguous.length,
        total: rawMessages.length,
        pendingMerchants: uniqueMerchants,
    };
}

/**
 * Phase 2: AI merchant enrichment — runs after UI is already showing data.
 * Fire-and-forget from the caller. Writes via applyMerchantCacheToTransactions().
 */
export async function enrichInBackground(merchants, onComplete, onProgress) {
    if (!merchants || merchants.length === 0) { onComplete?.(); return; }
    try {
        const cached = await getMerchantCache(merchants);
        const uncached = merchants.filter(m => !cached[m]);
        if (uncached.length > 0) {
            onProgress?.(0, `Categorizing 0 / ${uncached.length} merchants…`);
            const fresh = await enrichMerchantsBatch(uncached, (p, done, total) => {
                onProgress?.(Math.round(p * 100), `Categorizing ${done ?? 0} / ${total ?? uncached.length} merchants…`);
            });
            await setMerchantCache(fresh);
        }
        await applyMerchantCacheToTransactions();
    } catch (e) {
        console.warn('[enrichInBackground] Error:', e.message);
    } finally {
        onComplete?.();
    }
}

/**
 * Sample SMS data for development and testing.
 * Dates are generated dynamically relative to today so they always
 * fall within the current month for dashboard display.
 */
export function getSampleSMSData() {
    const now = new Date();
    const y = now.getFullYear();
    const yy = String(y).slice(-2);
    const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mon = MONTHS_SHORT[now.getMonth()];
    const mm = String(now.getMonth() + 1).padStart(2, '0');

    // Helper: generate a date N days ago (clamped to current month)
    const dayAgo = (n) => {
        const d = new Date(now);
        d.setDate(d.getDate() - n);
        // Clamp to current month's start
        if (d.getMonth() !== now.getMonth() || d.getFullYear() !== y) {
            d.setFullYear(y); d.setMonth(now.getMonth()); d.setDate(1);
        }
        const dd = String(d.getDate()).padStart(2, '0');
        return { dd, ts: d.getTime(), ddMon: `${d.getDate()}${mon}${yy}`, ddMmYyyy: `${dd}-${mm}-${y}`, ddMonYyyy: `${dd}-${mon}-${y}` };
    };

    const d1 = dayAgo(1), d2 = dayAgo(2), d3 = dayAgo(3), d4 = dayAgo(4), d5 = dayAgo(5);
    const d6 = dayAgo(6), d7 = dayAgo(7), d8 = dayAgo(8), d9 = dayAgo(9), d10 = dayAgo(10);
    const d11 = dayAgo(11), d12 = dayAgo(12), d15 = dayAgo(15), d16 = dayAgo(16), d17 = dayAgo(17);

    return [
        { body: `Your SBI UPI a/c XX1234 debited by Rs.250.00 on ${d1.ddMon} & credited to SWIGGY. UPI Ref No 412345678901. If not done by you call 1800111109.`, sender: 'VM-SBIINB', timestamp: d1.ts },
        { body: `Alert: INR 1,500.00 debited from A/c XX5678 on ${d2.ddMmYyyy} towards UPI-ZOMATO-123456@ybl. Avl Bal: INR 23,450.00`, sender: 'VM-HDFCBK', timestamp: d2.ts },
        { body: `Dear Customer, Your A/c XX9012 is credited with INR 45,000.00 on ${d3.ddMonYyyy} by NEFT from ACME CORP. Avl Bal is INR 68,450.00`, sender: 'AD-ICICIB', timestamp: d3.ts },
        { body: `Your AXIS BANK Card XX4567 has been used for a transaction of INR 3,200.00 at AMAZON on ${d4.ddMmYyyy}. Avl Lmt: INR 96,800.00`, sender: 'JD-AXISBK', timestamp: d4.ts },
        { body: `Rs 150 debited from Kotak Bank AC XX3456 to PhonePe/UPI on ${d5.dd}-${mm}-${yy}. UPI Ref 123456789012. Bal Rs 12,340.`, sender: 'VK-KOTAKB', timestamp: d5.ts },
        { body: `Money Sent! Rs 500 paid to OLA via UPI from Paytm Bank. Txn ID: TXN123456. Bal: Rs 2,340`, sender: 'QR-PYTMBK', timestamp: d6.ts },
        { body: `Your SBI UPI a/c XX1234 debited by Rs.899.00 on ${d7.ddMon} & credited to NETFLIX. UPI Ref No 412345678902.`, sender: 'VM-SBIINB', timestamp: d7.ts },
        { body: `Alert: INR 2,100.00 debited from A/c XX5678 on ${d8.ddMmYyyy} towards UPI-BIGBASKET-789@ybl. Avl Bal: INR 21,350.00`, sender: 'VM-HDFCBK', timestamp: d8.ts },
        { body: `Alert: INR 450.00 debited from A/c XX5678 on ${d9.ddMmYyyy} towards UPI-UBER-456@ybl. Avl Bal: INR 20,900.00`, sender: 'VM-HDFCBK', timestamp: d9.ts },
        { body: `Rs 1200 debited from Kotak Bank AC XX3456 to CRED on ${d10.dd}-${mm}-${yy}. UPI Ref 123456789013. Bal Rs 11,140.`, sender: 'VK-KOTAKB', timestamp: d10.ts },
        { body: `Your SBI UPI a/c XX1234 debited by Rs.350.00 on ${d11.ddMon} & credited to STARBUCKS. UPI Ref No 412345678903.`, sender: 'VM-SBIINB', timestamp: d11.ts },
        { body: `Alert: INR 5,500.00 debited from A/c XX5678 on ${d12.ddMmYyyy} towards UPI-FLIPKART-111@ybl. Avl Bal: INR 15,400.00`, sender: 'VM-HDFCBK', timestamp: d12.ts },
        { body: `Dear Customer, Your A/c XX9012 is credited with INR 25,000.00 on ${d15.ddMonYyyy} by UPI from RAMESH KUMAR. Avl Bal is INR 93,450.00`, sender: 'AD-ICICIB', timestamp: d15.ts },
        { body: `Rs 3500 debited from Kotak Bank AC XX3456 to JIO on ${d16.dd}-${mm}-${yy}. UPI Ref 123456789014. Bal Rs 7,640.`, sender: 'VK-KOTAKB', timestamp: d16.ts },
        { body: `Alert: INR 799.00 debited from A/c XX5678 on ${d17.ddMmYyyy} towards UPI-SPOTIFY-222@ybl. Avl Bal: INR 14,601.00`, sender: 'VM-HDFCBK', timestamp: d17.ts },
        
        // Added Credit Card Samples
        { body: `Alert: You've spent Rs.1,500.00 on your HDFC Bank Credit Card XX6789 at ZOMATO on ${d1.ddMmYyyy}. Avl Lmt: Rs.50,000.00`, sender: 'AD-HDFCBK', timestamp: d1.ts },
        { body: `Transaction of Rs.2,500.00 occurred on SBI Card ending 1234 at AMAZON on ${d2.dd}/${mm}/${yy}.`, sender: 'VM-SBICRD', timestamp: d2.ts },
        { body: `Transaction of Rs.550.00 on Kotak Bank Credit Card XX9988 at STARBUCKS on ${d3.dd}/${mm}/${yy}.`, sender: 'VK-KOTAKB', timestamp: d3.ts },
        
        // CC Bill Payment Samples (Logic check: These should be internal_transfer)
        { body: `Rs 1,500 debited from SBI A/c XX1234 towards SBI Card payment on ${d1.ddMon}. Ref: 12345678.`, sender: 'VM-SBIINB', timestamp: d1.ts },
        { body: `Payment of Rs 2,500 towards HDFC Card XX6789 from A/c XX5678 successful on ${d2.ddMon}.`, sender: 'VM-HDFCBK', timestamp: d2.ts },
        { body: `Rs 550.00 paid to CRED for Kotak Credit Card on ${d3.ddMon} via UPI.`, sender: 'VK-KOTAKB', timestamp: d3.ts },

        // Year-less format test (specifically for the Mar 2 issue)
        { body: `Your Card XX1234 spent INR 999.00 at AMAZON on 02-Mar. Avl Lmt: 45,000.`, sender: 'AD-SBICRD', timestamp: new Date(y, 2, 2).getTime() },
    ];
}
