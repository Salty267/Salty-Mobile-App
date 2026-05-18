import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_H } from './layout';

/**
 * Returns the correct bottom padding for a tab-screen ScrollView.
 * Accounts for the floating tab bar height + device safe area (iPhone home bar, Android nav bar).
 */
export function useBottomPad(extra = 16): number {
  const { bottom } = useSafeAreaInsets();
  return TAB_BAR_H + bottom + extra;
}
