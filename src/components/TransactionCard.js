/**
 * TransactionCard — Polished expandable card
 * Category color dot · merchant · date · amount · expand for SMS + exclude
 */
import React, { useState } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    LayoutAnimation, UIManager, Platform, Switch
} from 'react-native';
import { type, radius, spacing, CATEGORIES } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { formatCurrency } from '../lib/analytics';
import { formatDate } from '../lib/dateParser';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function TransactionCard({ transaction, onEditPress, onExcludeToggle }) {
    const { colors } = useTheme();
    const st = makeStyles(colors);

    const [expanded, setExpanded] = useState(false);

    const cat        = CATEGORIES[transaction.category];
    const catColor   = colors.category[transaction.category] ?? colors.text.muted;
    const catLabel   = cat?.label ?? 'Uncategorized';
    const catIcon    = cat?.icon  ?? '❓';
    const isDebit    = transaction.type === 'debit';
    const isExcluded = !!transaction.isExcluded;
    const dateObj    = transaction.date ? new Date(transaction.date + 'T00:00:00') : null;

    const toggleExpand = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpanded(e => !e);
    };

    return (
        <TouchableOpacity
            style={st.card}
            onPress={toggleExpand}
            activeOpacity={0.75}
        >
            {/* ── Main Row ── */}
            <View style={st.mainRow}>
                {/* Category dot */}
                <View style={[st.catDot, { backgroundColor: catColor + '33', borderColor: catColor }]}>
                    <Text style={{ fontSize: 14 }}>{catIcon}</Text>
                </View>

                {/* Left: merchant + meta */}
                <View style={st.leftCol}>
                    <Text
                        style={[st.merchant, isExcluded && st.excluded]}
                        numberOfLines={1}
                    >
                        {transaction.merchant || 'Unknown'}
                    </Text>
                    <View style={st.metaRow}>
                        <Text style={st.metaText}>{dateObj ? formatDate(dateObj) : '—'}</Text>
                        <Text style={st.metaDot}>·</Text>
                        <Text style={[st.metaText, { color: catColor }]}>{catLabel}</Text>
                    </View>
                </View>

                {/* Right: amount + edit */}
                <View style={st.rightCol}>
                    <Text style={[
                        st.amount,
                        isDebit ? st.debit : st.credit,
                        isExcluded && st.excludedAmount,
                    ]}>
                        {isDebit ? '−' : '+'}{formatCurrency(transaction.amount)}
                    </Text>
                    <TouchableOpacity
                        onPress={() => onEditPress?.(transaction)}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                        <Text style={st.editBtn}>Edit</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* ── Expanded Detail ── */}
            {expanded && (
                <View style={st.expandedSection}>
                    {/* Raw SMS */}
                    {transaction.rawSMS && (
                        <View style={st.rawSmsBox}>
                            <Text style={st.rawSmsLabel}>RAW SMS</Text>
                            <Text style={st.rawSmsText} selectable>
                                {transaction.rawSMS}
                            </Text>
                        </View>
                    )}

                    {/* Note */}
                    {transaction.note ? (
                        <View style={st.noteBox}>
                            <Text style={st.noteLabel}>NOTE</Text>
                            <Text style={st.noteText}>{transaction.note}</Text>
                        </View>
                    ) : null}

                    {/* Exclude toggle */}
                    <View style={st.excludeRow}>
                        <View style={{ flex: 1, paddingRight: spacing.lg }}>
                            <Text style={st.excludeTitle}>Exclude from totals</Text>
                            <Text style={st.excludeSub}>Won't count towards summaries</Text>
                        </View>
                        <Switch
                            value={isExcluded}
                            onValueChange={(val) => onExcludeToggle?.(transaction, val)}
                            trackColor={{ false: colors.surface.containerHighest, true: colors.primary.main }}
                            thumbColor={isExcluded ? '#FFFFFF' : colors.text.muted}
                        />
                    </View>
                </View>
            )}
        </TouchableOpacity>
    );
}

function makeStyles(colors) { return StyleSheet.create({
    card: {
        paddingVertical: spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: colors.outline.default,
    },
    mainRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },

    // Category dot
    catDot: {
        width: 38, height: 38,
        borderRadius: radius.md,
        borderWidth: 1,
        alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
    },

    // Left column
    leftCol: { flex: 1, justifyContent: 'center' },
    merchant: {
        ...type.headlineS,
        color: colors.text.headline,
        fontWeight: '600',
        marginBottom: 3,
    },
    excluded: { textDecorationLine: 'line-through', opacity: 0.5 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    metaText: { ...type.bodyS, color: colors.text.muted },
    metaDot: { ...type.bodyS, color: colors.outline.variant, fontSize: 14 },

    // Right column
    rightCol: { alignItems: 'flex-end', gap: spacing.xs },
    amount: { ...type.headlineS, fontWeight: '700' },
    debit: { color: colors.expense },
    credit: { color: colors.income },
    excludedAmount: { opacity: 0.4, textDecorationLine: 'line-through' },
    editBtn: { ...type.labelM, color: colors.primary.main, fontWeight: '600' },

    // Expanded section
    expandedSection: {
        marginTop: spacing.lg,
        paddingTop: spacing.lg,
        borderTopWidth: 1,
        borderTopColor: colors.outline.default,
        gap: spacing.md,
    },
    rawSmsBox: {
        backgroundColor: colors.surface.containerHigh,
        borderRadius: radius.md,
        padding: spacing.md,
    },
    rawSmsLabel: {
        ...type.labelS, color: colors.text.muted,
        letterSpacing: 0.8, marginBottom: spacing.xs,
    },
    rawSmsText: {
        ...type.bodyS, color: colors.text.secondary, lineHeight: 18,
    },
    noteBox: {
        backgroundColor: colors.primary.container + '55',
        borderRadius: radius.md,
        padding: spacing.md,
        borderLeftWidth: 2, borderLeftColor: colors.primary.main,
    },
    noteLabel: {
        ...type.labelS, color: colors.primary.main,
        letterSpacing: 0.8, marginBottom: spacing.xs,
    },
    noteText: { ...type.bodyS, color: colors.text.headline },
    excludeRow: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: spacing.sm,
    },
    excludeTitle: { ...type.bodyM, color: colors.text.headline, fontWeight: '500' },
    excludeSub: { ...type.labelS, color: colors.text.muted, marginTop: 2 },
}); }
