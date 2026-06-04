import { Dimensions } from 'react-native';

const { width: W, height: H } = Dimensions.get('window');

export const SCREEN_W = W;
export const SCREEN_H = H;

// Scale factor relative to 390dp reference (iPhone 14 / common mid-range Android)
const REF   = 390;
const REF_H = 844; // iPhone 14 logical height
const RATIO   = W / REF;
const RATIO_V = H / REF_H;

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

/**
 * Scale a value vertically (heights, vertical spacing).
 * Clamped to ±20%.
 */
export function vs(n: number): number {
  return Math.round(Math.max(n * 0.8, Math.min(n * 1.2, n * RATIO_V)));
}

/** Spacing alias for scale() — same math, semantic clarity for padding/margin/gap. */
export const sp = scale;

/** Clamp helper */
export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Screen size flags for one-off layout decisions */
export const isSmallScreen = W < 375;
export const isLargeScreen = W > 414;

/** Height of the floating tab bar — scales with device so useBottomPad stays accurate. */
export const TAB_BAR_H = scale(88);
