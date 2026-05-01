import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { colors, radius, spacing, typography } from '@/lib/theme';
import {
  BODY_LANGUAGE_BUTTONS,
  VOICE_TONE_BUTTONS,
  type SignalButton,
} from '@/lib/signalButtons';

interface PillRowProps {
  title: string;
  buttons: SignalButton[];
  selected: string[];
  onToggle: (key: string) => void;
}

function PillRow({ title, buttons, selected, onToggle }: PillRowProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollRow}
      >
        {buttons.map((btn) => {
          const isActive = selected.includes(btn.key);
          return (
            <Pressable
              key={btn.key}
              onPress={() => onToggle(btn.key)}
              style={[styles.pill, isActive && styles.pillActive]}
            >
              <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
                {btn.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

interface BodyLanguagePillsProps {
  selected: string[];
  onToggle: (key: string) => void;
}

export function BodyLanguagePills({ selected, onToggle }: BodyLanguagePillsProps) {
  return (
    <PillRow
      title="BEDEN DİLİ"
      buttons={BODY_LANGUAGE_BUTTONS}
      selected={selected}
      onToggle={onToggle}
    />
  );
}

interface VoiceTonePillsProps {
  selected: string[];
  onToggle: (key: string) => void;
}

export function VoiceTonePills({ selected, onToggle }: VoiceTonePillsProps) {
  return (
    <PillRow
      title="SES TONU"
      buttons={VOICE_TONE_BUTTONS}
      selected={selected}
      onToggle={onToggle}
    />
  );
}

const styles = StyleSheet.create({
  section: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  title: {
    ...typography.labelCaps,
    color: colors.textSecondary,
    fontSize: 10,
    marginBottom: 6,
    paddingHorizontal: spacing.lg,
  },
  scrollRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillActive: {
    backgroundColor: 'rgba(224, 82, 82, 0.15)',
    borderColor: colors.brandRed,
    shadowColor: colors.brandRed,
    shadowOpacity: 0.35,
    shadowRadius: 6,
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
});
