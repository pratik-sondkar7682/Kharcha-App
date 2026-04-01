/**
 * DateRangePickerModal — Material-style date range picker
 * FROM / TO tab switcher → year + date header → calendar → Cancel / OK
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Platform } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useTheme } from '../context/ThemeContext';
import { type, radius, spacing } from '../theme';

const TODAY = new Date().toISOString().split('T')[0];

function formatHeader(dateStr) {
    if (!dateStr) return { year: '----', date: 'Select date' };
    const d = new Date(dateStr + 'T00:00:00');
    return {
        year: d.getFullYear().toString(),
        date: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
    };
}

export default function DateRangePickerModal({ visible, initialStart, initialEnd, onApply, onClose }) {
    const { colors } = useTheme();
    const st = makeStyles(colors);

    const [start,   setStart]   = useState(initialStart || null);
    const [end,     setEnd]     = useState(initialEnd   || null);
    const [active,  setActive]  = useState('start'); // 'start' | 'end'

    useEffect(() => {
        if (visible) {
            setStart(initialStart || null);
            setEnd(initialEnd     || null);
            setActive('start');
        }
    }, [visible]);

    const onDayPress = ({ dateString }) => {
        if (active === 'start') {
            setStart(dateString);
            setEnd(null);
            setActive('end');
        } else {
            if (dateString < start) {
                setEnd(start);
                setStart(dateString);
            } else {
                setEnd(dateString);
            }
        }
    };

    // Build period marked dates
    const markedDates = (() => {
        if (!start) return {};
        const marks = {};
        const isRange = end && end !== start;

        marks[start] = {
            startingDay: true,
            endingDay: !isRange,
            color: colors.primary.main,
            textColor: '#FFFFFF',
        };

        if (isRange) {
            const s = new Date(start);
            const e = new Date(end);
            const cur = new Date(s);
            cur.setDate(cur.getDate() + 1);
            while (cur < e) {
                const key = cur.toISOString().split('T')[0];
                marks[key] = {
                    color: colors.primary.main + '40',
                    textColor: colors.text.headline,
                };
                cur.setDate(cur.getDate() + 1);
            }
            marks[end] = {
                endingDay: true,
                color: colors.primary.main,
                textColor: '#FFFFFF',
            };
        }

        return marks;
    })();

    const startHeader = formatHeader(start);
    const endHeader   = formatHeader(end);
    const canApply    = !!start && !!end;
    const currentHeader = active === 'start' ? startHeader : endHeader;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={st.overlay}>
                <View style={st.dialog}>

                    {/* ── FROM / TO Tab Bar ── */}
                    <View style={st.tabBar}>
                        <TouchableOpacity
                            style={[st.tab, active === 'start' && st.tabActive]}
                            onPress={() => setActive('start')}
                            activeOpacity={0.8}
                        >
                            <Text style={[st.tabText, active === 'start' && st.tabTextActive]}>FROM</Text>
                            {active === 'start' && <View style={[st.tabUnderline, { backgroundColor: colors.primary.main }]} />}
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[st.tab, active === 'end' && st.tabActive]}
                            onPress={() => setActive('end')}
                            activeOpacity={0.8}
                        >
                            <Text style={[st.tabText, active === 'end' && st.tabTextActive]}>TO</Text>
                            {active === 'end' && <View style={[st.tabUnderline, { backgroundColor: colors.primary.main }]} />}
                        </TouchableOpacity>
                    </View>

                    {/* ── Year + Date Header ── */}
                    <View style={st.dateHeader}>
                        <Text style={st.yearText}>
                            {active === 'start'
                                ? (start ? new Date(start + 'T00:00:00').getFullYear() : new Date().getFullYear())
                                : (end   ? new Date(end   + 'T00:00:00').getFullYear() : new Date().getFullYear())}
                        </Text>
                        <Text style={[st.dateText, !(active === 'start' ? start : end) && { color: colors.text.muted, fontSize: 22 }]}>
                            {active === 'start'
                                ? (start ? currentHeader.date : 'Select start date')
                                : (end   ? currentHeader.date : 'Select end date')}
                        </Text>
                    </View>

                    {/* ── Calendar ── */}
                    <Calendar
                        key={active}
                        current={
                            active === 'start'
                                ? (start || TODAY)
                                : (end || start || TODAY)
                        }
                        onDayPress={onDayPress}
                        markingType="period"
                        markedDates={markedDates}
                        maxDate={TODAY}
                        enableSwipeMonths
                        theme={{
                            calendarBackground: colors.surface.containerHigh,
                            todayTextColor: colors.primary.main,
                            dayTextColor: colors.text.headline,
                            textDisabledColor: colors.text.muted + '80',
                            arrowColor: colors.text.secondary,
                            monthTextColor: colors.text.headline,
                            textSectionTitleColor: colors.text.muted,
                            textMonthFontWeight: '700',
                            textMonthFontSize: 15,
                            textDayFontSize: 14,
                            textDayHeaderFontSize: 12,
                            selectedDayBackgroundColor: colors.primary.main,
                            selectedDayTextColor: '#FFFFFF',
                        }}
                    />

                    {/* ── Footer ── */}
                    <View style={st.footer}>
                        {/* Reset — left aligned, only shown when something is selected */}
                        <TouchableOpacity
                            style={[st.footerBtn, { marginRight: 'auto' }]}
                            onPress={() => { setStart(null); setEnd(null); setActive('start'); }}
                            activeOpacity={0.7}
                        >
                            <Text style={[st.footerBtnText, { color: colors.expense }]}>Reset</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={st.footerBtn} onPress={onClose} activeOpacity={0.7}>
                            <Text style={[st.footerBtnText, { color: colors.text.muted }]}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[st.footerBtn, !canApply && { opacity: 0.35 }]}
                            onPress={() => canApply && onApply(start, end)}
                            activeOpacity={canApply ? 0.7 : 1}
                        >
                            <Text style={[st.footerBtnText, { color: colors.primary.main }]}>OK</Text>
                        </TouchableOpacity>
                    </View>

                </View>
            </View>
        </Modal>
    );
}

