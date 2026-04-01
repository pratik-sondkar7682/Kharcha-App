/**
 * Database — Platform-aware storage layer
 * Uses SQLite on native (Android/iOS) and localStorage on web
 */

import { Platform } from 'react-native';

// In-memory store for web (backed by localStorage)
let memStore = {
    transactions: [],
    budgets: [],
    user_overrides: {},
    settings: {},
};

let dbReady = false;

// ==================== Initialization ====================

function loadFromLocalStorage() {
    if (Platform.OS !== 'web') return;
    try {
        const raw = localStorage.getItem('kharcha_data');
        if (raw) memStore = JSON.parse(raw);
    } catch (e) {
        console.warn('Failed to load from localStorage:', e);
    }
}

function saveToLocalStorage() {
    if (Platform.OS !== 'web') return;
    try {
        localStorage.setItem('kharcha_data', JSON.stringify(memStore));
    } catch (e) {
        console.warn('Failed to save to localStorage:', e);
    }
}

export async function initDatabase() {
    if (Platform.OS === 'web') {
        loadFromLocalStorage();
        dbReady = true;
        return;
    }

    // Native: use expo-sqlite
    try {
        const SQLite = require('expo-sqlite');
        const db = await SQLite.openDatabaseAsync('kharcha.db');

        // Migration: ensure new columns exist even if table was already created
        try {
            await db.execAsync(`ALTER TABLE transactions ADD COLUMN isExcluded INTEGER DEFAULT 0;`);
        } catch (e) { /* ignore error if column exists */ }

        await db.execAsync(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY, type TEXT NOT NULL, amount REAL NOT NULL,
        merchant TEXT, rawMerchant TEXT, account TEXT, bank TEXT,
        date TEXT NOT NULL, balance REAL, upiRef TEXT,
        category TEXT DEFAULT 'uncategorized', tier INTEGER DEFAULT 1,
        isExcluded INTEGER DEFAULT 0,
        rawSMS TEXT, note TEXT, createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(date);
      CREATE INDEX IF NOT EXISTS idx_txn_category ON transactions(category);
      CREATE INDEX IF NOT EXISTS idx_txn_rawMerchant ON transactions(rawMerchant);
    `);

        await db.execAsync(`
      CREATE TABLE IF NOT EXISTS budgets (
        category TEXT PRIMARY KEY, monthlyLimit REAL NOT NULL, updatedAt TEXT NOT NULL
      );
    `);

        await db.execAsync(`
      CREATE TABLE IF NOT EXISTS user_overrides (
        merchantKey TEXT PRIMARY KEY, category TEXT NOT NULL, updatedAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS merchant_cache (
        rawMerchant TEXT PRIMARY KEY,
        cleanName   TEXT NOT NULL,
        category    TEXT NOT NULL,
        enrichedAt  TEXT NOT NULL
      );
    `);

        // Store db reference globally for native queries
        global.__kharchaDB = db;
        dbReady = true;
    } catch (e) {
        console.warn('SQLite init failed, falling back to in-memory:', e);
        dbReady = true;
    }
}

export async function getDB() {
    if (!global.__kharchaDB) await initDatabase();
    return global.__kharchaDB || null;
}

// ==================== Transaction CRUD ====================

export async function insertTransactions(transactions) {
    if (Platform.OS === 'web') {
        let inserted = 0;
        for (const txn of transactions) {
            if (!memStore.transactions.find(t => t.id === txn.id)) {
                memStore.transactions.push(txn);
                inserted++;
            }
        }
        saveToLocalStorage();
        return inserted;
    }

    const db = await getDB();
    if (!db) return 0;

    let inserted = 0;
    for (const txn of transactions) {
        try {
            const result = await db.runAsync(
                `INSERT OR IGNORE INTO transactions (id,type,amount,merchant,rawMerchant,account,bank,date,balance,upiRef,category,tier,isExcluded,rawSMS,note,createdAt)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [txn.id, txn.type, txn.amount, txn.merchant, txn.rawMerchant, txn.account,
                txn.bank, txn.date, txn.balance, txn.upiRef, txn.category || 'uncategorized',
                txn.tier, txn.isExcluded ? 1 : 0, txn.rawSMS, txn.note || null, txn.createdAt]
            );
            if (result.changes > 0) inserted++;
        } catch (e) { console.warn('Insert error:', e.message); }
    }
    return inserted;
}

