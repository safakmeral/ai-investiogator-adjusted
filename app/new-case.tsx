import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { HeaderBar, IconButton } from '@/components/HeaderBar';
import { TextField } from '@/components/TextField';
import { FileImportField } from '@/components/FileImportField';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors, radius, spacing, typography } from '@/lib/theme';
import { newCaseSchema, type NewCaseFormValues } from '@/lib/validation';
import { createCase, uploadSuspectPhoto } from '@/lib/cases';
import { createSession } from '@/lib/sessions';

const PRESET_CRIMES = ['Cinayet', 'Hırsızlık', 'Dolandırıcılık', 'Diğer'];

export default function NewCaseScreen() {
  const router = useRouter();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [presetSelected, setPresetSelected] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<NewCaseFormValues>({
    resolver: zodResolver(newCaseSchema),
    defaultValues: {
      suspect_tc: '',
      suspect_name: '',
      suspect_surname: '',
      suspect_age: 0,
      suspect_gender: 'erkek',
      crime_type: '',
      crime_scene_notes: '',
      initial_statement: '',
    },
  });

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('İzin gerekli', 'Galeri erişim izni verilmedi.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!res.canceled && res.assets[0]) {
      setPhotoUri(res.assets[0].uri);
    }
  };

  const onSubmit = async (values: NewCaseFormValues) => {
    setSubmitting(true);
    try {
      let photoUrl: string | null = null;
      if (photoUri) {
        try {
          photoUrl = await uploadSuspectPhoto(photoUri, values.suspect_tc);
        } catch (err) {
          console.warn('[new-case] photo upload failed', err);
        }
      }
      const created = await createCase({
        ...values,
        suspect_photo_url: photoUrl,
      });
      const session = await createSession(created.id);
      router.replace(`/session/${created.id}?sessionId=${session.id}`);
    } catch (err) {
      Alert.alert('Hata', err instanceof Error ? err.message : 'Bilinmeyen');
    } finally {
      setSubmitting(false);
    }
  };

  const onPresetPress = (preset: string) => {
    setPresetSelected(preset);
    setValue('crime_type', preset, { shouldValidate: true });
  };

  return (
    <View style={styles.flex}>
      <HeaderBar
        left={
          <IconButton onPress={() => router.back()}>
            <Text style={styles.back}>‹</Text>
          </IconButton>
        }
        title="YENİ VAKA"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable onPress={pickPhoto} style={styles.photoBox}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photoImage} />
            ) : (
              <>
                <Text style={styles.photoIcon}>+</Text>
                <Text style={styles.photoLabel}>FOTOĞRAF EKLE</Text>
              </>
            )}
          </Pressable>

          <Controller
            control={control}
            name="suspect_tc"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="TC KİMLİK NO"
                placeholder="11 haneli numara"
                keyboardType="number-pad"
                maxLength={11}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.suspect_tc?.message}
              />
            )}
          />

          <View style={styles.row2}>
            <Controller
              control={control}
              name="suspect_name"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="AD"
                  placeholder="Ahmet"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.suspect_name?.message}
                  containerStyle={{ flex: 1, marginRight: spacing.sm }}
                />
              )}
            />
            <Controller
              control={control}
              name="suspect_surname"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="SOYAD"
                  placeholder="Yılmaz"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.suspect_surname?.message}
                  containerStyle={{ flex: 1 }}
                />
              )}
            />
          </View>

          <View style={styles.row2}>
            <Controller
              control={control}
              name="suspect_age"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="YAŞ"
                  placeholder="35"
                  keyboardType="number-pad"
                  maxLength={3}
                  value={value ? String(value) : ''}
                  onChangeText={(t) => {
                    const n = parseInt(t.replace(/\D/g, ''), 10);
                    onChange(Number.isNaN(n) ? 0 : n);
                  }}
                  onBlur={onBlur}
                  error={errors.suspect_age?.message}
                  containerStyle={{ width: 96, marginRight: spacing.sm }}
                />
              )}
            />
            <Controller
              control={control}
              name="suspect_gender"
              render={({ field: { onChange, value } }) => (
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>CİNSİYET</Text>
                  <View style={styles.toggleRow}>
                    {(['erkek', 'kadın'] as const).map((g) => {
                      const active = value === g;
                      return (
                        <Pressable
                          key={g}
                          onPress={() => onChange(g)}
                          style={[styles.toggle, active && styles.toggleActive]}
                        >
                          <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                            {g.toUpperCase()}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
            />
          </View>

          <Text style={styles.fieldLabel}>SUÇ TÜRÜ</Text>
          <View style={styles.crimeRow}>
            {PRESET_CRIMES.map((c) => {
              const active = presetSelected === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => onPresetPress(c)}
                  style={[styles.crimePill, active && styles.crimePillActive]}
                >
                  <Text style={[styles.crimePillText, active && styles.crimePillTextActive]}>
                    {c.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Controller
            control={control}
            name="crime_type"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label=""
                placeholder="Suç detaylarını giriniz..."
                value={value}
                onChangeText={(t) => {
                  setPresetSelected(null);
                  onChange(t);
                }}
                onBlur={onBlur}
                error={errors.crime_type?.message}
                containerStyle={{ marginTop: 0 }}
              />
            )}
          />

          <Controller
            control={control}
            name="crime_scene_notes"
            render={({ field: { onChange, onBlur, value } }) => (
              <FileImportField
                label="OLAY YERİ BİLGİLERİ VE KANITLARI"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.crime_scene_notes?.message}
                style={styles.textarea}
              />
            )}
          />
          <Controller
            control={control}
            name="initial_statement"
            render={({ field: { onChange, onBlur, value } }) => (
              <FileImportField
                label="İLK İFADE"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.initial_statement?.message}
                style={styles.textareaLg}
              />
            )}
          />

          <PrimaryButton
            label="SORGUYU BAŞLAT"
            onPress={handleSubmit(onSubmit)}
            loading={submitting}
            style={{ marginTop: spacing.lg }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  back: { color: colors.textPrimary, fontSize: 28, lineHeight: 28 },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    paddingBottom: 80,
  },

  photoBox: {
    alignSelf: 'center',
    width: 120,
    height: 120,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  photoImage: { width: '100%', height: '100%', borderRadius: radius.lg },
  photoIcon: { color: colors.brandBlue, fontSize: 32, marginBottom: 4 },
  photoLabel: { ...typography.labelCaps, color: colors.textSecondary, fontSize: 10 },

  row2: { flexDirection: 'row', alignItems: 'flex-start' },

  fieldLabel: {
    ...typography.labelCaps,
    color: colors.textSecondary,
    fontSize: 11,
    marginBottom: spacing.xs,
  },
  toggleRow: { flexDirection: 'row', gap: spacing.sm },
  toggle: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  toggleActive: {
    backgroundColor: 'rgba(79, 110, 247, 0.15)',
    borderColor: colors.brandBlue,
  },
  toggleText: { ...typography.labelCaps, color: colors.textSecondary, fontSize: 11 },
  toggleTextActive: { color: colors.brandBlue },

  crimeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  crimePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  crimePillActive: {
    backgroundColor: 'rgba(79, 110, 247, 0.15)',
    borderColor: colors.brandBlue,
  },
  crimePillText: { ...typography.labelCaps, color: colors.textSecondary, fontSize: 11 },
  crimePillTextActive: { color: colors.brandBlue },

  textarea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  textareaLg: {
    minHeight: 130,
    textAlignVertical: 'top',
  },
});
