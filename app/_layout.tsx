import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuthStore } from '@/lib/store';
import { colors } from '@/lib/theme';
import type { Officer } from '@/lib/types';

const STORAGE_KEY = 'ai_investigator_auth_v1';

export default function RootLayout() {
  const { officer, jwt, setAuth, hydrated, setHydrated } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  // Mount: AsyncStorage'dan oturumu yükle
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { officer: Officer; jwt: string };
          if (parsed.officer && parsed.jwt) {
            setAuth(parsed.officer, parsed.jwt);
          }
        }
      } catch {
        // storage erişimi başarısızsa sessizce login'e düşeriz
      } finally {
        setHydrated(true);
      }
    })();
  }, [setAuth, setHydrated]);

  // Oturum değiştikçe AsyncStorage'a yaz
  useEffect(() => {
    if (!hydrated) return;
    if (officer && jwt) {
      AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ officer, jwt }),
      ).catch(() => {});
    } else {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    }
  }, [officer, jwt, hydrated]);

  // Yönlendirme: oturumsuz -> login, oturumlu -> ana sayfa
  useEffect(() => {
    if (!hydrated) return;
    const inAuthGroup = segments[0] === 'login';
    if (!officer && !inAuthGroup) {
      router.replace('/login');
    } else if (officer && inAuthGroup) {
      router.replace('/');
    }
  }, [hydrated, officer, segments, router]);

  if (!hydrated) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: 'fade',
          }}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