const ALLOWED_ORDER = new Set(['date DESC', 'date ASC', 'amount DESC', 'amount ASC']);

/**
 * Fetch only the fields needed for deduplication hashing — no row limit.
 * Returns lightweight objects: { upiRef, amount, date, rawMerchant, merchant, type }
 */
export async function getTransactionHashFields() {
    if (Platform.OS === 'web') {
        return memStore.transactions.map(t => ({
            upiRef: t.upiRef, amount: t.amount, date: t.date,
            rawMerchant: t.rawMerchant, merchant: t.merchant, type: t.type,
        }));
    }
    const db = await getDB();
    if (!db) return [];
    return await db.getAllAsync(
        'SELECT upiRef, amount, date, rawMerchant, merchant, type FROM transactions'
    );
}

export async function getTransactions(filters = {}, orderBy = 'date DESC', limit = 500) {
    const safeOrder = ALLOWED_ORDER.has(orderBy) ? orderBy : 'date DESC';
    orderBy = safeOrder;

    if (Platform.OS === 'web') {
        let result = [...memStore.transactions];
        if (filters.startDate) result = result.filter(t => t.date >= filters.startDate);
        if (filters.endDate) result = result.filter(t => t.date <= filters.endDate + 'T23:59:59.999Z');
        if (filters.category) result = result.filter(t => t.category === filters.category);
        if (filters.type) result = result.filter(t => t.type === filters.type);
        if (filters.search) {
            const s = filters.search.toLowerCase();
            result = result.filter(t => (t.merchant || '').toLowerCase().includes(s) || (t.note || '').toLowerCase().includes(s));
        }
        result.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        return result.slice(0, limit);
    }

    const db = await getDB();
    if (!db) return [];

    let query = 'SELECT * FROM transactions WHERE 1=1';
    const params = [];
    if (filters.startDate) { query += ' AND date >= ?'; params.push(filters.startDate); }
    // Append T23:59:59.999Z so ISO datetime strings like "2026-04-01T14:30:00Z" are included on endDate day
    if (filters.endDate) { query += ' AND date <= ?'; params.push(filters.endDate + 'T23:59:59.999Z'); }
    if (filters.category) { query += ' AND category = ?'; params.push(filters.category); }
    if (filters.type) { query += ' AND type = ?'; params.push(filters.type); }
    if (filters.search) { const s = `%${filters.search}%`; query += ' AND (merchant LIKE ? OR note LIKE ?)'; params.push(s, s); }
    query += ` ORDER BY ${orderBy} LIMIT ?`;
    params.push(limit);
    return await db.getAllAsync(query, params);
}

export async function updateTransaction(txnId, updates) {
    if (Platform.OS === 'web') {
        const txn = memStore.transactions.find(t => t.id === txnId);
        if (txn) {
            if (updates.category !== undefined) txn.category = updates.category;
            if (updates.merchant !== undefined) txn.merchant = updates.merchant;
            if (updates.note !== undefined) txn.note = updates.note;
            if (updates.isExcluded !== undefined) txn.isExcluded = updates.isExcluded;
        }
        saveToLocalStorage();
        return;
    }

    const db = await getDB();
    if (!db) { console.warn('updateTransaction: DB not available'); return; }

    const fields = [];
    const params = [];
    if (updates.category !== undefined) { fields.push('category = ?'); params.push(updates.category); }
    if (updates.merchant !== undefined) { fields.push('merchant = ?'); params.push(updates.merchant); }
    if (updates.note !== undefined) { fields.push('note = ?'); params.push(updates.note); }
    if (updates.isExcluded !== undefined) { fields.push('isExcluded = ?'); params.push(updates.isExcluded ? 1 : 0); }

    if (fields.length === 0) return;

    const query = `UPDATE transactions SET ${fields.join(', ')} WHERE id = ?`;
    params.push(txnId);
    await db.runAsync(query, params);
}

