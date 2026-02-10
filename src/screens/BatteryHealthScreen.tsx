import React, { useMemo } from 'react';
import { StyleSheet, View, Text, StatusBar } from 'react-native';

import { DigitalMeter } from '../components/meters/DigitalMeter';
import { useBatteryHealthStore } from '../store/batteryHealthStore';
import { THEME } from '../utils/theme';

/** SOHからヘルスステータスを判定 */
function getHealthStatus(soh: number): {
  label: string;
  color: string;
  description: string;
} {
  if (soh >= 90)
    return { label: 'GOOD', color: THEME.success, description: 'Battery in healthy condition' };
  if (soh >= 75)
    return { label: 'FAIR', color: THEME.primary, description: 'Minor degradation detected' };
  if (soh >= 50)
    return { label: 'POOR', color: THEME.warning, description: 'Significant degradation - monitor closely' };
  return { label: 'CRITICAL', color: THEME.accent, description: 'Battery replacement recommended' };
}

/** モジュール電圧の偏差に応じた色を返す */
function getModuleCellColor(deviation: number): string {
  const absDev = Math.abs(deviation);
  if (absDev <= 0.05) return THEME.success;
  if (absDev <= 0.12) return THEME.warning;
  return THEME.accent;
}

/** 温度に応じたバーの色を返す */
function getTempBarColor(temp: number): string {
  if (temp < 30) return THEME.primary;
  if (temp <= 38) return THEME.success;
  return THEME.accent;
}

/** 電流の方向に応じた色を返す */
function getCurrentColor(current: number): string {
  return current >= 0 ? THEME.primary : THEME.warning;
}

// モジュールグリッドの定数
const GRID_COLS = 4;
const GRID_ROWS = 7;
const CELL_WIDTH = 74;
const CELL_HEIGHT = 54;

