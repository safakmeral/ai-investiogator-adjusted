import React from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { colors, radius, spacing, typography } from '@/lib/theme';

interface Props extends TextInputProps {
  label: string;
  error?: string;
  containerStyle?: ViewStyle;
}

export function TextField({ label, error, containerStyle, style, ...rest }: Props) {
  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
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
  label: {
    ...typography.labelCaps,
    color: colors.textSecondary,
    fontSize: 11,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
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
