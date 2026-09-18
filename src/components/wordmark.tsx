import { StyleSheet } from 'react-native';

import { Text } from '@/components/text';
import type { ColorToken } from '@/theme';

export type WordmarkProps = {
  /** Type scale. `title` for in-app brand moments, `large` for full-screen. */
  size?: 'title' | 'large';
  color?: ColorToken;
};

/**
 * The ROAM wordmark (#141).
 *
 * Uppercase with wide tracking, in the app's own sans — no custom font, and
 * deliberately no icon lock-up: the mark and the wordmark travel separately so
 * the mark can carry the icon and the wordmark can sit quietly in-app. Keep its
 * use rare; the brand is present, not plastered.
 */
export function Wordmark({ size = 'title', color = 'text' }: WordmarkProps) {
  return (
    <Text
      variant={size}
      color={color}
      accessibilityRole="header"
      accessibilityLabel="ROAM"
      style={styles.wordmark}>
      ROAM
    </Text>
  );
}

const styles = StyleSheet.create({
  wordmark: {
    fontWeight: '700',
    letterSpacing: 6,
    // Tracking adds trailing space after the final letter; pull it back so the
    // wordmark is optically centred and flush when left-aligned.
    marginRight: -6,
  },
});
