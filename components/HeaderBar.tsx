import React, { ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '@/lib/theme';

interface Props {
  left?: ReactNode;
  right?: ReactNode;
  title?: string;
}

export function HeaderBar({ left, right, title }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, height: insets.top + 56 },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.side}>{left}</View>
        {title ? (
          <View style={styles.center}>
            <Text style={styles.title}>{title}</Text>
          </View>
        ) : null}
        <View style={[styles.side, styles.right]}>{right}</View>
      </View>
    </View>
  );
}

interface LogoProps {
  small?: boolean;
}

export function Logo({ small }: LogoProps) {
  return (
    <View style={styles.logoWrap}>
      <View style={styles.logoIcon}>
        <View style={styles.logoIconInner} />
      </View>
      <View style={{ marginLeft: 8 }}>
        <Text style={[styles.logoText, small && { fontSize: 11 }]}>AI INVESTIGATOR</Text>
        {!small ? <Text style={styles.logoSub}>UNIT_CONTROL_V.04</Text> : null}
      </View>
    </View>
  );
}

interface IconButtonProps {
  onPress: () => void;
  children: ReactNode;
}

export function IconButton({ onPress, children }: IconButtonProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  side: {
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  right: {
    marginLeft: 'auto',
    justifyContent: 'flex-end',
  },
  center: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    ...typography.headlineMd,
    color: colors.textPrimary,
  },
  logoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoIcon: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: colors.brandBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoIconInner: {
    width: 8,
    height: 8,
    backgroundColor: colors.background,
    borderRadius: 1,
  },
  logoText: {
    ...typography.headlineMd,
    color: colors.textPrimary,
    fontSize: 12,
  },
  logoSub: {
    ...typography.labelCaps,
    color: colors.textSecondary,
    fontSize: 9,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
