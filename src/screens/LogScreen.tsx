import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { LogSession, DataPoint } from '../types/obd';
import { database } from '../storage/database';

// --- 定数 ---

const COLORS = {
  background: '#0f0f1a',
  card: '#1a1a2e',
  cardBorder: '#2a2a4a',
  primary: '#00d4ff',
  danger: '#ff4466',
  text: '#e0e0ff',
  textSecondary: '#8888aa',
  overlay: '#0f0f1a99',
} as const;

// --- ヘルパー関数 ---

/**
 * Unixタイムスタンプ(ms)を "YYYY/MM/DD HH:mm" 形式にフォーマットする
 */
function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}/${m}/${d} ${h}:${min}`;
}

/**
 * 開始・終了タイムスタンプからセッション継続時間を "HH:mm:ss" 形式で返す
 */
function formatDuration(startTime: number, endTime: number | null): string {
  const end = endTime ?? Date.now();
  const durationMs = Math.max(0, end - startTime);
  const totalSec = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// --- セッション詳細モーダル ---

interface SessionDetailProps {
  session: LogSession;
  onClose: () => void;
}

/**
 * セッション詳細表示コンポーネント
 * タップしたセッションのPID別データポイントを簡易グラフ(横棒)で表示する
 */
function SessionDetail({ session, onClose }: SessionDetailProps) {
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const points = await database.getSessionData(session.id);
        if (!cancelled) {
          setDataPoints(points);
        }
      } catch (err) {
        console.warn('Failed to load session data:', err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session.id]);

  // PIDごとにグループ化して最小・最大・平均を算出
  const pidStats = React.useMemo(() => {
    const map = new Map<
      string,
      { min: number; max: number; sum: number; count: number; values: number[] }
    >();

    for (const point of dataPoints) {
      const existing = map.get(point.pid);
      if (existing) {
        existing.min = Math.min(existing.min, point.value);
        existing.max = Math.max(existing.max, point.value);
        existing.sum += point.value;
        existing.count += 1;
        existing.values.push(point.value);
      } else {
        map.set(point.pid, {
          min: point.value,
          max: point.value,
          sum: point.value,
          count: 1,
          values: [point.value],
        });
      }
    }

    return Array.from(map.entries()).map(([pid, stats]) => ({
      pid,
      min: stats.min,
      max: stats.max,
      avg: stats.sum / stats.count,
      count: stats.count,
      values: stats.values,
    }));
  }, [dataPoints]);

  return (
    <View style={styles.detailOverlay}>
      <View style={styles.detailContainer}>
        <View style={styles.detailHeader}>
          <Text style={styles.detailTitle}>
            {formatDateTime(session.startTime)}
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>X</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.detailSubtitle}>
          {formatDuration(session.startTime, session.endTime)} | {session.dataPointCount} points
        </Text>

        {loading ? (
          <Text style={styles.loadingText}>Loading...</Text>
        ) : pidStats.length === 0 ? (
          <Text style={styles.emptyText}>No data points recorded</Text>
        ) : (
          <FlatList
            data={pidStats}
            keyExtractor={(item) => item.pid}
            style={styles.pidList}
            renderItem={({ item }) => (
              <View style={styles.pidCard}>
                <Text style={styles.pidName}>{item.pid}</Text>
                <Text style={styles.pidStatsText}>
                  Min: {item.min.toFixed(1)} | Max: {item.max.toFixed(1)} | Avg:{' '}
                  {item.avg.toFixed(1)} | {item.count} pts
                </Text>
                {/* 簡易スパークラインバー */}
                <View style={styles.sparkContainer}>
                  {item.values.slice(-30).map((val, idx) => {
                    const range = item.max - item.min;
                    const normalized =
                      range > 0 ? (val - item.min) / range : 0.5;
                    return (
                      <View
                        key={idx}
                        style={[
                          styles.sparkBar,
                          {
                            height: Math.max(2, normalized * 30),
                          },
                        ]}
                      />
                    );
                  })}
                </View>
              </View>
            )}
          />
        )}
      </View>
    </View>
  );
}

// --- スワイプ可能な行コンポーネント ---

interface SwipeableRowProps {
  session: LogSession;
  onPress: () => void;
  onDelete: () => void;
  onExport: () => void;
}

/**
 * セッション行コンポーネント
 * 左スワイプで削除・エクスポートボタンを表示する
 */
function SwipeableRow({ session, onPress, onDelete, onExport }: SwipeableRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const startX = useRef(0);
  const currentX = useRef(0);
  const isOpen = useRef(false);

  const ACTION_WIDTH = 140;

  const handleTouchStart = useCallback(
    (e: { nativeEvent: { pageX: number } }) => {
      startX.current = e.nativeEvent.pageX;
    },
    [],
  );

  const handleTouchMove = useCallback(
    (e: { nativeEvent: { pageX: number } }) => {
      const dx = e.nativeEvent.pageX - startX.current;
      const offset = isOpen.current ? -ACTION_WIDTH : 0;
      const newX = Math.min(0, Math.max(-ACTION_WIDTH, offset + dx));
      currentX.current = newX;
      translateX.setValue(newX);
    },
    [translateX],
  );

  const handleTouchEnd = useCallback(() => {
    const threshold = ACTION_WIDTH / 2;
    const shouldOpen = currentX.current < -threshold;

    Animated.spring(translateX, {
      toValue: shouldOpen ? -ACTION_WIDTH : 0,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();

    isOpen.current = shouldOpen;
  }, [translateX]);

  return (
    <View style={styles.swipeContainer}>
      {/* 背景のアクションボタン */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={[styles.actionButton, styles.exportButton]}
          onPress={onExport}
        >
          <Text style={styles.actionButtonText}>CSV</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={onDelete}
        >
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* 前面のカード */}
      <Animated.View
        style={[
          styles.sessionCard,
          { transform: [{ translateX }] },
        ]}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
          <Text style={styles.sessionDateTime}>
            {formatDateTime(session.startTime)}
          </Text>
          <View style={styles.sessionMeta}>
            <Text style={styles.sessionDuration}>
              {formatDuration(session.startTime, session.endTime)}
            </Text>
            <Text style={styles.sessionPoints}>
              {session.dataPointCount} data points
            </Text>
          </View>
          {session.endTime === null && (
            <View style={styles.recordingBadge}>
              <Text style={styles.recordingBadgeText}>RECORDING</Text>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// --- メイン画面 ---

/**
 * データログ一覧画面
 *
 * - セッション一覧をFlatListで表示
 * - 各セッション行をタップで詳細表示（PID別統計＋簡易グラフ）
 * - 左スワイプで削除・CSVエクスポート
 * - CSVエクスポートはReact NativeのShare APIを使用
 */
export function LogScreen() {
  const [sessions, setSessions] = useState<LogSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<LogSession | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const list = await database.getSessions();
      setSessions(list);
    } catch (err) {
      console.warn('Failed to load sessions:', err);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSessions();
    setRefreshing(false);
  }, [loadSessions]);

  const handleDelete = useCallback(
    (session: LogSession) => {
      Alert.alert(
        'Delete Session',
        `Delete session from ${formatDateTime(session.startTime)}?\nThis cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await database.deleteSession(session.id);
                await loadSessions();
              } catch (err) {
                Alert.alert('Error', 'Failed to delete session.');
                console.warn('Delete session failed:', err);
              }
            },
          },
        ],
      );
    },
    [loadSessions],
  );

  const handleExport = useCallback(async (session: LogSession) => {
    try {
      const csv = await database.exportSessionToCSV(session.id);
      const fileName = `obd_session_${session.id}_${formatDateTime(session.startTime).replace(/[/:]/g, '-')}.csv`;

      await Share.share({
        message: csv,
        title: fileName,
      });
    } catch (err) {
      if ((err as Error).message !== 'User did not share') {
        Alert.alert('Error', 'Failed to export session data.');
        console.warn('Export session failed:', err);
      }
    }
  }, []);

  const renderSession = useCallback(
    ({ item }: { item: LogSession }) => (
      <SwipeableRow
        session={item}
        onPress={() => setSelectedSession(item)}
        onDelete={() => handleDelete(item)}
        onExport={() => handleExport(item)}
      />
    ),
    [handleDelete, handleExport],
  );

  const keyExtractor = useCallback(
    (item: LogSession) => String(item.id),
    [],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Data Logs</Text>

      {sessions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No log sessions recorded yet.</Text>
          <Text style={styles.emptySubtext}>
            Start recording from the dashboard to create a log session.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={keyExtractor}
          renderItem={renderSession}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {selectedSession && (
        <SessionDetail
          session={selectedSession}
          onClose={() => setSelectedSession(null)}
        />
      )}
    </View>
  );
}

// --- スタイル ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  separator: {
    height: 8,
  },

  // --- Swipeable Row ---
  swipeContainer: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  actionsContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  actionButton: {
    width: 70,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exportButton: {
    backgroundColor: COLORS.primary,
  },
  deleteButton: {
    backgroundColor: COLORS.danger,
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },

  // --- Session Card ---
  sessionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 16,
  },
  sessionDateTime: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 6,
  },
  sessionMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionDuration: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  sessionPoints: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  recordingBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#ff444433',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  recordingBadgeText: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // --- Empty State ---
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    opacity: 0.7,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 24,
  },

  // --- Detail Modal ---
  detailOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  detailContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    width: '100%',
    maxHeight: '80%',
    padding: 20,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffff15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  detailSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },

  // --- PID Stats ---
  pidList: {
    flexGrow: 0,
  },
  pidCard: {
    backgroundColor: '#0f0f1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  pidName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 4,
  },
  pidStatsText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  sparkContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 32,
    gap: 1,
  },
  sparkBar: {
    width: 4,
    backgroundColor: COLORS.primary,
    borderRadius: 1,
    opacity: 0.8,
  },
});