export async function updateTransactionCategory(txnId, category) {
    return updateTransaction(txnId, { category });
}

export async function updateTransactionNote(txnId, note) {
    return updateTransaction(txnId, { note });
}

export async function updateTransactionExcluded(txnId, isExcluded) {
    return updateTransaction(txnId, { isExcluded });
}

export async function deleteTransaction(txnId) {
    if (Platform.OS === 'web') {
        memStore.transactions = memStore.transactions.filter(t => t.id !== txnId);
        saveToLocalStorage();
        return;
    }
    const db = await getDB();
    if (!db) return;
    await db.runAsync('DELETE FROM transactions WHERE id = ?', [txnId]);
}

export async function clearAllTransactions() {
    if (Platform.OS === 'web') {
        memStore.transactions = [];
        saveToLocalStorage();
        return;
    }
    const db = await getDB();
    if (!db) { console.warn('clearAllTransactions: DB not available'); return; }
    await db.runAsync('DELETE FROM transactions');
}

export async function getTransactionCount() {
    if (Platform.OS === 'web') return memStore.transactions.length;
    const db = await getDB();
    if (!db) return 0;
    const r = await db.getFirstAsync('SELECT COUNT(*) as count FROM transactions');
    return r?.count || 0;
}

// ==================== Budget CRUD ====================

export async function setBudget(category, monthlyLimit) {
    if (Platform.OS === 'web') {
        const idx = memStore.budgets.findIndex(b => b.category === category);
        const entry = { category, monthlyLimit, updatedAt: new Date().toISOString() };
        if (idx >= 0) memStore.budgets[idx] = entry; else memStore.budgets.push(entry);
        saveToLocalStorage();
        return;
    }
    const db = await getDB();
    if (!db) return;
    await db.runAsync(
        `INSERT OR REPLACE INTO budgets (category,monthlyLimit,updatedAt) VALUES (?,?,?)`,
        [category, monthlyLimit, new Date().toISOString()]
    );
}

export async function getBudgets() {
    if (Platform.OS === 'web') return [...memStore.budgets];
    const db = await getDB();
    if (!db) return [];
    return await db.getAllAsync('SELECT * FROM budgets');
}

export async function getBudget(category) {
    if (Platform.OS === 'web') return memStore.budgets.find(b => b.category === category) || null;
    const db = await getDB();
    if (!db) return null;
    return await db.getFirstAsync('SELECT * FROM budgets WHERE category = ?', [category]);
}

// ==================== User Overrides ====================

export async function saveUserOverride(merchantKey, category) {
    if (Platform.OS === 'web') {
        memStore.user_overrides[merchantKey.toLowerCase().trim()] = category;
        saveToLocalStorage();
        return;
    }
    const db = await getDB();
    if (!db) { console.warn('saveUserOverride: DB not available'); return; }
    await db.runAsync(
        `INSERT OR REPLACE INTO user_overrides (merchantKey,category,updatedAt) VALUES (?,?,?)`,
        [merchantKey.toLowerCase().trim(), category, new Date().toISOString()]
    );
}

export async function getUserOverrides() {
    if (Platform.OS === 'web') return { ...memStore.user_overrides };
    const db = await getDB();
    if (!db) return {};
    const rows = await db.getAllAsync('SELECT * FROM user_overrides');
    const overrides = {};
    for (const row of rows) overrides[row.merchantKey] = row.category;
    return overrides;
}

// ==================== Settings ====================

export async function saveSetting(key, value) {
    if (Platform.OS === 'web') {
        memStore.settings[key] = typeof value === 'string' ? value : JSON.stringify(value);
        saveToLocalStorage();
        return;
    }
    const db = await getDB();
    if (!db) return;
    await db.runAsync(
        `INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)`,
        [key, typeof value === 'string' ? value : JSON.stringify(value)]
    );
}

export async function getSetting(key) {
    if (Platform.OS === 'web') return memStore.settings[key] || null;
    const db = await getDB();
    if (!db) return null;
    const row = await db.getFirstAsync('SELECT value FROM settings WHERE key = ?', [key]);
    return row?.value || null;
}

