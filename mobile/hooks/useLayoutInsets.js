import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../theme/tokens';

const TAB_BAR_PILL_HEIGHT = 68;

/**
 * Normalized safe-area insets for PoolsEye mobile screens.
 */
export function useLayoutInsets() {
  const insets = useSafeAreaInsets();

  const horizontalInset = Math.max(insets.left, insets.right, 0);
  const tabBarPaddingBottom = Math.max(insets.bottom, spacing.sm);
  const contentHorizontalInset = horizontalInset + spacing.md;

  return {
    top: insets.top,
    bottom: insets.bottom,
    left: insets.left,
    right: insets.right,
    horizontalInset,
    contentHorizontalInset,
    headerPaddingTop: insets.top + spacing.sm,
    tabBarPaddingBottom,
    tabBarPaddingHorizontal: contentHorizontalInset,
    tabBarClearance: TAB_BAR_PILL_HEIGHT + tabBarPaddingBottom,
  };
}
