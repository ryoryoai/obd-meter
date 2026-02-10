import React from 'react';
import {
  StyleSheet,
  View,
  Text,
} from 'react-native';
import Svg, {
  Rect,
  Text as SvgText,
  G,
  Circle,
  Line,
} from 'react-native-svg';
import { useOBDStore } from '../store/obdStore';
import { PriusSilhouettePath } from '../components/PriusSilhouettePath';
import { PRIUS_SILHOUETTE_VIEWBOX } from '../components/priusSilhouettePathData';
import { THEME } from '../utils/theme';

// ─── 定数 ─────────────────────────────────────────────

const CAR_W = PRIUS_SILHOUETTE_VIEWBOX.width;
const CAR_H = PRIUS_SILHOUETTE_VIEWBOX.height;

// 温度→色変換 (寒色→暖色グラデーション)
function tempToColor(temp: number): string {
  if (temp <= 10) return '#4fc3f7';
  if (temp <= 18) return '#29b6f6';
  if (temp <= 22) return '#00e676';
  if (temp <= 26) return '#66bb6a';
  if (temp <= 30) return '#ffa726';
  if (temp <= 35) return '#ef5350';
  return '#d50000';
}

// Coolant温度→色変換
function coolantToColor(temp: number): string {
  if (temp < 60) return '#29b6f6';   // 暖機中: 青
  if (temp <= 95) return '#66bb6a';   // 正常: 緑
  if (temp <= 105) return '#ffa726';  // 注意: オレンジ
  return '#ef5350';                    // 危険: 赤
}

function tempToGlow(temp: number): string {
  return tempToColor(temp) + '30';
}

/** PIDの最新値を取得するフック */
const usePidValue = (pid: string, defaultValue = 0): number => {
  const data = useOBDStore((s) => s.data[pid]);
  return data?.value ?? defaultValue;
};

// ─── SVG温度ラベル (車上のキャビン温度用) ──────────────

interface TempLabelProps {
  x: number;
  y: number;
  label: string;
  temp: number;
}

function CabinTempLabel({ x, y, label, temp }: TempLabelProps) {
  const color = tempToColor(temp);
  const glow = tempToGlow(temp);
  const w = 68;
  const h = 40;

  return (
    <G>
      <Circle cx={x} cy={y} r={24} fill={glow} />
      <Rect
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        rx={6}
        fill={THEME.bgCard + 'dd'}
        stroke={color}
        strokeWidth={1.2}
      />
      <SvgText
        x={x}
        y={y - h / 2 + 12}
        textAnchor="middle"
        fill={THEME.textDim}
        fontSize={8}
        fontWeight="600"
        letterSpacing={0.5}
      >
        {label}
      </SvgText>
      <SvgText
        x={x}
        y={y + 6}
        textAnchor="middle"
        fill={color}
        fontSize={16}
        fontWeight="700"
      >
        {temp.toFixed(1)}°C
      </SvgText>
    </G>
  );
}

// ─── ゾーン区切り線 ────────────────────────────────────

function ZoneDividers() {
  return (
    <G>
      <Line
        x1={150} y1={50} x2={150} y2={100}
        stroke={THEME.border}
        strokeWidth={0.8}
        strokeDasharray="3,3"
      />
      <Line
        x1={240} y1={50} x2={240} y2={100}
        stroke={THEME.border}
        strokeWidth={0.8}
        strokeDasharray="3,3"
      />
    </G>
  );
}

// ─── サイドパネルカード (ネイティブView) ──────────────

interface InfoCardProps {
  label: string;
  value: string;
  unit: string;
  color: string;
  sublabel?: string;
}

function InfoCard({ label, value, unit, color, sublabel }: InfoCardProps) {
  return (
    <View style={sideStyles.card}>
      <Text style={sideStyles.cardLabel}>{label}</Text>
      <Text style={[sideStyles.cardValue, { color }]}>{value}</Text>
      <Text style={[sideStyles.cardUnit, { color: color + '99' }]}>{unit}</Text>
      {sublabel && <Text style={sideStyles.cardSublabel}>{sublabel}</Text>}
    </View>
  );
}

// ─── メインスクリーン ──────────────────────────────────

