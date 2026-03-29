/**
 * AI Categorizer — Claude-powered Merchant Enrichment (BATCHED)
 * Sends ALL unique merchants in a SINGLE API call → stays well within rate limits.
 * Only the merchant names leave the device. Zero financial data sent.
 *
 * Calls the Cloudflare Worker proxy (EXPO_PUBLIC_AI_PROXY_URL) so the
 * Anthropic API key never lives in the app bundle.
 */

const PROXY_URL = process.env.EXPO_PUBLIC_AI_PROXY_URL;
const PROXY_SECRET = process.env.EXPO_PUBLIC_PROXY_SECRET;

const VALID_CATEGORIES = new Set([
    'food', 'groceries', 'shopping', 'transport', 'bills', 'health',
    'entertainment', 'transfers', 'rent', 'education', 'investment',
    'internal_transfer', 'hardware', 'atm', 'uncategorized'
]);

/**
 * Enrich a batch of unique merchant names in ONE API call.
 * @param {string[]} merchants - Array of unique raw merchant names
 * @param {Function} [onProgress] - Optional callback for progress (0-1)
 * @returns {Object} map of rawMerchant → { cleanName, category }
 */
export async function enrichMerchantsBatch(merchants, onProgress) {
    if (!merchants || merchants.length === 0) {
        if (onProgress) onProgress(1);
        return {};
    }

    if (!PROXY_URL) {
        console.warn('[aiCategorizer] EXPO_PUBLIC_AI_PROXY_URL missing. Skipping AI.');
        if (onProgress) onProgress(1);
        return {};
    }

    // Filter out obviously non-enrichable strings
    const toEnrich = merchants.filter(m => m && m !== 'Unknown' && m !== 'Received' && m.length > 1);
    if (toEnrich.length === 0) {
        if (onProgress) onProgress(1);
        return {};
    }

    // Processing all merchants in one batch as requested for speed
    if (onProgress) onProgress(0.1); // Initial progress
    
    const resultMap = await _callClaude(toEnrich);
    
    if (onProgress) onProgress(1); // Final progress
    
    return resultMap;
}

async function _callClaude(merchants) {
    const prompt = `You are an expert Indian personal finance categorization AI. 
Given a list of raw merchant/payee names from Indian bank SMS, return the best category for each.

CATEGORIES (use EXACTLY one):
- food         → restaurants, dhabas, fast food, chicken shops, biryani, bakery, cafe, sweets, breakfast, snacks
- groceries    → kirana stores, supermarket, vegetables, dairy, BigBasket, Blinkit, Zepto, DMart
- shopping     → retail, clothing, electronics, Amazon, Flipkart, Myntra, Meesho, Nykaa, mall
- transport    → Uber, Ola, Rapido, petrol, fuel, IRCTC, flight, bus, auto, FASTag, toll plaza, Indigo
- bills        → electricity, mobile recharge, Jio, Airtel, broadband, gas, LPG, water, DTH, insurance
- health       → hospital, clinic, pharmacy, medical, Apollo, MedPlus, 1mg, doctor, dental, lab, diagnostic
- entertainment→ Netflix, Hotstar, Spotify, PVR, INOX, BookMyShow, gaming, OTT, movies
- rent         → rent, EMI, housing
- education    → school fees, college, Udemy, Coursera, tuition, coaching, books
- investment   → Zerodha, Groww, Upstox, mutual fund, SIP, shares, stock, NSE, BSE, NSDL
- hardware     → hardware store, tools, cement, iron, steel, electrical supplies, paint, plumbing
- transfers    → P2P money sent to a PERSON (a human name like "Rakesh Gulab", "Rameshwari Nars") OR generic bank transfer codes
- internal_transfer → credit card bill payment, own account transfer
- uncategorized → truly unrecognizable codes or ambiguous transfers

KEY RULES:
- If name looks like a PERSON'S name (first + last name, Indian names) → transfers
- Shop/store/enterprise names → use appropriate category (food, hardware, shopping, etc.)
- "CHICKEN", "CHICKE", "DHABA", "NAMDHARI", "BREAKFAST" in name → food
- "HARDW", "HARDWARE", "ENGINEERS", "TRADERS", "STEEL" → hardware  
- "ENTERPR", "ENTERPRISES", "PVTLTD", "LIMITED" → shopping or food based on context
- ATM codes like "NFS*CASH WDL", "CAM*" → transfers
- NEFT/IMPS codes → transfers
- Toll Plaza, Fastag → transport

Return ONLY minified JSON array, same order as input:
[{"m":"original","n":"clean display name","c":"category"}, ...]

Merchants to classify:
${JSON.stringify(merchants)}`;


    try {
        const headers = {
            'Content-Type': 'application/json',
        };
        if (PROXY_SECRET) headers['x-proxy-secret'] = PROXY_SECRET;

        const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: 'claude-sonnet-4-6',
                max_tokens: 2000,
                messages: [{ role: 'user', content: prompt }],
            }),
        });

        if (!response.ok) {
            const errBody = await response.text();
            console.warn(`[aiCategorizer] Claude error ${response.status} — scan will complete without AI. Re-scan to retry.`);
            console.warn(errBody);
            return {};
        }

        const data = await response.json();
        const rawText = data?.content?.[0]?.text || '';

        const jsonMatch = rawText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            console.warn('[aiCategorizer] No JSON array in response:', rawText.slice(0, 200));
            return {};
        }

        const parsed = JSON.parse(jsonMatch[0]);
        const resultMap = {};
        for (const item of parsed) {
            const category = VALID_CATEGORIES.has(item.c) ? item.c : 'uncategorized';
            resultMap[item.m] = { cleanName: item.n || item.m, category };
        }

        console.log(`[aiCategorizer] Enriched ${Object.keys(resultMap).length} merchants`);
        return resultMap;

    } catch (error) {
        console.warn('[aiCategorizer] Network error — scan will complete without AI:', error.message);
        return {};
    }
}


/**
 * Legacy single-merchant API (kept for backward compatibility)
 */
export async function enrichMerchantWithAI(rawMerchant) {
    if (!rawMerchant || rawMerchant === 'Unknown') return null;
    const map = await enrichMerchantsBatch([rawMerchant]);
    return map[rawMerchant] || null;
}
