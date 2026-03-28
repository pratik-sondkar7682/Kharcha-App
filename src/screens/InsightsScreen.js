/**
 * InsightsScreen — Analytics hub
 * Clean section layout: date filters → hero cards → insights grid → donut → pacing → merchants
 */
import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Modal, TextInput, Switch, Alert, Platform
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Path, G } from 'react-native-svg';
import { colors, type, radius, spacing, CATEGORIES } from '../theme';
import {
    monthlySummary, categoryBreakdown, dailyTrend, topMerchants,
    formatCurrency, getDateRange, DATE_RANGES, getPreviousPeriodRange,
    averageDailySpend, biggestTransactions, weekdayVsWeekend
} from '../lib/analytics';
import { getTransactions, updateTransaction, saveUserOverride } from '../lib/database';

// ── Horizontal scrollable bar chart ──────────────────────────────────────────
function SpendingBars({ data, height = 130, onBarPress, selectedDate }) {
    const max = Math.max(...data.map(d => d.value), 1);
    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 10 }}>
                {data.map((d, i) => {
                    const h       = Math.max((d.value / max) * height * 0.82, 4);
                    const isHigh  = d.value > max * 0.7;
                    const isZero  = d.value === 0;
                    const isActive = selectedDate === d.date;
                    const barColor = isActive ? colors.primary.main : isHigh ? colors.expense : colors.income;
                    const opacity  = isZero ? 0.12 : selectedDate && !isActive ? 0.18 : 0.88;

                    return (
                        <TouchableOpacity key={i} style={{ alignItems: 'center', width: 26 }} onPress={() => onBarPress?.(d.date)} activeOpacity={0.7}>
                            <View style={{ width: 13, height: h, backgroundColor: barColor, borderRadius: 4, opacity }} />
                            <Text style={{ fontSize: 9, color: isActive ? colors.primary.main : colors.text.muted, marginTop: 4, fontWeight: isActive ? '700' : '400' }}>
                                {d.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </ScrollView>
    );
}

// ── SVG Donut chart ───────────────────────────────────────────────────────────
function SvgDonut({ data, size = 178, thickness = 24, onSlicePress, selectedCategory, isFaded }) {
    const total  = data.reduce((sum, d) => sum + Math.abs(d.value), 0) || 1;
    const center = size / 2;
    const r      = size / 2 - thickness / 2;
    let cur      = -Math.PI / 2;

    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', opacity: isFaded ? 0.35 : 1 }}>
            <Svg width={size} height={size}>
                <G x={center} y={center}>
                    {data.map((d, i) => {
                        const angle = (Math.abs(d.value) / total) * Math.PI * 2;
                        if (angle === 0) return null;
                        const start = cur;
                        const end   = cur + angle;
                        cur         = end;
                        const laf   = angle > Math.PI ? 1 : 0;
                        const sx    = r * Math.cos(start);
                        const sy    = r * Math.sin(start);
                        const ex    = r * Math.cos(end);
                        const ey    = r * Math.sin(end);
                        const op    = selectedCategory && selectedCategory !== d.category ? 0.2 : 1;

                        if (angle >= Math.PI * 1.99) {
                            return <Path key={i} d={`M 0 -${r} A ${r} ${r} 0 1 1 0 ${r} A ${r} ${r} 0 1 1 0 -${r}`} stroke={d.color} strokeWidth={thickness} fill="none" opacity={op} onPress={() => onSlicePress?.(d)} />;
                        }
                        return <Path key={i} d={`M ${sx} ${sy} A ${r} ${r} 0 ${laf} 1 ${ex} ${ey}`} stroke={d.color} strokeWidth={thickness} fill="none" opacity={op} onPress={() => onSlicePress?.(d)} />;
                    })}
                </G>
            </Svg>
            <View style={{ position: 'absolute', alignItems: 'center' }}>
                <Text style={{ ...type.headlineM, color: colors.text.headline }} adjustsFontSizeToFit numberOfLines={1}>{formatCurrency(total)}</Text>
                <Text style={{ ...type.labelS, color: colors.text.muted, marginTop: 2 }}>Total Spend</Text>
            </View>
        </View>
    );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function InsightsScreen() {
    const [loading, setLoading]             = useState(true);
    const [dateFilter, setDateFilter]       = useState('current_month');
    const [customModal, setCustomModal]     = useState(false);
    const [customStart, setCustomStart]     = useState('');
    const [customEnd, setCustomEnd]         = useState('');
    const [showCalFor, setShowCalFor]       = useState(null);

    const [selectedCategory, setSelectedCategory] = useState(null);
    const [selectedDate, setSelectedDate]         = useState(null);
    const [expandedMerchant, setExpandedMerchant] = useState(null);
    const [allTxns, setAllTxns]                   = useState([]);

    const [showMerchantEdit, setShowMerchantEdit]     = useState(false);
    const [editingMerchant, setEditingMerchant]       = useState(null);
    const [merchantEditForm, setMerchantEditForm]     = useState({ category: 'uncategorized', isExcluded: false });

    const [summary, setSummary]         = useState({ totalSpent: 0, totalReceived: 0, count: 0 });
    const [prevSummary, setPrevSummary] = useState(null);
    const [categories, setCategories]   = useState([]);
    const [trend, setTrend]             = useState([]);
    const [merchants, setMerchants]     = useState([]);
    const [avgDaily, setAvgDaily]       = useState(0);
    const [anomalies, setAnomalies]     = useState([]);
    const [behavior, setBehavior]       = useState(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            let curStart, curEnd;
            if (dateFilter === 'custom') {
                curStart = customStart || null; curEnd = customEnd || null;
            } else {
                const { startDate, endDate } = getDateRange(dateFilter);
                curStart = startDate; curEnd = endDate;
            }

            let rawTxns = await getTransactions({ startDate: curStart, endDate: curEnd }, 'date DESC', 5000);
            rawTxns = rawTxns.filter(t => t.category !== 'internal_transfer');
            setAllTxns(rawTxns);

            // Pacing: respects category filter, not date
            let pacingSrc = rawTxns;
            if (selectedCategory) pacingSrc = pacingSrc.filter(t => t.category === selectedCategory);
            setTrend(dailyTrend(pacingSrc, curEnd, curStart));

            // Donut: respects date filter, not category
            let pieSrc = rawTxns;
            if (selectedDate) pieSrc = pieSrc.filter(t => t.date.startsWith(selectedDate));
            setCategories(categoryBreakdown(pieSrc));

            // Everything else: both filters
            let strict = rawTxns;
            if (selectedCategory) strict = strict.filter(t => t.category === selectedCategory);
            if (selectedDate)     strict = strict.filter(t => t.date.startsWith(selectedDate));

            setSummary(monthlySummary(strict));
            setMerchants(topMerchants(strict, Infinity));
            setAvgDaily(averageDailySpend(strict, curStart, curEnd));
            setAnomalies(biggestTransactions(strict, 3));
            setBehavior(weekdayVsWeekend(strict));

            if (dateFilter !== 'all_time' && curStart && curEnd && dateFilter !== 'custom') {
                const prev = getPreviousPeriodRange(curStart, curEnd);
                let prevTxns = await getTransactions({ startDate: prev.startDate, endDate: prev.endDate }, 'date DESC', 5000);
                if (selectedCategory) prevTxns = prevTxns.filter(t => t.category === selectedCategory);
                if (selectedDate)     prevTxns = prevTxns.filter(t => t.date.startsWith(selectedDate));
                setPrevSummary(monthlySummary(prevTxns));
            } else {
                setPrevSummary(null);
            }
        } catch (e) { console.error('Insights load error:', e); }
        finally { setLoading(false); }
    }, [dateFilter, customStart, customEnd, selectedCategory, selectedDate]);

    useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

    const toggleCategory = (cat) => setSelectedCategory(p => p === cat ? null : cat);
    const toggleDate     = (dt)  => setSelectedDate(p => p === dt ? null : dt);

    const handleMerchantEditPress = (m, mTxns) => {
        setEditingMerchant({ merchant: m.merchant, txns: mTxns });
        setMerchantEditForm({ category: m.category || 'uncategorized', isExcluded: mTxns.every(t => t.isExcluded) });
        setShowMerchantEdit(true);
    };

    const handleMerchantSave = async () => {
        if (!editingMerchant) return;
        const { merchant, txns } = editingMerchant;
        const applyChanges = async () => {
            try {
                await Promise.all(txns.map(t => updateTransaction(t.id, merchantEditForm)));
                await saveUserOverride(merchant.toLowerCase().trim(), merchantEditForm.category);
                setShowMerchantEdit(false);
                setEditingMerchant(null);
                await loadData();
            } catch (e) { console.error('Merchant update error:', e); }
        };
        if (txns.length > 1) {
            Alert.alert('Apply to All?', `This updates all ${txns.length} transactions for "${merchant}".`, [
                { text: 'Cancel', style: 'cancel' },
                { text: `Apply to All ${txns.length}`, onPress: applyChanges },
            ]);
        } else {
            await applyChanges();
        }
    };

    const pieData = categories.map(c => ({
        value: Math.abs(c.amount),
        color: CATEGORIES[c.category]?.color || colors.text.muted,
        category: c.category,
    }));

    const barData = trend.map(d => ({ value: d.spent, label: d.label, date: d.date }));

    const filterSubtitle = (() => {
        if (selectedCategory && selectedDate) return `${CATEGORIES[selectedCategory]?.label} · ${selectedDate}`;
        if (selectedCategory) return CATEGORIES[selectedCategory]?.label ?? 'Category';
        if (selectedDate)     return selectedDate;
        return DATE_RANGES.find(r => r.id === dateFilter)?.label ?? '';
    })();

    const momSpentDelta  = prevSummary?.totalSpent  > 0 ? Math.round(Math.abs(((summary.totalSpent  - prevSummary.totalSpent)  / prevSummary.totalSpent)  * 100)) : null;
    const momSpentUp     = prevSummary && summary.totalSpent  > prevSummary.totalSpent;
    const momIncDelta    = prevSummary?.totalReceived > 0 ? Math.round(Math.abs(((summary.totalReceived - prevSummary.totalReceived) / prevSummary.totalReceived) * 100)) : null;
    const momIncUp       = prevSummary && summary.totalReceived > prevSummary.totalReceived;

    const SAFE_TOP = Platform.OS === 'android' ? 48 : 56;

    return (
        <ScrollView style={st.screen} contentContainerStyle={[st.content, { paddingTop: SAFE_TOP }]} showsVerticalScrollIndicator={false}>

            {/* ── Header ── */}
            <View style={st.header}>
                <View style={{ flex: 1 }}>
                    <Text style={st.title}>Insights</Text>
                    <Text style={[st.subtitle, (selectedCategory || selectedDate) && { color: colors.primary.main }]} numberOfLines={1}>
                        {filterSubtitle}
                    </Text>
                </View>
                {(selectedCategory || selectedDate) && (
                    <TouchableOpacity
                        style={st.clearFilterBtn}
                        onPress={() => { setSelectedCategory(null); setSelectedDate(null); }}
                        activeOpacity={0.75}
                    >
                        <Text style={st.clearFilterText}>✕  Clear</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* ── Date Filters ── */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.dateFilterRow} style={{ marginHorizontal: -spacing.xl, marginBottom: spacing.xl }}>
                {DATE_RANGES.map(range => {
                    const active = dateFilter === range.id;
                    return (
                        <TouchableOpacity
                            key={range.id}
                            style={[st.datePill, active && st.datePillActive]}
                            onPress={() => range.id === 'custom' ? setCustomModal(true) : setDateFilter(range.id)}
                            activeOpacity={0.75}
                        >
                            <Text style={[st.datePillText, active && st.datePillTextActive]}>{range.label}</Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {loading && allTxns.length === 0 ? (
                <View style={st.loadingWrap}>
                    <ActivityIndicator size="large" color={colors.primary.main} />
                </View>
            ) : (
                <>
                    {/* ── Hero Cards ── */}
                    <View style={st.heroRow}>
                        {/* Spent */}
                        <View style={[st.heroCard, { borderLeftColor: colors.expense }]}>
                            <Text style={st.heroLabel}>{selectedCategory ? 'Category Spend' : selectedDate ? 'Daily Spend' : 'Total Spent'}</Text>
                            <Text style={st.heroAmount} adjustsFontSizeToFit numberOfLines={1}>{formatCurrency(summary.totalSpent)}</Text>
                            {momSpentDelta !== null ? (
                                <View style={[st.momPill, { backgroundColor: momSpentUp ? colors.expense + '22' : colors.income + '22' }]}>
                                    <Text style={[st.momText, { color: momSpentUp ? colors.expense : colors.income }]}>
                                        {momSpentUp ? '↑' : '↓'} {momSpentDelta}% vs prev
                                    </Text>
                                </View>
                            ) : (
                                <Text style={st.heroMeta}>{summary.count} transactions</Text>
                            )}
                        </View>

                        {/* Income / txn count */}
                        <View style={[st.heroCard, { borderLeftColor: colors.income }]}>
                            {selectedCategory ? (
                                <>
                                    <Text style={st.heroLabel}>Transactions</Text>
                                    <Text style={st.heroAmount} adjustsFontSizeToFit numberOfLines={1}>{summary.count}</Text>
                                    <Text style={st.heroMeta}>{summary.count > 0 ? `avg ${formatCurrency(Math.round(summary.totalSpent / summary.count))}` : 'no data'}</Text>
                                </>
                            ) : (
                                <>
                                    <Text style={st.heroLabel}>{selectedDate ? 'Daily Income' : 'Income'}</Text>
                                    <Text style={st.heroAmount} adjustsFontSizeToFit numberOfLines={1}>{formatCurrency(summary.totalReceived)}</Text>
                                    {momIncDelta !== null ? (
                                        <View style={[st.momPill, { backgroundColor: momIncUp ? colors.income + '22' : colors.expense + '22' }]}>
                                            <Text style={[st.momText, { color: momIncUp ? colors.income : colors.expense }]}>
                                                {momIncUp ? '↑' : '↓'} {momIncDelta}% vs prev
                                            </Text>
                                        </View>
                                    ) : (
                                        <Text style={st.heroMeta}>{summary.count} txns</Text>
                                    )}
                                </>
                            )}
                        </View>
                    </View>

                    {/* ── Quick Insights Grid ── */}
                    <View style={st.insightGrid}>
                        <View style={st.insightCard}>
                            <Text style={st.insightIcon}>⏱</Text>
                            <Text style={st.insightValue} adjustsFontSizeToFit numberOfLines={1}>{formatCurrency(avgDaily)}</Text>
                            <Text style={st.insightLabel}>Avg / day</Text>
                        </View>
                        <View style={st.insightCard}>
                            <Text style={st.insightIcon}>{behavior?.weekendPct > behavior?.weekdayPct ? '🏖' : '💼'}</Text>
                            <Text style={st.insightValue}>{behavior?.weekendPct ?? 0}%</Text>
                            <Text style={st.insightLabel}>Weekend spend</Text>
                        </View>
                        {anomalies[0] ? (
                            <View style={[st.insightCard, st.insightCardWide]}>
                                <View style={st.anomalyInner}>
                                    <View style={st.anomalyIconWrap}>
                                        <Text style={{ fontSize: 20 }}>🚨</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[st.insightValue, { color: colors.expense }]} adjustsFontSizeToFit numberOfLines={1}>{formatCurrency(anomalies[0].amount)}</Text>
                                        <Text style={st.insightLabel}>Largest transaction</Text>
                                    </View>
                                </View>
                            </View>
                        ) : null}
                    </View>

                    {/* ── Category Donut ── */}
                    {categories.length > 0 && (
                        <View style={st.section}>
                            <View style={st.sectionHeader}>
                                <Text style={st.sectionTitle}>Spending by Category</Text>
                                <Text style={st.sectionHint}>Tap slice to filter</Text>
                            </View>
                            <View style={st.donutWrap}>
                                <SvgDonut
                                    data={pieData}
                                    size={190}
                                    thickness={26}
                                    onSlicePress={(d) => toggleCategory(d.category)}
                                    selectedCategory={selectedCategory}
                                    isFaded={!!selectedDate}
                                />
                            </View>
                            <View style={st.legend}>
                                {categories.map(c => {
                                    const cat      = CATEGORIES[c.category] || CATEGORIES.uncategorized;
                                    const isActive = selectedCategory === c.category;
                                    const pct      = Math.round((Math.abs(c.amount) / Math.max(categories.reduce((s, x) => s + Math.abs(x.amount), 0), 1)) * 100);
                                    return (
                                        <TouchableOpacity
                                            key={c.category}
                                            style={[st.legendRow, { opacity: selectedCategory && !isActive ? 0.28 : 1 }]}
                                            onPress={() => toggleCategory(c.category)}
                                            activeOpacity={0.7}
                                        >
                                            <View style={[st.legendDot, { backgroundColor: cat.color }]} />
                                            <Text style={st.legendLabel} numberOfLines={1}>{cat.icon} {cat.label}</Text>
                                            <Text style={st.legendPct}>{pct}%</Text>
                                            <Text style={st.legendAmt}>{formatCurrency(c.amount)}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                    )}

                    {/* ── Daily Pacing ── */}
                    {barData.length > 0 && (
                        <View style={[st.section, { paddingHorizontal: 0 }]}>
                            <View style={[st.sectionHeader, { paddingHorizontal: spacing.xl }]}>
                                <View>
                                    <Text style={st.sectionTitle}>Daily Pacing</Text>
                                    <Text style={st.sectionHint}>Tap a bar to isolate</Text>
                                </View>
                                {selectedDate && (
                                    <TouchableOpacity onPress={() => setSelectedDate(null)} style={st.clearDateBtn}>
                                        <Text style={st.clearDateText}>{selectedDate}  ✕</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                            <View style={{ marginTop: spacing.md }}>
                                <SpendingBars data={barData} selectedDate={selectedDate} onBarPress={toggleDate} />
                            </View>
                        </View>
                    )}

                    {/* ── Merchants ── */}
                    {merchants.length > 0 && (
                        <View style={st.section}>
                            <View style={[st.sectionHeader, { marginBottom: spacing.lg }]}>
                                <Text style={st.sectionTitle}>Top Merchants</Text>
                                <Text style={st.sectionHint}>Tap to expand</Text>
                            </View>

                            {merchants.map((m, i) => {
                                const cat      = CATEGORIES[m.category] || CATEGORIES.uncategorized;
                                const isExp    = expandedMerchant === m.merchant;
                                const mTxns    = allTxns.filter(t =>
                                    t.merchant === m.merchant &&
                                    (!selectedCategory || t.category === selectedCategory) &&
                                    (!selectedDate || t.date.startsWith(selectedDate))
                                );
                                if (mTxns.length === 0) return null;

                                return (
                                    <View key={m.merchant} style={st.merchantBlock}>
                                        <View style={st.merchantRow}>
                                            <TouchableOpacity
                                                style={st.merchantLeft}
                                                onPress={() => setExpandedMerchant(isExp ? null : m.merchant)}
                                                activeOpacity={0.7}
                                            >
                                                <View style={[st.rankBadge, i === 0 && st.rankBadgeTop]}>
                                                    <Text style={[st.rankText, i === 0 && { color: colors.primary.main }]}>{i + 1}</Text>
                                                </View>
                                                <View style={st.merchantInfo}>
                                                    <Text style={st.merchantName} numberOfLines={1}>{m.merchant}</Text>
                                                    <Text style={st.merchantMeta}>{cat.icon} {mTxns.length} transaction{mTxns.length !== 1 ? 's' : ''}</Text>
                                                </View>
                                            </TouchableOpacity>
                                            <Text style={st.merchantAmt}>{formatCurrency(m.amount)}</Text>
                                            <TouchableOpacity style={st.editMerchantBtn} onPress={() => handleMerchantEditPress(m, mTxns)} activeOpacity={0.7}>
                                                <Text style={{ fontSize: 14 }}>✏️</Text>
                                            </TouchableOpacity>
                                        </View>

                                        {isExp && (
                                            <View style={st.merchantTxnList}>
                                                {mTxns.slice(0, 15).map((t, idx) => (
                                                    <View key={String(t.id ?? idx)} style={st.miniTxnRow}>
                                                        <Text style={st.miniTxnDate}>
                                                            {new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                                        </Text>
                                                        <Text style={st.miniTxnCat}>{CATEGORIES[t.category]?.icon}</Text>
                                                        <Text style={[st.miniTxnAmt, { color: t.type === 'debit' ? colors.expense : colors.income }]}>
                                                            {t.type === 'debit' ? '−' : '+'}{formatCurrency(t.amount)}
                                                        </Text>
                                                    </View>
                                                ))}
                                                {mTxns.length > 15 && (
                                                    <Text style={st.moreTxns}>+{mTxns.length - 15} more</Text>
                                                )}
                                            </View>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                    )}
                </>
            )}

            <View style={{ height: 80 }} />

            {/* ══ Custom Date Modal ══ */}
            <Modal visible={customModal} transparent animationType="slide" onRequestClose={() => setCustomModal(false)}>
                <TouchableOpacity style={st.overlay} activeOpacity={1} onPress={() => setCustomModal(false)} />
                <View style={st.bottomSheet}>
                    <View style={st.sheetHandle} />
                    <Text style={st.sheetTitle}>Custom Date Range</Text>
                    {showCalFor ? (
                        <View>
                            <Calendar
                                current={showCalFor === 'start' ? customStart || undefined : customEnd || undefined}
                                onDayPress={(day) => {
                                    if (showCalFor === 'start') setCustomStart(day.dateString);
                                    else setCustomEnd(day.dateString);
                                    setShowCalFor(null);
                                }}
                                theme={{ calendarBackground: colors.surface.containerHigh, todayTextColor: colors.primary.main, dayTextColor: colors.text.headline, arrowColor: colors.primary.main, monthTextColor: colors.text.headline, textSectionTitleColor: colors.text.secondary }}
                            />
                            <TouchableOpacity style={{ alignSelf: 'center', marginTop: spacing.lg }} onPress={() => setShowCalFor(null)}>
                                <Text style={{ ...type.labelL, color: colors.primary.main }}>Done</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View>
                            <Text style={st.inputLabel}>Start Date</Text>
                            <View style={st.dateInputRow}>
                                <TextInput style={[st.formInput, { flex: 1, marginBottom: 0 }]} placeholder="YYYY-MM-DD" placeholderTextColor={colors.text.muted} value={customStart} onChangeText={setCustomStart} />
                                <TouchableOpacity style={st.calBtn} onPress={() => setShowCalFor('start')}><Text style={{ fontSize: 22 }}>📅</Text></TouchableOpacity>
                            </View>
                            <Text style={[st.inputLabel, { marginTop: spacing.lg }]}>End Date</Text>
                            <View style={st.dateInputRow}>
                                <TextInput style={[st.formInput, { flex: 1, marginBottom: 0 }]} placeholder="YYYY-MM-DD" placeholderTextColor={colors.text.muted} value={customEnd} onChangeText={setCustomEnd} />
                                <TouchableOpacity style={st.calBtn} onPress={() => setShowCalFor('end')}><Text style={{ fontSize: 22 }}>📅</Text></TouchableOpacity>
                            </View>
                            <View style={st.sheetFooter}>
                                <TouchableOpacity style={st.cancelBtn} onPress={() => setCustomModal(false)}><Text style={st.cancelText}>Cancel</Text></TouchableOpacity>
                                <TouchableOpacity style={st.applyBtn} onPress={() => { setCustomModal(false); setDateFilter('custom'); }}><Text style={st.applyText}>Apply</Text></TouchableOpacity>
                            </View>
                        </View>
                    )}
                </View>
            </Modal>

            {/* ══ Merchant Edit Modal ══ */}
            <Modal visible={showMerchantEdit} transparent animationType="slide" onRequestClose={() => setShowMerchantEdit(false)}>
                <TouchableOpacity style={st.overlay} activeOpacity={1} onPress={() => setShowMerchantEdit(false)} />
                <View style={[st.bottomSheet, { maxHeight: '85%' }]}>
                    <View style={st.sheetHandle} />
                    <Text style={st.sheetTitle}>Edit Merchant</Text>
                    {editingMerchant && (
                        <Text style={st.sheetSubtitle}>{editingMerchant.merchant} · {editingMerchant.txns.length} transaction{editingMerchant.txns.length !== 1 ? 's' : ''}</Text>
                    )}
                    <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                        <Text style={st.inputLabel}>Category</Text>
                        <View style={st.chipRow}>
                            <TouchableOpacity style={[st.chip, merchantEditForm.category === 'internal_transfer' && st.chipActive]} onPress={() => setMerchantEditForm(f => ({ ...f, category: 'internal_transfer' }))}>
                                <Text style={[st.chipText, merchantEditForm.category === 'internal_transfer' && st.chipTextActive]}>🔄 Internal Transfer</Text>
                            </TouchableOpacity>
                            {Object.entries(CATEGORIES).map(([id, cat]) => (
                                <TouchableOpacity key={id} style={[st.chip, merchantEditForm.category === id && st.chipActive]} onPress={() => setMerchantEditForm(f => ({ ...f, category: id }))}>
                                    <Text style={[st.chipText, merchantEditForm.category === id && st.chipTextActive]}>{cat.icon} {cat.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <View style={st.excludeRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={st.excludeTitle}>Exclude from totals</Text>
                                <Text style={st.excludeSub}>Hide from summaries and charts</Text>
                            </View>
                            <Switch
                                value={merchantEditForm.isExcluded}
                                onValueChange={(val) => setMerchantEditForm(f => ({ ...f, isExcluded: val }))}
                                trackColor={{ false: colors.surface.containerHighest, true: colors.primary.main }}
                                thumbColor={merchantEditForm.isExcluded ? '#fff' : colors.text.muted}
                            />
                        </View>
                    </ScrollView>
                    <View style={st.sheetFooter}>
                        <TouchableOpacity style={st.cancelBtn} onPress={() => setShowMerchantEdit(false)}><Text style={st.cancelText}>Cancel</Text></TouchableOpacity>
                        <TouchableOpacity style={st.applyBtn} onPress={handleMerchantSave}>
                            <Text style={st.applyText}>{editingMerchant?.txns.length > 1 ? `Apply to All ${editingMerchant.txns.length}` : 'Save Changes'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </ScrollView>
    );
}

const st = StyleSheet.create({
    screen:  { flex: 1, backgroundColor: colors.surface.base },
    content: { paddingHorizontal: spacing.xl },
    loadingWrap: { paddingVertical: 100, alignItems: 'center' },

    // ── Header ──
    header:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl },
    title:           { ...type.displayS, color: colors.text.headline },
    subtitle:        { ...type.bodyS, color: colors.text.muted, marginTop: 2 },
    clearFilterBtn:  { backgroundColor: colors.expense + '22', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full },
    clearFilterText: { ...type.labelM, color: colors.expense, fontWeight: '700' },

    // ── Date filter ──
    dateFilterRow: { paddingHorizontal: spacing.xl, gap: spacing.sm, flexDirection: 'row' },
    datePill:      { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 1, borderRadius: radius.full, backgroundColor: colors.surface.containerHigh, borderWidth: 1, borderColor: colors.outline.variant },
    datePillActive: { backgroundColor: colors.primary.container, borderColor: colors.primary.main },
    datePillText:   { ...type.labelM, color: colors.text.secondary },
    datePillTextActive: { color: colors.primary.onContainer, fontWeight: '700' },

    // ── Hero cards ──
    heroRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
    heroCard: {
        flex: 1, backgroundColor: colors.surface.container,
        borderRadius: radius.xl, padding: spacing.xl,
        borderWidth: 1, borderColor: colors.outline.default,
        borderLeftWidth: 3,
    },
    heroLabel:  { ...type.labelM, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
    heroAmount: { ...type.headlineL, color: colors.text.headline, fontWeight: '800', marginTop: spacing.xs, marginBottom: spacing.sm },
    heroMeta:   { ...type.labelS, color: colors.text.muted },
    momPill:    { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
    momText:    { ...type.labelS, fontWeight: '700' },

    // ── Insights grid ──
    insightGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg },
    insightCard:    { width: '47%', backgroundColor: colors.surface.container, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.outline.default },
    insightCardWide:{ width: '100%', flexDirection: 'row' },
    insightIcon:    { fontSize: 22, marginBottom: spacing.sm },
    insightValue:   { ...type.headlineM, color: colors.text.headline, fontWeight: '700' },
    insightLabel:   { ...type.labelS, color: colors.text.muted, marginTop: 2 },
    anomalyInner:   { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    anomalyIconWrap:{ backgroundColor: colors.expense + '22', padding: spacing.md, borderRadius: radius.full },

    // ── Sections ──
    section:       { backgroundColor: colors.surface.container, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.outline.default },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing.md },
    sectionTitle:  { ...type.headlineM, color: colors.text.headline },
    sectionHint:   { ...type.labelS, color: colors.text.muted },
    donutWrap:     { alignItems: 'center', marginVertical: spacing.xl },
    clearDateBtn:  { backgroundColor: colors.primary.container, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.full },
    clearDateText: { ...type.labelS, color: colors.primary.onContainer, fontWeight: '700' },

    // ── Category legend ──
    legend:      { marginTop: spacing.sm },
    legendRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm + 1, borderBottomWidth: 1, borderBottomColor: colors.outline.default, gap: spacing.sm },
    legendDot:   { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
    legendLabel: { ...type.bodyM, color: colors.text.secondary, flex: 1 },
    legendPct:   { ...type.labelS, color: colors.text.muted, minWidth: 30, textAlign: 'right' },
    legendAmt:   { ...type.headlineS, color: colors.text.headline, fontWeight: '600', minWidth: 70, textAlign: 'right' },

    // ── Merchants ──
    merchantBlock:   { borderBottomWidth: 1, borderBottomColor: colors.outline.default },
    merchantRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, gap: spacing.sm },
    merchantLeft:    { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    rankBadge:       { width: 34, height: 34, borderRadius: radius.md, backgroundColor: colors.surface.containerHighest, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    rankBadgeTop:    { backgroundColor: colors.primary.container },
    rankText:        { ...type.labelL, color: colors.text.secondary },
    merchantInfo:    { flex: 1 },
    merchantName:    { ...type.headlineS, color: colors.text.headline },
    merchantMeta:    { ...type.bodyS, color: colors.text.muted, marginTop: 2 },
    merchantAmt:     { ...type.headlineS, color: colors.text.headline, fontWeight: '700' },
    editMerchantBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface.containerHigh, borderRadius: radius.md },

    merchantTxnList: { backgroundColor: colors.surface.containerHigh, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, gap: 2 },
    miniTxnRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: spacing.sm },
    miniTxnDate:     { ...type.labelM, color: colors.text.muted, width: 60 },
    miniTxnCat:      { fontSize: 14, width: 22 },
    miniTxnAmt:      { ...type.labelL, fontWeight: '700', marginLeft: 'auto' },
    moreTxns:        { ...type.labelS, color: colors.text.muted, textAlign: 'center', paddingTop: spacing.sm },

    // ── Bottom sheet ──
    overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
    bottomSheet:  { backgroundColor: colors.surface.containerHigh, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, paddingHorizontal: spacing.xxl, paddingBottom: spacing.xxxl + spacing.xl, paddingTop: spacing.lg },
    sheetHandle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.outline.variant, alignSelf: 'center', marginBottom: spacing.xl },
    sheetTitle:   { ...type.headlineL, color: colors.text.headline, textAlign: 'center', marginBottom: spacing.sm },
    sheetSubtitle:{ ...type.bodyS, color: colors.text.muted, textAlign: 'center', marginBottom: spacing.xl },
    sheetFooter:  { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
    inputLabel:   { ...type.labelM, color: colors.text.secondary, marginBottom: spacing.sm },
    dateInputRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginBottom: spacing.sm },
    formInput:    { backgroundColor: colors.surface.container, borderRadius: radius.lg, padding: spacing.lg, color: colors.text.headline, ...type.bodyM, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.outline.default },
    calBtn:       { width: 50, height: 50, borderRadius: radius.lg, backgroundColor: colors.surface.container, borderWidth: 1, borderColor: colors.outline.default, justifyContent: 'center', alignItems: 'center' },

    // ── Chips ──
    chipRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xl },
    chip:         { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full, backgroundColor: colors.surface.container, borderWidth: 1, borderColor: colors.outline.default },
    chipActive:   { backgroundColor: colors.primary.main, borderColor: colors.primary.main },
    chipText:     { ...type.labelM, color: colors.text.secondary },
    chipTextActive: { color: colors.surface.base, fontWeight: '700' },

    // ── Exclude row ──
    excludeRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.lg, borderTopWidth: 1, borderTopColor: colors.outline.default, marginBottom: spacing.lg },
    excludeTitle: { ...type.headlineS, color: colors.text.headline },
    excludeSub:   { ...type.labelS, color: colors.text.muted, marginTop: 3 },

    // ── Buttons ──
    cancelBtn:  { flex: 1, alignItems: 'center', paddingVertical: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface.container },
    cancelText: { ...type.labelL, color: colors.text.muted },
    applyBtn:   { flex: 2, alignItems: 'center', paddingVertical: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.primary.main },
    applyText:  { ...type.labelL, color: colors.surface.base, fontWeight: '800' },
});
