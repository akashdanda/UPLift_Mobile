/**
 * UPLift theme — modern fitness palette with light and dark mode.
 * 2026 refresh: two-tier cards, warm accent for streaks, softer whites.
 */

import { Platform } from 'react-native';

// Primary accent: teal (energetic, clean)
const primaryLight = '#0D9488';
const primaryDark = '#2DD4BF';

// Warm accent for streaks / fire
const warmLight = '#EA580C';
const warmDark = '#F97316';

// Rank medal colors
const gold = '#EAB308';
const silver = '#94A3B8';
const bronze = '#D97706';

export const Colors = {
  light: {
    text: '#0F172A',
    textMuted: '#64748B',
    background: '#F8FAFC',
    card: '#FFFFFF',
    cardElevated: '#F1F5F9',
    tint: primaryLight,
    warm: warmLight,
    gold,
    silver,
    bronze,
    icon: '#64748B',
    tabIconDefault: '#94A3B8',
    tabIconSelected: primaryLight,
    tabBarBackground: '#FFFFFF',
    tabBarBorder: 'rgba(0,0,0,0.06)',
  },
  dark: {
    text: '#E2E8F0',
    textMuted: '#94A3B8',
    background: '#0F172A',
    card: '#1E293B',
    cardElevated: '#253548',
    tint: primaryDark,
    warm: warmDark,
    gold,
    silver,
    bronze,
    icon: '#94A3B8',
    tabIconDefault: '#64748B',
    tabIconSelected: primaryDark,
    tabBarBackground: '#1E293B',
    tabBarBorder: 'rgba(255,255,255,0.06)',
  },
};

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
});
