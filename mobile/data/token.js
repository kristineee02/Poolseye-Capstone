// PoolsEye React Native — Design Tokens
// Sky Harmony blue brand · mobile-optimized scale

export const colors = {
  // Surfaces
  bgApp:    '#F0F8FF',
  bgPanel:  '#FFFFFF',
  bgRaised: '#FAFCFE',
  bgInset:  '#E8F3FC',

  // Borders
  borderSubtle: '#DCE8F2',
  borderStrong: '#C5D9E8',

  // Text
  textPrimary:   '#0F172A',
  textSecondary: '#5A6B7D',
  textTertiary:  '#8FA3B8',

  // Brand blues — Sky Harmony
  accent:       '#1E6FFF',
  accentStrong: '#1E6FFF',
  accentDeep:   '#1557D6',
  accentLight:  '#4DB8FF',
  accentHighlight: '#A7ECFF',
  accentTint:   '#F0F8FF',
  brandGradient: ['#4DB8FF', '#1E6FFF'],

  // Status trio
  safe:       '#1B9C6E',
  safeTint:   '#E6F6EF',
  safeBorder: '#B3E2D0',

  warn:       '#E6B800',
  warnTint:   '#FFF9E0',
  warnBorder: '#F0D86A',
  warnDark:   '#8A7000',
  warnMid:    '#C4A000',

  alarm:       '#D6364A',
  alarmTint:   '#FCEAEE',
  alarmBorder: '#F4C6CD',
  alarmDark:   '#7A1C28',
  alarmMid:    '#B5505F',
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 16,
  xl: 20,
  full: 999,
};

/** Consistent spacing rhythm for mobile layouts */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 36,
};

/** Readable mobile type scale (min ~11px) */
export const typography = {
  ui:   'System',
  mono: 'Courier',
  xs:   11,
  sm:   13,
  base: 14,
  md:  15,
  lg:  17,
  xl:  22,
  kpi: 28,
};

/** Minimum comfortable tap target */
export const touch = {
  min: 44,
  comfortable: 48,
};

export const shadow = {
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowColor: '#1E6FFF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
};
