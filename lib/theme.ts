// Tasarım Sistemi — AI_Investigator_v4.md Bölüm 10 + mockup'lardan
// Tüm renkler, tipografi ve spacing burada merkezi olarak tanımlanır.

export const colors = {
  // Yüzeyler
  background: '#0A0A0F',
  surface: '#13131A',
  surfaceAlt: '#1C1C26',
  surfaceHigh: '#1E1F27',

  // Sınırlar
  border: '#2A2A3A',
  borderStrong: '#444654',

  // Markalar
  brandBlue: '#4F6EF7',
  brandRed: '#E05252',
  brandYellow: '#F0A500',
  brandGreen: '#4CAF7D',

  // Metin
  textPrimary: '#F0F0F5',
  textSecondary: '#7A7A9A',
  textMuted: '#5A5A7A',
  textOnPrimary: '#FFFFFF',

  // Metrik renk eşikleri
  metricLow: '#4CAF7D',     // 0-33
  metricMid: '#F0A500',     // 34-66
  metricHigh: '#E05252',    // 67-100
};

export const typography = {
  headlineXl: {
    fontFamily: 'System',
    fontSize: 24,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
  },
  headlineMd: {
    fontFamily: 'System',
    fontSize: 16,
    fontWeight: '600' as const,
    letterSpacing: 1.2,
  },
  bodyLg: {
    fontFamily: 'System',
    fontSize: 16,
    fontWeight: '400' as const,
  },
  bodyMd: {
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '400' as const,
  },
  labelCaps: {
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
  },
  dataMono: {
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '500' as const,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  metricNumber: {
    fontFamily: 'System',
    fontSize: 22,
    fontWeight: '700' as const,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
};

export const radius = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  pill: 20,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

// Metrik skoruna göre renk seçimi
export function metricColor(score: number): string {
  if (score < 34) return colors.metricLow;
  if (score < 67) return colors.metricMid;
  return colors.metricHigh;
}
