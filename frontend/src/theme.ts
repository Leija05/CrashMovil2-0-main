import { Platform } from 'react-native';

export const COLORS = {
  bg: '#050506',
  surface: '#101014',
  surfaceAlt: '#161620',
  elevated: '#1D1D28',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  text: '#F5F5F7',
  textSec: '#9A9AA8',
  textDim: '#5F5F6E',
  primary: '#FF3B30',
  primarySoft: 'rgba(255,59,48,0.14)',
  accent: '#CCFF00',
  accentSoft: 'rgba(204,255,0,0.12)',
  success: '#34D399',
  warning: '#FBBF24',
  info: '#60A5FA',
  danger: '#F87171',
};

export const RADIUS = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const FONT = Platform.select({
  ios: {
    mono: 'Menlo',
  },
  android: {
    mono: 'monospace',
  },
  default: {
    mono: 'monospace',
  },
})!;

export function severityColor(gForce: number) {
  if (gForce < 1.5) return COLORS.success;
  if (gForce < 5) return COLORS.info;
  if (gForce < 10) return COLORS.warning;
  if (gForce < 15) return '#FB923C';
  return COLORS.primary;
}

export function severityLabel(gForce: number) {
  if (gForce < 1.5) return 'ESTABLE';
  if (gForce < 5) return 'NORMAL';
  if (gForce < 10) return 'MEDIO';
  if (gForce < 15) return 'ALTO';
  return 'CRÍTICO';
}
