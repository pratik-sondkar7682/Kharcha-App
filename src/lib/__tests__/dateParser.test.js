import { parseDate, extractDateFromSMS, toISODate } from '../dateParser';

describe('dateParser.js', () => {
    describe('parseDate', () => {
        it('parses compressed format: 24Mar25', () => {
            const date = parseDate('24Mar25');
            expect(date).not.toBeNull();
            expect(date.getFullYear()).toBe(2025);
            expect(date.getMonth()).toBe(2); // March is 2
            expect(date.getDate()).toBe(24);
        });

        it('parses ISO format: 2025-03-24', () => {
            const date = parseDate('2025-03-24');
            expect(date.getFullYear()).toBe(2025);
            expect(date.getMonth()).toBe(2);
            expect(date.getDate()).toBe(24);
        });

        it('handles invalid dates gracefully', () => {
            expect(parseDate('Feb 30 2024')).toBeNull(); 
            expect(parseDate('Not a date')).toBeNull();
        });
    });

    describe('extractDateFromSMS', () => {
        it('extracts date embedded in SMS body', () => {
            const body = 'Alert: INR 1,500.00 debited from A/c XX5678 on 24-03-2024 towards Zomato.';
            const result = extractDateFromSMS(body);
            expect(result).not.toBeNull();
            expect(result.raw).toBe('24-03-2024');
            expect(result.date.getFullYear()).toBe(2024);
        });
    });

    describe('toISODate', () => {
        it('formats Date object into YYYY-MM-DD string', () => {
            const d = new Date(2026, 0, 5); // Jan 5, 2026
            expect(toISODate(d)).toBe('2026-01-05');
        });
    });
});
