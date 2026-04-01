/**
 * AI Categorizer — Gemini 3.1 Flash Lite Preview-powered merchant name cleaning + categorization.
 * ONE call for all unique merchants. Cache-first: only uncached merchants go to Gemini.
 * Only merchant names leave the device. Zero financial data sent.
 *
 * Model choice: gemini-2.0-flash — fastest Gemini model, ideal for bulk classification.
 * Chunks are fired in parallel (max 5 concurrent) for maximum throughput.
 */

import { normalizeMerchant } from './merchantNormalizer';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const PROXY_URL = process.env.EXPO_PUBLIC_AI_PROXY_URL;
const PROXY_SECRET = process.env.EXPO_PUBLIC_PROXY_SECRET;
const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Flash handles 100 merchants per call reliably at high speed
const MAX_PER_CALL = 500;
// Max parallel API calls at once (stay within rate limits)
const MAX_CONCURRENT = 5;

const VALID_CATEGORIES = new Set([
    'food', 'groceries', 'shopping', 'transport', 'bills', 'health',
    'entertainment', 'transfers', 'rent', 'education', 'investment',
    'internal_transfer', 'hardware', 'atm', 'uncategorized',
]);

const PROMPT_HEADER = `You are an expert Indian personal finance AI.
Given raw merchant/payee names from Indian bank SMS, return the cleaned display name AND category for each.

CATEGORIES (use EXACTLY one):
- food          → restaurants, dhabas, fast food, chicken shops, biryani, bakery, cafe, sweets, breakfast, snacks, Swiggy, Zomato
- groceries     → kirana, supermarket, vegetables, dairy, BigBasket, Blinkit, Zepto, DMart, JioMart
- shopping      → retail, clothing, electronics, Amazon, Flipkart, Myntra, Meesho, Nykaa, mall
- transport     → Uber, Ola, Rapido, petrol, fuel, IRCTC, flight, bus, auto, FASTag, toll, Indigo, RedBus
- bills         → electricity, mobile recharge, Jio, Airtel, broadband, gas, LPG, water, DTH, insurance, BESCOM
- health        → hospital, clinic, pharmacy, medical, Apollo, MedPlus, 1mg, doctor, dental, lab, diagnostic
- entertainment → Netflix, Hotstar, Spotify, PVR, INOX, BookMyShow, gaming, OTT, movies
- rent          → rent, EMI, housing loan
- education     → school fees, college, Udemy, Coursera, tuition, coaching, books
- investment    → Zerodha, Groww, Upstox, mutual fund, SIP, shares, stock, NSE, BSE
- hardware      → hardware store, tools, cement, iron, steel, electrical supplies, paint, plumbing
- transfers     → P2P to a PERSON (Indian human name e.g. "Rakesh Gulab") OR NEFT/IMPS/bank codes
- internal_transfer → credit card bill payment, own account transfer
- uncategorized → truly unrecognizable

KEY RULES:
- Human name (first + last, Indian) → transfers
- "CHICKEN","DHABA","NAMDHARI","BREAKFAST","CHAI","BAKERY" → food
- "HARDW","HARDWARE","ENGINEERS","TRADERS","STEEL","CEMENT" → hardware
- ATM codes ("NFS*","CAM*","CASH WDL") → atm
- Toll Plaza, FASTag → transport
- Clean name: expand abbreviations, remove bank codes/UPI suffixes, proper Title Case
- Keep brand names as-is (Swiggy, Zomato, Amazon, etc.)

Return ONLY a JSON object with a single key "merchants" containing an array, same order as input:
{"merchants":[{"m":"original","n":"clean display name","c":"category"}, ...]}

Merchants:
`;

/**
 * Enrich unique merchant names — clean display name + category — in as few API calls as possible.
 * @param {string[]} merchants
 * @param {Function} [onProgress] callback(0–1, done, total)
 * @returns {Object} { rawMerchant → { cleanName, category } }
 */
