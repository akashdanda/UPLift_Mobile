/**
 * Uplift theme — black & purple modern fitness palette.
 * Accent violets match the app icon: cool electric purple, bright rim highlights, deep violet shadows.
 */

import { Platform } from 'react-native'

/**
 * Handshake icon palette — blue-leaning violet (not warm magenta-purple).
 * Use these for any purple gradient or accent that should feel “on-brand.”
 */
export const BrandViolet = {
  /** Primary accent on light backgrounds (buttons, links) */
  primary: '#2A1870',
  /** Primary accent on dark backgrounds (tabs, labels) */
  primaryOnDark: '#4A3890',
  /** Logo rim-light / highlight */
  highlight: '#6858A8',
  /** Logo body / mid tone */
  mid: '#3A2880',
  /** Logo deep shadow */
  deep: '#0A0618',
  /** Near-black violet for gradient ends */
  shadow: '#020108',
} as const

const primaryLight = BrandViolet.primary
const primaryDark = BrandViolet.primaryOnDark

// Warm accent for streaks / fire
const warmLight = '#F59E0B'
const warmDark = '#FBBF24'

// Rank medal colors
const gold = '#EAB308'
const silver = '#94A3B8'
const bronze = '#D97706'

export const Colors = {
  light: {
    text: '#1A1025',
    textMuted: '#6B6280',
    background: '#FAF9FC',
    card: '#FFFFFF',
    cardElevated: '#F3F0F8',
    tint: primaryLight,
    warm: warmLight,
    gold,
    silver,
    bronze,
    icon: '#6B6280',
    tabIconDefault: '#A09BB0',
    tabIconSelected: primaryLight,
    tabBarBackground: '#FFFFFF',
    tabBarBorder: 'rgba(94,66,216,0.08)',
  },
  dark: {
    text: '#FFFFFF',
    textMuted: '#8A8A8A',
    background: '#0A0A0A',
    card: '#141414',
    cardElevated: '#1C1C1C',
    tint: primaryDark,
    warm: warmDark,
    gold,
    silver,
    bronze,
    icon: '#8A8A8A',
    tabIconDefault: '#5A5A5A',
    tabIconSelected: primaryDark,
    tabBarBackground: '#0A0A0A',
    tabBarBorder: 'rgba(255,255,255,0.06)',
  },
}

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
})
