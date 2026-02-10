/**
 * UPLift theme — modern fitness palette with light and dark mode.
 */

import { Platform } from 'react-native';

// Primary accent: teal (energetic, clean)
const primaryLight = '#0D9488';
const primaryDark = '#2DD4BF';

export const Colors = {
  light: {
    text: '#0F172A',
    textMuted: '#64748B',
    background: '#F8FAFC',
    card: '#FFFFFF',
    tint: primaryLight,
    icon: '#64748B',
    tabIconDefault: '#94A3B8',
    tabIconSelected: primaryLight,
    tabBarBackground: '#FFFFFF',
    tabBarBorder: 'rgba(0,0,0,0.06)',
  },
  dark: {
    text: '#F1F5F9',
    textMuted: '#94A3B8',
    background: '#0F172A',
    card: '#1E293B',
    tint: primaryDark,
    icon: '#94A3B8',
    tabIconDefault: '#64748B',
    tabIconSelected: primaryDark,
    tabBarBackground: '#1E293B',
    tabBarBorder: 'rgba(255,255,255,0.08)',
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
