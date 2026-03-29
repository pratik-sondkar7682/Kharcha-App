/**
 * OnboardingScreen — First-launch flow
 * Slide 1: Welcome  →  Slide 2: Privacy  →  Slide 3: SMS Permission
 * On completion writes onboarding_done=1 to settings and calls onDone().
 */
import React, { useState, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Dimensions,
    ScrollView, Platform, PermissionsAndroid, StatusBar,
} from 'react-native';
import { saveSetting } from '../lib/database';
import { colors as darkColors, type, radius, spacing } from '../theme';

const { width: SCREEN_W } = Dimensions.get('window');

const SLIDES = [
    {
        emoji: '💰',
        title: 'Know where your\nmoney goes',
        body: 'Kharcha reads your bank SMS to automatically track every UPI, debit, and ATM transaction — no manual entry needed.',
    },
    {
        emoji: '🔒',
        title: 'Your data never\nleaves your phone',
        body: 'All transactions are stored locally on your device. Only merchant names are sent to AI for smarter categorization — never amounts, accounts, or personal details.',
        highlight: 'Zero financial data shared. Ever.',
    },
    {
        emoji: '📩',
        title: 'One permission,\nfull picture',
        body: 'Kharcha needs access to your SMS inbox to read bank messages. We never read personal or OTP messages — only bank transaction alerts.',
        cta: 'Grant SMS Access',
        ctaSecondary: 'Skip for now',
    },
];

export default function OnboardingScreen({ onDone }) {
    const [slide, setSlide] = useState(0);
    const scrollRef = useRef(null);

    const goTo = (index) => {
        setSlide(index);
        scrollRef.current?.scrollTo({ x: index * SCREEN_W, animated: true });
    };

    const handleNext = () => {
        if (slide < SLIDES.length - 1) {
            goTo(slide + 1);
        }
    };

    const finish = async () => {
        await saveSetting('onboarding_done', '1');
        onDone();
    };

    const requestSMSAndFinish = async () => {
        if (Platform.OS === 'android') {
            try {
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.READ_SMS,
                    {
                        title: 'SMS Access',
                        message: 'Kharcha needs to read your bank SMS messages to track transactions automatically.',
                        buttonPositive: 'Allow',
                        buttonNegative: 'Deny',
                    }
                );
                // Whether granted or denied, proceed — DashboardScreen handles denied state
            } catch (e) {
                console.warn('SMS permission request failed:', e);
            }
        }
        await finish();
    };

    const c = darkColors;

    return (
        <View style={st.root}>
            <StatusBar barStyle="light-content" backgroundColor={c.surface.base} />

            {/* Slides */}
            <ScrollView
                ref={scrollRef}
                horizontal
                pagingEnabled
                scrollEnabled={false}
                showsHorizontalScrollIndicator={false}
                style={{ flex: 1 }}
            >
                {SLIDES.map((s, i) => (
                    <View key={i} style={st.slide}>
                        {/* Decorative background blob */}
                        <View style={[st.blob, { opacity: 0.12 + i * 0.04 }]} />

                        <View style={st.emojiWrap}>
                            <Text style={st.emoji}>{s.emoji}</Text>
                        </View>

                        <Text style={st.title}>{s.title}</Text>
                        <Text style={st.body}>{s.body}</Text>

                        {s.highlight && (
                            <View style={st.highlightBox}>
                                <Text style={st.highlightText}>{s.highlight}</Text>
                            </View>
                        )}
                    </View>
                ))}
            </ScrollView>

            {/* Dots */}
            <View style={st.dots}>
                {SLIDES.map((_, i) => (
                    <View
                        key={i}
                        style={[
                            st.dot,
                            i === slide ? st.dotActive : st.dotInactive,
                        ]}
                    />
                ))}
            </View>

            {/* Actions */}
            <View style={st.actions}>
                {slide < SLIDES.length - 1 ? (
                    <>
                        <TouchableOpacity style={st.primaryBtn} onPress={handleNext} activeOpacity={0.8}>
                            <Text style={st.primaryBtnText}>Continue</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={st.ghostBtn} onPress={finish} activeOpacity={0.7}>
                            <Text style={st.ghostBtnText}>Skip setup</Text>
                        </TouchableOpacity>
                    </>
                ) : (
                    <>
                        <TouchableOpacity style={st.primaryBtn} onPress={requestSMSAndFinish} activeOpacity={0.8}>
                            <Text style={st.primaryBtnText}>{SLIDES[slide].cta}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={st.ghostBtn} onPress={finish} activeOpacity={0.7}>
                            <Text style={st.ghostBtnText}>{SLIDES[slide].ctaSecondary}</Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>
        </View>
    );
}

const c = darkColors;

const st = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: c.surface.base,
        paddingBottom: Platform.OS === 'android' ? 32 : 48,
    },
    slide: {
        width: SCREEN_W,
        flex: 1,
        paddingHorizontal: spacing.xxl + spacing.md,
        paddingTop: 80,
        alignItems: 'center',
    },
    blob: {
        position: 'absolute',
        top: -80,
        right: -80,
        width: 320,
        height: 320,
        borderRadius: 160,
        backgroundColor: c.primary.main,
    },
    emojiWrap: {
        width: 96,
        height: 96,
        borderRadius: radius.xxl,
        backgroundColor: c.primary.container,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacing.xxl + spacing.md,
    },
    emoji: { fontSize: 44 },
    title: {
        ...type.displayS,
        color: c.text.headline,
        textAlign: 'center',
        marginBottom: spacing.xl,
        lineHeight: 34,
    },
    body: {
        ...type.bodyL,
        color: c.text.body,
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: spacing.xl,
    },
    highlightBox: {
        backgroundColor: c.secondary.container,
        borderRadius: radius.lg,
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.md,
        marginTop: spacing.sm,
    },
    highlightText: {
        ...type.labelL,
        color: c.secondary.onContainer,
        textAlign: 'center',
    },

    // Dots
    dots: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: spacing.sm,
        marginBottom: spacing.xl,
    },
    dot: {
        height: 8,
        borderRadius: radius.full,
    },
    dotActive: {
        width: 24,
        backgroundColor: c.primary.main,
    },
    dotInactive: {
        width: 8,
        backgroundColor: c.outline.variant,
    },

    // Buttons
    actions: {
        paddingHorizontal: spacing.xxl,
        gap: spacing.md,
    },
    primaryBtn: {
        backgroundColor: c.primary.main,
        borderRadius: radius.full,
        paddingVertical: spacing.lg,
        alignItems: 'center',
    },
    primaryBtnText: {
        ...type.labelL,
        fontSize: 16,
        color: '#FFFFFF',
        fontWeight: '700',
    },
    ghostBtn: {
        paddingVertical: spacing.md,
        alignItems: 'center',
    },
    ghostBtnText: {
        ...type.labelM,
        fontSize: 13,
        color: c.text.muted,
    },
});