export async function enrichMerchantsBatch(merchants, onProgress) {
    if (!merchants || merchants.length === 0) { onProgress?.(1); return {}; }
    if (!GEMINI_API_KEY) {
        console.warn('[aiCategorizer] EXPO_PUBLIC_GEMINI_API_KEY missing. Skipping AI.');
        onProgress?.(1);
        return {};
    }

    const isSkippable = m => {
        if (!m || m === 'Unknown' || m === 'Received' || m.length <= 1) return true;
        if (/^[6-9]\d{9}$/.test(m.trim())) return true;          // phone number
        if (/^\d+$/.test(m.trim())) return true;                  // pure number
        if (/@[a-z]{2,}/i.test(m)) return true;                   // UPI VPA like name@ybl
        if (/^(PhonePe|GooglePay|Paytm|BHIM)[\/\s]/i.test(m)) return true; // UPI app prefix only
        return false;
    };

    // Normalize each raw merchant, build a map: normalizedName → [rawMerchant, ...]
    // SWIGGY*ORDER123 and SWIGGY*ORDER456 both normalize to "Swiggy" → 1 AI call instead of 2
    const normalizedToRaw = {};
    for (const raw of merchants) {
        if (isSkippable(raw)) continue;
        const normalized = normalizeMerchant(raw);
        if (!normalized || normalized === 'Unknown') continue;
        if (!normalizedToRaw[normalized]) normalizedToRaw[normalized] = [];
        normalizedToRaw[normalized].push(raw);
    }

    const toEnrich = Object.keys(normalizedToRaw);
    console.log(`[aiCategorizer] Sending ${toEnrich.length} merchants to Gemini 3.1 Flash Lite Preview (normalized from ${merchants.length})`);
    console.log(`[aiCategorizer] Sample:`, toEnrich.slice(0, 10));
    if (toEnrich.length === 0) { onProgress?.(1); return {}; }

    const chunks = [];
    for (let i = 0; i < toEnrich.length; i += MAX_PER_CALL) {
        chunks.push(toEnrich.slice(i, i + MAX_PER_CALL));
    }

    // Fire chunks in parallel, MAX_CONCURRENT at a time
    const normalizedResultMap = {};
    let done = 0;
    for (let i = 0; i < chunks.length; i += MAX_CONCURRENT) {
        const batch = chunks.slice(i, i + MAX_CONCURRENT);
        onProgress?.(i / chunks.length, done, toEnrich.length);
        const results = await Promise.all(batch.map(chunk => _callGemini(chunk)));
        for (let j = 0; j < results.length; j++) {
            Object.assign(normalizedResultMap, results[j]);
            done += batch[j].length;
        }
        onProgress?.(Math.min((i + MAX_CONCURRENT) / chunks.length, 1), done, toEnrich.length);
    }

    // Fan results back out to all original rawMerchant keys
    const resultMap = {};
    for (const [normalized, enriched] of Object.entries(normalizedResultMap)) {
        for (const raw of (normalizedToRaw[normalized] || [])) {
            resultMap[raw] = enriched;
        }
    }

    onProgress?.(1, toEnrich.length, toEnrich.length);
    console.log(`[aiCategorizer] Enriched ${Object.keys(resultMap).length}/${merchants.length} merchants via Gemini 3.1 Flash Lite Preview in ${chunks.length} call(s)`);
    return resultMap;
}

async function _callGemini(merchants) {
    const prompt = PROMPT_HEADER + JSON.stringify(merchants);

    const body = JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
        },
    });

    const useProxy = !!PROXY_URL;
    const doFetch = () => useProxy
        ? fetch(PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-proxy-secret': PROXY_SECRET || '' },
            body,
        })
        : fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        });

    let response = await doFetch();

    // Retry once on 429 using the retry-after header
    if (response.status === 429) {
        const wait = (parseInt(response.headers.get('retry-after') || '15', 10) + 2) * 1000;
        console.warn(`[aiCategorizer] Rate limited. Retrying in ${wait / 1000}s...`);
        await new Promise(r => setTimeout(r, wait));
        response = await doFetch();
    }

    if (!response.ok) {
        console.warn(`[aiCategorizer] Error ${response.status}:`, await response.text());
        return {};
    }

    try {
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (!text) {
            console.warn('[aiCategorizer] Empty response from Gemini');
            return {};
        }

        let items = null;

        // responseMimeType: application/json — unwrap the "merchants" array
        try {
            const parsed = JSON.parse(text);
            items = parsed.merchants ?? (Array.isArray(parsed) ? parsed : Object.values(parsed)[0]);
        } catch (_) {}

        // Fallback: extract JSON array from response
        if (!Array.isArray(items)) {
            const match = text.match(/\[[\s\S]*\]/);
            if (match) {
                try { items = JSON.parse(match[0]); } catch (_) {}
            }
        }

        // Last resort: salvage individual complete objects
        if (!Array.isArray(items)) {
            const partials = [...text.matchAll(/\{"m":"[^"]+","n":"[^"]*","c":"[^"]+"\}/g)];
            if (partials.length > 0) {
                items = partials.map(p => JSON.parse(p[0]));
                console.warn(`[aiCategorizer] Salvaged ${items.length} entries from partial response`);
            }
        }

        if (!Array.isArray(items)) {
            console.warn('[aiCategorizer] Could not parse Gemini response:', text.slice(0, 200));
            return {};
        }

        const map = {};
        for (const item of items) {
            if (item?.m) {
                map[item.m] = {
                    cleanName: item.n || item.m,
                    category: VALID_CATEGORIES.has(item.c) ? item.c : 'uncategorized',
                };
            }
        }
        return map;
    } catch (e) {
        console.warn('[aiCategorizer] Parse error:', e.message);
        return {};
    }
}

/** Legacy single-merchant shim */
export async function enrichMerchantWithAI(rawMerchant) {
    if (!rawMerchant || rawMerchant === 'Unknown') return null;
    const map = await enrichMerchantsBatch([rawMerchant]);
    return map[rawMerchant] || null;
}
