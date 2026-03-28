/**
 * SettingsScreen — Clean grouped layout
 * Profile → Data → Danger Zone → About
 */
import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, Share, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, type, radius, spacing } from '../theme';
import { getTransactionCount, exportData, getSetting, saveSetting, clearAllTransactions, resetTransactionSettings } from '../lib/database';
import { syncSMS } from '../lib/smsReader';

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title, danger }) {
    return (
        <Text style={[st.sectionHeader, danger && { color: '#FF453A' }]}>{title}</Text>
    );
}

function MenuItem({ icon, title, subtitle, onPress, badge, danger, first, last }) {
    return (
        <TouchableOpacity
            style={[st.menuItem, first && st.menuItemFirst, last && st.menuItemLast, !last && st.menuItemBordered]}
            onPress={onPress}
            activeOpacity={0.65}
        >
            <View style={[st.menuIconWrap, danger && { backgroundColor: '#FF453A22' }]}>
                <Text style={{ fontSize: 20 }}>{icon}</Text>
            </View>
            <View style={st.menuText}>
                <Text style={[st.menuTitle, danger && { color: '#FF453A' }]}>{title}</Text>
                {subtitle ? <Text style={st.menuSub}>{subtitle}</Text> : null}
            </View>
            {badge
                ? <View style={st.badge}><Text style={st.badgeText}>{badge}</Text></View>
                : <Text style={[st.chevron, danger && { color: '#FF453A' }]}>›</Text>
            }
        </TouchableOpacity>
    );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function SettingsScreen() {
    const [txnCount, setTxnCount] = useState(0);
    const [fullName, setFullName] = useState('');

    useFocusEffect(useCallback(() => {
        (async () => {
            setTxnCount(await getTransactionCount());
            const name = await getSetting('user_full_name');
            if (name) setFullName(name);
        })();
    }, []));

    const handleSaveName = async () => {
        await saveSetting('user_full_name', fullName);
        Alert.alert('Profile Updated', 'Full name saved for self-transfer detection.');
    };

    const handleExport = async () => {
        try {
            const data = await exportData();
            await Share.share({ message: JSON.stringify(data, null, 2), title: 'Kharcha Backup' });
        } catch { Alert.alert('Error', 'Export failed'); }
    };

    const handleRescan = () => {
        Alert.alert('Re-scan SMS', 'Read new SMS and add transactions. Existing data won\'t change.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Scan', onPress: async () => {
                const r = await syncSMS();
                setTxnCount(await getTransactionCount());
                Alert.alert('Done', `${r.newCount} new, ${r.duplicateCount} duplicates skipped`);
            }},
        ]);
    };

    const handleResetSettings = () => {
        Alert.alert('Reset Transaction Settings', 'Clears all manual category changes, merchant overrides, and exclude toggles.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Reset', style: 'destructive', onPress: () =>
                Alert.alert('Final Confirmation', 'All your category edits will be wiped. Continue?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Yes, Reset', style: 'destructive', onPress: async () => {
                        await resetTransactionSettings();
                        Alert.alert('Reset Done', 'Preferences cleared. Re-scan to restore categories.');
                    }},
                ])
            },
        ]);
    };

    const handleClearAll = () => {
        Alert.alert('Clear All Data', 'Permanently deletes ALL transactions. This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete Everything', style: 'destructive', onPress: () =>
                Alert.alert('Final Confirmation', 'All transactions will be wiped. Ready?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Yes, Clear All', style: 'destructive', onPress: async () => {
                        await clearAllTransactions();
                        setTxnCount(0);
                        Alert.alert('Cleared', 'All transactions deleted. Re-scan SMS for a clean import.');
                    }},
                ])
            },
        ]);
    };

    const SAFE_TOP = Platform.OS === 'android' ? 48 : 56;

    return (
        <ScrollView style={st.screen} contentContainerStyle={[st.content, { paddingTop: SAFE_TOP }]} showsVerticalScrollIndicator={false}>

            {/* ── Page Title ── */}
            <View style={st.pageHeader}>
                <Text style={st.pageTitle}>Settings</Text>
                <View style={st.txnPill}>
                    <Text style={st.txnPillText}>{txnCount.toLocaleString()} transactions</Text>
                </View>
            </View>

            {/* ── Profile ── */}
            <SectionHeader title="Profile" />
            <View style={st.card}>
                <Text style={st.cardDesc}>Set your full name as it appears in bank transfers to detect self-transfers.</Text>
                <View style={st.profileRow}>
                    <TextInput
                        style={st.profileInput}
                        placeholder="e.g. PRATIK SONDKAR"
                        placeholderTextColor={colors.text.muted}
                        value={fullName}
                        onChangeText={setFullName}
                        autoCapitalize="characters"
                        returnKeyType="done"
                        onSubmitEditing={handleSaveName}
                    />
                    <TouchableOpacity style={st.saveBtn} onPress={handleSaveName} activeOpacity={0.8}>
                        <Text style={st.saveBtnText}>Save</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* ── Data ── */}
            <SectionHeader title="Data" />
            <View style={st.menuGroup}>
                <MenuItem
                    icon="📤" title="Export Data" subtitle="Share full backup as JSON"
                    onPress={handleExport} first last
                />
            </View>

            {/* ── Danger Zone ── */}
            <SectionHeader title="Danger Zone" danger />
            <View style={[st.menuGroup, st.dangerGroup]}>
                <MenuItem
                    icon="🔄" title="Re-scan SMS" subtitle="Read new SMS, add transactions"
                    onPress={handleRescan} first
                />
                <MenuItem
                    icon="↩️" title="Reset Transaction Settings" subtitle="Clear all category edits and overrides"
                    onPress={handleResetSettings} danger
                />
                <MenuItem
                    icon="🗑" title="Clear All Data" subtitle="Permanently delete all transactions"
                    onPress={handleClearAll} danger last
                />
            </View>

            {/* ── About ── */}
            <SectionHeader title="About" />
            <View style={st.menuGroup}>
                <MenuItem
                    icon="🔒" title="Privacy" subtitle="Everything stays on your device"
                    onPress={() => Alert.alert('Privacy', 'Kharcha processes everything locally.\n\nOnly bank SMS are read — never personal messages.\n\nNo data leaves your device.')}
                    first
                />
                <MenuItem
                    icon="📱" title="Version" badge="v1.0.0"
                    onPress={() => {}} last
                />
            </View>

            <View style={{ height: 100 }} />
        </ScrollView>
    );
}

