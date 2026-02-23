import { createClient } from '@supabase/supabase-js';
import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';

const isNode =
  typeof process !== 'undefined' && process.versions != null && typeof process.versions.node === 'string';

const memoryStore: Record<string, string> = {};

const ExpoSecureStoreAdapter = isNode
  ? {
      getItem: async (key: string) => memoryStore[key] ?? null,
      setItem: async (_key: string, value: string) => {
        if (value.length > 2048) {
          console.warn('Value being stored is larger than 2048 bytes.');
        }
      },
      removeItem: async () => {},
    }
  : {
      getItem: (key: string) => getItemAsync(key),
      setItem: (key: string, value: string) => {
        if (value.length > 2048) {
          console.warn('Value being stored in SecureStore is larger than 2048 bytes and it may not be stored successfully. In a future SDK version, this call may throw an error.');
        }
        return setItemAsync(key, value);
      },
      removeItem: (key: string) => deleteItemAsync(key),
    };

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  {
    auth: {
      storage: ExpoSecureStoreAdapter as any,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);