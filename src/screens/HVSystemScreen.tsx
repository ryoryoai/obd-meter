import React, { useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  TouchableOpacity,
  Platform,
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
  Circle,
  Polygon,
} from 'react-native-svg';
import { useBatteryHealthStore } from '../store/batteryHealthStore';
import { useOBDStore } from '../store/obdStore';
import { BarMeter } from '../components/meters/BarMeter';
import { THEME } from '../utils/theme';
import type { DiagnosticTroubleCode } from '../types/obd';

// ─── 定数 ─────────────────────────────────────────────

// Car SVG viewBox (prius-silhouette.svg と一致させる)
const CAR_W = 398;
const CAR_H = 190;

/**
 * ZVW30 Prius 物理レイアウトに基づくコンポーネント位置
 * (car viewBox座標系: 0,0=左上, 398x190)
 *
 *  車体前端 x≈24  後端 x≈375
 *  屋根 y≈33      車体下部 y≈143
 *  前輪ハブ x≈88  後輪ハブ x≈310
 *
 * 配置方針: 縦方向に大きく分離して重複を回避
 *  ENGINE  → 屋根上(フード上方の空間)
 *  P.SPLIT → エンジンベイ中央
 *  WHEELS  → 車体下方(タイヤ接地面付近)
 *  BATTERY → 後方床下
 */
const POS = {
  engine:     { x: 65, y: 40 },    // フード上方 (車体の上の空間)
  powerSplit: { x: 112, y: 100 },  // エンジンベイ内
  battery:    { x: 255, y: 160 },  // 後方床下 (地面付近)
  frontWheel: { x: 88, y: 158 },   // 前輪ハブ
  rearWheel:  { x: 310, y: 158 },  // 後輪ハブ
  wheels:     { x: 70, y: 170 },   // 車体下方 (前輪の下)
} as const;

// ─── ヘルパー ─────────────────────────────────────────

