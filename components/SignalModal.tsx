import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '@/lib/theme';
import { BODY_LANGUAGE_BUTTONS, VOICE_TONE_BUTTONS } from '@/lib/signalButtons';

interface Props {
  visible: boolean;
  onClose: () => void;
  selectedBodyLanguage: string[];
  selectedVoiceTone: string[];
  onToggleBodyLanguage: (key: string) => void;
  onToggleVoiceTone: (key: string) => void;
}

export function SignalModal({
  visible,
  onClose,
  selectedBodyLanguage,
  selectedVoiceTone,
  onToggleBodyLanguage,
  onToggleVoiceTone,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + spacing.md, spacing.xl) }]}>
        {/* Başlık */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>SİNYAL SEÇ</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {/* Beden Dili */}
          <Text style={styles.sectionTitle}>BEDEN DİLİ</Text>
          <View style={styles.pillGrid}>
            {BODY_LANGUAGE_BUTTONS.map((btn) => {
              const active = selectedBodyLanguage.includes(btn.key);
              return (
                <Pressable
                  key={btn.key}
                  onPress={() => onToggleBodyLanguage(btn.key)}
                  style={[styles.pill, active && styles.pillActive]}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>
                    {btn.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.divider} />

          {/* Ses Tonu */}
          <Text style={styles.sectionTitle}>SES TONU</Text>
          <View style={styles.pillGrid}>
            {VOICE_TONE_BUTTONS.map((btn) => {
              const active = selectedVoiceTone.includes(btn.key);
              return (
                <Pressable
                  key={btn.key}
                  onPress={() => onToggleVoiceTone(btn.key)}
                  style={[styles.pill, active && styles.pillActive]}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>
                    {btn.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {/* Onayla */}
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.confirmText}>TAMAM</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: colors.border,
    maxHeight: '75%',
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headerTitle: {
    ...typography.labelCaps,
    color: colors.textPrimary,
    fontSize: 13,
    letterSpacing: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
  },
  closeBtnText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  content: {
    paddingBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.labelCaps,
    color: colors.textSecondary,
    fontSize: 10,
    marginBottom: spacing.sm,
  },
  pillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  pillActive: {
    backgroundColor: 'rgba(224, 82, 82, 0.15)',
    borderColor: colors.brandRed,
    shadowColor: colors.brandRed,
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  pillText: {
    ...typography.labelCaps,
    color: colors.textSecondary,
    fontSize: 12,
  },
  pillTextActive: {
    color: colors.brandRed,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  confirmBtn: {
    marginTop: spacing.md,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.brandBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    ...typography.labelCaps,
    color: colors.textOnPrimary,
    fontSize: 13,
  },
});
