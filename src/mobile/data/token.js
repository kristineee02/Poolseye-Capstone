// PoolsEye React Native — Design Tokens
// Mirrors the web dashboard's tokens.css exactly

export const colors = {
  // Surfaces
  bgApp:    '#F6F7F9',
  bgPanel:  '#FFFFFF',
  bgRaised: '#FAFBFC',
  bgInset:  '#F0F2F5',

  // Borders
  borderSubtle: '#E7E9EE',
  borderStrong: '#D7DAE2',

  // Text
  textPrimary:   '#1A2233',
  textSecondary: '#6B7385',
  textTertiary:  '#9AA1B0',

  // Accent — calm teal
  accent:      '#0E94A6',
  accentStrong:'#0B7686',
  accentTint:  '#E3F4F6',

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
  sm: 6,
  md: 10,
  lg: 14,
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
  // Font families
  ui:   'System',   // Inter equivalent — use expo-google-fonts/inter in production
  mono: 'Courier',  // Roboto Mono equivalent

  // Scale
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
    shadowColor: '#141824',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#141824',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
};