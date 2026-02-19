/**
 * Uplift theme — black & purple modern fitness palette.
 * Deep blacks with vibrant purple accents, easy on the eyes.
 */

import { Platform } from 'react-native';

// Primary accent: purple (vibrant, modern)
const primaryLight = '#7C3AED';
const primaryDark = '#A78BFA';

// Warm accent for streaks / fire
const warmLight = '#F59E0B';
const warmDark = '#FBBF24';

// Rank medal colors
const gold = '#EAB308';
const silver = '#94A3B8';
const bronze = '#D97706';

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
    tabBarBorder: 'rgba(124,58,237,0.08)',
  },
  dark: {
    text: '#E8E4F0',
    textMuted: '#8B83A0',
    background: '#08060D',
    card: '#13101A',
    cardElevated: '#1C1826',
    tint: primaryDark,
    warm: warmDark,
    gold,
    silver,
    bronze,
    icon: '#8B83A0',
    tabIconDefault: '#5A5370',
    tabIconSelected: primaryDark,
    tabBarBackground: '#0E0B14',
    tabBarBorder: 'rgba(167,139,250,0.10)',
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
