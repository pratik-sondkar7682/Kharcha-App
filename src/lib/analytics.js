/**
 * Analytics — Aggregation and calculation utilities for dashboard
 * Computes monthly summaries, category breakdowns, trends, and top merchants
 */

/**
 * Calculate monthly summary for a set of transactions.
 * @param {Object[]} transactions - Array of transaction objects
 * @returns {{ totalSpent: number, totalReceived: number, netFlow: number, count: number }}
 */
export function monthlySummary(transactions) {
    let totalSpent = 0;
    let totalReceived = 0;
    let count = 0;

    for (const txn of transactions) {
        if (txn.category === 'internal_transfer') continue;
        if (txn.isExcluded) continue;

        count++;
        if (txn.type === 'debit') {
            totalSpent += txn.amount;
        } else if (txn.type === 'credit') {
            totalReceived += txn.amount;
        }
    }

    return {
        totalSpent: Math.round(totalSpent * 100) / 100,
        totalReceived: Math.round(totalReceived * 100) / 100,
        netFlow: Math.round((totalReceived - totalSpent) * 100) / 100,
        count,
    };
}

/**
 * Calculate spend breakdown by category.
 * @param {Object[]} transactions - DEBIT transactions only recommended
 * @returns {Object[]} - [{ category, amount, percentage, count }] sorted by amount desc
 */
export function categoryBreakdown(transactions) {
    const debits = transactions.filter(t => t.type === 'debit');
    const totals = {};
    const counts = {};

    for (const txn of debits) {
        if (txn.isExcluded) continue;
        const cat = txn.category || 'uncategorized';
        totals[cat] = (totals[cat] || 0) + txn.amount;
        counts[cat] = (counts[cat] || 0) + 1;
    }

    const totalSpent = Object.values(totals).reduce((a, b) => a + b, 0);

    return Object.entries(totals)
        .map(([category, amount]) => ({
            category,
            amount: Math.round(amount * 100) / 100,
            percentage: totalSpent > 0 ? Math.round((amount / totalSpent) * 1000) / 10 : 0,
            count: counts[category] || 0,
        }))
        .sort((a, b) => b.amount - a.amount);
}

/**
 * Calculate daily spending totals between a date range.
 * @param {Object[]} transactions
 * @param {string|null} endDate - YYYY-MM-DD
 * @param {string|null} startDate - YYYY-MM-DD
 * @returns {Object[]} - [{ date, spent, label }]
 */
export function dailyTrend(transactions, endDate, startDate) {
    const end = endDate ? new Date(endDate) : new Date();
    const result = [];

    let start;
    if (startDate) {
        start = new Date(startDate);
    } else {
        start = new Date(end);
        start.setDate(start.getDate() - 13); // fallback to 14 days
    }

    const diffTime = end.getTime() - start.getTime();
    let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Safety generic bounds checks
    if (diffDays > 90) diffDays = 90;
    if (diffDays < 0) diffDays = 0;

    const byDate = {};
    for (const t of transactions) {
        if (t.type !== 'debit' || t.isExcluded) continue;
        const txnDate = t.date.split('T')[0]; // normalise ISO datetime → YYYY-MM-DD
        byDate[txnDate] = (byDate[txnDate] || 0) + Math.abs(t.amount);
    }

    for (let i = diffDays; i >= 0; i--) {
        const d = new Date(end);
        d.setDate(d.getDate() - i);

        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const total = byDate[dateStr] || 0;

        result.push({
            date: dateStr,
            label: `${d.getDate()}/${d.getMonth() + 1}`,
            spent: Math.round(total * 100) / 100
        });
    }

    return result;
}

/**
 * Get top merchants by spending amount.
 * @param {Object[]} transactions
 * @param {number} [limit=5]
 * @returns {Object[]} - [{ merchant, amount, count, category }]
 */
export function topMerchants(transactions, limit = 5) {
    const debits = transactions.filter(t => t.type === 'debit');
    const merchants = {};

    for (const txn of debits) {
        if (txn.isExcluded) continue;
        const name = txn.merchant || 'Unknown';
        if (!merchants[name]) {
            merchants[name] = { merchant: name, amount: 0, count: 0, category: txn.category };
        }
        merchants[name].amount += txn.amount;
        merchants[name].count++;
    }

    return Object.values(merchants)
        .map(m => ({ ...m, amount: Math.round(m.amount * 100) / 100 }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, limit);
}

/**
 * Calculate budget utilization for each category.
 * @param {Object[]} transactions - Current month's transactions
 * @param {Object[]} budgets - [{ category, monthlyLimit }]
 * @returns {Object[]} - [{ category, spent, limit, percentage, status }]
 */
export function budgetUtilization(transactions, budgets) {
    const debits = transactions.filter(t => t.type === 'debit');

    // Calculate spent per category
    const spent = {};
    for (const txn of debits) {
        if (txn.isExcluded) continue;
        const cat = txn.category || 'uncategorized';
        spent[cat] = (spent[cat] || 0) + txn.amount;
    }

    return budgets.map(budget => {
        const categorySpent = spent[budget.category] || 0;
        const percentage = budget.monthlyLimit > 0
            ? Math.round((categorySpent / budget.monthlyLimit) * 100)
            : 0;

        let status = 'good'; // green
        if (percentage >= 100) status = 'over';     // red
        else if (percentage >= 80) status = 'warning'; // yellow

        return {
            category: budget.category,
            spent: Math.round(categorySpent * 100) / 100,
            limit: budget.monthlyLimit,
            percentage,
            status,
        };
    });
}

/**
 * Calculate Average Daily Spend.
 * @param {Object[]} transactions
 * @param {string} [startDate]
 * @param {string} [endDate]
 * @returns {number}
 */
export function averageDailySpend(transactions, startDate, endDate) {
    const debits = transactions.filter(t => t.type === 'debit' && !t.isExcluded);
    const totalSpent = debits.reduce((acc, t) => acc + t.amount, 0);

    if (debits.length === 0) return 0;

    let days = 1;
    if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        days = Math.max(1, Math.abs(Math.ceil((end - start) / (1000 * 60 * 60 * 24))) + 1);
    } else {
        const dates = new Set(debits.map(t => t.date.split('T')[0]));
        days = Math.max(1, dates.size);
    }

    return Math.round((totalSpent / days) * 100) / 100;
}