const st = StyleSheet.create({
    screen:   { flex: 1, backgroundColor: colors.surface.base },
    content:  { paddingHorizontal: spacing.xl },

    // ── Page header ──
    pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xxxl },
    pageTitle:  { ...type.displayS, color: colors.text.headline },
    txnPill:    { backgroundColor: colors.primary.container, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full },
    txnPillText:{ ...type.labelM, color: colors.primary.onContainer, fontWeight: '700' },

    // ── Section headers ──
    sectionHeader: { ...type.labelM, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.sm, marginLeft: spacing.sm },

    // ── Profile card ──
    card:       { backgroundColor: colors.surface.container, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.xxl, borderWidth: 1, borderColor: colors.outline.default },
    cardDesc:   { ...type.bodyM, color: colors.text.secondary, marginBottom: spacing.lg, lineHeight: 20 },
    profileRow: { flexDirection: 'row', gap: spacing.sm },
    profileInput: {
        flex: 1,
        backgroundColor: colors.surface.base,
        borderRadius: radius.lg, padding: spacing.lg,
        color: colors.text.headline, ...type.bodyM,
        borderWidth: 1, borderColor: colors.outline.variant,
    },
    saveBtn:     { backgroundColor: colors.primary.main, borderRadius: radius.lg, paddingHorizontal: spacing.xl, justifyContent: 'center', alignItems: 'center' },
    saveBtnText: { ...type.labelL, color: colors.surface.base, fontWeight: '800' },

    // ── Menu groups ──
    menuGroup:   { backgroundColor: colors.surface.container, borderRadius: radius.xl, marginBottom: spacing.xxl, borderWidth: 1, borderColor: colors.outline.default, overflow: 'hidden' },
    dangerGroup: { borderColor: '#FF453A22' },

    // ── Menu items ──
    menuItem:        { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.lg, paddingHorizontal: spacing.xl, gap: spacing.md },
    menuItemFirst:   {},
    menuItemLast:    {},
    menuItemBordered:{ borderBottomWidth: 1, borderBottomColor: colors.outline.default },
    menuIconWrap:    { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surface.base, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    menuText:        { flex: 1 },
    menuTitle:       { ...type.headlineS, color: colors.text.headline },
    menuSub:         { ...type.bodyS, color: colors.text.muted, marginTop: 2 },
    chevron:         { fontSize: 20, color: colors.text.muted, lineHeight: 24 },
    badge:           { backgroundColor: colors.primary.container, paddingHorizontal: spacing.md, paddingVertical: 3, borderRadius: radius.full },
    badgeText:       { ...type.labelS, color: colors.primary.onContainer, fontWeight: '700' },
});
