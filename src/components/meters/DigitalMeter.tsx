import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';

const COLORS = {
  background: '#1a1a2e',
  value: '#00d4ff',
  unit: '#64748b',
  label: '#8892a4',
  text: '#ffffff',
};

interface DigitalMeterProps {
  value: number;
  unit: string;
  label: string;
  decimals?: number;
  fontSize?: number;
}

/**
 * デジタル数値表示メーター
 *
 * 大きなデジタルフォント風の数値を表示する。
 * 値が変化した際にフェードアウト -> フェードインの
 * アニメーションで視覚的に変化を強調する。
 */
export const DigitalMeter: React.FC<DigitalMeterProps> = ({
  value,
  unit,
  label,
  decimals = 1,
  fontSize = 36,
}) => {
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);
  const prevValueRef = useRef(value);

  // 値変化時のフェードアニメーション
  useEffect(() => {
    // 初回レンダリングでは前回値と同じなのでスキップ
    if (prevValueRef.current !== value) {
      prevValueRef.current = value;

      // フェードアウト -> フェードイン
      opacity.value = withSequence(
        withTiming(0.3, { duration: 80, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 200, easing: Easing.in(Easing.ease) }),
      );

      // 軽いスケールバウンス
      scale.value = withSequence(
        withTiming(1.05, { duration: 80, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 200, easing: Easing.in(Easing.ease) }),
      );
    }
  }, [value, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  // 表示フォーマット
  const formattedValue = value.toFixed(decimals);

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { fontSize: fontSize * 0.35 }]}>{label}</Text>

      <Animated.View style={[styles.valueRow, animatedStyle]}>
        <Text
          style={[
            styles.value,
            {
              fontSize,
              lineHeight: fontSize * 1.15,
            },
          ]}
        >
          {formattedValue}
        </Text>
        <Text style={[styles.unit, { fontSize: fontSize * 0.35 }]}>{unit}</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#16213e',
  },
  label: {
    color: COLORS.label,
    fontWeight: '500',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  value: {
    color: COLORS.value,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  unit: {
    color: COLORS.unit,
    fontWeight: '500',
    marginLeft: 4,
  },
});
