import React, { useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Svg, {
  Circle,
  Path,
  Line,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withSpring,
  useDerivedValue,
} from 'react-native-reanimated';

const AnimatedLine = Animated.createAnimatedComponent(Line);

// ダークテーマカラー
const COLORS = {
  background: '#1a1a2e',
  arc: '#16213e',
  value: '#e94560',
  primary: '#00d4ff',
  warning: '#ffd700',
  danger: '#e94560',
  text: '#ffffff',
  tickMinor: '#334155',
  tickMajor: '#64748b',
  needle: '#e94560',
  needleCenter: '#ffffff',
  normalZone: '#00d4ff',
};

interface GaugeMeterProps {
  value: number;
  min: number;
  max: number;
  unit: string;
  label: string;
  size?: number;
  warningThreshold?: number;
  dangerThreshold?: number;
}

/**
 * SVGベースの円形アナログゲージメーター
 *
 * 270度のアーク（下部が開いた円弧）で値を表示する。
 * react-native-reanimated によるスプリングアニメーションで
 * 針がスムーズに動く。warningThreshold / dangerThreshold を
 * 超えた領域は色分けされる。
 */
export const GaugeMeter: React.FC<GaugeMeterProps> = ({
  value,
  min,
  max,
  unit,
  label,
  size = 200,
  warningThreshold,
  dangerThreshold,
}) => {
  const animatedValue = useSharedValue(min);

  // 値の範囲をクランプしてアニメーション
  useEffect(() => {
    const clamped = Math.max(min, Math.min(max, value));
    animatedValue.value = withSpring(clamped, {
      damping: 20,
      stiffness: 90,
      mass: 1,
    });
  }, [value, min, max, animatedValue]);

  const center = size / 2;
  const radius = size * 0.38;
  const strokeWidth = size * 0.06;
  const needleLength = radius - strokeWidth;
  const innerRadius = radius - strokeWidth * 1.5;

  // ゲージの角度設定: 270度のアーク、下部135度から開始
  const startAngle = 135; // 左下から開始 (度)
  const endAngle = 405; // 右下で終了 (135 + 270)
  const sweepAngle = 270;

  // 角度をラジアンに変換
  const toRadians = (deg: number) => (deg * Math.PI) / 180;

  // 値を角度に変換 (min -> startAngle, max -> endAngle)
  const valueToAngle = (v: number) => {
    const ratio = (v - min) / (max - min);
    return startAngle + ratio * sweepAngle;
  };

  // 角度から座標を計算
  const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number) => {
    const rad = toRadians(angleDeg);
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  };

  // SVGアークパスを生成する
  const describeArc = (
    cx: number,
    cy: number,
    r: number,
    startDeg: number,
    endDeg: number,
  ) => {
    const start = polarToCartesian(cx, cy, r, endDeg);
    const end = polarToCartesian(cx, cy, r, startDeg);
    const arcSweep = endDeg - startDeg <= 180 ? 0 : 1;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${arcSweep} 0 ${end.x} ${end.y}`;
  };

  // 背景アーク (フルスイープ)
  const backgroundArc = describeArc(center, center, radius, startAngle, endAngle);

  // ゾーン別アークを生成
  const renderZoneArcs = () => {
    const arcs: React.ReactNode[] = [];

    // 通常ゾーン
    const normalEnd = warningThreshold
      ? valueToAngle(Math.min(warningThreshold, max))
      : endAngle;
    arcs.push(
      <Path
        key="normal-zone"
        d={describeArc(center, center, radius, startAngle, normalEnd)}
        stroke={COLORS.normalZone}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        opacity={0.3}
      />,
    );

    // 警告ゾーン
    if (warningThreshold !== undefined && warningThreshold < max) {
      const warningStart = valueToAngle(warningThreshold);
      const warningEnd = dangerThreshold
        ? valueToAngle(Math.min(dangerThreshold, max))
        : endAngle;
      arcs.push(
        <Path
          key="warning-zone"
          d={describeArc(center, center, radius, warningStart, warningEnd)}
          stroke={COLORS.warning}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="butt"
          opacity={0.4}
        />,
      );
    }

    // 危険ゾーン
    if (dangerThreshold !== undefined && dangerThreshold < max) {
      const dangerStart = valueToAngle(dangerThreshold);
      arcs.push(
        <Path
          key="danger-zone"
          d={describeArc(center, center, radius, dangerStart, endAngle)}
          stroke={COLORS.danger}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          opacity={0.5}
        />,
      );
    }

    return arcs;
  };

  // 目盛り描画
  const renderTicks = () => {
    const ticks: React.ReactNode[] = [];
    const majorTickCount = 10;
    const minorTickCount = 50;

    // マイナーティック
    for (let i = 0; i <= minorTickCount; i++) {
      const angle = startAngle + (sweepAngle / minorTickCount) * i;
      const outer = polarToCartesian(center, center, radius - strokeWidth / 2 - 1, angle);
      const inner = polarToCartesian(center, center, radius - strokeWidth / 2 - size * 0.03, angle);
      ticks.push(
        <Line
          key={`minor-${i}`}
          x1={outer.x}
          y1={outer.y}
          x2={inner.x}
          y2={inner.y}
          stroke={COLORS.tickMinor}
          strokeWidth={1}
        />,
      );
    }

    // メジャーティック + ラベル
    for (let i = 0; i <= majorTickCount; i++) {
      const angle = startAngle + (sweepAngle / majorTickCount) * i;
      const outer = polarToCartesian(center, center, radius - strokeWidth / 2 - 1, angle);
      const inner = polarToCartesian(
        center,
        center,
        radius - strokeWidth / 2 - size * 0.06,
        angle,
      );
      const labelPos = polarToCartesian(
        center,
        center,
        innerRadius - size * 0.06,
        angle,
      );

      ticks.push(
        <Line
          key={`major-${i}`}
          x1={outer.x}
          y1={outer.y}
          x2={inner.x}
          y2={inner.y}
          stroke={COLORS.tickMajor}
          strokeWidth={2}
        />,
      );

      const tickValue = Math.round(min + ((max - min) / majorTickCount) * i);
      ticks.push(
        <SvgText
          key={`label-${i}`}
          x={labelPos.x}
          y={labelPos.y}
          fill={COLORS.tickMajor}
          fontSize={size * 0.055}
          textAnchor="middle"
          alignmentBaseline="central"
        >
          {tickValue}
        </SvgText>,
      );
    }

    return ticks;
  };

  // アニメーションされた針のprops
  const animatedNeedleAngle = useDerivedValue(() => {
    const ratio = (animatedValue.value - min) / (max - min);
    return startAngle + ratio * sweepAngle;
  });

  const needleAnimatedProps = useAnimatedProps(() => {
    const angle = animatedNeedleAngle.value;
    const rad = (angle * Math.PI) / 180;
    const tipX = center + needleLength * Math.cos(rad);
    const tipY = center + needleLength * Math.sin(rad);
    // 針の根元 (中心から少し反対方向)
    const tailLength = size * 0.05;
    const tailX = center - tailLength * Math.cos(rad);
    const tailY = center - tailLength * Math.sin(rad);

    return {
      x1: tailX,
      y1: tailY,
      x2: tipX,
      y2: tipY,
    };
  });

  // 値表示テキストの色を決定
  const getValueColor = () => {
    if (dangerThreshold !== undefined && value >= dangerThreshold) {
      return COLORS.danger;
    }
    if (warningThreshold !== undefined && value >= warningThreshold) {
      return COLORS.warning;
    }
    return COLORS.value;
  };

  // 表示する値をフォーマット
  const displayValue = Math.max(min, Math.min(max, value));
  const formattedValue =
    max - min > 100 ? Math.round(displayValue).toString() : displayValue.toFixed(1);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <LinearGradient id="needleGradient" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={COLORS.needle} stopOpacity="0.6" />
            <Stop offset="1" stopColor={COLORS.needle} stopOpacity="1" />
          </LinearGradient>
        </Defs>

        {/* 背景円 */}
        <Circle
          cx={center}
          cy={center}
          r={radius + strokeWidth}
          fill={COLORS.background}
        />

        {/* 背景アーク */}
        <Path
          d={backgroundArc}
          stroke={COLORS.arc}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
        />

        {/* カラーゾーン */}
        {renderZoneArcs()}

        {/* 目盛り */}
        {renderTicks()}

        {/* アニメーション針 */}
        <AnimatedLine
          animatedProps={needleAnimatedProps}
          stroke={COLORS.needle}
          strokeWidth={size * 0.015}
          strokeLinecap="round"
        />

        {/* 中心円 */}
        <Circle cx={center} cy={center} r={size * 0.03} fill={COLORS.needleCenter} />
        <Circle cx={center} cy={center} r={size * 0.02} fill={COLORS.needle} />
      </Svg>

      {/* デジタル値表示 (中央) */}
      <View style={[styles.valueContainer, { top: center + size * 0.1 }]}>
        <Text
          style={[
            styles.valueText,
            {
              fontSize: size * 0.14,
              color: getValueColor(),
            },
          ]}
        >
          {formattedValue}
        </Text>
        <Text style={[styles.unitText, { fontSize: size * 0.06 }]}>{unit}</Text>
      </View>

      {/* ラベル (下部) */}
      <View style={[styles.labelContainer, { bottom: size * 0.05 }]}>
        <Text style={[styles.labelText, { fontSize: size * 0.065 }]}>{label}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueContainer: {
    position: 'absolute',
    alignItems: 'center',
  },
  valueText: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  unitText: {
    color: COLORS.tickMajor,
    fontWeight: '500',
    marginTop: -2,
  },
  labelContainer: {
    position: 'absolute',
    alignItems: 'center',
  },
  labelText: {
    color: COLORS.text,
    fontWeight: '600',
    opacity: 0.8,
  },
});
