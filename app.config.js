// Load .env so EXPO_PUBLIC_* are available
require('dotenv').config();

const appJson = require('./app.json');

module.exports = {
  ...appJson,
  expo: {
    ...appJson.expo,
    plugins: [...(appJson.expo.plugins || []), 'expo-secure-store'],
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