export function BatteryHealthScreen(): React.JSX.Element {
  const summary = useBatteryHealthStore((s) => s.summary);

  const {
    modules,
    packVoltage,
    packCurrent,
    avgTemp,
    minTemp,
    maxTemp,
    soh,
    internalResistance,
    aux12v,
    maxMinDelta,
  } = summary;

  /**
   * ZVW30 NiMHモジュール電圧 → SOC% 変換
   * 6セル直列モジュール: 6.0V(0%) 〜 8.4V(100%)
   * 通常運用レンジは約6.5V〜8.0V
   */
  const voltageToSoc = (v: number): number => {
    const minV = 6.5;
    const maxV = 8.0;
    const soc = ((v - minV) / (maxV - minV)) * 100;
    return Math.max(0, Math.min(100, soc));
  };

  // δSOC: 全モジュール中の最大SOC - 最小SOC (%)
  const deltaSoc = useMemo(() => {
    if (modules.length === 0) return 0;
    const socs = modules.map((m) => voltageToSoc(m.voltage));
    return Math.max(...socs) - Math.min(...socs);
  }, [modules]);

  // 平均モジュール電圧を算出
  const avgModuleVoltage = useMemo(() => {
    if (modules.length === 0) return 0;
    const sum = modules.reduce((acc, m) => acc + m.voltage, 0);
    return sum / modules.length;
  }, [modules]);

  // 各モジュールの偏差を算出してソート（ワースト順）
  const moduleDeviations = useMemo(() => {
    return modules
      .map((m) => ({
        index: m.moduleIndex,
        voltage: m.voltage,
        deviation: m.voltage - avgModuleVoltage,
      }))
      .sort((a, b) => a.deviation - b.deviation); // 最も低いモジュールが先頭
  }, [modules, avgModuleVoltage]);

  // ワースト3モジュール
  const worstModules = useMemo(() => {
    return moduleDeviations.slice(0, 3);
  }, [moduleDeviations]);

  // ワーストモジュールのインデックスセット（ハイライト用）
  const worstIndices = useMemo(() => {
    return new Set(worstModules.map((m) => m.index));
  }, [worstModules]);

  // 温度センサー3点
  const tempSensors = useMemo(() => {
    return [
      { label: 'Front', value: minTemp },
      { label: 'Mid', value: avgTemp },
      { label: 'Rear', value: maxTemp },
    ];
  }, [minTemp, avgTemp, maxTemp]);

  // モジュールを行ごとにグループ化
  const moduleRows = useMemo(() => {
    const rows: typeof modules[] = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      const start = r * GRID_COLS;
      rows.push(modules.slice(start, start + GRID_COLS));
    }
    return rows;
  }, [modules]);

  // ヘルスステータス
  const health = getHealthStatus(soh);

  return (
    <View style={styles.screen}>
      <StatusBar hidden />

      {/* ヘッダー */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Battery Health</Text>
          <View style={styles.headerBadgeRow}>
            <View style={[styles.healthBadge, { backgroundColor: health.color + '22', borderColor: health.color }]}>
              <View style={[styles.healthDot, { backgroundColor: health.color }]} />
              <Text style={[styles.healthLabel, { color: health.color }]}>
                {health.label}
              </Text>
            </View>
            <View style={styles.sohBadge}>
              <Text style={styles.sohLabel}>SOH</Text>
              <Text style={[styles.sohValue, { color: health.color }]}>{soh.toFixed(0)}%</Text>
            </View>
          </View>
        </View>

        <View style={styles.headerRight}>
          <DigitalMeter
            value={aux12v}
            unit="V"
            label="12V AUX"
            decimals={1}
            fontSize={20}
          />
        </View>
      </View>

      {/* メインコンテンツ */}
      <View style={styles.mainContent}>
        {/* 左側: モジュール電圧グリッド */}
        <View style={styles.leftPanel}>
          <Text style={styles.sectionTitle}>
            {'Module Voltages  '}
            <Text style={styles.avgVoltageHint}>
              (avg: {avgModuleVoltage.toFixed(2)}V)
            </Text>
          </Text>

          <View style={styles.moduleGrid}>
            {moduleRows.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.moduleRow}>
                {row.map((mod) => {
                  const deviation = mod.voltage - avgModuleVoltage;
                  const cellColor = getModuleCellColor(deviation);
                  const isWorst = worstIndices.has(mod.moduleIndex);
                  return (
                    <View
                      key={mod.moduleIndex}
                      style={[
                        styles.moduleCell,
                        { borderColor: cellColor },
                        isWorst && styles.moduleCellWorst,
                      ]}
                    >
                      <Text style={styles.moduleCellIndex}>
                        {isWorst ? '\u25BC' : ''}{mod.moduleIndex + 1}
                      </Text>
                      <Text
                        style={[styles.moduleCellVoltage, { color: cellColor }]}
                      >
                        {mod.voltage.toFixed(2)}
                      </Text>
                      <Text
                        style={[
                          styles.moduleCellDelta,
                          { color: deviation < -0.05 ? THEME.accent : deviation < -0.02 ? THEME.warning : THEME.textDim },
                        ]}
                      >
                        {deviation >= 0 ? '+' : ''}{(deviation * 1000).toFixed(0)}mV
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>

          {/* 凡例 */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: THEME.success }]} />
              <Text style={styles.legendText}>{'\u00B1'}50mV</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: THEME.warning }]} />
              <Text style={styles.legendText}>{'\u00B1'}120mV</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: THEME.accent }]} />
              <Text style={styles.legendText}>{'>'}120mV</Text>
            </View>
            <View style={styles.legendItem}>
              <Text style={[styles.legendText, { color: THEME.warning }]}>{'\u25BC'} Worst</Text>
            </View>
          </View>
        </View>

        {/* 右側: Pack Summary + Weakest + Temperature */}
        <View style={styles.rightPanel}>
          {/* Pack Summary カード */}
          <View style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>Pack Summary</Text>

            <SummaryRow
              label="Pack Voltage"
              value={packVoltage.toFixed(1)}
              unit="V"
              valueColor={THEME.primary}
            />
            <SummaryRow
              label="Pack Current"
              value={packCurrent.toFixed(1)}
              unit="A"
              valueColor={getCurrentColor(packCurrent)}
            />
            <SummaryRow
              label={`Max-Min ${String.fromCharCode(0x0394)}`}
              value={maxMinDelta.toFixed(2)}
              unit="V"
              valueColor={
                maxMinDelta > 0.20
                  ? THEME.accent
                  : maxMinDelta > 0.10
                    ? THEME.warning
                    : THEME.success
              }
            />
            <SummaryRow
              label={`${String.fromCharCode(0x03B4)}SOC`}
              value={deltaSoc.toFixed(1)}
              unit="%"
              valueColor={
                deltaSoc > 15
                  ? THEME.accent
                  : deltaSoc > 5
                    ? THEME.warning
                    : THEME.success
              }
            />
            <SummaryRow
              label="Int. Resistance"
              value={internalResistance.toFixed(1)}
              unit={`m${String.fromCharCode(0x03A9)}`}
              valueColor={THEME.text}
            />
          </View>

          {/* Weakest Modules カード */}
          <View style={styles.worstCard}>
            <Text style={styles.sectionTitle}>Weakest Modules</Text>
            {worstModules.map((mod, rank) => (
              <View key={mod.index} style={styles.worstRow}>
                <View style={styles.worstRank}>
                  <Text style={[
                    styles.worstRankText,
                    { color: rank === 0 ? THEME.accent : rank === 1 ? THEME.warning : THEME.textSecondary },
                  ]}>
                    #{rank + 1}
                  </Text>
                </View>
                <Text style={styles.worstModLabel}>Module {mod.index + 1}</Text>
                <Text style={[styles.worstVoltage, { color: getModuleCellColor(mod.deviation) }]}>
                  {mod.voltage.toFixed(2)}V
                </Text>
                <Text style={[
                  styles.worstDelta,
                  { color: THEME.accent },
                ]}>
                  {(mod.deviation * 1000).toFixed(0)}mV
                </Text>
              </View>
            ))}
          </View>

          {/* Temperature セクション */}
          <View style={styles.temperatureCard}>
            <Text style={styles.sectionTitle}>Temperature</Text>

            <View style={styles.tempBarsContainer}>
              {tempSensors.map((sensor) => (
                <View key={sensor.label} style={styles.tempBarWrapper}>
                  <Text style={styles.tempBarLabel}>{sensor.label}</Text>
                  <View style={styles.tempBarTrack}>
                    <View
                      style={[
                        styles.tempBarFill,
                        {
                          width: `${Math.min(100, Math.max(0, (sensor.value / 60) * 100))}%`,
                          backgroundColor: getTempBarColor(sensor.value),
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[styles.tempBarValue, { color: getTempBarColor(sensor.value) }]}
                  >
                    {sensor.value.toFixed(0)}{'\u00B0C'}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.avgTempRow}>
              <Text style={styles.avgTempLabel}>Avg:</Text>
              <Text style={styles.avgTempValue}>
                {avgTemp.toFixed(0)}{'\u00B0C'}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── サブコンポーネント ────────────────────────────────────────────

interface SummaryRowProps {
  label: string;
  value: string;
  unit: string;
  valueColor: string;
}

function SummaryRow({ label, value, unit, valueColor }: SummaryRowProps) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <View style={styles.summaryValueRow}>
        <Text style={[styles.summaryValue, { color: valueColor }]}>
          {value}
        </Text>
        <Text style={styles.summaryUnit}>{unit}</Text>
      </View>
    </View>
  );
}

// ─── スタイル ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: THEME.bg,
  },

  // ── ヘッダー ──
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
  headerLeft: {
    flex: 1,
    justifyContent: 'center',
  },
  headerTitle: {
    color: THEME.primary,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  healthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  healthDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 5,
  },
  healthLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  headerBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 10,
  },
  sohBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  sohLabel: {
    color: THEME.textDim,
    fontSize: 11,
    fontWeight: '600',
  },
  sohValue: {
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  headerRight: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  // ── メインコンテンツ ──
  mainContent: {
    flex: 1,
    flexDirection: 'row',
    padding: 10,
  },

  // ── 左パネル: モジュール電圧 ──
  leftPanel: {
    flex: 1,
    marginRight: 10,
  },
  sectionTitle: {
    color: THEME.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: THEME.primary,
    paddingLeft: 8,
  },
  avgVoltageHint: {
    color: THEME.textDim,
    fontSize: 11,
    fontWeight: '400',
    textTransform: 'none',
    letterSpacing: 0,
  },
  moduleGrid: {
    alignItems: 'center',
  },
  moduleRow: {
    flexDirection: 'row',
  },
  moduleCell: {
    width: CELL_WIDTH,
    height: CELL_HEIGHT,
    backgroundColor: THEME.bgCard,
    borderWidth: 1,
    borderRadius: THEME.radiusSm,
    margin: 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  moduleCellWorst: {
    borderWidth: 2,
    backgroundColor: '#1a0a12',
  },
  moduleCellIndex: {
    position: 'absolute',
    top: 2,
    left: 4,
    color: THEME.textDim,
    fontSize: 8,
    fontWeight: '500',
  },
  moduleCellVoltage: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  moduleCellDelta: {
    fontSize: 8,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },

  // ── 凡例 ──
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 6,
    gap: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
    marginRight: 4,
  },
  legendText: {
    color: THEME.textDim,
    fontSize: 10,
    fontWeight: '500',
  },

  // ── 右パネル ──
  rightPanel: {
    flex: 1,
    marginLeft: 10,
  },

  // ── Pack Summary カード ──
  summaryCard: {
    backgroundColor: THEME.bgCard,
    borderRadius: THEME.radiusMd,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 12,
    marginBottom: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: THEME.border,
  },
  summaryLabel: {
    color: THEME.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  summaryValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  summaryUnit: {
    color: THEME.textDim,
    fontSize: 10,
    fontWeight: '500',
    marginLeft: 3,
  },

  // ── Weakest Modules カード ──
  worstCard: {
    backgroundColor: THEME.bgCard,
    borderRadius: THEME.radiusMd,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 12,
    marginBottom: 10,
  },
  worstRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: THEME.border,
  },
  worstRank: {
    width: 28,
  },
  worstRankText: {
    fontSize: 12,
    fontWeight: '800',
  },
  worstModLabel: {
    flex: 1,
    color: THEME.text,
    fontSize: 12,
    fontWeight: '500',
  },
  worstVoltage: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginRight: 8,
  },
  worstDelta: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    width: 55,
    textAlign: 'right',
  },

  // ── Temperature カード ──
  temperatureCard: {
    backgroundColor: THEME.bgCard,
    borderRadius: THEME.radiusMd,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 12,
    flex: 1,
  },
  tempBarsContainer: {
    gap: 8,
  },
  tempBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tempBarLabel: {
    color: THEME.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    width: 40,
  },
  tempBarTrack: {
    flex: 1,
    height: 14,
    backgroundColor: THEME.border,
    borderRadius: 7,
    overflow: 'hidden',
    marginHorizontal: 8,
  },
  tempBarFill: {
    height: '100%',
    borderRadius: 7,
  },
  tempBarValue: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    width: 40,
    textAlign: 'right',
  },
  avgTempRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'baseline',
    marginTop: 10,
    gap: 6,
  },
  avgTempLabel: {
    color: THEME.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  avgTempValue: {
    color: THEME.primary,
    fontSize: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
