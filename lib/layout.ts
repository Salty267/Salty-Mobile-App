import { Dimensions } from 'react-native';

const { width: W, height: H } = Dimensions.get('window');

export const SCREEN_W = W;
export const SCREEN_H = H;

/** Height of the floating tab bar (matches _layout.tsx tabBarStyle.height) */
export const TAB_BAR_H = 88;

// Scale factor relative to 390dp reference (iPhone 14 / common mid-range Android)
const REF = 390;
const RATIO = W / REF;

/**
 * Scale a dp value proportionally to screen width.
 * Clamped to ±25% so nothing becomes absurdly large or tiny.
 */
export function scale(n: number): number {
  return Math.round(Math.max(n * 0.75, Math.min(n * 1.25, n * RATIO)));
}

/**
 * Scale a font size. Tighter clamp (±15%) to keep text readable on all devices.
 */
export function scaleFont(n: number): number {
  return Math.round(Math.max(n * 0.85, Math.min(n * 1.15, n * RATIO)));
}

/** Clamp helper */
export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
