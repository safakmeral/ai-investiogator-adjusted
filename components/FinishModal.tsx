import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '@/lib/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onComplete: () => void;
  onExitForNow: () => void;
  busy?: boolean;
}

export function FinishModal({ visible, onClose, onComplete, onExitForNow, busy }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>SORGUYU TAMAMLA</Text>
          <Text style={styles.subtitle}>
            Oturumu sonlandırmak için bir eylem seçin.
          </Text>

          <Pressable
            disabled={busy}
            onPress={onComplete}
            style={({ pressed }) => [
              styles.option,
              styles.optionGreen,
              pressed && { opacity: 0.85 },
              busy && { opacity: 0.6 },
            ]}
          >
            <Text style={[styles.optionTitle, { color: colors.brandGreen }]}>
              Sorguyu Tamamla
            </Text>
            <Text style={styles.optionDesc}>
              Sorgu kapatılır ve anket doldurulur.
            </Text>
          </Pressable>

          <Pressable
            disabled={busy}
            onPress={onExitForNow}
            style={({ pressed }) => [
              styles.option,
              pressed && { opacity: 0.85 },
              busy && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.optionTitle}>Şimdilik Çık</Text>
            <Text style={styles.optionDesc}>
              Sorgu açık kalır, daha sonra devam edebilirsiniz.
            </Text>
          </Pressable>

          <Pressable onPress={onClose} disabled={busy} style={styles.cancel}>
            <Text style={styles.cancelText}>İPTAL</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  title: {
    ...typography.headlineMd,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceAlt,
  },
  optionGreen: {
    borderColor: colors.brandGreen,
  },
  optionTitle: {
    ...typography.headlineMd,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  optionDesc: {
    ...typography.bodyMd,
    fontSize: 12,
    color: colors.textSecondary,
  },
  cancel: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  cancelText: {
    ...typography.labelCaps,
    color: colors.textSecondary,
    fontSize: 11,
  },
});
