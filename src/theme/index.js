/**
 * Kharcha Design System — Material 3 Expressive Theme
 * Inspired by Google's Material 3 Expressive / Stitch design language:
 * - Bold, rounded shapes (32dp+ corners)
 * - Vibrant, saturated color palette
 * - Emphasized typography with large weights
 * - Expressive containers with semantic colors
 * - Playful, organic feel
 */

export const colors = {
  // Surface layers — warm deep tones
  surface: {
    base: '#0F1116',           // Darkest background
    container: '#1B1D24',      // Card backgrounds
    containerHigh: '#252830',  // Elevated cards/modals
    containerHighest: '#2F323B', // Active states
    dim: '#13151B',            // Slightly lighter than base
  },
  // Primary — expressive purple-blue gradient feel
  primary: {
    main: '#A78BFA',           // Vivid lavender
    container: '#2D2254',      // Dark purple container
    onContainer: '#D4BBFF',    // Text on dark container
    bright: '#C4B5FD',         // Highlighted primary
    dim: '#7C3AED',            // Pressed/active state
  },
  // Secondary — mint/teal accent  
  secondary: {
    main: '#34D399',           // Mint green
    container: '#1A3D2F',      // Dark green container
    onContainer: '#6EE7B7',    // Text on container
  },
  // Tertiary — warm coral
  tertiary: {
    main: '#FB7185',           // Coral pink
    container: '#3D1A23',      // Dark coral container
    onContainer: '#FCA5B3',    // Text on container
  },
  // Semantic
  income: '#34D399',           // Green — money received
  expense: '#FB7185',          // Coral — money spent
  warning: '#FBBF24',         // Amber — budget warning
  // Text — clear hierarchy
  text: {
    headline: '#F5F5F7',       // Brightest — headlines
    body: '#D1D5DB',           // Body text
    secondary: '#9CA3AF',      // Secondary info
    muted: '#6B7280',          // Least emphasis
  },
  // Borders & dividers
  outline: {
    default: 'rgba(255,255,255,0.07)',
    variant: 'rgba(255,255,255,0.12)',
    focus: 'rgba(167,139,250,0.4)',
  },
  // Category colors — vibrant, accessible, M3 Expressive style
  category: {
    food: '#F97316',  // Warm orange
    shopping: '#F472B6',  // Pink
    transport: '#60A5FA',  // Sky blue
    bills: '#A78BFA',  // Lavender
    health: '#2DD4BF',  // Teal
    entertainment: '#E879F9',  // Magenta
    transfers: '#818CF8',  // Indigo
    rent: '#34D399',  // Emerald
    education: '#4ADE80',  // Lime green
    groceries: '#FBBF24',  // Amber
    uncategorized: '#6B7280',  // Gray
    refund: '#34D399',  // Green
    investment: '#8B5CF6', // Purple
    internal_transfer: '#9CA3AF', // Neutral gray
    hardware: '#D97706', // Dark amber/brown
    atm: '#F59E0B', // Amber — cash
  },
};

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
};
