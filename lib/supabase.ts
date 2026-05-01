// =====================================================================
// Supabase Client — Mobil uygulamadan veri tabanı erişimi
// Edge Function'lar service_role kullanır; mobil tarafta anon key + JWT
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL veya EXPO_PUBLIC_SUPABASE_ANON_KEY eksik — .env dosyasını kontrol edin.',
  );
}

// Mobil React Native ortamı için AsyncStorage adaptörü
const reactNativeStorage = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: reactNativeStorage,
    autoRefreshToken: false, // kendi JWT'mizi kullanıyoruz
    persistSession: false,
    detectSessionInUrl: false,
  },
});

// Edge Function çağrı yardımcısı
export async function callEdgeFunction<T = unknown>(
  name: string,
  body: object,
  jwt?: string,
): Promise<T> {
  const url = `${SUPABASE_URL}/functions/v1/${name}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${jwt ?? SUPABASE_ANON_KEY}`,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Edge Function ${name} hata: ${response.status} ${errText}`);
  }

  return (await response.json()) as T;
}
