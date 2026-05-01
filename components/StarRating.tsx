import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { colors } from '@/lib/theme';

interface Props {
  value: number;        // 0-5
  onChange: (n: number) => void;
}

export function StarRating({ value, onChange }: Props) {
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= value;
        return (
          <Pressable key={n} onPress={() => onChange(n)} hitSlop={8}>
            <Text style={[styles.star, active ? styles.active : styles.inactive]}>★</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  star: { fontSize: 28 },
  active: { color: colors.brandYellow },
  inactive: { color: colors.border },
});
