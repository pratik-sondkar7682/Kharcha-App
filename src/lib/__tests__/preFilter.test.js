import { preFilterSMS, isBankSender } from '../preFilter';

describe('preFilter.js', () => {
    describe('isBankSender', () => {
        it('should identify valid banking sender formats', () => {
            expect(isBankSender('VM-SBIINB')).toBe(true);
            expect(isBankSender('AD-HDFCBK')).toBe(true);
            expect(isBankSender('VK-KOTAKB')).toBe(true);
            expect(isBankSender('BP-AMAZON')).toBe(true);
        });

        it('should reject personal numbers', () => {
            expect(isBankSender('+919876543210')).toBe(false);
            expect(isBankSender('9876543210')).toBe(false);
            expect(isBankSender('Mom')).toBe(false);
            expect(isBankSender('12345')).toBe(true); // Shortcodes are actually valid bank senders!
        });
    });

    describe('preFilterSMS', () => {
        it('should reject OTPs and promotional messages', () => {
            const resultOTP = preFilterSMS('Your OTP for login is 123456.', 'VM-SBIINB');
            expect(resultOTP.shouldProcess).toBe(false);
            expect(resultOTP.reason || resultOTP.rejectReason).toContain('Matched reject: \\bOTP\\b');

            const resultPromo = preFilterSMS('Get 50% discount on loans, use code SAVE50', 'AD-HDFCBK');
            expect(resultPromo.shouldProcess).toBe(false);
            expect(resultPromo.reason || resultPromo.rejectReason).toContain('discount');
        });

        it('should accept valid transaction messages', () => {
            const body = 'Your a/c XX1234 debited by Rs.250.00 on 24Mar & credited to SWIGGY.';
            const result = preFilterSMS(body, 'VM-SBIINB');
            expect(result.shouldProcess).toBe(true);
        });

        it('should enforce bank sender rules by default', () => {
            const body = 'Your a/c XX1234 debited by Rs.250.00 on 24Mar & credited to SWIGGY.';
            const result = preFilterSMS(body, '+919876543210');
            expect(result.shouldProcess).toBe(false);
            expect(result.reason || result.rejectReason).toBe('Non-bank sender');
        });
    });
});