// ==================== Export/Import ====================

export async function exportData() {
    const transactions = await getTransactions({}, 'date DESC', 99999);
    const budgets = await getBudgets();
    const overrides = await getUserOverrides();
    return { version: 1, exportedAt: new Date().toISOString(), transactions, budgets, overrides };
}

export async function importData(data) {
    if (!data || data.version !== 1) throw new Error('Invalid format');
    return await insertTransactions(data.transactions || []);
}

// ==================== Merchant Cache ====================

// No TTL — merchant names don't change. Use "Clear Cache" in Settings to force re-enrichment.

/**
 * Look up a list of rawMerchant names from the persistent cache.
 * Entries older than MERCHANT_CACHE_TTL_DAYS are treated as cache misses and re-enriched.
 * Returns a map: { rawMerchant → { cleanName, category } }
 */
export async function getMerchantCache(rawMerchants) {
    if (!rawMerchants || rawMerchants.length === 0) return {};
    const db = await getDB();
    if (!db) return {};
    try {
        const rows = await db.getAllAsync(
            `SELECT rawMerchant, cleanName, category FROM merchant_cache`
        );
        const set = new Set(rawMerchants);
        const map = {};
        for (const row of rows) {
            if (set.has(row.rawMerchant)) {
                map[row.rawMerchant] = { cleanName: row.cleanName, category: row.category };
            }
        }
        return map;
    } catch (e) {
        console.warn('[DB] getMerchantCache error:', e.message);
        return {};
    }
}

/**
 * Persist AI enrichment results to the merchant cache.
 * @param {Object} resultMap - { rawMerchant → { cleanName, category } }
 */
export async function setMerchantCache(resultMap) {
    if (!resultMap || Object.keys(resultMap).length === 0) return;
    const db = await getDB();
    if (!db) return;
    try {
        const now = new Date().toISOString();
        await db.withTransactionAsync(async () => {
            for (const [rawMerchant, { cleanName, category }] of Object.entries(resultMap)) {
                await db.runAsync(
                    `INSERT OR REPLACE INTO merchant_cache (rawMerchant, cleanName, category, enrichedAt) VALUES (?, ?, ?, ?)`,
                    [rawMerchant, cleanName, category, now]
                );
            }
        });
    } catch (e) {
        console.warn('[DB] setMerchantCache error:', e.message);
    }
}

export async function clearMerchantCache() {
    const db = await getDB();
    if (!db) return;
    await db.runAsync('DELETE FROM merchant_cache');
}

/**
 * Apply cached merchant enrichment results to ALL existing transactions in the DB.
 * Updates merchant name + category for every transaction whose rawMerchant is in the cache,
 * skipping internal_transfer, credit_card, and keyword-protected categories.
 * Returns the count of transactions updated.
 */
export async function applyMerchantCacheToTransactions() {
    const db = await getDB();
    if (!db) return 0;

    // Load full cache once
    const cacheRows = await db.getAllAsync(
        `SELECT rawMerchant, cleanName, category FROM merchant_cache`
    );
    if (cacheRows.length === 0) return 0;

    // One UPDATE per unique rawMerchant — updates all matching transactions at once
    let updated = 0;
    await db.withTransactionAsync(async () => {
        for (const { rawMerchant, cleanName, category } of cacheRows) {
            const result = await db.runAsync(
                `UPDATE transactions SET merchant = ?, category = ?
                 WHERE rawMerchant = ?
                   AND category NOT IN ('internal_transfer','credit_card','atm','transfers','rent','bills','food','groceries','shopping','transport','health','entertainment','education','hardware','investment')`,
                [cleanName, category, rawMerchant]
            );
            updated += result.changes ?? 0;
        }
    });
    return updated;
}

/**
 * Reset all user-set transaction preferences:
 * - Clears all merchant category overrides
 * - Resets every transaction's category to 'uncategorized' and isExcluded to 0
 * After calling this, user should re-scan SMS to restore auto-categories.
 */
