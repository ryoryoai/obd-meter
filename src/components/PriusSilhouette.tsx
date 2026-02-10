import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg from 'react-native-svg';

import { PriusSilhouettePath } from './PriusSilhouettePath';
import { PRIUS_SILHOUETTE_VIEWBOX } from './priusSilhouettePathData';

interface Props {
  width?: number;
  height?: number;
  color?: string;
  opacity?: number;
}

/**
 * ZVW30 Prius (3rd gen) サイドビュー線画
 *
 * Android/iOS でも表示できるよう、react-native-svg で Path を直接描画する。
 */
export const PriusSilhouette: React.FC<Props> = ({
  width = 600,
  height = 285,
  color = '#ffffff',
  opacity = 0.06,
}) => {
  return (
    <View style={[styles.container, { width, height }]}>
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${PRIUS_SILHOUETTE_VIEWBOX.width} ${PRIUS_SILHOUETTE_VIEWBOX.height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <PriusSilhouettePath color={color} opacity={opacity} />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
