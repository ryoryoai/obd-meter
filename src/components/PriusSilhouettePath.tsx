import React from 'react';
import { Path } from 'react-native-svg';

import { PRIUS_SILHOUETTE_PATH_D } from './priusSilhouettePathData';

interface Props {
  color?: string;
  opacity?: number;
}

/**
 * ZVW30 Prius silhouette as an SVG Path.
 *
 * Use inside an Svg with viewBox `0 0 398 190`.
 */
export function PriusSilhouettePath({
  color = '#ffffff',
  opacity = 0.18,
}: Props): React.JSX.Element {
  return (
    <Path
      d={PRIUS_SILHOUETTE_PATH_D}
      fill={color}
      opacity={opacity}
      fillRule="evenodd"
      stroke="none"
    />
  );
}

