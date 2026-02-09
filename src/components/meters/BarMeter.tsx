import React, { useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Svg, {
  Rect,
  Defs,
  LinearGradient,
  Stop,
  ClipPath,
} from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withSpring,
} from 'react-native-reanimated';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const COLORS = {
  background: '#0f0f1a',
  barBackground: '#16213e',
  text: '#ffffff',
  value: '#e94560',
  label: '#64748b',
  gradientStart: '#00ff88',
  gradientMid: '#ffd700',
  gradientEnd: '#e94560',
};

interface BarMeterProps {
  value: number;
  min: number;
  max: number;
  unit: string;
  label: string;
  width?: number;
  height?: number;
  warningThreshold?: number;
}

/**
 * 水平バーメーター
 *
 * 左から右にバーが伸びるアニメーションで値を表示する。
 * バーは緑 -> 黄 -> 赤のグラデーションで塗りつぶされ、
 * 値の大きさを直感的に表現する。
 */
export const BarMeter: React.FC<BarMeterProps> = ({
  value,
  min,
  max,
  unit,
  label,
  width = 250,
  height = 60,
  warningThreshold,
}) => {
  const animatedRatio = useSharedValue(0);

  useEffect(() => {
    const clamped = Math.max(min, Math.min(max, value));
    const ratio = (clamped - min) / (max - min);
    animatedRatio.value = withSpring(ratio, {
      damping: 18,
      stiffness: 80,
      mass: 0.8,
    });
  }, [value, min, max, animatedRatio]);

  const barHeight = height * 0.35;
  const cornerRadius = barHeight * 0.3;
  const barPadding = 2;
  const innerBarWidth = width - barPadding * 2;

  // アニメーションされたバー幅
  const animatedBarProps = useAnimatedProps(() => {
    return {
      width: Math.max(0, innerBarWidth * animatedRatio.value),
    };
  });

  // 値の色を決定
  const getValueColor = () => {
    if (warningThreshold !== undefined && value >= warningThreshold) {
      return COLORS.gradientEnd;
    }
    const ratio = (value - min) / (max - min);
    if (ratio > 0.8) {
      return COLORS.gradientEnd;
    }
    if (ratio > 0.5) {
      return COLORS.gradientMid;
    }
    return COLORS.gradientStart;
  };

  const displayValue = Math.max(min, Math.min(max, value));
  const formattedValue =
    max - min > 100 ? Math.round(displayValue).toString() : displayValue.toFixed(1);

  return (
    <View style={[styles.container, { width, height }]}>
      {/* 上段: 値表示 */}
      <View style={styles.valueRow}>
        <Text style={[styles.valueText, { color: getValueColor(), fontSize: height * 0.3 }]}>
          {formattedValue}
        </Text>
        <Text style={[styles.unitText, { fontSize: height * 0.18 }]}>{unit}</Text>
      </View>

      {/* バー本体 (SVG) */}
      <Svg width={width} height={barHeight + barPadding * 2}>
        <Defs>
          <LinearGradient id="barGradient" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={COLORS.gradientStart} stopOpacity="1" />
            <Stop offset="0.5" stopColor={COLORS.gradientMid} stopOpacity="1" />
            <Stop offset="1" stopColor={COLORS.gradientEnd} stopOpacity="1" />
          </LinearGradient>
          <ClipPath id="barClip">
            <Rect
              x={barPadding}
              y={barPadding}
              width={innerBarWidth}
              height={barHeight}
              rx={cornerRadius}
              ry={cornerRadius}
            />
          </ClipPath>
        </Defs>

        {/* 背景バー */}
        <Rect
          x={barPadding}
          y={barPadding}
          width={innerBarWidth}
          height={barHeight}
          rx={cornerRadius}
          ry={cornerRadius}
          fill={COLORS.barBackground}
        />

        {/* 値バー (アニメーション) */}
        <AnimatedRect
          animatedProps={animatedBarProps}
          x={barPadding}
          y={barPadding}
          height={barHeight}
          rx={cornerRadius}
          ry={cornerRadius}
          fill="url(#barGradient)"
          clipPath="url(#barClip)"
        />

        {/* 警告マーカーライン */}
        {warningThreshold !== undefined && (
          <Rect
            x={barPadding + innerBarWidth * ((warningThreshold - min) / (max - min)) - 1}
            y={0}
            width={2}
            height={barHeight + barPadding * 2}
            fill={COLORS.gradientMid}
            opacity={0.7}
          />
        )}
      </Svg>

      {/* 下段: ラベル */}
      <Text style={[styles.labelText, { fontSize: height * 0.18 }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 2,
  },
  valueText: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  unitText: {
    color: COLORS.label,
    fontWeight: '500',
    marginLeft: 4,
  },
  labelText: {
    color: COLORS.label,
    fontWeight: '500',
    marginTop: 2,
  },
});
