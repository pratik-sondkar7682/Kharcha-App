/**
 * AppNavigator — Bottom tab navigation
 * Ionicons + active dot indicator, no pill background
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { FilterProvider } from '../context/FilterContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DashboardScreen from '../screens/DashboardScreen';
import InsightsScreen from '../screens/InsightsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { type, radius, spacing } from '../theme';

const Tab = createBottomTabNavigator();

const TABS = [
    { name: 'Dashboard', label: 'Home',     iconActive: 'wallet',          iconInactive: 'wallet-outline' },
    { name: 'Insights',  label: 'Insights', iconActive: 'bar-chart',       iconInactive: 'bar-chart-outline' },
    { name: 'Settings',  label: 'Settings', iconActive: 'settings',        iconInactive: 'settings-outline' },
];

const SCREENS = {
    Dashboard: DashboardScreen,
    Insights:  InsightsScreen,
    Settings:  SettingsScreen,
};

function TabIcon({ iconActive, iconInactive, label, focused, colors }) {
    return (
        <View style={styles.tabItem}>
            <Ionicons
                name={focused ? iconActive : iconInactive}
                size={24}
                color={focused ? colors.primary.main : colors.text.muted}
            />
            <Text style={[styles.label, { color: focused ? colors.primary.main : colors.text.muted, fontWeight: focused ? '700' : '400' }]}>
                {label}
            </Text>
            {focused && <View style={[styles.dot, { backgroundColor: colors.primary.main }]} />}
        </View>
    );
}

function Navigator() {
    const { colors } = useTheme();

    const barStyle = {
        backgroundColor: colors.surface.containerHigh,
        borderTopWidth: 1,
        borderTopColor: colors.outline.default,
        height: Platform.OS === 'android' ? 68 : 82,
        paddingBottom: Platform.OS === 'android' ? 10 : 24,
        paddingTop: 8,
        elevation: 8,
        shadowOpacity: 0,
    };

    return (
        <Tab.Navigator
            screenOptions={{
                headerShown: false,
                tabBarStyle: barStyle,
                tabBarShowLabel: false,
                tabBarHideOnKeyboard: true,
            }}
        >
            {TABS.map(tab => (
                <Tab.Screen
                    key={tab.name}
                    name={tab.name}
                    component={SCREENS[tab.name]}
                    options={{
                        tabBarIcon: ({ focused }) => (
                            <TabIcon {...tab} focused={focused} colors={colors} />
                        ),
                    }}
                />
            ))}
        </Tab.Navigator>
    );
}

export default function AppNavigator() {
    return (
        <ThemeProvider>
            <FilterProvider>
                <NavigationContainer>
                    <Navigator />
                </NavigationContainer>
            </FilterProvider>
        </ThemeProvider>
    );
}

const styles = StyleSheet.create({
    tabItem: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        minWidth: 64,
    },
    label: {
        ...type.labelS,
        fontSize: 10,
        letterSpacing: 0.2,
    },
    dot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        marginTop: 2,
    },
});
