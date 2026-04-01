/**
 * DashboardScreen — Polished master dashboard
 * Hero card → date filters → feed tabs → toolbar → transaction list
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, RefreshControl, TouchableOpacity,
    ActivityIndicator, Modal, TextInput, FlatList, ScrollView, Switch, Platform
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import DateRangePickerModal from '../components/DateRangePickerModal';
import { type, radius, spacing, CATEGORIES } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useFilter } from '../context/FilterContext';
import {
    monthlySummary, categoryBreakdown, dailyTrend, topMerchants,
    formatCurrency, getDateRange, DATE_RANGES,
    averageDailySpend, biggestTransactions, weekdayVsWeekend, getPreviousPeriodRange
} from '../lib/analytics';
import { getTransactions, updateTransaction, getSetting } from '../lib/database';
import { syncSMS, hasSMSPermission, requestSMSPermission, enrichInBackground } from '../lib/smsReader';
import TransactionCard from '../components/TransactionCard';

const SAFE_TOP = Platform.OS === 'android' ? 48 : 56;

function makeStyles(colors) {
    return StyleSheet.create({
        screen: { flex: 1, backgroundColor: colors.surface.base },
        center: { justifyContent: 'center', alignItems: 'center' },
        listContent: { paddingTop: SAFE_TOP, paddingBottom: 100 },
        loadingText: { ...type.bodyM, color: colors.text.muted, marginTop: spacing.md },

        syncBanner: {
            position: 'absolute', top: SAFE_TOP, left: 0, right: 0, zIndex: 50,
            backgroundColor: colors.surface.containerHigh,
            paddingTop: 10, paddingBottom: 14, paddingHorizontal: spacing.xl,
            borderBottomWidth: 1, borderBottomColor: colors.outline.variant,
        },
        syncBannerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
        syncStatusText: { ...type.labelM, color: colors.text.body },
        syncPct: { ...type.labelM, color: colors.primary.main, fontWeight: '700' },
        progressTrack: { height: 4, backgroundColor: colors.outline.variant, borderRadius: 2, overflow: 'hidden' },
        progressFill: { height: '100%', backgroundColor: colors.primary.main, borderRadius: 2 },
        enrichBanner: {
            position: 'absolute', bottom: 90, left: spacing.xl, right: spacing.xl, zIndex: 50,
            backgroundColor: colors.surface.containerHigh,
            flexDirection: 'row', alignItems: 'center',
            paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.lg,
            borderRadius: radius.lg,
            borderWidth: 1, borderColor: colors.outline.variant,
        },

        header: {
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            paddingHorizontal: spacing.xl, marginBottom: spacing.lg,
        },
        appTitle: { ...type.displayS, color: colors.text.headline },
        appSubtitle: { ...type.bodyS, color: colors.text.muted, marginTop: 2 },
        syncBtn: {
            backgroundColor: colors.primary.container,
            paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 1,
            borderRadius: radius.full,
        },
        syncBtnText: { ...type.labelM, color: colors.primary.onContainer, fontWeight: '700' },

        dateFilterRow: {
            paddingHorizontal: spacing.xl,
            paddingBottom: spacing.lg,
            gap: spacing.sm,
            flexDirection: 'row',
        },
        datePill: {
            paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 1,
            borderRadius: radius.full,
            backgroundColor: colors.surface.containerHigh,
            borderWidth: 1, borderColor: colors.outline.variant,
        },
        datePillActive: {
            backgroundColor: colors.primary.container,
            borderColor: colors.primary.main,
        },
        datePillText: { ...type.labelM, color: colors.text.secondary },
        datePillTextActive: { color: colors.primary.onContainer, fontWeight: '700' },

        heroCard: {
            marginHorizontal: spacing.xl, marginBottom: spacing.xl,
            backgroundColor: colors.surface.container,
            borderRadius: radius.xl,
            paddingTop: spacing.lg, paddingBottom: spacing.lg,
            paddingHorizontal: spacing.xl,
            borderWidth: 1, borderColor: colors.outline.default,
            borderLeftWidth: 3, borderLeftColor: colors.expense,
        },
        heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
        heroLabel: { ...type.labelS, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 1 },
        heroAmount: {
            fontSize: 36, fontWeight: '800', color: colors.text.headline,
            letterSpacing: -0.5, marginBottom: spacing.md,
        },
        momBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
        momText: { ...type.labelS, fontWeight: '700', fontSize: 11 },
        statsBar: {
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: colors.surface.containerHigh,
            borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
        },
        statItem: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
        statDivider: { width: 1, height: 24, backgroundColor: colors.outline.variant },
        statLabel: { ...type.labelS, color: colors.text.muted, marginBottom: 2, fontSize: 10 },
        statValue: { fontSize: 14, fontWeight: '700', color: colors.text.headline },

        // ── Feed section ──
        feedSection: {
            marginTop: spacing.md,
            marginBottom: spacing.sm,
        },

        // Main tab bar — underline style
        feedTabBar: {
            flexDirection: 'row',
            paddingHorizontal: spacing.xl,
            borderBottomWidth: 1,
            borderBottomColor: colors.outline.default,
        },
        feedTab: {
            flex: 1,
            alignItems: 'center',
            paddingBottom: spacing.sm,
        },
        feedTabInner: {
            flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
            paddingTop: spacing.sm,
        },
        feedTabText: { ...type.labelL, color: colors.text.muted },
        feedTabTextActive: { color: colors.text.headline, fontWeight: '700' },
        feedTabUnderline: {
            height: 2,
            backgroundColor: colors.primary.main,
            borderRadius: 2,
            marginTop: spacing.sm,
            alignSelf: 'stretch',
        },

        // Search + filter toolbar
        toolbar: {
            flexDirection: 'row',
            paddingHorizontal: spacing.xl,
            paddingVertical: spacing.md,
            gap: spacing.sm, alignItems: 'center',
        },

        // Sub-tabs row
        subTabRow: {
            flexDirection: 'row', alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.sm,
            paddingBottom: spacing.md,
            gap: spacing.sm,
        },
        subTabGroup: {
            flex: 1,
            flexDirection: 'row',
            backgroundColor: colors.surface.containerHigh,
            borderRadius: radius.full,
            padding: 3,
        },
        subTab: {
            flex: 1,
            alignItems: 'center',
            paddingVertical: spacing.xs + 1,
            borderRadius: radius.full,
        },
        subTabActive: {
            backgroundColor: colors.surface.container,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.08,
            shadowRadius: 2,
            elevation: 2,
        },
        subTabText: { ...type.labelM, color: colors.text.muted },
        subTabTextActive: { color: colors.text.headline, fontWeight: '700' },
        feedCount: { ...type.labelS, color: colors.text.muted },

        badge: {
            backgroundColor: colors.primary.main,
            borderRadius: radius.full, minWidth: 18, height: 18,
            alignItems: 'center', justifyContent: 'center',
            paddingHorizontal: 5,
        },
        badgeText: { ...type.labelS, color: '#FFFFFF', fontWeight: '800', fontSize: 9 },
        searchBox: {
            flex: 1, flexDirection: 'row', alignItems: 'center',
            backgroundColor: colors.surface.container,
            borderRadius: radius.full, paddingHorizontal: spacing.lg,
            height: 46, borderWidth: 1, borderColor: colors.outline.default,
            gap: spacing.sm,
        },
        searchIcon: { fontSize: 15, color: colors.text.muted },
        searchInput: { flex: 1, ...type.bodyM, color: colors.text.headline, paddingVertical: 0 },
        clearIcon: { fontSize: 14, color: colors.text.muted, paddingLeft: spacing.sm },
        filterIconBtn: {
            width: 46, height: 46, borderRadius: radius.full,
            backgroundColor: colors.surface.container,
            justifyContent: 'center', alignItems: 'center',
            borderWidth: 1, borderColor: colors.outline.default,
        },
        filterIconBtnActive: { borderColor: colors.primary.main, backgroundColor: colors.primary.container },
        filterDot: {
            position: 'absolute', top: 10, right: 10,
            width: 7, height: 7, borderRadius: 4,
            backgroundColor: colors.primary.main,
            borderWidth: 1, borderColor: colors.surface.containerHigh,
        },

        feedMeta: {
            ...type.labelS, color: colors.text.muted,
            paddingHorizontal: spacing.xl, marginBottom: spacing.sm,
        },

        cardWrapper: { paddingHorizontal: spacing.xl },

        emptyState: { alignItems: 'center', paddingTop: 60, paddingBottom: 40 },
        emptyIcon: { fontSize: 48, marginBottom: spacing.lg },
        emptyTitle: { ...type.headlineM, color: colors.text.secondary, marginBottom: spacing.sm },
        emptySubtitle: { ...type.bodyM, color: colors.text.muted },

        permDeniedWrap: {
            flex: 1, justifyContent: 'center', alignItems: 'center',
            paddingHorizontal: spacing.xxl + spacing.lg,
        },
        permDeniedIconWrap: {
            width: 88, height: 88, borderRadius: radius.xxl,
            backgroundColor: colors.surface.containerHigh,
            justifyContent: 'center', alignItems: 'center',
            marginBottom: spacing.xxl,
        },
        permDeniedEmoji: { fontSize: 40 },
        permDeniedTitle: { ...type.headlineL, color: colors.text.headline, textAlign: 'center', marginBottom: spacing.md },
        permDeniedBody: { ...type.bodyM, color: colors.text.muted, textAlign: 'center', lineHeight: 22, marginBottom: spacing.xxl + spacing.md },
        permDeniedBtn: {
            backgroundColor: colors.primary.main,
            borderRadius: radius.full,
            paddingVertical: spacing.lg,
            paddingHorizontal: spacing.xxl + spacing.lg,
            alignItems: 'center',
        },
        permDeniedBtnText: { ...type.labelL, fontSize: 15, color: '#FFFFFF', fontWeight: '700' },

        overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
        bottomSheet: {
            backgroundColor: colors.surface.containerHigh,
            borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl,
            paddingHorizontal: spacing.xxl, paddingBottom: spacing.xxxl + spacing.xl,
            paddingTop: spacing.lg,
            maxHeight: '82%',
        },
        sheetHandle: {
            width: 40, height: 4, borderRadius: 2,
            backgroundColor: colors.outline.variant,
            alignSelf: 'center', marginBottom: spacing.xl,
        },
        sheetTitle: { ...type.headlineL, color: colors.text.headline, textAlign: 'center', marginBottom: spacing.xl },
        sheetSectionLabel: { ...type.labelM, color: colors.text.secondary, marginBottom: spacing.sm, marginLeft: 2 },
        sheetFooter: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },

        chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xl },
        chip: {
            paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
            borderRadius: radius.full,
            backgroundColor: colors.surface.container,
            borderWidth: 1, borderColor: colors.outline.default,
        },
        chipActive: { backgroundColor: colors.primary.main, borderColor: colors.primary.main },
        chipText: { ...type.labelM, color: colors.text.secondary },
        chipTextActive: { color: '#FFFFFF', fontWeight: '700' },

        formInput: {
            backgroundColor: colors.surface.container,
            borderRadius: radius.lg, padding: spacing.lg,
            color: colors.text.headline, ...type.bodyM,
            marginBottom: spacing.lg,
            borderWidth: 1, borderColor: colors.outline.default,
        },
        dateInputRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginBottom: spacing.sm },
        calBtn: {
            width: 50, height: 50, borderRadius: radius.lg,
            backgroundColor: colors.surface.container,
            borderWidth: 1, borderColor: colors.outline.default,
            justifyContent: 'center', alignItems: 'center',
        },

        excludeRow: {
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingVertical: spacing.lg,
            borderTopWidth: 1, borderTopColor: colors.outline.default,
            marginBottom: spacing.lg,
        },
        excludeTitle: { ...type.headlineS, color: colors.text.headline },
        excludeSub: { ...type.labelS, color: colors.text.muted, marginTop: 3 },

        cancelBtn: {
            flex: 1, alignItems: 'center', paddingVertical: spacing.lg,
            borderRadius: radius.lg, backgroundColor: colors.surface.container,
        },
        cancelText: { ...type.labelL, color: colors.text.muted },
        applyBtn: {
            flex: 2, alignItems: 'center', paddingVertical: spacing.lg,
            borderRadius: radius.lg, backgroundColor: colors.primary.main,
        },
        applyText: { ...type.labelL, color: '#FFFFFF', fontWeight: '800' },
        resetLink: { justifyContent: 'center', paddingHorizontal: spacing.md },
        resetText: { ...type.labelL, color: colors.expense },
    });
}

// 30 s buffer so SMS delivered slightly out of order aren't missed on incremental syncs.
// Deduplication handles any resulting overlaps.
const CLOCK_SKEW_BUFFER_MS = 30_000;

export default function DashboardScreen() {
    const { colors } = useTheme();
    const st = makeStyles(colors);

    const [loading, setLoading]     = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [smsPermissionDenied, setSmsPermissionDenied] = useState(false);

    const { dateFilter, setDateFilter, customStart, setCustomStart, customEnd, setCustomEnd } = useFilter();

    const [transactions, setTransactions] = useState([]);
    const [feedTab, setFeedTab]           = useState('transactions');
    const [txnSubTab, setTxnSubTab]       = useState('all');

    const [customModal, setCustomModal]   = useState(false);

    const [summary, setSummary]       = useState({ totalSpent: 0, totalReceived: 0, netFlow: 0, count: 0 });
    const [prevSummary, setPrevSummary] = useState(null);
    const [avgDaily, setAvgDaily]     = useState(0);
    const [topCategory, setTopCategory] = useState(null);
    const [biggestSpend, setBiggestSpend] = useState(null);

    const [searchQuery, setSearchQuery]   = useState('');
    const [filterCategory, setFilterCategory] = useState('all');
    const [sortField, setSortField]       = useState('date');
    const [sortOrder, setSortOrder]       = useState('DESC');
    const [showFilterModal, setShowFilterModal] = useState(false);

    const [showEditModal, setShowEditModal] = useState(false);
    const [editingTxn, setEditingTxn]     = useState(null);
    const [editForm, setEditForm]         = useState({ merchant: '', category: '', note: '', isExcluded: false });

    const [syncProgress, setSyncProgress] = useState(0);
    const [syncStatus, setSyncStatus]     = useState('');
    const [enriching, setEnriching]       = useState(false);
    const [enrichStatus, setEnrichStatus] = useState('');

    const loadData = useCallback(async () => {
        try {
            let curStart, curEnd;
            if (dateFilter === 'custom') {
                curStart = customStart || null;
                curEnd   = customEnd   || null;
            } else {
                const { startDate, endDate } = getDateRange(dateFilter);
                curStart = startDate; curEnd = endDate;
            }

            const txns = await getTransactions({ startDate: curStart, endDate: curEnd }, 'date DESC', 5000);
            setTransactions(txns);

            const analyticTxns = txns.filter(t => t.category !== 'internal_transfer' && t.category !== 'credit_card');
            setSummary(monthlySummary(analyticTxns));
            setAvgDaily(averageDailySpend(analyticTxns, curStart, curEnd));

            const catBreakdown = categoryBreakdown(analyticTxns);
            setTopCategory(catBreakdown.length > 0 ? catBreakdown[0] : null);

            const biggest = biggestTransactions(analyticTxns, 1);
            setBiggestSpend(biggest.length > 0 ? biggest[0] : null);

            if (dateFilter !== 'all_time' && curStart && curEnd && dateFilter !== 'custom') {
                const prev = getPreviousPeriodRange(curStart, curEnd);
                const prevTxns = await getTransactions({ startDate: prev.startDate, endDate: prev.endDate }, 'date DESC', 5000);
                setPrevSummary(monthlySummary(prevTxns.filter(t => t.category !== 'internal_transfer' && t.category !== 'credit_card')));
            } else {
                setPrevSummary(null);
            }
        } catch (e) { console.error('Load error:', e); }
        finally { setLoading(false); }
    }, [dateFilter, customStart, customEnd]);

    const handleUpdateTransaction = useCallback(async (txnId, updates) => {
        await updateTransaction(txnId, updates);
        await loadData();
    }, [loadData]);

    const handleEditPress = (txn) => {
        setEditingTxn(txn);
        setEditForm({
            merchant:   txn.merchant   || '',
            category:   txn.category   || 'uncategorized',
            note:       txn.note       || '',
            isExcluded: !!txn.isExcluded,
        });
        setShowEditModal(true);
    };

    const handleSaveEdit = async () => {
        if (editingTxn) {
            await handleUpdateTransaction(editingTxn.id, editForm);
            setShowEditModal(false);
            setEditingTxn(null);
        }
    };

    const handleSync = useCallback(async (isManual = false) => {
        const hasPermission = await hasSMSPermission();
        if (!hasPermission) {
            setSmsPermissionDenied(true);
            setLoading(false);
            return;
        }
        setSmsPermissionDenied(false);

        // Decide: full scan or incremental?
        const rawTs = await getSetting('last_synced_at');
        const lastSyncedAt = rawTs ? parseInt(rawTs, 10) : null;
        const isFirstOpen = !lastSyncedAt;

        const syncOptions = (isManual || isFirstOpen)
            ? {}
            : { minDate: Math.max(0, lastSyncedAt - CLOCK_SKEW_BUFFER_MS) };

        // Full-screen loader only on first open with no transactions yet.
        // Pull-to-refresh gets the top banner. Silent otherwise.
        const showFullLoader = isFirstOpen && transactions.length === 0;

        if (showFullLoader) {
            setLoading(true);
            setSyncProgress(1);
            setSyncStatus('Starting sync…');
        } else if (isManual) {
            setRefreshing(true);
            setSyncProgress(1);
            setSyncStatus('Checking for new transactions…');
        }

        let pendingMerchants = [];
        try {
            const result = await syncSMS(syncOptions, (progress, status) => {
                if (showFullLoader || isManual) {
                    setSyncProgress(progress);
                    setSyncStatus(status);
                }
            });
            pendingMerchants = result?.pendingMerchants || [];

            // Silent incremental: show a brief toast if new transactions were found.
            if (!showFullLoader && !isManual && result.newCount > 0) {
                setSyncStatus(`${result.newCount} new transaction${result.newCount > 1 ? 's' : ''} added`);
                setSyncProgress(100);
                setTimeout(() => { setSyncProgress(0); setSyncStatus(''); }, 3000);
            }
        } catch (e) {
            console.error('Sync error:', e);
            if (showFullLoader || isManual) setSyncStatus('Sync failed');
        } finally {
            setRefreshing(false);
            setLoading(false);
            if (showFullLoader || isManual) {
                setTimeout(() => { setSyncProgress(0); setSyncStatus(''); }, 2000);
            }
        }
        await loadData();
        if (pendingMerchants.length > 0) {
            setEnriching(true);
            setEnrichStatus(`Categorizing 0 / ${pendingMerchants.length} merchants…`);
            enrichInBackground(
                pendingMerchants,
                () => { setEnriching(false); setEnrichStatus(''); loadData(); },
                (_pct, status) => { setEnrichStatus(status); }
            );
        }
    }, [loadData, transactions.length]);

    const handleGrantSMSAccess = useCallback(async () => {
        const granted = await requestSMSPermission();
        if (granted) {
            setSmsPermissionDenied(false);
            handleSync(true);
        }
    }, [handleSync]);

    useFocusEffect(useCallback(() => { loadData(); }, [loadData]));
    useEffect(() => { handleSync(); }, []);

    const filteredTxns = React.useMemo(() => {
        let result = transactions.filter(t => {
            const isUnaccounted = t.category === 'internal_transfer' || t.category === 'credit_card' || !!t.isExcluded;
            if (feedTab === 'unaccounted') {
                if (!isUnaccounted) return false;
                if (txnSubTab === 'debit')  return t.type === 'debit';
                if (txnSubTab === 'credit') return t.type === 'credit';
                return true;
            }
            if (txnSubTab === 'debit')  return !isUnaccounted && t.type === 'debit';
            if (txnSubTab === 'credit') return !isUnaccounted && t.type === 'credit';
            return !isUnaccounted;
        });
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(t =>
                (t.merchant || '').toLowerCase().includes(q) ||
                (t.rawMerchant || t.merchant || '').toLowerCase().includes(q)
            );
        }
        if (filterCategory !== 'all') {
            result = result.filter(t => t.category === filterCategory);
        }
        result.sort((a, b) => {
            let vA = sortField === 'amount' ? (parseFloat(a.amount) || 0) : a[sortField];
            let vB = sortField === 'amount' ? (parseFloat(b.amount) || 0) : b[sortField];
            if (vA < vB) return sortOrder === 'ASC' ? -1 : 1;
            if (vA > vB) return sortOrder === 'ASC' ?  1 : -1;
            return 0;
        });
        return result;
    }, [transactions, feedTab, txnSubTab, searchQuery, filterCategory, sortField, sortOrder]);

    const hasActiveFilters = filterCategory !== 'all' || sortField !== 'date' || sortOrder !== 'DESC';
    const unaccountedCount = transactions.filter(t => t.category === 'internal_transfer' || t.category === 'credit_card' || !!t.isExcluded).length;

    const momDelta = prevSummary && prevSummary.totalSpent > 0
        ? Math.round(Math.abs(((summary.totalSpent - prevSummary.totalSpent) / prevSummary.totalSpent) * 100))
        : null;
    const momUp = prevSummary && summary.totalSpent > prevSummary.totalSpent;

    if ((loading || refreshing) && transactions.length === 0) {
        const steps = [
            { pct: 10,  label: 'Reading SMS inbox…' },
            { pct: 20,  label: 'Filtering bank messages…' },
            { pct: 30,  label: 'Parsing transactions…' },
            { pct: 60,  label: 'Categorizing…' },
            { pct: 85,  label: 'AI enriching merchants…' },
            { pct: 95,  label: 'Saving to database…' },
            { pct: 100, label: 'Done!' },
        ];
        const activeStep = syncProgress > 0
            ? steps.filter(s => syncProgress >= s.pct).pop() || steps[0]
            : null;

        return (
            <View style={[st.screen, st.center, { paddingHorizontal: spacing.xxl }]}>
                <Text style={{ fontSize: 52, marginBottom: spacing.xxl }}>💰</Text>
                <Text style={[type.headlineM, { color: colors.text.headline, marginBottom: spacing.sm, textAlign: 'center' }]}>
                    {syncProgress > 0 ? (activeStep?.label ?? 'Processing…') : 'Loading your transactions…'}
                </Text>
                <Text style={[type.bodyM, { color: colors.text.muted, marginBottom: spacing.xxl, textAlign: 'center' }]}>
                    {syncProgress > 0 ? syncStatus : 'Setting things up for you'}
                </Text>

                {/* Progress bar */}
                <View style={{ width: '100%', height: 6, backgroundColor: colors.outline.variant, borderRadius: 3, overflow: 'hidden', marginBottom: spacing.xl }}>
                    <View style={{
                        height: '100%',
                        width: `${syncProgress || 0}%`,
                        backgroundColor: colors.primary.main,
                        borderRadius: 3,
                    }} />
                </View>

                {/* Step indicators */}
                <View style={{ width: '100%', gap: spacing.sm }}>
                    {steps.map((step, i) => {
                        const done = syncProgress >= step.pct;
                        const active = activeStep?.pct === step.pct;
                        return (
                            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, opacity: done ? 1 : 0.3 }}>
                                <View style={{
                                    width: 22, height: 22, borderRadius: 11,
                                    backgroundColor: done ? colors.primary.main : colors.outline.variant,
                                    alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <Text style={{ fontSize: 11, color: '#fff', fontWeight: '700' }}>
                                        {done ? '✓' : String(i + 1)}
                                    </Text>
                                </View>
                                <Text style={[type.bodyM, {
                                    color: active ? colors.primary.main : done ? colors.text.body : colors.text.muted,
                                    fontWeight: active ? '700' : '400',
                                }]}>
                                    {step.label}
                                </Text>
                                {active && <ActivityIndicator size="small" color={colors.primary.main} style={{ marginLeft: 'auto' }} />}
                            </View>
                        );
                    })}
                </View>
            </View>
        );
    }

    if (smsPermissionDenied && transactions.length === 0) {
        return (
            <View style={[st.screen, st.permDeniedWrap]}>
                <View style={st.permDeniedIconWrap}>
                    <Text style={st.permDeniedEmoji}>📩</Text>
                </View>
                <Text style={st.permDeniedTitle}>SMS access needed</Text>
                <Text style={st.permDeniedBody}>
                    Kharcha reads your bank SMS messages to track transactions automatically. No personal or OTP messages are ever read.
                </Text>
                <TouchableOpacity style={st.permDeniedBtn} onPress={handleGrantSMSAccess} activeOpacity={0.8}>
                    <Text style={st.permDeniedBtnText}>Grant SMS Access</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={st.screen}>

            {syncProgress > 0 && (
                <View style={st.syncBanner}>
                    <View style={st.syncBannerRow}>
                        <Text style={st.syncStatusText}>{syncStatus}</Text>
                        <Text style={st.syncPct}>{syncProgress}%</Text>
                    </View>
                    <View style={st.progressTrack}>
                        <View style={[st.progressFill, { width: `${syncProgress}%` }]} />
                    </View>
                </View>
            )}

            {enriching && syncProgress === 0 && (
                <View style={st.enrichBanner}>
                    <ActivityIndicator size="small" color={colors.primary.main} />
                    <Text style={[st.syncStatusText, { marginLeft: spacing.sm }]}>
                        {enrichStatus || 'Categorizing merchants…'}
                    </Text>
                </View>
            )}

            <FlatList
                data={filteredTxns}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={st.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => handleSync(true)}
                        tintColor={colors.primary.main}
                        colors={[colors.primary.main]}
                    />
                }

                ListHeaderComponent={
                    <View>
                        <View style={st.header}>
                            <View>
                                <Text style={st.appTitle}>Kharcha</Text>
                                <Text style={st.appSubtitle}>
                                    {DATE_RANGES.find(r => r.id === dateFilter)?.label ?? 'All Time'}
                                </Text>
                            </View>
                        </View>

                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={st.dateFilterRow}
                        >
                            {DATE_RANGES.map(range => {
                                const active = dateFilter === range.id;
                                return (
                                    <TouchableOpacity
                                        key={range.id}
                                        onPress={() => {
                                            if (range.id === 'custom') setCustomModal(true);
                                            else { setLoading(true); setDateFilter(range.id); }
                                        }}
                                        style={[st.datePill, active && st.datePillActive]}
                                        activeOpacity={0.75}
                                    >
                                        <Text style={[st.datePillText, active && st.datePillTextActive]}>
                                            {range.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>

                        <View style={st.heroCard}>
                            <View style={st.heroTopRow}>
                                <Text style={st.heroLabel}>TOTAL SPENT</Text>
                                {momDelta !== null && (
                                    <View style={[st.momBadge, { backgroundColor: momUp ? colors.expense + '22' : colors.income + '22' }]}>
                                        <Text style={[st.momText, { color: momUp ? colors.expense : colors.income }]}>
                                            {momUp ? '↑' : '↓'} {momDelta}% vs last
                                        </Text>
                                    </View>
                                )}
                            </View>

                            <Text style={st.heroAmount} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.6}>
                                {formatCurrency(summary.totalSpent)}
                            </Text>

                            <View style={st.statsBar}>
                                <View style={st.statItem}>
                                    <Text style={st.statLabel}>Avg / Day</Text>
                                    <Text style={st.statValue} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.7}>
                                        {formatCurrency(avgDaily)}
                                    </Text>
                                </View>
                                <View style={st.statDivider} />
                                <View style={st.statItem}>
                                    <Text style={st.statLabel}>Top Category</Text>
                                    {topCategory ? (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                            <Text style={st.statValue} numberOfLines={1}>
                                                {CATEGORIES[topCategory.category]?.icon ?? '❓'}
                                            </Text>
                                            <Text style={[st.statValue, { color: colors.primary.main }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                                                {topCategory.percentage}%
                                            </Text>
                                        </View>
                                    ) : (
                                        <Text style={st.statValue}>—</Text>
                                    )}
                                </View>
                                <View style={st.statDivider} />
                                <View style={st.statItem}>
                                    <Text style={st.statLabel}>Biggest</Text>
                                    <Text style={[st.statValue, { color: colors.expense }]} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.7}>
                                        {biggestSpend ? formatCurrency(biggestSpend.amount) : '—'}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* ── Feed Section ── */}
                        <View style={st.feedSection}>

                            {/* Row 1: Main tabs with underline indicator */}
                            <View style={st.feedTabBar}>
                                {[
                                    { id: 'transactions', label: 'Transactions' },
                                    { id: 'unaccounted',  label: 'CC & Self Transfer' },
                                ].map(tab => {
                                    const active = feedTab === tab.id;
                                    return (
                                        <TouchableOpacity
                                            key={tab.id}
                                            style={st.feedTab}
                                            onPress={() => setFeedTab(tab.id)}
                                            activeOpacity={0.8}
                                        >
                                            <View style={st.feedTabInner}>
                                                <Text style={[st.feedTabText, active && st.feedTabTextActive]}>
                                                    {tab.label}
                                                </Text>
                                            </View>
                                            {active && <View style={st.feedTabUnderline} />}
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            {/* Row 2: Search + filter */}
                            <View style={st.toolbar}>
                                <View style={st.searchBox}>
                                    <Text style={st.searchIcon}>🔍</Text>
                                    <TextInput
                                        style={st.searchInput}
                                        placeholder="Search merchants…"
                                        placeholderTextColor={colors.text.muted}
                                        value={searchQuery}
                                        onChangeText={setSearchQuery}
                                        returnKeyType="search"
                                    />
                                    {searchQuery.length > 0 && (
                                        <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                            <Text style={st.clearIcon}>✕</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                                <TouchableOpacity
                                    style={[st.filterIconBtn, hasActiveFilters && st.filterIconBtnActive]}
                                    onPress={() => setShowFilterModal(true)}
                                    activeOpacity={0.75}
                                >
                                    <Ionicons
                                        name="options-outline"
                                        size={20}
                                        color={hasActiveFilters ? colors.primary.main : colors.text.secondary}
                                    />
                                    {hasActiveFilters && <View style={st.filterDot} />}
                                </TouchableOpacity>
                            </View>

                            {/* Row 3: Sub-tabs + count (both tabs) */}
                            <View style={st.subTabRow}>
                                <View style={st.subTabGroup}>
                                    {[
                                        { id: 'all',    label: 'All' },
                                        { id: 'debit',  label: 'Debit' },
                                        { id: 'credit', label: 'Credit' },
                                    ].map(sub => {
                                        const active = txnSubTab === sub.id;
                                        return (
                                            <TouchableOpacity
                                                key={sub.id}
                                                style={[st.subTab, active && st.subTabActive]}
                                                onPress={() => setTxnSubTab(sub.id)}
                                                activeOpacity={0.8}
                                            >
                                                <Text style={[st.subTabText, active && st.subTabTextActive]}>
                                                    {sub.label}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                                <Text style={st.feedCount}>
                                    {filteredTxns.length} {feedTab === 'unaccounted' ? 'items' : 'transactions'}
                                </Text>
                            </View>


                        </View>
                    </View>
                }

                renderItem={({ item }) => (
                    <View style={st.cardWrapper}>
                        <TransactionCard
                            transaction={item}
                            onEditPress={handleEditPress}
                            onExcludeToggle={(txn, val) => handleUpdateTransaction(txn.id, { isExcluded: val })}
                        />
                    </View>
                )}

                ListEmptyComponent={
                    <View style={st.emptyState}>
                        <Text style={st.emptyIcon}>🧾</Text>
                        <Text style={st.emptyTitle}>No transactions</Text>
                        <Text style={st.emptySubtitle}>Pull down to sync your SMS</Text>
                    </View>
                }
            />

            {/* ══ Filter & Sort Modal ══ */}
            <Modal visible={showFilterModal} transparent animationType="slide" onRequestClose={() => setShowFilterModal(false)}>
                <TouchableOpacity style={st.overlay} activeOpacity={1} onPress={() => setShowFilterModal(false)} />
                <View style={st.bottomSheet}>
                    <View style={st.sheetHandle} />
                    <Text style={st.sheetTitle}>Filter & Sort</Text>

                    <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                        <Text style={st.sheetSectionLabel}>Sort By</Text>
                        <View style={st.chipRow}>
                            {[{ id: 'date', label: 'Date' }, { id: 'amount', label: 'Amount' }].map(opt => (
                                <TouchableOpacity
                                    key={opt.id}
                                    style={[st.chip, sortField === opt.id && st.chipActive]}
                                    onPress={() => setSortField(opt.id)}
                                >
                                    <Text style={[st.chipText, sortField === opt.id && st.chipTextActive]}>{opt.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={st.sheetSectionLabel}>Order</Text>
                        <View style={st.chipRow}>
                            {[{ id: 'DESC', label: 'Newest / Highest' }, { id: 'ASC', label: 'Oldest / Lowest' }].map(opt => (
                                <TouchableOpacity
                                    key={opt.id}
                                    style={[st.chip, sortOrder === opt.id && st.chipActive]}
                                    onPress={() => setSortOrder(opt.id)}
                                >
                                    <Text style={[st.chipText, sortOrder === opt.id && st.chipTextActive]}>{opt.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={st.sheetSectionLabel}>Category</Text>
                        <View style={st.chipRow}>
                            <TouchableOpacity
                                style={[st.chip, filterCategory === 'all' && st.chipActive]}
                                onPress={() => setFilterCategory('all')}
                            >
                                <Text style={[st.chipText, filterCategory === 'all' && st.chipTextActive]}>All</Text>
                            </TouchableOpacity>
                            {Object.entries(CATEGORIES).map(([id, cat]) => (
                                <TouchableOpacity
                                    key={id}
                                    style={[st.chip, filterCategory === id && st.chipActive]}
                                    onPress={() => setFilterCategory(id)}
                                >
                                    <Text style={[st.chipText, filterCategory === id && st.chipTextActive]}>
                                        {cat.icon} {cat.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </ScrollView>

                    <View style={st.sheetFooter}>
                        <TouchableOpacity
                            style={st.resetLink}
                            onPress={() => { setFilterCategory('all'); setSortField('date'); setSortOrder('DESC'); setSearchQuery(''); }}
                        >
                            <Text style={st.resetText}>Reset</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={st.applyBtn} onPress={() => setShowFilterModal(false)}>
                            <Text style={st.applyText}>Show Results</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ══ Custom Date Range Modal ══ */}
            <DateRangePickerModal
                visible={customModal}
                initialStart={customStart}
                initialEnd={customEnd}
                onClose={() => setCustomModal(false)}
                onApply={(s, e) => {
                    setCustomStart(s);
                    setCustomEnd(e);
                    setCustomModal(false);
                    setDateFilter('custom');
                    setLoading(true);
                }}
            />

            {/* ══ Edit Transaction Modal ══ */}
            <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
                <TouchableOpacity style={st.overlay} activeOpacity={1} onPress={() => setShowEditModal(false)} />
                <View style={[st.bottomSheet, { maxHeight: '88%' }]}>
                    <View style={st.sheetHandle} />
                    <Text style={st.sheetTitle}>Edit Transaction</Text>

                    <ScrollView showsVerticalScrollIndicator={false} bounces={false} keyboardShouldPersistTaps="handled">
                        <Text style={st.sheetSectionLabel}>Merchant Name</Text>
                        <TextInput
                            style={st.formInput}
                            value={editForm.merchant}
                            onChangeText={(val) => setEditForm(f => ({ ...f, merchant: val }))}
                            placeholder="Merchant name"
                            placeholderTextColor={colors.text.muted}
                        />

                        <Text style={st.sheetSectionLabel}>Category</Text>
                        <View style={st.chipRow}>
                            <TouchableOpacity
                                style={[st.chip, editForm.category === 'internal_transfer' && st.chipActive]}
                                onPress={() => setEditForm(f => ({ ...f, category: 'internal_transfer' }))}
                            >
                                <Text style={[st.chipText, editForm.category === 'internal_transfer' && st.chipTextActive]}>
                                    🔄 Internal Transfer
                                </Text>
                            </TouchableOpacity>
                            {Object.entries(CATEGORIES).map(([id, cat]) => (
                                <TouchableOpacity
                                    key={id}
                                    style={[st.chip, editForm.category === id && st.chipActive]}
                                    onPress={() => setEditForm(f => ({ ...f, category: id }))}
                                >
                                    <Text style={[st.chipText, editForm.category === id && st.chipTextActive]}>
                                        {cat.icon} {cat.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={st.sheetSectionLabel}>Note</Text>
                        <TextInput
                            style={[st.formInput, { height: 80, textAlignVertical: 'top' }]}
                            value={editForm.note}
                            onChangeText={(val) => setEditForm(f => ({ ...f, note: val }))}
                            placeholder="Add a note…"
                            placeholderTextColor={colors.text.muted}
                            multiline
                        />

                        <View style={st.excludeRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={st.excludeTitle}>Exclude from totals</Text>
                                <Text style={st.excludeSub}>Won't count towards summaries or charts</Text>
                            </View>
                            <Switch
                                value={editForm.isExcluded}
                                onValueChange={(val) => setEditForm(f => ({ ...f, isExcluded: val }))}
                                trackColor={{ false: colors.surface.containerHigh, true: colors.primary.main }}
                                thumbColor={editForm.isExcluded ? '#FFFFFF' : colors.text.muted}
                            />
                        </View>
                    </ScrollView>

                    <View style={st.sheetFooter}>
                        <TouchableOpacity style={st.cancelBtn} onPress={() => setShowEditModal(false)}>
                            <Text style={st.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={st.applyBtn} onPress={handleSaveEdit}>
                            <Text style={st.applyText}>Save Changes</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
