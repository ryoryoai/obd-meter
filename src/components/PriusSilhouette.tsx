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
 * 外部SVG(base64 PNG埋め込み)を背景として表示。
 * 元画像は暗背景に白線画のため、mix-blend-mode: screen で
 * 暗部を透過させ白線のみ表示する。
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
          {
            opacity,
            // @ts-expect-error web-only CSS: 暗い背景を透過し白線のみ残す
            mixBlendMode: 'screen',
          },
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
