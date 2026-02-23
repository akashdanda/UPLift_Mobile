// Load .env so EXPO_PUBLIC_* are available
require('dotenv').config();

const appJson = require('./app.json');

// Only include expo-notifications plugin if the package is installed (avoids PluginError after fresh clone before npm install)
const basePlugins = appJson.expo.plugins || [];
const hasNotifications = basePlugins.some(
  (p) => p === 'expo-notifications' || (Array.isArray(p) && p[0] === 'expo-notifications')
);
const plugins = [
  ...basePlugins.filter(
    (p) => p !== 'expo-notifications' && (!Array.isArray(p) || p[0] !== 'expo-notifications')
  ),
  'expo-secure-store',
];
try {
  require.resolve('expo-notifications');
  if (hasNotifications) {
    const notifEntry = basePlugins.find(
      (p) => p === 'expo-notifications' || (Array.isArray(p) && p[0] === 'expo-notifications')
    );
    plugins.push(notifEntry);
  }
} catch {
  // expo-notifications not installed; skip plugin so app can start (run npm install to enable push)
}

module.exports = {
  ...appJson,
  expo: {
    ...appJson.expo,
    updates: {
      url: 'https://u.expo.dev/366563bc-3d64-4420-8890-a2f21fc33b3c',
    },
    runtimeVersion: {
      policy: 'appVersion',
    },
    plugins,
    extra: {
      ...appJson.expo.extra,
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      eas: {
        projectId:
          process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
          appJson.expo.extra?.eas?.projectId ??
          '366563bc-3d64-4420-8890-a2f21fc33b3c',
      },
    },
  },
};