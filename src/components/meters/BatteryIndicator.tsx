import React, { useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Svg, {
  Rect,
  G,
  Defs,
  LinearGradient,
  Stop,
  ClipPath,
} from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const COLORS = {
  background: '#1a1a2e',
  batteryBorder: '#64748b',
  batteryFill: '#16213e',
  socHigh: '#00ff88',
  socMid: '#ffd700',
  socLow: '#e94560',
  charging: '#00d4ff',
  discharging: '#ffd700',
  text: '#ffffff',
  label: '#8892a4',
  subValue: '#64748b',
};

interface BatteryIndicatorProps {
  soc: number;
  voltage: number;
  current: number;
  temperature: number;
}

/**
 * ZVW30プリウス HVバッテリー専用インジケーター
 *
 * バッテリーアイコン型のSOC表示を行い、充電/放電状態を
 * アニメーションで表現する。SOCが20%未満で赤点滅警告を出す。
 * 電圧・電流・温度はサブ表示として下部に配置する。
 */
export const BatteryIndicator: React.FC<BatteryIndicatorProps> = ({
  soc,
  voltage,
  current,
  temperature,
}) => {
  const animatedSoc = useSharedValue(0);
  const flashOpacity = useSharedValue(1);
  const chargePulse = useSharedValue(0);

  // SOCアニメーション
  useEffect(() => {
    const clampedSoc = Math.max(0, Math.min(100, soc));
    animatedSoc.value = withSpring(clampedSoc, {
      damping: 15,
      stiffness: 60,
    });
  }, [soc, animatedSoc]);

  // SOC低下時の点滅アニメーション
  useEffect(() => {
    if (soc < 20) {
      flashOpacity.value = withRepeat(
        withSequence(
          withTiming(0.2, { duration: 500, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        ),
        -1, // 無限繰り返し
        false,
      );
    } else {
      cancelAnimation(flashOpacity);
      flashOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [soc < 20, flashOpacity, soc]);

  // 充電/放電パルスアニメーション
  useEffect(() => {
    if (current !== 0) {
      chargePulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(chargePulse);
      chargePulse.value = withTiming(0, { duration: 200 });
    }
  }, [current !== 0, chargePulse, current]);

  // バッテリーアイコンの寸法
  const batteryWidth = 160;
  const batteryHeight = 70;
  const batteryTerminalWidth = 8;
  const batteryTerminalHeight = 24;
  const batteryBorderWidth = 3;
  const batteryCornerRadius = 8;
  const fillPadding = 5;

  const fillMaxWidth = batteryWidth - fillPadding * 2 - batteryBorderWidth * 2;
  const fillHeight = batteryHeight - fillPadding * 2 - batteryBorderWidth * 2;

  // SOCバーのアニメーション幅
  const animatedFillProps = useAnimatedProps(() => {
    const fillWidth = (animatedSoc.value / 100) * fillMaxWidth;
    return {
      width: Math.max(0, fillWidth),
    };
  });

  // SOCに応じたバーの色
  const getSocColor = () => {
    if (soc < 20) { return COLORS.socLow; }
    if (soc < 50) { return COLORS.socMid; }
    return COLORS.socHigh;
  };

  // 点滅アニメーションスタイル (SOC低下時)
  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  // 充放電状態テキスト
  const getChargeStatus = () => {
    if (current > 0.5) {
      return { text: 'CHARGING', color: COLORS.charging, symbol: '+' };
    }
    if (current < -0.5) {
      return { text: 'DISCHARGING', color: COLORS.discharging, symbol: '-' };
    }
    return { text: 'IDLE', color: COLORS.label, symbol: '' };
  };

  const chargeStatus = getChargeStatus();
  const socColor = getSocColor();

  return (
    <View style={styles.container}>
      {/* 充放電ステータス */}
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, { backgroundColor: chargeStatus.color }]} />
        <Text style={[styles.statusText, { color: chargeStatus.color }]}>
          {chargeStatus.text}
        </Text>
      </View>

      {/* バッテリーアイコン + SOC */}
      <Animated.View style={flashStyle}>
        <View style={styles.batteryRow}>
          <Svg
            width={batteryWidth + batteryTerminalWidth + 4}
            height={batteryHeight}
          >
            <Defs>
              <LinearGradient id="socGradient" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={socColor} stopOpacity="0.8" />
                <Stop offset="1" stopColor={socColor} stopOpacity="1" />
              </LinearGradient>
              <ClipPath id="fillClip">
                <Rect
                  x={batteryBorderWidth + fillPadding}
                  y={batteryBorderWidth + fillPadding}
                  width={fillMaxWidth}
                  height={fillHeight}
                  rx={batteryCornerRadius - 4}
                  ry={batteryCornerRadius - 4}
                />
              </ClipPath>
            </Defs>

            {/* バッテリー本体の枠 */}
            <Rect
              x={0}
              y={0}
              width={batteryWidth}
              height={batteryHeight}
              rx={batteryCornerRadius}
              ry={batteryCornerRadius}
              fill={COLORS.batteryFill}
              stroke={COLORS.batteryBorder}
              strokeWidth={batteryBorderWidth}
            />

            {/* バッテリー端子 */}
            <Rect
              x={batteryWidth}
              y={(batteryHeight - batteryTerminalHeight) / 2}
              width={batteryTerminalWidth}
              height={batteryTerminalHeight}
              rx={3}
              ry={3}
              fill={COLORS.batteryBorder}
            />

            {/* SOC塗りつぶし (アニメーション) */}
            <AnimatedRect
              animatedProps={animatedFillProps}
              x={batteryBorderWidth + fillPadding}
              y={batteryBorderWidth + fillPadding}
              height={fillHeight}
              rx={batteryCornerRadius - 4}
              ry={batteryCornerRadius - 4}
              fill="url(#socGradient)"
              clipPath="url(#fillClip)"
            />

            {/* SOCセグメント区切り線 (10%ごと) */}
            {Array.from({ length: 9 }, (_, i) => {
              const segX =
                batteryBorderWidth +
                fillPadding +
                ((i + 1) / 10) * fillMaxWidth;
              return (
                <Rect
                  key={`seg-${i}`}
                  x={segX - 0.5}
                  y={batteryBorderWidth + fillPadding}
                  width={1}
                  height={fillHeight}
                  fill={COLORS.background}
                  opacity={0.4}
                />
              );
            })}
          </Svg>

          {/* SOCパーセント表示 */}
          <Text style={[styles.socText, { color: socColor }]}>
            {Math.round(soc)}
            <Text style={styles.socPercent}>%</Text>
          </Text>
        </View>
      </Animated.View>

      {/* サブ情報 (電圧・電流・温度) */}
      <View style={styles.subInfoRow}>
        <View style={styles.subInfoItem}>
          <Text style={styles.subInfoValue}>{voltage.toFixed(1)}</Text>
          <Text style={styles.subInfoUnit}>V</Text>
        </View>

        <View style={styles.subInfoDivider} />

        <View style={styles.subInfoItem}>
          <Text
            style={[
              styles.subInfoValue,
              { color: current > 0.5 ? COLORS.charging : current < -0.5 ? COLORS.discharging : COLORS.text },
            ]}
          >
            {chargeStatus.symbol}
            {Math.abs(current).toFixed(1)}
          </Text>
          <Text style={styles.subInfoUnit}>A</Text>
        </View>

        <View style={styles.subInfoDivider} />

        <View style={styles.subInfoItem}>
          <Text
            style={[
              styles.subInfoValue,
              { color: temperature > 45 ? COLORS.socLow : COLORS.text },
            ]}
          >
            {temperature.toFixed(0)}
          </Text>
          <Text style={styles.subInfoUnit}>{'\u00B0C'}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#16213e',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  batteryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  socText: {
    fontSize: 32,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginLeft: 12,
  },
  socPercent: {
    fontSize: 18,
    fontWeight: '500',
  },
  subInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#16213e',
  },
  subInfoItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: 12,
  },
  subInfoValue: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  subInfoUnit: {
    color: COLORS.subValue,
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 2,
  },
  subInfoDivider: {
    width: 1,
    height: 16,
    backgroundColor: '#16213e',
  },
});
