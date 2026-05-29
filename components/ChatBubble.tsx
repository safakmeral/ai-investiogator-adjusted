import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '@/lib/theme';

export type ChatBubbleType =
  | 'ai'
  | 'suspect'
  | 'contradiction_alert'
  | 'inconsistency_alert'
  | 'stress_alert'
  | 'analysis_alert'
  | 'phase_change';

interface Props {
  type: ChatBubbleType;
  content: string;
  tactic?: string;
  onLongPress?: () => void;
  highlighted?: boolean;
}

export function ChatBubble({ type, content, tactic, onLongPress, highlighted }: Props) {
  switch (type) {
    case 'ai':
      return (
        <View style={[styles.row, styles.rowLeft]}>
          <View style={[styles.bubble, styles.aiBubble]}>
            <Text style={styles.aiText}>{content}</Text>
          </View>
        </View>
      );
    case 'suspect':
      return (
        <Pressable
          onLongPress={onLongPress}
          style={({ pressed }) => [
            styles.row,
            styles.rowRight,
            pressed && onLongPress ? { opacity: 0.75 } : null,
          ]}
        >
          <View style={[styles.bubble, styles.suspectBubble, highlighted && styles.suspectBubbleHighlighted]}>
            <Text style={styles.suspectLabel}>ŞÜPHELİ</Text>
            <Text style={styles.suspectText}>{content}</Text>
          </View>
        </Pressable>
      );
    case 'contradiction_alert':
      return (
        <AlertBanner
          color={colors.brandRed}
          label="⚠ ÇELİŞKİ TESPİT EDİLDİ"
          content={content}
        />
      );
    case 'inconsistency_alert':
      return (
        <AlertBanner
          color={colors.brandRed}
          label="◐ TUTARSIZLIK"
          content={content}
        />
      );
    case 'stress_alert':
      return (
        <AlertBanner
          color={colors.brandYellow}
          label="◉ YÜKSEK STRES SİNYALİ"
          content={content}
        />
      );
    case 'analysis_alert':
      return (
        <AlertBanner
          color={colors.brandYellow}
          label="● ANALİZ"
          content={content}
        />
      );
    case 'phase_change':
      return (
        <AlertBanner
          color={colors.brandBlue}
          label="▶ FAZ DEĞİŞİMİ"
          content={content}
        />
      );
  }
}

function AlertBanner({
  color,
  label,
  content,
}: {
  color: string;
  label: string;
  content: string;
}) {
  return (
    <View style={[styles.alert, { borderLeftColor: color }]}>
      <Text style={[styles.alertLabel, { color }]}>{label}</Text>
      <Text style={styles.alertText}>{content}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
  },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },

  bubble: {
    maxWidth: '85%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  aiBubble: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  aiText: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    lineHeight: 21,
  },

  suspectBubble: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  suspectBubbleHighlighted: {
    borderColor: colors.brandBlue,
  },
  suspectLabel: {
    ...typography.labelCaps,
    color: colors.textSecondary,
    fontSize: 10,
    marginBottom: spacing.xs,
  },
  suspectText: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    lineHeight: 21,
  },

  alert: {
    marginHorizontal: spacing.lg,
    marginVertical: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderLeftWidth: 4,
  },
  alertLabel: {
    ...typography.labelCaps,
    fontSize: 10,
    marginBottom: 2,
  },
  alertText: {
    ...typography.bodyMd,
    fontSize: 13,
    color: colors.textPrimary,
  },
});