export const ClimateScreen: React.FC = () => {
  const ambientTemp = usePidValue('0146', 20);
  const cabinAvg = usePidValue('TOYOTA_CABIN_TEMP', 22);
  // Real OBD polling provides TOYOTA_CABIN_TEMP; per-zone values are demo-only for now.
  const frontTemp = usePidValue('CABIN_TEMP_FRONT', cabinAvg);
  const midTemp = usePidValue('CABIN_TEMP_MID', cabinAvg);
  const rearTemp = usePidValue('CABIN_TEMP_REAR', cabinAvg);
  const coolantTemp = usePidValue('0105', 90);
  const acStatus = usePidValue('TOYOTA_AC_STATUS', 0);
  const acSetTemp = usePidValue('TOYOTA_AC_SET_TEMP', 24);
  const acPower = usePidValue('TOYOTA_AC_POWER', 0);

  const minCabin = Math.min(frontTemp, midTemp, rearTemp);
  const maxCabin = Math.max(frontTemp, midTemp, rearTemp);
  const delta = maxCabin - minCabin;

  return (
    <View style={styles.screen}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Climate Monitor</Text>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>ZVW30</Text>
        </View>
      </View>

      {/* 3カラムレイアウト */}
      <View style={styles.mainArea}>
        {/* 左サイド: OUTSIDE + COOLANT */}
        <View style={styles.sidePanel}>
          <InfoCard
            label="OUTSIDE"
            value={ambientTemp.toFixed(1)}
            unit="°C"
            color={tempToColor(ambientTemp)}
            sublabel="外気温"
          />
          <InfoCard
            label="COOLANT"
            value={coolantTemp.toFixed(1)}
            unit="°C"
            color={coolantToColor(coolantTemp)}
            sublabel={coolantTemp < 60 ? '暖機中' : coolantTemp <= 95 ? '正常' : '高温注意'}
          />
        </View>

        {/* 中央: 車シルエット + キャビン温度 */}
        <View style={styles.carArea}>
          <Svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${CAR_W} ${CAR_H}`}
            preserveAspectRatio="xMidYMid meet"
            style={StyleSheet.absoluteFill}
          >
            <PriusSilhouettePath color={THEME.text} opacity={0.18} />
            <ZoneDividers />
            <CabinTempLabel x={105} y={75} label="FRONT" temp={frontTemp} />
            <CabinTempLabel x={195} y={75} label="MID" temp={midTemp} />
            <CabinTempLabel x={280} y={75} label="REAR" temp={rearTemp} />
          </Svg>
        </View>

        {/* 右サイド: A/C情報 */}
        <View style={styles.sidePanel}>
          <InfoCard
            label="A/C SET"
            value={acSetTemp.toFixed(0)}
            unit="°C"
            color={acStatus > 0 ? THEME.primary : THEME.textDim}
            sublabel={acStatus > 0 ? 'ON' : 'OFF'}
          />
          <InfoCard
            label="A/C POWER"
            value={acPower.toFixed(1)}
            unit="kW"
            color={acStatus > 0 ? (acPower > 2 ? THEME.warning : THEME.primary) : THEME.textDim}
            sublabel={acStatus > 0 ? 'コンプレッサー' : '停止中'}
          />
        </View>
      </View>

      {/* 下段: サマリーカード */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>CABIN DELTA</Text>
          <Text style={[
            styles.summaryValue,
            { color: delta > 3 ? THEME.warning : delta > 1.5 ? THEME.primary : THEME.success },
          ]}>
            {delta.toFixed(1)}°C
          </Text>
          <Text style={styles.summaryHint}>Front-Rear差</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>MIN</Text>
          <Text style={[styles.summaryValue, { color: tempToColor(minCabin) }]}>
            {minCabin.toFixed(1)}°C
          </Text>
          <Text style={styles.summaryHint}>キャビン最低</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>MAX</Text>
          <Text style={[styles.summaryValue, { color: tempToColor(maxCabin) }]}>
            {maxCabin.toFixed(1)}°C
          </Text>
          <Text style={styles.summaryHint}>キャビン最高</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>OUT vs IN</Text>
          <Text style={[
            styles.summaryValue,
            { color: ambientTemp > midTemp ? THEME.accent : THEME.primary },
          ]}>
            {ambientTemp > midTemp ? '+' : ''}{(ambientTemp - midTemp).toFixed(1)}°C
          </Text>
          <Text style={styles.summaryHint}>外気-車内差</Text>
        </View>
      </View>
    </View>
  );
};

// ─── サイドパネル用スタイル ────────────────────────────

const sideStyles = StyleSheet.create({
  card: {
    backgroundColor: THEME.bgCard,
    borderRadius: THEME.radiusMd,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  cardLabel: {
    color: THEME.textDim,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  cardValue: {
    fontSize: 26,
    fontWeight: '700',
    fontVariant: ['tabular-nums'] as any,
  },
  cardUnit: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  cardSublabel: {
    color: THEME.textMuted,
    fontSize: 9,
    marginTop: 4,
  },
});

// ─── メインスタイル ───────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: THEME.bg,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: THEME.bgElevated,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  headerTitle: {
    color: THEME.text,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
  headerBadge: {
    backgroundColor: THEME.primary + '20',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: THEME.primary + '40',
  },
  headerBadgeText: {
    color: THEME.primary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // 3カラムレイアウト
  mainArea: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 10,
  },
  sidePanel: {
    width: 120,
    justifyContent: 'center',
  },

  // 中央車エリア
  carArea: {
    flex: 1,
    borderRadius: THEME.radiusMd,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: THEME.bgCard,
    overflow: 'hidden',
  },

  // サマリーカード
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: THEME.bgCard,
    borderRadius: THEME.radiusMd,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  summaryLabel: {
    color: THEME.textDim,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'] as any,
  },
  summaryHint: {
    color: THEME.textMuted,
    fontSize: 8,
    marginTop: 2,
  },
});
