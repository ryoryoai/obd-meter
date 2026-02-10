import React, { useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, {
  Rect,
  Text as SvgText,
  Line,
  G,
  Defs,
  LinearGradient,
  Stop,
  Circle,
  Polygon,
  Path,
} from 'react-native-svg';
import { useBatteryHealthStore } from '../store/batteryHealthStore';
import { useOBDStore } from '../store/obdStore';
import { BarMeter } from '../components/meters/BarMeter';
import { THEME } from '../utils/theme';
import type { DiagnosticTroubleCode } from '../types/obd';

const SVG_W = 560;
const SVG_H = 300;

/** MM:SS 形式にフォーマット */
function formatMMSS(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** デモ用ランダムDTCを2件生成 */
function generateDemoDTCs(): DiagnosticTroubleCode[] {
  const pool: DiagnosticTroubleCode[] = [
    { code: 'P0301', description: 'Cylinder 1 Misfire Detected', isPending: false },
    { code: 'P0A80', description: 'Replace Hybrid Battery Pack', isPending: false },
    { code: 'P3000', description: 'HV Battery Malfunction', isPending: true },
    { code: 'C1234', description: 'ABS Sensor Malfunction', isPending: true },
    { code: 'P0171', description: 'System Too Lean Bank 1', isPending: false },
    { code: 'P0420', description: 'Catalyst Efficiency Below Threshold', isPending: true },
  ];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 2);
}

// ─── パワーフロー図 ───────────────────────────────────

interface PowerFlowDiagramProps {
  engineKw: number;
  mg1Kw: number;
  mg2Kw: number;
  batteryKw: number;
  wheelKw: number;
  evMode: boolean;
}

/**
 * パワーフロー図 (THS-II アーキテクチャ)
 *
 * 横レイアウト:
 *   ENGINE ──MG1──▶ [POWER SPLIT] ──MG2──▶ WHEELS
 *                        │
 *                    BATTERY
 *
 * - 太さ = |kW| に比例
 * - 矢印 = エネルギーの流れ方向
 * - 色 = コンポーネント別 (Engine=橙, Battery=シアン, Wheels=黄)
 */
function PowerFlowDiagram({
  engineKw,
  mg1Kw,
  mg2Kw,
  batteryKw,
  wheelKw,
  evMode,
}: PowerFlowDiagramProps): React.JSX.Element {
  // レイアウト定数
  const blockW = 110;
  const blockH = 56;
  const splitR = 28;

  // 各ブロック中心座標
  const engineCx = 70;
  const engineCy = 90;
  const splitCx = SVG_W / 2;
  const splitCy = 90;
  const wheelCx = SVG_W - 70;
  const wheelCy = 90;
  const batteryCx = SVG_W / 2;
  const batteryCy = 240;

  const engineFill = evMode ? '#333340' : THEME.engineColor;
  const engineTextColor = evMode ? '#666' : '#fff';

  /** kW → 線幅 (最小2, 最大8) */
  const kwToWidth = (kw: number): number => Math.max(2, Math.min(8, Math.abs(kw) * 1.5 + 2));

  // アニメーション用共有値 (ダッシュオフセット)
  const AnimatedLine = Animated.createAnimatedComponent(Line);
  const dashAnim = useSharedValue(0);

  useEffect(() => {
    dashAnim.value = withRepeat(
      withTiming(20, { duration: 800, easing: Easing.linear }),
      -1,
      false,
    );
  }, [dashAnim]);

  /** フロー矢印: アニメーション付きの方向性のあるフローライン */
  const FlowArrow = ({
    x1, y1, x2, y2,
    kw, color, label,
  }: {
    x1: number; y1: number; x2: number; y2: number;
    kw: number; color: string; label: string;
  }) => {
    const abskw = Math.abs(kw);
    const isActive = abskw > 0.05;
    const width = kwToWidth(kw);

    // 矢印方向: kw > 0 → x1→x2, kw < 0 → x2→x1
    const forward = kw >= 0;

    // 線の方向ベクトル
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / len;
    const uy = dy / len;
    // 法線 (ラベルオフセット用)
    const nx = -uy;
    const ny = ux;

    // 矢印先端座標 (forward: x2側, backward: x1側)
    const tipX = forward ? x2 : x1;
    const tipY = forward ? y2 : y1;
    const dirUx = forward ? ux : -ux;
    const dirUy = forward ? uy : -uy;
    const arrowSize = width + 7;

    // 三角形矢印 (先端に1個)
    const triTip = `${tipX},${tipY}`;
    const triL = `${tipX - dirUx * arrowSize - dirUy * arrowSize * 0.6},${tipY - dirUy * arrowSize + dirUx * arrowSize * 0.6}`;
    const triR = `${tipX - dirUx * arrowSize + dirUy * arrowSize * 0.6},${tipY - dirUy * arrowSize - dirUx * arrowSize * 0.6}`;

    // 中間矢印 (線の途中にもシェブロンを配置)
    const chevrons: { cx: number; cy: number }[] = [];
    const chevronCount = Math.floor(len / 50);
    for (let i = 1; i <= chevronCount; i++) {
      const t = i / (chevronCount + 1);
      chevrons.push({
        cx: x1 + dx * t,
        cy: y1 + dy * t,
      });
    }
    const chevronSize = 6;

    // ラベル位置 (中点からオフセット)
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const labelOff = 18; // 法線方向にオフセット
    const lx = midX + nx * labelOff;
    const ly = midY + ny * labelOff;

    // アニメーションダッシュ (流れる点線)
    const animProps = useAnimatedProps(() => ({
      strokeDashoffset: forward ? -dashAnim.value : dashAnim.value,
    }));

    return (
      <G>
        {/* ベースライン (薄い背景線) */}
        <Line
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={color}
          strokeWidth={width + 4}
          opacity={isActive ? 0.08 : 0.04}
          strokeLinecap="round"
        />

        {/* アニメーション流線 (ダッシュが流れる) */}
        {isActive && (
          <AnimatedLine
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={color}
            strokeWidth={width}
            opacity={0.9}
            strokeLinecap="round"
            strokeDasharray="6,14"
            animatedProps={animProps}
          />
        )}

        {/* 非アクティブ時は細い実線 */}
        {!isActive && (
          <Line
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={THEME.textMuted}
            strokeWidth={1.5}
            opacity={0.4}
            strokeDasharray="4,8"
          />
        )}

        {/* 先端矢印 */}
        {isActive && (
          <Polygon
            points={`${triTip} ${triL} ${triR}`}
            fill={color}
            opacity={0.95}
          />
        )}

        {/* 中間シェブロン (流れの方向を強調) */}
        {isActive && chevrons.map((c, i) => {
          const cTip = `${c.cx + dirUx * chevronSize},${c.cy + dirUy * chevronSize}`;
          const cL = `${c.cx - dirUx * chevronSize * 0.3 - dirUy * chevronSize * 0.5},${c.cy - dirUy * chevronSize * 0.3 + dirUx * chevronSize * 0.5}`;
          const cR = `${c.cx - dirUx * chevronSize * 0.3 + dirUy * chevronSize * 0.5},${c.cy - dirUy * chevronSize * 0.3 - dirUx * chevronSize * 0.5}`;
          return (
            <Polygon
              key={`chev-${i}`}
              points={`${cTip} ${cL} ${cR}`}
              fill={color}
              opacity={0.5}
            />
          );
        })}

        {/* ラベル背景 */}
        <Rect
          x={lx - 36}
          y={ly - 14}
          width={72}
          height={28}
          rx={6}
          fill={THEME.bgCard}
          stroke={color}
          strokeWidth={0.5}
          opacity={0.9}
        />
        {/* ラベル: MG名 */}
        <SvgText
          x={lx}
          y={ly - 3}
          fill={THEME.textSecondary}
          fontSize={9}
          fontWeight="600"
          textAnchor="middle"
        >
          {label}
        </SvgText>
        {/* ラベル: kW値 */}
        <SvgText
          x={lx}
          y={ly + 10}
          fill={isActive ? color : THEME.textDim}
          fontSize={12}
          fontWeight="700"
          textAnchor="middle"
        >
          {isActive ? `${abskw.toFixed(1)} kW` : '---'}
        </SvgText>
      </G>
    );
  };

  /** コンポーネントブロック */
  const Block = ({
    cx, cy, label, value, bgColor, textColor = '#fff', icon,
  }: {
    cx: number; cy: number; label: string; value: string;
    bgColor: string; textColor?: string; icon?: string;
  }) => (
    <G>
      {/* グロー効果 */}
      <Rect
        x={cx - blockW / 2 - 2}
        y={cy - blockH / 2 - 2}
        width={blockW + 4}
        height={blockH + 4}
        rx={12}
        fill={bgColor}
        opacity={0.15}
      />
      {/* メインブロック */}
      <Rect
        x={cx - blockW / 2}
        y={cy - blockH / 2}
        width={blockW}
        height={blockH}
        rx={10}
        fill={bgColor}
        opacity={0.9}
      />
      {/* ブロック内線 (装飾) */}
      <Line
        x1={cx - blockW / 2 + 10}
        y1={cy + blockH / 2 - 16}
        x2={cx + blockW / 2 - 10}
        y2={cy + blockH / 2 - 16}
        stroke={textColor}
        strokeWidth={0.5}
        opacity={0.3}
      />
      {/* ラベル */}
      <SvgText
        x={cx}
        y={cy - 6}
        fill={textColor}
        fontSize={13}
        fontWeight="bold"
        textAnchor="middle"
      >
        {icon ? `${icon} ${label}` : label}
      </SvgText>
      {/* 値 */}
      <SvgText
        x={cx}
        y={cy + 14}
        fill={textColor}
        fontSize={15}
        fontWeight="700"
        textAnchor="middle"
        opacity={0.9}
      >
        {value}
      </SvgText>
    </G>
  );

  return (
    <Svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`}>
      <Defs>
        <LinearGradient id="splitGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={THEME.motorColor} stopOpacity="0.8" />
          <Stop offset="1" stopColor={THEME.motorColor} stopOpacity="0.4" />
        </LinearGradient>
      </Defs>

      {/* === フロー矢印 === */}

      {/* ENGINE → Power Split (MG1) */}
      <FlowArrow
        x1={engineCx + blockW / 2 + 4}
        y1={engineCy}
        x2={splitCx - splitR - 6}
        y2={splitCy}
        kw={mg1Kw}
        color={THEME.engineColor}
        label="MG1"
      />

      {/* Power Split → WHEELS (MG2) */}
      <FlowArrow
        x1={splitCx + splitR + 6}
        y1={splitCy}
        x2={wheelCx - blockW / 2 - 4}
        y2={wheelCy}
        kw={mg2Kw}
        color={THEME.wheelColor}
        label="MG2"
      />

      {/* BATTERY ↔ Power Split (縦) */}
      <FlowArrow
        x1={splitCx}
        y1={splitCy + splitR + 6}
        x2={batteryCx}
        y2={batteryCy - blockH / 2 - 4}
        kw={batteryKw}
        color={THEME.batteryColor}
        label="DC"
      />

      {/* === 中央ノード (Power Split Device / 遊星歯車) === */}
      <Circle
        cx={splitCx}
        cy={splitCy}
        r={splitR + 4}
        fill={THEME.motorColor}
        opacity={0.1}
      />
      <Circle
        cx={splitCx}
        cy={splitCy}
        r={splitR}
        fill="url(#splitGrad)"
      />
      {/* 遊星歯車のシンボル (内側の歯車模様) */}
      <Circle
        cx={splitCx}
        cy={splitCy}
        r={splitR - 6}
        fill="none"
        stroke={THEME.bg}
        strokeWidth={2}
        opacity={0.4}
      />
      <Circle cx={splitCx} cy={splitCy} r={5} fill={THEME.bg} opacity={0.5} />
      <SvgText
        x={splitCx}
        y={splitCy + 42}
        fill={THEME.textDim}
        fontSize={9}
        textAnchor="middle"
      >
        POWER SPLIT
      </SvgText>

      {/* === コンポーネントブロック === */}

      {/* ENGINE */}
      <Block
        cx={engineCx}
        cy={engineCy}
        label="ENGINE"
        value={evMode ? 'OFF' : `${engineKw.toFixed(1)} kW`}
        bgColor={engineFill}
        textColor={engineTextColor}
      />

      {/* WHEELS */}
      <Block
        cx={wheelCx}
        cy={wheelCy}
        label="WHEELS"
        value={`${wheelKw.toFixed(1)} kW`}
        bgColor={THEME.wheelColor}
        textColor="#000"
      />

      {/* BATTERY */}
      <Block
        cx={batteryCx}
        cy={batteryCy}
        label="BATTERY"
        value={`${batteryKw.toFixed(1)} kW`}
        bgColor={THEME.batteryColor}
        textColor="#fff"
      />

      {/* EV Mode バッジ */}
      {evMode && (
        <G>
          <Rect
            x={SVG_W - 80}
            y={12}
            width={64}
            height={26}
            rx={13}
            fill={THEME.success}
          />
          <SvgText
            x={SVG_W - 48}
            y={30}
            fill="#000"
            fontSize={13}
            fontWeight="bold"
            textAnchor="middle"
          >
            EV
          </SvgText>
        </G>
      )}
    </Svg>
  );
}

// ─── メイン画面 ──────────────────────────────────────

export function HVSystemScreen(): React.JSX.Element {
  const powerFlow = useBatteryHealthStore((s) => s.powerFlow);
  const engineStats = useBatteryHealthStore((s) => s.engineStats);
  const evThresholdLog = useBatteryHealthStore((s) => s.evThresholdLog);
  const dtcList = useBatteryHealthStore((s) => s.dtcList);
  const setDTCs = useBatteryHealthStore((s) => s.setDTCs);

  const obdData = useOBDStore((s) => s.data);
  const coolantTemp = obdData['0105']?.value ?? 0;

  // EV閾値推定: EVモードからエンジン起動した瞬間の冷却水温の平均
  const evThreshold = useMemo(() => {
    const transitions = evThresholdLog.filter(
      (o) => o.wasEvMode && o.engineRpm > 100,
    );
    if (transitions.length < 3) return null;
    const sum = transitions.reduce((acc, o) => acc + o.coolantTemp, 0);
    return sum / transitions.length;
  }, [evThresholdLog]);

  const handleReadDTCs = () => {
    const demoDTCs = generateDemoDTCs();
    setDTCs(demoDTCs);
  };

  const handleClearDTCs = () => {
    setDTCs([]);
  };

  // 閾値ステータス判定
  const thresholdStatus = useMemo(() => {
    if (evThreshold === null) return null;
    if (coolantTemp >= evThreshold) {
      return { label: 'EV Available', color: THEME.success };
    }
    return { label: 'Engine Required', color: THEME.accent };
  }, [coolantTemp, evThreshold]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
    >
      {/* Header */}
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>HV System Monitor</Text>
      </View>

      {/* Top row: Power Flow + Stats */}
      <View style={styles.topRow}>
        {/* Left: Power Flow Diagram */}
        <View style={[styles.card, styles.powerFlowCard]}>
          <Text style={styles.cardTitle}>Power Flow</Text>
          <PowerFlowDiagram
            engineKw={powerFlow.engineKw}
            mg1Kw={powerFlow.mg1Kw}
            mg2Kw={powerFlow.mg2Kw}
            batteryKw={powerFlow.batteryKw}
            wheelKw={powerFlow.wheelKw}
            evMode={powerFlow.evMode}
          />
        </View>

        {/* Right: Engine Stats + EV Threshold */}
        <View style={styles.rightColumn}>
          {/* Engine Stats */}
          <View style={[styles.card, styles.statsCard]}>
            <Text style={styles.cardTitle}>Engine Stats</Text>
            <View style={styles.barMeterWrap}>
              <BarMeter
                value={engineStats.engineOnRatio * 100}
                min={0}
                max={100}
                unit="%"
                label="ON Ratio"
                width={220}
                height={50}
              />
            </View>
            <View style={styles.statsRow}>
              <Text style={styles.statsLabel}>ON Time</Text>
              <Text style={styles.statsValue}>
                {formatMMSS(engineStats.engineOnSeconds)}
              </Text>
            </View>
            <View style={styles.statsRow}>
              <Text style={styles.statsLabel}>Total</Text>
              <Text style={styles.statsValue}>
                {formatMMSS(engineStats.totalSeconds)}
              </Text>
            </View>
          </View>

          {/* EV Threshold */}
          <View style={[styles.card, styles.thresholdCard]}>
            <Text style={styles.cardTitle}>EV Threshold</Text>
            <View style={styles.statsRow}>
              <Text style={styles.statsLabel}>Coolant</Text>
              <Text style={styles.statsValue}>{coolantTemp.toFixed(0)}{'\u00B0'}C</Text>
            </View>
            <View style={styles.statsRow}>
              <Text style={styles.statsLabel}>Threshold</Text>
              <Text style={styles.statsValue}>
                {evThreshold !== null
                  ? `~${evThreshold.toFixed(0)}\u00B0C`
                  : 'Observing...'}
              </Text>
            </View>
            {thresholdStatus !== null && (
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: thresholdStatus.color }]} />
                <Text style={[styles.statusText, { color: thresholdStatus.color }]}>
                  {thresholdStatus.label}
                </Text>
              </View>
            )}
            {evThreshold === null && (
              <View style={styles.statusRow}>
                <Text style={styles.observingText}>
                  Need {Math.max(0, 3 - evThresholdLog.filter((o) => o.wasEvMode && o.engineRpm > 100).length)} more observations
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* DTC Section */}
      <View style={[styles.card, styles.dtcCard]}>
        <View style={styles.dtcHeader}>
          <Text style={styles.cardTitle}>DTC (Diagnostic Trouble Codes)</Text>
          <View style={styles.dtcButtons}>
            <TouchableOpacity
              style={styles.dtcButton}
              onPress={handleReadDTCs}
              activeOpacity={0.7}
            >
              <Text style={styles.dtcButtonText}>Read</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dtcButton, styles.dtcClearButton]}
              onPress={handleClearDTCs}
              activeOpacity={0.7}
            >
              <Text style={styles.dtcButtonText}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>

        {dtcList.length === 0 ? (
          <Text style={styles.noDtcText}>No DTCs found (demo mode)</Text>
        ) : (
          dtcList.map((dtc, index) => (
            <View key={`${dtc.code}-${index}`} style={styles.dtcRow}>
              <Text style={styles.dtcCode}>{dtc.code}</Text>
              <Text style={styles.dtcDesc} numberOfLines={1}>
                {dtc.description}
              </Text>
              <Text
                style={[
                  styles.dtcStatus,
                  {
                    color: dtc.isPending ? THEME.warning : THEME.textSecondary,
                  },
                ]}
              >
                ({dtc.isPending ? 'pending' : 'stored'})
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

// ─── スタイル ────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  screenContent: {
    padding: 14,
    paddingBottom: 24,
  },
  headerBar: {
    backgroundColor: THEME.bgElevated,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
    marginHorizontal: -14,
    marginTop: -14,
    marginBottom: 14,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: THEME.text,
  },

  topRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },

  card: {
    backgroundColor: THEME.bgCard,
    borderRadius: THEME.radiusMd,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 10,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    borderLeftWidth: 3,
    borderLeftColor: THEME.primary,
    paddingLeft: 8,
  },

  powerFlowCard: {
    flex: 1.2,
    minWidth: 580,
  },
  rightColumn: {
    flex: 1,
    gap: 10,
  },
  statsCard: {
    flex: 1,
  },
  thresholdCard: {
    flex: 1,
  },

  barMeterWrap: {
    marginBottom: 6,
  },

  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  statsLabel: {
    fontSize: 13,
    color: THEME.textDim,
  },
  statsValue: {
    fontSize: 15,
    fontWeight: '600',
    color: THEME.text,
    fontVariant: ['tabular-nums'],
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  observingText: {
    fontSize: 12,
    color: THEME.textDim,
    fontStyle: 'italic',
  },

  // DTC
  dtcCard: {
    marginTop: 0,
  },
  dtcHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dtcButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  dtcButton: {
    backgroundColor: THEME.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: THEME.radiusSm,
  },
  dtcClearButton: {
    backgroundColor: THEME.accent,
  },
  dtcButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  noDtcText: {
    fontSize: 13,
    color: THEME.textDim,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  dtcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.bgInput,
    borderRadius: THEME.radiusSm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 4,
    gap: 10,
  },
  dtcCode: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.primary,
    fontVariant: ['tabular-nums'],
    minWidth: 52,
  },
  dtcDesc: {
    flex: 1,
    fontSize: 12,
    color: THEME.text,
  },
  dtcStatus: {
    fontSize: 11,
    fontWeight: '500',
    minWidth: 60,
    textAlign: 'right',
  },
});
