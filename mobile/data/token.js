// PoolsEye React Native — Design Tokens
// Mirrors the web dashboard blue brand palette

export const colors = {
  // Surfaces
  bgApp:    '#F5F9FC',
  bgPanel:  '#FFFFFF',
  bgRaised: '#FAFCFE',
  bgInset:  '#EEF4F9',

  // Borders
  borderSubtle: '#DCE8F2',
  borderStrong: '#C5D9E8',

  // Text
  textPrimary:   '#0D1B2A',
  textSecondary: '#5A6B7D',
  textTertiary:  '#8FA3B8',

  // Brand blues
  accent:       '#007BFF',
  accentStrong: '#1565C0',
  accentDeep:   '#0D47A1',
  accentLight:  '#4FC3F7',
  accentTint:   '#E8F4FF',

  // Status trio
  safe:       '#1B9C6E',
  safeTint:   '#E6F6EF',
  safeBorder: '#B3E2D0',

  warn:       '#B6790A',
  warnTint:   '#FBF1DE',
  warnBorder: '#EDD59A',

  alarm:       '#D6364A',
  alarmTint:   '#FCEAEE',
  alarmBorder: '#F4C6CD',
  alarmDark:   '#7A1C28',
  alarmMid:    '#B5505F',
};

export const radius = {
  sm: 10,
  md: 12,
  lg: 14,
  xl: 16,
  full: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 18,
  xl: 24,
};

export const typography = {
  ui:   'System',
  mono: 'Courier',
  xs:   10,
  sm:   11.5,
  base: 13,
  md:   14,
  lg:   15,
  xl:   19,
  kpi:  25,
};

export const shadow = {
  sm: {
    shadowColor: '#0D47A1',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: '#0D47A1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
};