/**
 * Remove duplicate transactions from the DB.
 * Keeps the earliest-inserted row (MIN rowid) for each unique rawSMS.
 * Returns the count of rows deleted.
 */
export async function removeDuplicateTransactions() {
    if (Platform.OS === 'web') {
        const seen = new Set();
        memStore.transactions = memStore.transactions.filter(t => {
            const key = t.rawSMS || t.id;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        saveToLocalStorage();
        return 0;
    }
    const db = await getDB();
    if (!db) return 0;
    const result = await db.runAsync(`
        DELETE FROM transactions
        WHERE rowid NOT IN (
            SELECT MIN(rowid) FROM transactions GROUP BY rawSMS
        )
    `);
    return result.changes ?? 0;
}

/**
 * Re-categorize transactions when the user's name changes.
 * - Transactions whose merchant matches newName → set category = 'internal_transfer'
 * - Transactions whose merchant matched oldName → revert to 'uncategorized' (parser will re-classify on next scan)
 * Name matching: case-insensitive, first-name + any other word prefix match (same logic as smsParser).
 */
export async function reCategorizeByName(newName, oldName) {
    if (Platform.OS === 'web') {
        const matchesName = (merchant, name) => {
            if (!name || !merchant) return false;
            const stored = name.toUpperCase().split(/\s+/).filter(w => w.length > 0);
            const parts = merchant.toUpperCase().split(/\s+/).filter(w => w.length > 0);
            if (stored.length === 0 || parts.length === 0) return false;
            if (stored[0] !== parts[0]) return false;
            if (stored.length === 1) return true;
            return stored.slice(1).some(sw => parts.some(pw => sw.startsWith(pw) || pw.startsWith(sw)));
        };
        for (const t of memStore.transactions) {
            if (oldName && matchesName(t.merchant, oldName) && t.category === 'internal_transfer') {
                t.category = 'uncategorized';
            }
            if (newName && matchesName(t.merchant, newName)) {
                t.category = 'internal_transfer';
            }
        }
        saveToLocalStorage();
        return { updated: 0 };
    }

    const db = await getDB();
    if (!db) return { updated: 0 };

    // Revert old-name matches (only those we set — category = internal_transfer)
    if (oldName && oldName.trim()) {
        const oldFirst = oldName.trim().toUpperCase().split(/\s+/)[0];
        await db.runAsync(
            `UPDATE transactions SET category = 'uncategorized'
             WHERE category = 'internal_transfer'
               AND UPPER(merchant) LIKE ?`,
            [`${oldFirst}%`]
        );
    }

    // Set new-name matches → internal_transfer
    let updated = 0;
    if (newName && newName.trim()) {
        const newFirst = newName.trim().toUpperCase().split(/\s+/)[0];
        const candidates = await db.getAllAsync(
            `SELECT id, merchant FROM transactions WHERE UPPER(merchant) LIKE ?`,
            [`${newFirst}%`]
        );
        const storedWords = newName.toUpperCase().split(/\s+/).filter(w => w.length > 0);
        const matched = candidates.filter(({ merchant }) => {
            if (!merchant) return false;
            const parts = merchant.toUpperCase().split(/\s+/).filter(w => w.length > 0);
            if (storedWords[0] !== parts[0]) return false;
            if (storedWords.length === 1) return true;
            return storedWords.slice(1).some(sw => parts.some(pw => sw.startsWith(pw) || pw.startsWith(sw)));
        });
        for (const { id } of matched) {
            await db.runAsync(`UPDATE transactions SET category = 'internal_transfer' WHERE id = ?`, [id]);
        }
        updated = matched.length;
    }
    return { updated };
}

export async function resetTransactionSettings() {
    if (Platform.OS === 'web') {
        memStore.user_overrides = {};
        for (const t of memStore.transactions) {
            t.category = 'uncategorized';
            t.isExcluded = false;
        }
        saveToLocalStorage();
        return;
    }
    const db = await getDB();
    if (!db) { console.warn('resetTransactionSettings: DB not available'); return; }
    await db.runAsync('DELETE FROM user_overrides');
    await db.runAsync(`UPDATE transactions SET category = 'uncategorized', isExcluded = 0`);
}
