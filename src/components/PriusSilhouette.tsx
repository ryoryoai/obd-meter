import React from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';

interface Props {
  width?: number;
  height?: number;
  color?: string;
  opacity?: number;
}

/**
 * ZVW30 Prius (3rd gen) サイドビュー線画
 *
 * 背景透過ベクターSVGを背景として表示。
 * 白線画のみのSVGのため blend-mode 不要。
 */
export const PriusSilhouette: React.FC<Props> = ({
  width = 600,
  height = 285,
  opacity = 0.06,
}) => {
  // The current asset pipeline uses a web-served SVG. On native (Android/iOS),
  // avoid attempting to load it to prevent noisy redboxes or missing image warnings.
  if (Platform.OS !== 'web') {
    return null;
  }

  return (
    <View style={[styles.container, { width, height }]}>
      <Image
        source={{ uri: '/prius-silhouette.svg' }}
        style={[
          styles.image,
          { opacity },
        ]}
        resizeMode="contain"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
