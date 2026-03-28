/**
 * Deduplicator — Hash-based duplicate transaction detection
 * Prevents inflated spending totals from re-importing same SMS
 */

/**
 * Generate a hash string for a transaction.
 * Uses UPI ref (primary, globally unique) then falls back to amount+date+merchant+type.
 */
export function transactionHash(txn) {
    // UPI reference is globally unique — use it as the primary key
    if (txn.upiRef) {
        return `upi:${txn.upiRef}`;
    }
    // Fallback: amount + day portion of date + rawMerchant + type
    const day = (txn.date || '').slice(0, 10); // "2026-03-26" — strip time component
    const parts = [
        String(txn.amount || 0),
        day,
        (txn.rawMerchant || txn.merchant || '').toLowerCase().trim(),
        txn.type || '',
    ];
    return parts.join('|');
}

/**
 * Deduplicate an array of new transactions against existing ones.
 * Returns only truly new transactions for insertion.
 */
export function deduplicateTransactions(newTxns, existingTxns) {
    // Build hash set from existing transactions
    const existingHashes = new Set();
    for (const txn of existingTxns) {
        existingHashes.add(transactionHash(txn));
    }

    const unique = [];
    const duplicates = [];

    // Track within the new batch to avoid inserting same txn twice
    const seenInBatch = new Set();

    for (const txn of newTxns) {
        const hash = transactionHash(txn);

        if (existingHashes.has(hash) || seenInBatch.has(hash)) {
            duplicates.push(txn);
            continue;
        }

        unique.push(txn);
        seenInBatch.add(hash);
    }

    return { unique, duplicates, ambiguous: [] };
}