function formatMMSS(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

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

// ─── パワーフロー車体オーバーレイ ──────────────────────

interface PowerFlowProps {
  engineKw: number;
  mg1Kw: number;
  mg2Kw: number;
  batteryKw: number;
  wheelKw: number;
  evMode: boolean;
}

/**
 * プリウス線画を背景に、THS-II パワーフロー要素を
 * 車体上の実際の位置にオーバーレイ表示する。
 *
 * viewBox を car SVG と一致させることで自動的に座標が揃う。
 */
function PowerFlowCarOverlay({
  engineKw, mg1Kw, mg2Kw, batteryKw, wheelKw, evMode,
}: PowerFlowProps): React.JSX.Element {
  const AnimatedLine = Animated.createAnimatedComponent(Line);
  const dashAnim = useSharedValue(0);

  useEffect(() => {
    dashAnim.value = withRepeat(
      withTiming(20, { duration: 800, easing: Easing.linear }),
      -1,
      false,
    );
  }, [dashAnim]);

  const kwToWidth = (kw: number) =>
    Math.max(1.2, Math.min(4.5, Math.abs(kw) * 0.7 + 1.2));

  /** フロー矢印 */
  const FlowArrow = ({
    x1, y1, x2, y2, kw, color, label,
  }: {
    x1: number; y1: number; x2: number; y2: number;
    kw: number; color: string; label: string;
  }) => {
    const abskw = Math.abs(kw);
    const active = abskw > 0.05;
    const forward = kw >= 0;
    const w = kwToWidth(kw);

    const animProps = useAnimatedProps(() => ({
      strokeDashoffset: forward ? -dashAnim.value : dashAnim.value,
    }));

    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.1) return null;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;

    // 矢印先端
    const tipX = forward ? x2 : x1;
    const tipY = forward ? y2 : y1;
    const dirUx = forward ? ux : -ux;
    const dirUy = forward ? uy : -uy;
    const as = w + 4;
    const triTip = `${tipX},${tipY}`;
    const triL = `${tipX - dirUx * as - dirUy * as * 0.5},${tipY - dirUy * as + dirUx * as * 0.5}`;
    const triR = `${tipX - dirUx * as + dirUy * as * 0.5},${tipY - dirUy * as - dirUx * as * 0.5}`;

    // ラベル位置 (中点から法線方向にオフセット)
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const lOff = 10;
    const lx = midX + nx * lOff;
    const ly = midY + ny * lOff;

    return (
      <G>
        {/* 背景グロー */}
        <Line
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={color} strokeWidth={w + 3}
          opacity={active ? 0.08 : 0.03} strokeLinecap="round"
        />

        {/* アニメーションフロー線 / 非アクティブ点線 */}
        {active ? (
          <AnimatedLine
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={color} strokeWidth={w} opacity={0.9}
            strokeLinecap="round" strokeDasharray="4,10"
            animatedProps={animProps}
          />
        ) : (
          <Line
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={THEME.textMuted} strokeWidth={1}
            opacity={0.3} strokeDasharray="3,6"
          />
        )}

        {/* 矢印先端 */}
        {active && (
          <Polygon
            points={`${triTip} ${triL} ${triR}`}
            fill={color} opacity={0.9}
          />
        )}

        {/* ラベル背景 + テキスト */}
        <Rect
          x={lx - 22} y={ly - 9} width={44} height={18} rx={3}
          fill={THEME.bgCard} stroke={active ? color : THEME.textMuted}
          strokeWidth={0.4} opacity={0.92}
        />
        <SvgText
          x={lx} y={ly - 1.5}
          fill={THEME.textSecondary} fontSize={5.5}
          fontWeight="600" textAnchor="middle"
        >
          {label}
        </SvgText>
        <SvgText
          x={lx} y={ly + 6}
          fill={active ? color : THEME.textDim} fontSize={6.5}
          fontWeight="700" textAnchor="middle"
        >
          {active ? `${abskw.toFixed(1)} kW` : '---'}
        </SvgText>
      </G>
    );
  };

  /** コンポーネントブロック (半透明背景 + ラベル + 値) */
  const Block = ({
    cx, cy, label, value, bgColor, textColor = '#fff', w = 58, h = 26,
  }: {
    cx: number; cy: number; label: string; value: string;
    bgColor: string; textColor?: string; w?: number; h?: number;
  }) => (
    <G>
      {/* 外側グロー */}
      <Rect
        x={cx - w / 2 - 2} y={cy - h / 2 - 2}
        width={w + 4} height={h + 4}
        rx={7} fill={bgColor} opacity={0.2}
      />
      {/* メインブロック */}
      <Rect
        x={cx - w / 2} y={cy - h / 2}
        width={w} height={h}
        rx={5} fill={bgColor} opacity={0.88}
      />
      {/* ラベル */}
      <SvgText
        x={cx} y={cy - 2}
        fill={textColor} fontSize={6.5}
        fontWeight="bold" textAnchor="middle"
      >
        {label}
      </SvgText>
      {/* 値 */}
      <SvgText
        x={cx} y={cy + 8}
        fill={textColor} fontSize={8.5}
        fontWeight="700" textAnchor="middle"
      >
        {value}
      </SvgText>
    </G>
  );

  return (
    <View style={styles.powerFlowArea}>
      {/* 車体シルエット背景 */}
      {Platform.OS === 'web' && (
        <Image
          source={{ uri: '/prius-silhouette.svg' }}
          style={styles.carImage}
          resizeMode="contain"
        />
      )}

      {/* SVG オーバーレイ (car viewBox と同一座標系で自動整列) */}
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${CAR_W} ${CAR_H}`}
        preserveAspectRatio="xMidYMid meet"
        style={styles.svgOverlay}
      >
        {/* ── フロー矢印 (要素間を十分に離して配置) ── */}

        {/* ENGINE → POWER SPLIT (MG1): 上から斜め下へ */}
        <FlowArrow
          x1={POS.engine.x + 24} y1={POS.engine.y + 14}
          x2={POS.powerSplit.x - 8} y2={POS.powerSplit.y - 10}
          kw={mg1Kw} color={THEME.engineColor} label="MG1"
        />

        {/* POWER SPLIT → WHEELS (MG2): 下方向へ */}
        <FlowArrow
          x1={POS.powerSplit.x - 8} y1={POS.powerSplit.y + 12}
          x2={POS.wheels.x + 8} y2={POS.wheels.y - 14}
          kw={mg2Kw} color={THEME.wheelColor} label="MG2"
        />

        {/* POWER SPLIT ↔ BATTERY (DC): 右後方へ */}
        <FlowArrow
          x1={POS.powerSplit.x + 14} y1={POS.powerSplit.y + 8}
          x2={POS.battery.x - 34} y2={POS.battery.y - 4}
          kw={batteryKw} color={THEME.batteryColor} label="DC"
        />

        {/* ── POWER SPLIT ノード (遊星歯車) ── */}
        <Circle
          cx={POS.powerSplit.x} cy={POS.powerSplit.y}
          r={10} fill={THEME.motorColor} opacity={0.55}
        />
        <Circle
          cx={POS.powerSplit.x} cy={POS.powerSplit.y}
          r={6} fill="none" stroke={THEME.bg}
          strokeWidth={1.5} opacity={0.4}
        />
        <Circle
          cx={POS.powerSplit.x} cy={POS.powerSplit.y}
          r={2.5} fill={THEME.bg} opacity={0.5}
        />
        <SvgText
          x={POS.powerSplit.x + 16} y={POS.powerSplit.y + 4}
          fill={THEME.textDim} fontSize={4}
          fontWeight="600" textAnchor="start"
        >
          P.SPLIT
        </SvgText>

        {/* ── コンポーネントブロック ── */}

        {/* ENGINE */}
        <Block
          cx={POS.engine.x} cy={POS.engine.y}
          label="ENGINE"
          value={evMode ? 'OFF' : `${engineKw.toFixed(1)} kW`}
          bgColor={evMode ? '#2a2a38' : THEME.engineColor}
          textColor={evMode ? '#666' : '#fff'}
          w={58} h={26}
        />

        {/* BATTERY */}
        <Block
          cx={POS.battery.x} cy={POS.battery.y}
          label="BATTERY"
          value={`${batteryKw >= 0 ? '+' : ''}${batteryKw.toFixed(1)} kW`}
          bgColor={THEME.batteryColor}
          textColor="#fff"
          w={66} h={26}
        />

        {/* WHEELS */}
        <Block
          cx={POS.wheels.x} cy={POS.wheels.y}
          label="WHEELS"
          value={`${wheelKw.toFixed(1)} kW`}
          bgColor={THEME.wheelColor}
          textColor="#000"
          w={54} h={26}
        />

        {/* ── ホイール強調リング ── */}
        <Circle
          cx={POS.frontWheel.x} cy={POS.frontWheel.y}
          r={15} fill="none" stroke={THEME.wheelColor}
          strokeWidth={1.2} opacity={0.3}
          strokeDasharray="3,3"
        />
        <Circle
          cx={POS.rearWheel.x} cy={POS.rearWheel.y}
          r={15} fill="none" stroke={THEME.wheelColor}
          strokeWidth={0.6} opacity={0.15}
          strokeDasharray="3,3"
        />

        {/* ── EV モードバッジ (車体後方上部) ── */}
        {evMode && (
          <G>
            <Rect
              x={340} y={22} width={36} height={16}
              rx={8} fill={THEME.success}
            />
            <SvgText
              x={358} y={34}
              fill="#000" fontSize={9}
              fontWeight="bold" textAnchor="middle"
            >
              EV
            </SvgText>
          </G>
        )}

        {/* 充電/放電インジケーター (バッテリー横) */}
        {Math.abs(batteryKw) > 0.05 && (
          <SvgText
            x={POS.battery.x + 38} y={POS.battery.y + 3}
            fill={batteryKw > 0 ? THEME.success : THEME.warning}
            fontSize={8} fontWeight="bold" textAnchor="start"
          >
            {batteryKw > 0 ? '▲' : '▼'}
          </SvgText>
        )}
      </Svg>
    </View>
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

  const evThreshold = useMemo(() => {
    const transitions = evThresholdLog.filter(
      (o) => o.wasEvMode && o.engineRpm > 100,
    );
    if (transitions.length < 3) return null;
    const sum = transitions.reduce((acc, o) => acc + o.coolantTemp, 0);
    return sum / transitions.length;
  }, [evThresholdLog]);

  const handleReadDTCs = () => setDTCs(generateDemoDTCs());
  const handleClearDTCs = () => setDTCs([]);

  const thresholdStatus = useMemo(() => {
    if (evThreshold === null) return null;
    if (coolantTemp >= evThreshold) {
      return { label: 'EV Available', color: THEME.success };
    }
    return { label: 'Engine Required', color: THEME.accent };
  }, [coolantTemp, evThreshold]);

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>HV System Monitor</Text>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>THS-II</Text>
        </View>
      </View>

      {/* パワーフロー (車体背景オーバーレイ) */}
      <View style={styles.powerFlowSection}>
        <View style={styles.sectionLabelRow}>
          <Text style={styles.sectionLabel}>POWER FLOW</Text>
        </View>
        <PowerFlowCarOverlay
          engineKw={powerFlow.engineKw}
          mg1Kw={powerFlow.mg1Kw}
          mg2Kw={powerFlow.mg2Kw}
          batteryKw={powerFlow.batteryKw}
          wheelKw={powerFlow.wheelKw}
          evMode={powerFlow.evMode}
        />
      </View>

      {/* 下段: Engine Stats / EV Threshold / DTC */}
      <View style={styles.bottomRow}>
        {/* Engine Stats */}
        <View style={[styles.card, styles.statsCard]}>
          <Text style={styles.cardTitle}>Engine Stats</Text>
          <View style={styles.barWrap}>
            <BarMeter
              value={engineStats.engineOnRatio * 100}
              min={0} max={100}
              unit="%" label="ON Ratio"
              width={200} height={44}
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
            <Text style={styles.statsValue}>
              {coolantTemp.toFixed(0)}{'\u00B0'}C
            </Text>
          </View>
          <View style={styles.statsRow}>
            <Text style={styles.statsLabel}>Threshold</Text>
            <Text style={styles.statsValue}>
              {evThreshold !== null
                ? `~${evThreshold.toFixed(0)}\u00B0C`
                : 'Observing...'}
            </Text>
          </View>
          {thresholdStatus !== null ? (
            <View style={styles.statusRow}>
              <View
                style={[styles.statusDot, { backgroundColor: thresholdStatus.color }]}
              />
              <Text style={[styles.statusText, { color: thresholdStatus.color }]}>
                {thresholdStatus.label}
              </Text>
            </View>
          ) : (
            <View style={styles.statusRow}>
              <Text style={styles.observingText}>
                Need{' '}
                {Math.max(
                  0,
                  3 - evThresholdLog.filter((o) => o.wasEvMode && o.engineRpm > 100).length,
                )}{' '}
                more observations
              </Text>
            </View>
          )}
        </View>

        {/* DTC */}
        <View style={[styles.card, styles.dtcCard]}>
          <View style={styles.dtcHeader}>
            <Text style={styles.cardTitle}>DTC</Text>
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
                    { color: dtc.isPending ? THEME.warning : THEME.textSecondary },
                  ]}
                >
                  {dtc.isPending ? 'pending' : 'stored'}
                </Text>
              </View>
            ))
          )}
        </View>
      </View>
    </View>
  );
}

// ─── スタイル ────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: THEME.bg,
  },

  // ヘッダー
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.bgElevated,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: THEME.text,
  },
  headerBadge: {
    backgroundColor: THEME.motorColor + '22',
    borderWidth: 1,
    borderColor: THEME.motorColor + '44',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginLeft: 12,
  },
  headerBadgeText: {
    color: THEME.motorColor,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // パワーフローセクション
  powerFlowSection: {
    marginHorizontal: 14,
    marginTop: 6,
    marginBottom: 4,
  },
  sectionLabelRow: {
    marginBottom: 4,
    paddingLeft: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.textDim,
    letterSpacing: 1,
  },
  powerFlowArea: {
    height: 380,
    borderRadius: THEME.radiusMd,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: THEME.bgCard,
    overflow: 'hidden',
  },
  carImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.22,
  },
  svgOverlay: {
    ...StyleSheet.absoluteFillObject,
  },

  // 下段
  bottomRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },

  // カード共通
  card: {
    backgroundColor: THEME.bgCard,
    borderRadius: THEME.radiusMd,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 10,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    borderLeftWidth: 3,
    borderLeftColor: THEME.primary,
    paddingLeft: 8,
    marginBottom: 6,
  },

  // Engine Stats
  statsCard: {
    flex: 1,
  },
  barWrap: {
    marginBottom: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  statsLabel: {
    fontSize: 12,
    color: THEME.textDim,
  },
  statsValue: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.text,
    fontVariant: ['tabular-nums'],
  },

  // EV Threshold
  thresholdCard: {
    flex: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  observingText: {
    fontSize: 11,
    color: THEME.textDim,
    fontStyle: 'italic',
  },

  // DTC
  dtcCard: {
    flex: 1.2,
  },
  dtcHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  dtcButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  dtcButton: {
    backgroundColor: THEME.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: THEME.radiusSm,
  },
  dtcClearButton: {
    backgroundColor: THEME.accent,
  },
  dtcButtonText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  noDtcText: {
    fontSize: 12,
    color: THEME.textDim,
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  dtcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.bgInput,
    borderRadius: THEME.radiusSm,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 3,
    gap: 8,
  },
  dtcCode: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.primary,
    fontVariant: ['tabular-nums'],
    minWidth: 48,
  },
  dtcDesc: {
    flex: 1,
    fontSize: 11,
    color: THEME.text,
  },
  dtcStatus: {
    fontSize: 10,
    fontWeight: '500',
    minWidth: 48,
    textAlign: 'right',
  },
});
