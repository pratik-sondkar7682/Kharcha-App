import { parseSMS } from '../smsParser';

describe('smsParser.js', () => {
    describe('parseSMS - Internal Transfers', () => {
        it('matches based on identity configuration', () => {
            const text = "Dear SBI User, your A/c X3681-credited by Rs.100000 on 02Mar26 transfer from PRATIK SONDKAR Ref No 642747859197 -SBI";
            
            // Testing the non-exported isInternalTransfer helper indirectly through parseSMS
            const resMatch = parseSMS(text, 'VM-SBIINB', null, {}, { fullName: 'PRATIK SONDKAR' });
            expect(resMatch.transaction.category).toBe('internal_transfer');
            
            const resNoMatch = parseSMS(text, 'VM-SBIINB', null, {}, { fullName: 'ANOTHER USER' });
            expect(resNoMatch.transaction.category).toBeNull();
        });

        it('matches regex heuristics even without identity', () => {
            const text = "Dear SBI User, your A/c X3681-credited by Rs.100000 transfer from self account Ref No 642747859197 -SBI";
            const res = parseSMS(text, 'VM-SBIINB');
            expect(res.transaction.category).toBe('internal_transfer');
        });
    });

    describe('core parseSMS', () => {
        it('parses standard SBI debit', () => {
            const text = 'Your SBI UPI a/c XX1234 debited by Rs.250.00 on 24Mar & credited to SWIGGY. UPI Ref No 412345678901.';
            const result = parseSMS(text, 'VM-SBIINB');
            expect(result.transaction).not.toBeNull();
            expect(result.transaction.type).toBe('debit');
            expect(result.transaction.amount).toBe(250);
            expect(result.transaction.merchant).toContain('Swiggy');
            expect(result.transaction.bank).toBe('SBI');
        });

        it('parses correct category when identity matching self-transfer', () => {
            const text = "Dear SBI User, your A/c X3681-credited by Rs.100000 on 02Mar26 transfer from RAJESH SONDKAR Ref No 642747859197 -SBI";
            const result = parseSMS(text, 'VM-SBIINB', null, {}, { fullName: 'RAJESH SONDKAR' });
            expect(result.transaction).not.toBeNull();
            expect(result.transaction.type).toBe('credit');
            expect(result.transaction.amount).toBe(100000);
            expect(result.transaction.category).toBe('internal_transfer');
        });
    });
});
