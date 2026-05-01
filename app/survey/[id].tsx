import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { HeaderBar, IconButton } from '@/components/HeaderBar';
import { StarRating } from '@/components/StarRating';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors, radius, spacing, typography } from '@/lib/theme';
import { saveSurvey } from '@/lib/sessions';
import type { SurveyResponse } from '@/lib/types';

export default function SurveyScreen() {
  const router = useRouter();
  const { id: sessionId } = useLocalSearchParams<{ id: string }>();
  const [submitting, setSubmitting] = useState(false);

  const [questionQuality, setQuestionQuality] = useState(0);
  const [contradictionAccuracy, setContradictionAccuracy] = useState(0);
  const [helpfulness, setHelpfulness] = useState(0);
  const [verdict, setVerdict] = useState<'suçlu' | 'suçsuz' | null>(null);
  const [notes, setNotes] = useState('');

  const onSubmit = async () => {
    if (!sessionId) return;
    if (!questionQuality || !contradictionAccuracy || !helpfulness) {
      Alert.alert('Eksik', 'Lütfen tüm yıldız değerlendirmelerini doldurun.');
      return;
    }
    setSubmitting(true);
    try {
      const responses: SurveyResponse = {
        question_quality: questionQuality,
        contradiction_accuracy: contradictionAccuracy,
        helpfulness,
        is_guilty: verdict,
        notes: notes.trim(),
      };
      await saveSurvey(sessionId, responses as unknown as Record<string, unknown>);
      router.replace('/');
    } catch (err) {
      Alert.alert('Hata', err instanceof Error ? err.message : 'Bilinmeyen');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.flex}>
      <HeaderBar
        left={
          <IconButton onPress={() => router.replace('/')}>
            <Text style={styles.back}>‹</Text>
          </IconButton>
        }
        title="DEĞERLENDİRME"
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>SORGU DEĞERLENDİRMESİ</Text>
        <Text style={styles.subtitle}>
          Sorgu tamamlandı. Lütfen değerlendirmenizi yapın.
        </Text>

        <Card>
          <Text style={styles.cardLabel}>Soruların kalitesini değerlendirin</Text>
          <StarRating value={questionQuality} onChange={setQuestionQuality} />
        </Card>

        <Card>
          <Text style={styles.cardLabel}>Çelişki tespitleri ne kadar doğruydu?</Text>
          <StarRating value={contradictionAccuracy} onChange={setContradictionAccuracy} />
        </Card>

        <Card>
          <Text style={styles.cardLabel}>Sistem genel olarak ne kadar yardımcı oldu?</Text>
          <StarRating value={helpfulness} onChange={setHelpfulness} />
        </Card>

        <Card>
          <Text style={styles.cardLabel}>Şüpheli gerçekten suçlu muydur?</Text>
          <View style={styles.verdictRow}>
            <Pressable
              onPress={() => setVerdict('suçlu')}
              style={[
                styles.verdict,
                styles.verdictGuilty,
                verdict === 'suçlu' && styles.verdictGuiltyActive,
              ]}
            >
              <Text style={[styles.verdictText, verdict === 'suçlu' && { color: colors.brandRed }]}>
                SUÇLU
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setVerdict('suçsuz')}
              style={[
                styles.verdict,
                styles.verdictInnocent,
                verdict === 'suçsuz' && styles.verdictInnocentActive,
              ]}
            >
              <Text
                style={[
                  styles.verdictText,
                  verdict === 'suçsuz' && { color: colors.brandGreen },
                ]}
              >
                SUÇSUZ
              </Text>
            </Pressable>
          </View>
        </Card>

        <Card>
          <Text style={styles.cardLabel}>Ek notlar (isteğe bağlı)</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Sorgu sürecine dair gözlemlerinizi girin..."
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={5}
            style={styles.textarea}
          />
        </Card>

        <PrimaryButton
          label="DEĞERLENDİRMEYİ KAYDET"
          onPress={onSubmit}
          loading={submitting}
          style={{ marginTop: spacing.lg }}
        />
      </ScrollView>
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  back: { color: colors.textPrimary, fontSize: 28 },
  scroll: { padding: spacing.lg, paddingBottom: 60 },

  title: {
    ...typography.headlineMd,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  cardLabel: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },

  verdictRow: { flexDirection: 'row', gap: spacing.sm },
  verdict: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    alignItems: 'center',
  },
  verdictGuilty: { borderColor: colors.border },
  verdictGuiltyActive: {
    borderColor: colors.brandRed,
    backgroundColor: 'rgba(224,82,82,0.10)',
  },
  verdictInnocent: { borderColor: colors.border },
  verdictInnocentActive: {
    borderColor: colors.brandGreen,
    backgroundColor: 'rgba(76,175,125,0.10)',
  },
  verdictText: {
    ...typography.labelCaps,
    color: colors.textSecondary,
    fontSize: 12,
  },

  textarea: {
    minHeight: 100,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    textAlignVertical: 'top',
    ...typography.bodyMd,
  },
});
