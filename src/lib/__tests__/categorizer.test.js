import { categorize, categorizeAll } from '../categorizer';

describe('categorizer.js', () => {
    describe('categorize', () => {
        it('applies user-defined overrides perfectly', () => {
            const txn = { merchant: 'starbucks', category: 'uncategorized' };
            const overrides = { 'starbucks': 'dining' };

            const category = categorize(txn, overrides);
            expect(category).toBe('dining');
        });
    });

    describe('categorizeAll', () => {
        it('falls back to regex/dictionary when no override exists', () => {
            const txns = [
                { merchant: 'ZOMATO' },
                { merchant: 'UBER' },
                { merchant: 'UNKNOWN_M' }
            ];

            const result = categorizeAll(txns, {});
            
            expect(result[0].category).toBe('food');
            expect(result[1].category).toBe('transport');
            expect(result[2].category).toBe('uncategorized'); // Should remain uncategorized
        });

        it('does not overwrite already assigned rigid categories like internal_transfer', () => {
             const txns = [
                { merchant: 'Self Transfer', category: 'internal_transfer', tier: 1 }
             ];

             const result = categorizeAll(txns, { 'Self Transfer': 'shopping' });
             expect(result[0].category).toBe('internal_transfer');
        });
    });
});
