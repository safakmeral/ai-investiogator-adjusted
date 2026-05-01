import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { colors, radius, spacing, typography } from '@/lib/theme';
import { callEdgeFunction } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store';

interface Props extends TextInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  containerStyle?: ViewStyle;
  importHint?: string;
}

const TEXT_LIKE_EXT = ['.txt', '.md', '.csv', '.log'];

function isTextLike(name: string | null | undefined, mime: string | null | undefined): boolean {
  if (mime?.startsWith('text/')) return true;
  if (!name) return false;
  const lower = name.toLowerCase();
  return TEXT_LIKE_EXT.some((ext) => lower.endsWith(ext));
}

function inferMime(name: string | null | undefined, fallback: string | null | undefined): string | null {
  if (fallback) return fallback;
  if (!name) return null;
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.md')) return 'text/markdown';
  return null;
}

export function FileImportField({
  label,
  value,
  onChangeText,
  error,
  containerStyle,
  style,
  importHint = 'PDF, görsel veya .txt dosyası',
  ...rest
}: Props) {
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);

  const onPickFile = async () => {
    try {
      setBusy(true);
      setBusyMsg('Dosya seçiliyor...');
      const result = await DocumentPicker.getDocumentAsync({
        type: ['*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      const mime = inferMime(asset.name, asset.mimeType);

      // 1) Düz metin → direkt oku
      if (isTextLike(asset.name, mime)) {
        setBusyMsg('Metin okunuyor...');
        const content = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        const trimmed = content.replace(/\r\n/g, '\n').trim();
        if (!trimmed) {
          Alert.alert('Boş dosya', 'Seçilen dosyada okunabilir metin yok.');
          return;
        }
        onChangeText(trimmed);
        setFileName(asset.name ?? 'dosya.txt');
        return;
      }

      // 2) PDF / Görsel → server-side Gemini extract
      if (
        mime === 'application/pdf' ||
        mime === 'image/png' ||
        mime === 'image/jpeg' ||
        mime === 'image/webp' ||
        mime === 'image/heic'
      ) {
        const jwt = useAuthStore.getState().jwt;
        if (!jwt) {
          Alert.alert('Oturum yok', 'Lütfen tekrar giriş yapın.');
          return;
        }

        setBusyMsg('Dosya yükleniyor...');
        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        // ~8MB ham (10.7MB base64) — server-side de kontrol var ama fail-fast
        if (base64.length > 11 * 1024 * 1024) {
          Alert.alert(
            'Dosya çok büyük',
            'En fazla 8MB dosya yükleyebilirsin. Lütfen daha küçük bir dosya seç.',
          );
          return;
        }

        setBusyMsg('Metin çıkarılıyor (yapay zeka)...');
        const response = await callEdgeFunction<{ text: string; char_count: number }>(
          'extract-text',
          {
            file_base64: base64,
            mime_type: mime,
            file_name: asset.name ?? null,
          },
          jwt,
        );

        const extracted = (response.text ?? '').trim();
        if (!extracted) {
          Alert.alert('Metin bulunamadı', 'Dosyadan okunabilir metin çıkarılamadı.');
          return;
        }
        onChangeText(extracted);
        setFileName(asset.name ?? 'dosya');
        return;
      }

      // 3) Desteklenmeyen
      Alert.alert(
        'Desteklenmiyor',
        `Bu dosya türü desteklenmiyor (${mime ?? 'bilinmiyor'}). ` +
          'PDF, görsel (PNG/JPEG) veya düz metin (.txt) kullanın.',
      );
    } catch (err) {
      Alert.alert(
        'Dosya işlenemedi',
        err instanceof Error ? err.message : 'Bilinmeyen hata',
      );
    } finally {
      setBusy(false);
      setBusyMsg('');
    }
  };

  const onClear = () => {
    setFileName(null);
    onChangeText('');
  };

  return (
    <View style={[styles.container, containerStyle]}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.actions}>
          {fileName && !busy ? (
            <Pressable onPress={onClear} style={styles.clearBtn}>
              <Text style={styles.clearText}>TEMİZLE</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onPickFile}
            disabled={busy}
            style={[styles.importBtn, busy && { opacity: 0.5 }]}
          >
            {busy ? (
              <ActivityIndicator color={colors.brandBlue} size="small" />
            ) : (
              <Text style={styles.importText}>+ DOSYA İÇE AKTAR</Text>
            )}
          </Pressable>
        </View>
      </View>

      {busy && busyMsg ? (
        <Text style={styles.busyMsg}>{busyMsg}</Text>
      ) : fileName ? (
        <View style={styles.fileBadge}>
          <Text style={styles.fileBadgeIcon}>📄</Text>
          <Text style={styles.fileBadgeName} numberOfLines={1}>
            {fileName}
          </Text>
        </View>
      ) : null}

      <TextInput
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={(t) => {
          if (fileName && t !== value) setFileName(null);
          onChangeText(t);
        }}
        multiline
        textAlignVertical="top"
        editable={!busy}
        style={[styles.input, error ? styles.inputError : null, style]}
        {...rest}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  label: {
    ...typography.labelCaps,
    color: colors.textSecondary,
    fontSize: 11,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  importBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.brandBlue,
    backgroundColor: 'rgba(79, 110, 247, 0.1)',
    minWidth: 36,
    alignItems: 'center',
  },
  importText: {
    ...typography.labelCaps,
    color: colors.brandBlue,
    fontSize: 9,
  },
  clearBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clearText: {
    ...typography.labelCaps,
    color: colors.textSecondary,
    fontSize: 9,
  },
  hint: {
    ...typography.labelCaps,
    color: colors.textMuted,
    fontSize: 9,
    marginBottom: spacing.xs,
  },
  busyMsg: {
    ...typography.labelCaps,
    color: colors.brandBlue,
    fontSize: 9,
    marginBottom: spacing.xs,
  },
  fileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.brandBlue,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    marginBottom: spacing.xs,
  },
  fileBadgeIcon: { fontSize: 12 },
  fileBadgeName: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    fontSize: 12,
    flex: 1,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    minHeight: 110,
    ...typography.bodyMd,
  },
  inputError: {
    borderColor: colors.brandRed,
  },
  error: {
    ...typography.bodyMd,
    color: colors.brandRed,
    fontSize: 12,
    marginTop: 4,
  },
});
