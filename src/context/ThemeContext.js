/**
 * ThemeContext — Global dark/light mode with SQLite persistence
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { getColors } from '../theme';
import { getSetting, saveSetting } from '../lib/database';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
    const [isDark, setIsDark] = useState(true);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        (async () => {
            const saved = await getSetting('theme_mode');
            if (saved === 'light') setIsDark(false);
            setLoaded(true);
        })();
    }, []);

    const toggleTheme = async () => {
        const next = !isDark;
        setIsDark(next);
        await saveSetting('theme_mode', next ? 'dark' : 'light');
    };

    if (!loaded) return null;

    return (
        <ThemeContext.Provider value={{ isDark, toggleTheme, colors: getColors(isDark) }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}
