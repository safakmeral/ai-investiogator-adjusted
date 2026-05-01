import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { TextField } from '@/components/TextField';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors, spacing, typography } from '@/lib/theme';
import { login } from '@/lib/auth';

const loginSchema = z.object({
  badge_id: z
    .string()
    .min(3, 'Rozet numarası en az 3 karakter olmalı')
    .max(40, 'Rozet numarası çok uzun'),
  password: z.string().min(4, 'Şifre en az 4 karakter olmalı'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const [submitting, setSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { badge_id: '', password: '' },
  });

  const onSubmit = async (values: LoginForm) => {
    setSubmitting(true);
    try {
      await login(values.badge_id.trim(), values.password);
      // _layout effect Routing'i halleder
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bilinmeyen hata';
      Alert.alert('Giriş başarısız', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.cornerTL} />
        <View style={styles.cornerTR} />
        <View style={styles.cornerBL} />
        <View style={styles.cornerBR} />

        <View style={styles.card}>
          <Text style={styles.title}>AI INVESTIGATOR</Text>
          <Text style={styles.subtitle}>Polis Sorgu Sistemi</Text>
          <View style={styles.divider} />

          <Controller
            control={control}
            name="badge_id"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="ROZET NO"
                placeholder="7742-ALPHA-01"
                autoCapitalize="characters"
                autoCorrect={false}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.badge_id?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="ŞİFRE"
                placeholder="••••••••"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.password?.message}
              />
            )}
          />

          <PrimaryButton
            label="GİRİŞ YAP"
            onPress={handleSubmit(onSubmit)}
            loading={submitting}
            style={{ marginTop: spacing.md }}
          />

          <View style={styles.footer}>
            <Text style={styles.footerLine}>● ENCRYPTED CONNECTION ACTIVE</Text>
            <Text style={styles.footerLine}>UNIT_CONTROL_V.04 // NODE_01</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.background,
  },
  cornerTL: { position: 'absolute', top: 24, left: 24, width: 16, height: 16, borderTopWidth: 1, borderLeftWidth: 1, borderColor: colors.border },
  cornerTR: { position: 'absolute', top: 24, right: 24, width: 16, height: 16, borderTopWidth: 1, borderRightWidth: 1, borderColor: colors.border },
  cornerBL: { position: 'absolute', bottom: 24, left: 24, width: 16, height: 16, borderBottomWidth: 1, borderLeftWidth: 1, borderColor: colors.border },
  cornerBR: { position: 'absolute', bottom: 24, right: 24, width: 16, height: 16, borderBottomWidth: 1, borderRightWidth: 1, borderColor: colors.border },
  card: {
    paddingVertical: spacing.xl,
  },
  title: {
    ...typography.headlineXl,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.labelCaps,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    fontSize: 11,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xl,
  },
  footer: {
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  footerLine: {
    ...typography.labelCaps,
    color: colors.textMuted,
    fontSize: 9,
    marginVertical: 2,
  },
});
