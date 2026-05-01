import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  Image,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';

import { HeaderBar, Logo } from '@/components/HeaderBar';
import { colors, radius, spacing, typography } from '@/lib/theme';
import { listCases } from '@/lib/cases';
import { logout } from '@/lib/auth';
import { useAuthStore } from '@/lib/store';
import type { Case, CaseStatus } from '@/lib/types';

type Filter = 'all' | 'open' | 'closed';

export default function CaseListScreen() {
  const router = useRouter();
  const officer = useAuthStore((s) => s.officer);
  const [cases, setCases] = useState<Case[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    if (!officer) return;
    try {
      const data = await listCases(filter);
      setCases(data);
    } catch (err) {
      Alert.alert('Hata', err instanceof Error ? err.message : 'Bilinmeyen');
    } finally {
      setRefreshing(false);
      setLoaded(true);
    }
  }, [filter, officer]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  useEffect(() => {
    reload();
  }, [filter, reload]);

  const filtered = useMemo(() => {
    if (!search.trim()) return cases;
    const q = search.toLowerCase();
    return cases.filter(
      (c) =>
        c.case_code.toLowerCase().includes(q) ||
        `${c.suspect_name} ${c.suspect_surname}`.toLowerCase().includes(q) ||
        c.crime_type.toLowerCase().includes(q),
    );
  }, [cases, search]);

  return (
    <View style={styles.flex}>
      <HeaderBar
        left={<Logo small />}
        right={
          <View style={styles.headerRight}>
            <View style={styles.officerInfo}>
              <Text style={styles.officerName}>{officer?.full_name ?? '—'}</Text>
              <Text style={styles.officerBadge}>{officer?.badge_id ?? '—'}</Text>
            </View>
            <Pressable
              onPress={() => {
                Alert.alert('Çıkış', 'Oturumu sonlandırmak istiyor musunuz?', [
                  { text: 'Vazgeç', style: 'cancel' },
                  { text: 'Çık', style: 'destructive', onPress: logout },
                ]);
              }}
              style={styles.logoutBtn}
            >
              <Text style={styles.logoutText}>ÇIK</Text>
            </Pressable>
          </View>
        }
      />

      <View style={styles.searchRow}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="VAKA VEYA ŞÜPHELİ ARA..."
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          autoCapitalize="characters"
        />
      </View>

      <View style={styles.filterRow}>
        {(['all', 'open', 'closed'] as Filter[]).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.filterPill, filter === f && styles.filterPillActive]}
          >
            <Text
              style={[
                styles.filterText,
                filter === f && styles.filterTextActive,
              ]}
            >
              {f === 'all' ? 'TÜMÜ' : f === 'open' ? 'AÇIK' : 'KAPALI'}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              reload();
            }}
            tintColor={colors.brandBlue}
          />
        }
        ListEmptyComponent={
          loaded ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Henüz vaka yok</Text>
              <Text style={styles.emptyText}>
                Yeni bir sorgu başlatmak için sağ alttaki + butonuna basın.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => <CaseCard caseRow={item} onPress={() => router.push(`/session/${item.id}`)} />}
      />

      <Pressable
        onPress={() => router.push('/new-case')}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>
    </View>
  );
}

function CaseCard({ caseRow, onPress }: { caseRow: Case; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.avatar}>
        {caseRow.suspect_photo_url ? (
          <Image source={{ uri: caseRow.suspect_photo_url }} style={styles.avatarImage} />
        ) : (
          <Text style={styles.avatarFallback}>
            {(caseRow.suspect_name[0] ?? '?').toUpperCase()}
          </Text>
        )}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardName}>
          {caseRow.suspect_name.toUpperCase()} {caseRow.suspect_surname.toUpperCase()}
        </Text>
        <Text style={styles.cardCrime}>{caseRow.crime_type.toUpperCase()}</Text>
        <View style={styles.cardMeta}>
          <Text style={styles.cardCode}>VAKA #{caseRow.case_code}</Text>
          <StatusBadge status={caseRow.status} />
        </View>
      </View>
    </Pressable>
  );
}

function StatusBadge({ status }: { status: CaseStatus }) {
  const isOpen = status === 'open';
  return (
    <View
      style={[
        styles.statusBadge,
        isOpen ? styles.statusOpen : styles.statusClosed,
      ]}
    >
      <Text style={[styles.statusText, isOpen ? styles.statusOpenText : styles.statusClosedText]}>
        {isOpen ? 'AÇIK' : 'KAPALI'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },

  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  officerInfo: { alignItems: 'flex-end' },
  officerName: { ...typography.bodyMd, color: colors.textPrimary, fontSize: 12 },
  officerBadge: { ...typography.labelCaps, color: colors.textSecondary, fontSize: 9 },
  logoutBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoutText: { ...typography.labelCaps, color: colors.brandRed, fontSize: 10 },

  searchRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  searchInput: {
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    ...typography.dataMono,
    letterSpacing: 1.2,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  filterPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterPillActive: {
    backgroundColor: colors.brandBlue,
    borderColor: colors.brandBlue,
  },
  filterText: {
    ...typography.labelCaps,
    color: colors.textSecondary,
    fontSize: 10,
  },
  filterTextActive: { color: colors.textOnPrimary },

  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
  },

  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardPressed: { borderColor: colors.brandBlue },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 6,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarFallback: {
    ...typography.headlineMd,
    color: colors.textSecondary,
    fontSize: 20,
  },
  cardBody: { flex: 1, justifyContent: 'space-between' },
  cardName: { ...typography.headlineMd, color: colors.textPrimary, fontSize: 14 },
  cardCrime: { ...typography.bodyMd, color: colors.textSecondary, fontSize: 12 },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardCode: { ...typography.labelCaps, color: colors.textSecondary, fontSize: 10 },

  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  statusOpen: { backgroundColor: 'rgba(76, 175, 125, 0.15)' },
  statusClosed: { backgroundColor: 'rgba(122, 122, 154, 0.15)' },
  statusText: { ...typography.labelCaps, fontSize: 9 },
  statusOpenText: { color: colors.brandGreen },
  statusClosedText: { color: colors.textSecondary },

  empty: {
    paddingTop: 80,
    alignItems: 'center',
  },
  emptyTitle: {
    ...typography.headlineMd,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  emptyText: {
    ...typography.bodyMd,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },

  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brandBlue,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  fabIcon: {
    fontSize: 28,
    color: colors.textOnPrimary,
    marginTop: -2,
  },
});
