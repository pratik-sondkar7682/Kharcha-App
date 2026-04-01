/**
 * Kharcha Design System — Material 3 Expressive Theme
 * Inspired by Google's Material 3 Expressive / Stitch design language:
 * - Bold, rounded shapes (32dp+ corners)
 * - Vibrant, saturated color palette
 * - Emphasized typography with large weights
 * - Expressive containers with semantic colors
 * - Playful, organic feel
 */

// Category colors for dark mode (vivid, high contrast on dark surfaces)
const categoryColors = {
  food: '#F97316',
  shopping: '#F472B6',
  transport: '#60A5FA',
  bills: '#A78BFA',
  health: '#2DD4BF',
  entertainment: '#E879F9',
  transfers: '#818CF8',
  rent: '#34D399',
  education: '#4ADE80',
  groceries: '#FBBF24',
  uncategorized: '#6B7280',
  refund: '#34D399',
  investment: '#8B5CF6',
  internal_transfer: '#9CA3AF',
  hardware: '#D97706',
  atm: '#F59E0B',
  credit_card: '#38BDF8',
};

// Category colors for light mode (deeper, readable on white surfaces)
const lightCategoryColors = {
  food: '#C2410C',
  shopping: '#BE185D',
  transport: '#1D4ED8',
  bills: '#6D28D9',
  health: '#0F766E',
  entertainment: '#7E22CE',
  transfers: '#4338CA',
  rent: '#047857',
  education: '#15803D',
  groceries: '#B45309',
  uncategorized: '#4B5563',
  refund: '#047857',
  investment: '#5B21B6',
  internal_transfer: '#6B7280',
  hardware: '#92400E',
  atm: '#92400E',
  credit_card: '#0369A1',
};

const darkColors = {
  surface: {
    base: '#0F1116',
    container: '#1B1D24',
    containerHigh: '#252830',
    containerHighest: '#2F323B',
    dim: '#13151B',
  },
  primary: {
    main: '#A78BFA',
    container: '#2D2254',
    onContainer: '#D4BBFF',
    bright: '#C4B5FD',
    dim: '#7C3AED',
  },
  secondary: {
    main: '#34D399',
    container: '#1A3D2F',
    onContainer: '#6EE7B7',
  },
  tertiary: {
    main: '#FB7185',
    container: '#3D1A23',
    onContainer: '#FCA5B3',
  },
  income: '#34D399',
  expense: '#FB7185',
  warning: '#FBBF24',
  text: {
    headline: '#F5F5F7',
    body: '#D1D5DB',
    secondary: '#9CA3AF',
    muted: '#6B7280',
  },
  outline: {
    default: 'rgba(255,255,255,0.07)',
    variant: 'rgba(255,255,255,0.12)',
    focus: 'rgba(167,139,250,0.4)',
  },
  category: categoryColors,
};

const lightColors = {
  surface: {
    base: '#F0F2F8',
    container: '#FFFFFF',
    containerHigh: '#E4E7F0',
    containerHighest: '#D2D6E4',
    dim: '#E8EBF3',
  },
  primary: {
    main: '#6D28D9',
    container: '#EDE9FE',
    onContainer: '#4C1D95',
    bright: '#5B21B6',
    dim: '#4C1D95',
  },
  secondary: {
    main: '#047857',
    container: '#CCFBF1',
    onContainer: '#064E3B',
  },
  tertiary: {
    main: '#BE123C',
    container: '#FFE4E6',
    onContainer: '#881337',
  },
  income: '#047857',
  expense: '#BE123C',
  warning: '#B45309',
  text: {
    headline: '#0D0F14',
    body: '#1F2937',
    secondary: '#4B5563',
    muted: '#6B7280',
  },
  outline: {
    default: 'rgba(0,0,0,0.10)',
    variant: 'rgba(0,0,0,0.16)',
    focus: 'rgba(109,40,217,0.35)',
  },
  category: lightCategoryColors,
};

export function getColors(isDark = true) {
  return isDark ? darkColors : lightColors;
}

// Default export — dark mode (backwards compat for static imports)
export const colors = darkColors;

// M3 Expressive: larger, bolder corner radii
export const radius = {
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  full: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
};

// M3 Expressive: bold, emphasized typography
export const type = {
  displayL: { fontSize: 40, fontWeight: '800', letterSpacing: -1.2 },
  displayM: { fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  displayS: { fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  headlineL: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  headlineM: { fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
  headlineS: { fontSize: 16, fontWeight: '600', letterSpacing: 0 },
  bodyL: { fontSize: 16, fontWeight: '400', letterSpacing: 0.1 },
  bodyM: { fontSize: 14, fontWeight: '400', letterSpacing: 0.1 },
  bodyS: { fontSize: 12, fontWeight: '400', letterSpacing: 0.2 },
  labelL: { fontSize: 14, fontWeight: '600', letterSpacing: 0.2 },
  labelM: { fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
  labelS: { fontSize: 10, fontWeight: '600', letterSpacing: 0.4 },
};

// Category metadata: icons + colors + labels (emoji for now)
export const CATEGORIES = {
  food: { label: 'Food & Dining', icon: '🍕', color: colors.category.food },
  shopping: { label: 'Shopping', icon: '🛍️', color: colors.category.shopping },
  transport: { label: 'Transport', icon: '🚗', color: colors.category.transport },
  bills: { label: 'Bills & Utilities', icon: '💡', color: colors.category.bills },
  health: { label: 'Health', icon: '🏥', color: colors.category.health },
  entertainment: { label: 'Entertainment', icon: '🎬', color: colors.category.entertainment },
  transfers: { label: 'Transfers', icon: '💸', color: colors.category.transfers },
  rent: { label: 'Rent & EMI', icon: '🏠', color: colors.category.rent },
  education: { label: 'Education', icon: '📚', color: colors.category.education },
  groceries: { label: 'Groceries', icon: '🥬', color: colors.category.groceries },
  uncategorized: { label: 'Uncategorized', icon: '❓', color: colors.category.uncategorized },
  refund: { label: 'Refund', icon: '↩️', color: colors.category.refund },
  investment: { label: 'Investment', icon: '📈', color: colors.category.investment },
  internal_transfer: { label: 'Self Transfer', icon: '🔄', color: colors.category.internal_transfer },
  hardware: { label: 'Hardware', icon: '🔨', color: colors.category.hardware },
  atm: { label: 'ATM / Cash', icon: '🏧', color: colors.category.atm },
  credit_card: { label: 'Credit Card', icon: '💳', color: colors.category.credit_card },
};
