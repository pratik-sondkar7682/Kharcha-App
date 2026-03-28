/**
 * AppNavigator — Refined bottom tab navigation
 * Clean icon-label layout, sharp active indicator, no borders
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet, Platform } from 'react-native';
import DashboardScreen from '../screens/DashboardScreen';
import InsightsScreen from '../screens/InsightsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { colors, type, radius, spacing } from '../theme';

const Tab = createBottomTabNavigator();

const TABS = [
    { name: 'Dashboard', icon: '◈', iconActive: '◈', label: 'Home' },
    { name: 'Insights',  icon: '◎', iconActive: '◎', label: 'Insights' },
    { name: 'Settings',  icon: '⊙', iconActive: '⊙', label: 'Settings' },
];

const TabIcon = ({ icon, label, focused }) => (
    <View style={[st.tabItem, focused && st.tabItemActive]}>
        <Text style={[st.icon, focused && st.iconActive]}>{icon}</Text>
        <Text style={[st.label, focused && st.labelActive]}>{label}</Text>
    </View>
);

export default function AppNavigator() {
    return (
        <NavigationContainer>
            <Tab.Navigator
                screenOptions={{
                    headerShown: false,
                    tabBarStyle: st.bar,
                    tabBarShowLabel: false,
                    tabBarHideOnKeyboard: true,
                }}
            >
                <Tab.Screen
                    name="Dashboard"
                    component={DashboardScreen}
                    options={{ tabBarIcon: ({ focused }) => <TabIcon icon="⊞" label="Home" focused={focused} /> }}
                />
                <Tab.Screen
                    name="Insights"
                    component={InsightsScreen}
                    options={{ tabBarIcon: ({ focused }) => <TabIcon icon="◎" label="Insights" focused={focused} /> }}
                />
                <Tab.Screen
                    name="Settings"
                    component={SettingsScreen}
                    options={{ tabBarIcon: ({ focused }) => <TabIcon icon="⊙" label="Settings" focused={focused} /> }}
                />
            </Tab.Navigator>
        </NavigationContainer>
    );
}

const st = StyleSheet.create({
    bar: {
        backgroundColor: colors.surface.containerHigh,
        borderTopWidth: 0,
        height: Platform.OS === 'android' ? 68 : 82,
        paddingBottom: Platform.OS === 'android' ? 10 : 24,
        paddingTop: 8,
        elevation: 0,
        shadowOpacity: 0,
        // Subtle top separator
        borderTopWidth: 1,
        borderTopColor: colors.outline.default,
    },
    tabItem: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.xs + 2,
        borderRadius: radius.lg,
        minWidth: 72,
        gap: 3,
    },
    tabItemActive: {
        backgroundColor: colors.primary.container,
    },
    icon: {
        fontSize: 22,
        color: colors.text.muted,
        lineHeight: 26,
    },
    iconActive: {
        color: colors.primary.main,
    },
    label: {
        ...type.labelS,
        color: colors.text.muted,
        fontSize: 10,
    },
    labelActive: {
        color: colors.primary.onContainer,
        fontWeight: '700',
    },
});
