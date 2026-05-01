import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, metricColor, radius, spacing, typography } from '@/lib/theme';

interface Props {
  label: string;
  value: number; // 0-100
}

export function MetricCard({ label, value }: Props) {
  const pct = Math.max(0, Math.min(100, value));
  const color = metricColor(pct);
  return (
    <View style={[styles.card, { borderLeftColor: color, shadowColor: color }]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color }]}>{`${pct.toFixed(0)}%`}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    justifyContent: 'space-between',
    height: 64,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  label: {
    ...typography.labelCaps,
    color: colors.textSecondary,
    fontSize: 8,
    letterSpacing: 1.2,
  },
  value: {
    ...typography.metricNumber,
    fontSize: 16,
  },
  barTrack: {
    height: 3,
    width: '100%',
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
});
