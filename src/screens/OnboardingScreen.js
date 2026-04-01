/**
 * OnboardingScreen — First-launch flow
 * Slide 1: Welcome  →  Slide 2: Privacy  →  Slide 3: SMS Permission
 * On completion writes onboarding_done=1 to settings and calls onDone().
 */
import React, { useState, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Dimensions,
    ScrollView, Platform, PermissionsAndroid, StatusBar, TextInput,
} from 'react-native';
import { saveSetting, reCategorizeByName } from '../lib/database';
import { colors as darkColors, type, radius, spacing } from '../theme';

const { width: SCREEN_W } = Dimensions.get('window');

const SLIDES = [
    {
        emoji: '⚡',
        title: 'Your expenses,\nautomatically tracked',
        body: 'Kharcha reads your bank SMS and logs every UPI, debit, and ATM transaction the moment it happens — no manual entry, no linking bank accounts.',
        highlight: 'Works with ICICI, HDFC, Axis, SBI, Kotak & more.',
    },
    {
        emoji: '📊',
        title: 'Instant clarity on\nyour spending',
        body: 'See exactly where your money goes — broken down by category, merchant, and month. Spot patterns you never noticed before.',
        highlight: 'Food, groceries, transport, bills — sorted automatically.',
    },
    {
        emoji: '🔒',
        title: 'Built for privacy,\nnot data collection',
        body: 'Your transactions never leave your phone. Kharcha stores everything locally — amounts, accounts, and dates stay on your device, always.',
        highlight: 'Only merchant names touch the internet — to label them correctly.',
    },
    {
        emoji: '👤',
        title: "What's your name?",
        body: 'Kharcha uses your name to detect transfers to yourself — like moving money between your own accounts — and keeps them separate from your spending.',
        nameInput: true,
    },
    {
        emoji: '📩',
        title: 'Allow SMS access\nto get started',
        body: "Kharcha only reads messages from your bank — never OTPs, never personal chats. You'll see Android's permission dialog next. Tap Allow to begin.",
        cta: 'Grant SMS Access',
        ctaSecondary: 'Skip for now',
    },
];

export default function OnboardingScreen({ onDone }) {
    const [slide, setSlide] = useState(0);
    const [fullName, setFullName] = useState('');
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

    const saveName = async () => {
        if (fullName.trim()) {
            await saveSetting('user_full_name', fullName.trim());
            await reCategorizeByName(fullName.trim(), null);
        }
    };

    const finish = async () => {
        await saveName();
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

                        {s.nameInput && (
                            <TextInput
                                style={st.nameInput}
                                placeholder="e.g. PRATIK SONDKAR"
                                placeholderTextColor={c.text.muted}
                                value={fullName}
                                onChangeText={setFullName}
                                autoCapitalize="characters"
                                returnKeyType="done"
                                onSubmitEditing={handleNext}
                            />
                        )}

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
    nameInput: {
        width: '100%',
        backgroundColor: c.surface.container,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: c.outline.variant,
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.lg,
        color: c.text.headline,
        ...type.bodyL,
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