function makeStyles(colors) {
    return StyleSheet.create({
        overlay: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: spacing.xl,
        },
        dialog: {
            width: '100%',
            backgroundColor: colors.surface.containerHigh,
            borderRadius: radius.xl,
            overflow: 'hidden',
        },

        // FROM / TO tabs
        tabBar: {
            flexDirection: 'row',
            backgroundColor: colors.surface.containerHighest,
        },
        tab: {
            flex: 1,
            alignItems: 'center',
            paddingVertical: spacing.lg,
        },
        tabActive: {},
        tabText: {
            ...type.labelL,
            color: colors.text.muted,
            letterSpacing: 1.2,
        },
        tabTextActive: {
            color: colors.text.headline,
            fontWeight: '700',
        },
        tabUnderline: {
            position: 'absolute',
            bottom: 0,
            left: spacing.xl,
            right: spacing.xl,
            height: 2,
            borderRadius: 1,
        },

        // Year + date header
        dateHeader: {
            backgroundColor: colors.surface.containerHighest,
            paddingHorizontal: spacing.xxl,
            paddingBottom: spacing.xl,
        },
        yearText: {
            ...type.bodyM,
            color: colors.text.muted,
            marginBottom: 2,
        },
        dateText: {
            fontSize: 28,
            fontWeight: '700',
            color: colors.text.headline,
            letterSpacing: -0.5,
        },

        // Footer buttons
        footer: {
            flexDirection: 'row',
            justifyContent: 'flex-end',
            paddingHorizontal: spacing.xl,
            paddingVertical: spacing.lg,
            gap: spacing.xxl,
            borderTopWidth: 1,
            borderTopColor: colors.outline.default,
        },
        footerBtn: {
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.md,
        },
        footerBtnText: {
            ...type.labelL,
            fontWeight: '700',
            fontSize: 14,
            letterSpacing: 0.5,
        },
    });
}
