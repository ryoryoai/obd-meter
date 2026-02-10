import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CartesianChart, Line } from 'victory-native';
import { matchFont } from '@shopify/react-native-skia';
import type { FuelEconomyData } from '../types/obd';
import { fuelAnalysis } from '../analysis/fuelAnalysis';
import { THEME } from '../utils/theme';

// --- 定数 ---

const COLORS = {
  background: THEME.bg,
  card: THEME.bgCard,
  cardBorder: THEME.border,
  primary: THEME.primary,
  accent: THEME.success,
  warning: THEME.warning,
  text: THEME.text,
  textSecondary: THEME.textSecondary,
  graphGrid: THEME.border,
} as const;

/** グラフに表示する最大データポイント数 */
const MAX_GRAPH_POINTS = 60;

/** リアルタイム更新間隔 (ms) */
const UPDATE_INTERVAL = 1000;

// --- グラフデータポイント型 ---

interface GraphPoint {
  [key: string]: unknown;
  time: number;
  kmPerL: number;
}

// --- サマリカード ---

interface SummaryCardProps {
  label: string;
  value: string;
  unit: string;
  color: string;
}

function SummaryCard({ label, value, unit, color }: SummaryCardProps) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <View style={styles.summaryValueRow}>
        <Text style={[styles.summaryValue, { color }]}>{value}</Text>
        <Text style={styles.summaryUnit}>{unit}</Text>
      </View>
    </View>
  );
}

// --- 統計行 ---

interface StatRowProps {
  label: string;
  value: string;
}

function StatRow({ label, value }: StatRowProps) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

// --- メイン画面 ---

/**
 * 燃費分析画面
 *
 * - 上部: 瞬間燃費・平均燃費・EV走行率のサマリカード
 * - 中央: victory-native による燃費推移リアルタイムグラフ
 * - 下部: 走行距離・燃料消費量・トリップ時間の統計情報
 * - リセットボタンでトリップデータをクリア
 */