/**
 * Get Biggest Single Transactions (Anomalies).
 * @param {Object[]} transactions
 * @param {number} [limit=3]
 * @returns {Object[]}
 */
export function biggestTransactions(transactions, limit = 3) {
    return transactions
        .filter(t => t.type === 'debit' && !t.isExcluded)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, limit);
}

/**
 * Calculate Weekday vs Weekend spending behavior.
 * @param {Object[]} transactions
 * @returns {Object}
 */
export function weekdayVsWeekend(transactions) {
    const debits = transactions.filter(t => t.type === 'debit');
    let weekday = 0;
    let weekend = 0;

    debits.forEach(t => {
        if (t.isExcluded) return;
        const d = new Date(t.date);
        const day = d.getDay(); // 0 is Sunday, 6 is Saturday
        if (day === 0 || day === 6) weekend += t.amount;
        else weekday += t.amount;
    });

    const total = weekday + weekend;
    if (total === 0) return { weekdayPct: 0, weekendPct: 0, weekdayAmount: 0, weekendAmount: 0 };

    return {
        weekdayPct: Math.round((weekday / total) * 100),
        weekendPct: Math.round((weekend / total) * 100),
        weekdayAmount: weekday,
        weekendAmount: weekend
    };
}

/**
 * Computes the Previous Period date range based on the current range for MoM comparisons.
 * Shifts back exactly 1 month.
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {{ startDate: string|null, endDate: string|null }}
 */
export function getPreviousPeriodRange(startDate, endDate) {
    if (!startDate || !endDate) return { startDate: null, endDate: null };

    const start = new Date(startDate);
    const end = new Date(endDate);

    const formatDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    // If the range is a full month (start = 1st, end = last day or today), compare against full previous month
    const isMonthStart = start.getDate() === 1;
    const endIsLastDayOrToday = (() => {
        const lastDay = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
        return end.getDate() === lastDay || end.toDateString() === new Date().toDateString();
    })();

    if (isMonthStart && endIsLastDayOrToday) {
        // Full previous calendar month: 1st → last day
        const prevStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
        const prevEnd   = new Date(start.getFullYear(), start.getMonth(), 0); // last day of prev month
        return { startDate: formatDate(prevStart), endDate: formatDate(prevEnd) };
    }

    // For custom or partial ranges: shift back by the same number of days
    const rangeDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
    const prevEnd   = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - rangeDays);

    return { startDate: formatDate(prevStart), endDate: formatDate(prevEnd) };
}

export const DATE_RANGES = [
    { id: 'current_month', label: 'This Month' },
    { id: 'last_month', label: 'Last Month' },
    { id: 'this_year', label: 'This Year' },
    { id: 'custom', label: 'Custom Range' }
];

/**
 * Get the date range for a specific filter.
 * @param {string} filterId - e.g., 'current_month', 'last_month', etc.
 * @returns {{ startDate: string|null, endDate: string|null }}
 */
export function getDateRange(filterId = 'current_month') {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    const formatDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    if (filterId === 'all_time') {
        return { startDate: null, endDate: null };
    }
    if (filterId === 'this_year') {
        return { startDate: `${y}-01-01`, endDate: formatDate(now) };
    }
    if (filterId === 'last_month') {
        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m, 0);
        return { startDate: formatDate(start), endDate: formatDate(end) };
    }
    if (filterId === 'last_3_months') {
        const start = new Date(y, m - 2, 1);
        return { startDate: formatDate(start), endDate: formatDate(now) };
    }

    // Default: current_month — cap end to today so avg daily and trend bars don't include future empty days
    const start = new Date(y, m, 1);
    const endOfMonth = new Date(y, m + 1, 0);
    const end = endOfMonth > now ? now : endOfMonth;
    return { startDate: formatDate(start), endDate: formatDate(end) };
}

/**
 * Format amount in Indian currency style (₹1,23,456.78)
 * @param {number} amount
 * @returns {string}
 */
export function formatCurrency(amount) {
    if (amount === null || amount === undefined) return '₹0';

    const isNegative = amount < 0;
    const absAmount = Math.abs(amount);

    // Indian number formatting
    const parts = absAmount.toFixed(2).split('.');
    let intPart = parts[0];
    const decPart = parts[1];

    // Apply Indian grouping: last 3 digits then groups of 2
    if (intPart.length > 3) {
        const last3 = intPart.slice(-3);
        const rest = intPart.slice(0, -3);
        const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
        intPart = `${grouped},${last3}`;
    }

    const formatted = decPart === '00' ? intPart : `${intPart}.${decPart}`;
    return `${isNegative ? '-' : ''}₹${formatted}`;
}