export function AnalysisScreen() {
  const [summary, setSummary] = useState<FuelEconomyData>(
    fuelAnalysis.getSummary(),
  );
  const [graphData, setGraphData] = useState<GraphPoint[]>([]);
  const tripStartTime = useRef(Date.now());
  const axisFont = React.useMemo(
    () =>
      matchFont({
        fontFamily: 'System',
        fontSize: 10,
        fontStyle: 'normal',
        fontWeight: '500',
      }),
    [],
  );

  // リアルタイム更新: fuelAnalysisの最新状態を定期取得
  useEffect(() => {
    const interval = setInterval(() => {
      const currentSummary = fuelAnalysis.getSummary();
      setSummary(currentSummary);

      // グラフにデータポイントを追加
      setGraphData((prev) => {
        const elapsed = (Date.now() - tripStartTime.current) / 1000;
        const newPoint: GraphPoint = {
          time: elapsed,
          kmPerL: currentSummary.instantKmPerL,
        };

        const updated = [...prev, newPoint];
        // 最大ポイント数を超えたら古いデータを削除
        if (updated.length > MAX_GRAPH_POINTS) {
          return updated.slice(updated.length - MAX_GRAPH_POINTS);
        }
        return updated;
      });
    }, UPDATE_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  const handleReset = useCallback(() => {
    fuelAnalysis.reset();
    setSummary(fuelAnalysis.getSummary());
    setGraphData([]);
    tripStartTime.current = Date.now();
  }, []);

  // トリップ経過時間を "HH:mm:ss" で表示
  // (summary更新で定期的に再レンダされるので、ここは単純計算でOK)
  const tripDuration = (() => {
    const elapsedMs = Date.now() - tripStartTime.current;
    const totalSec = Math.floor(elapsedMs / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  })();

  // グラフが空の場合のプレースホルダデータ
  const chartData =
    graphData.length >= 2
      ? graphData
      : [
          { time: 0, kmPerL: 0 },
          { time: 1, kmPerL: 0 },
        ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      {/* ヘッダ */}
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Fuel Analysis</Text>
        <TouchableOpacity onPress={handleReset} style={styles.resetButton}>
          <Text style={styles.resetButtonText}>Reset Trip</Text>
        </TouchableOpacity>
      </View>

      {/* サマリカード群 */}
      <View style={styles.summaryRow}>
        <SummaryCard
          label="Instant"
          value={summary.instantKmPerL > 0 ? summary.instantKmPerL.toFixed(1) : '--'}
          unit="km/L"
          color={COLORS.primary}
        />
        <SummaryCard
          label="Average"
          value={summary.averageKmPerL > 0 ? summary.averageKmPerL.toFixed(1) : '--'}
          unit="km/L"
          color={COLORS.accent}
        />
        <SummaryCard
          label="EV Ratio"
          value={(summary.evRatio * 100).toFixed(0)}
          unit="%"
          color={COLORS.warning}
        />
      </View>

      {/* 燃費推移グラフ */}
      <View style={styles.graphContainer}>
        <Text style={styles.graphTitle}>Fuel Economy Trend</Text>
        <View style={styles.graphWrapper}>
          <CartesianChart
            data={chartData}
            xKey="time"
            yKeys={['kmPerL']}
            padding={{ left: 10, right: 10, top: 10, bottom: 10 }}
            domainPadding={{ left: 10, right: 10, top: 10, bottom: 0 }}
            xAxis={{
              font: axisFont,
              tickCount: 5,
              labelColor: COLORS.textSecondary,
              lineColor: COLORS.graphGrid,
              formatXLabel: (val: unknown) => `${Math.round(val as number)}s`,
            }}
            yAxis={[
              {
                font: axisFont,
                tickCount: 4,
                labelColor: COLORS.textSecondary,
                lineColor: COLORS.graphGrid,
                formatYLabel: (val: unknown) => `${(val as number).toFixed(0)}`,
              },
            ]}
            frame={{
              lineColor: COLORS.graphGrid,
              lineWidth: StyleSheet.hairlineWidth,
            }}
          >
            {({ points }) => (
              <Line
                points={points.kmPerL}
                color={COLORS.primary}
                strokeWidth={2}
                animate={{ type: 'timing', duration: 300 }}
              />
            )}
          </CartesianChart>
        </View>
        <Text style={styles.graphAxisLabel}>Time (seconds) vs km/L</Text>
      </View>

      {/* 統計情報 */}
      <View style={styles.statsContainer}>
        <Text style={styles.statsTitle}>Trip Statistics</Text>
        <StatRow
          label="Total Distance"
          value={`${summary.distanceKm.toFixed(2)} km`}
        />
        <StatRow
          label="Fuel Consumed"
          value={`${summary.fuelUsedL.toFixed(3)} L`}
        />
        <StatRow
          label="EV Distance"
          value={`${(summary.distanceKm * summary.evRatio).toFixed(2)} km`}
        />
        <StatRow label="Trip Time" value={tripDuration} />
        <StatRow
          label="Average Fuel Economy"
          value={
            summary.averageKmPerL > 0
              ? `${summary.averageKmPerL.toFixed(1)} km/L`
              : '-- km/L'
          }
        />
      </View>
    </ScrollView>
  );
}

// --- スタイル ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },

  // --- Header ---
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
  },
  resetButton: {
    backgroundColor: '#ffffff10',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  resetButtonText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },

  // --- Summary Cards ---
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 12,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  summaryUnit: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },

  // --- Graph ---
  graphContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 16,
    marginBottom: 16,
  },
  graphTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  graphWrapper: {
    height: 220,
  },
  graphAxisLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },

  // --- Statistics ---
  statsContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 16,
  },
  statsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.cardBorder,
  },
  statLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    fontVariant: ['tabular-nums'],
  },
});
