import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useConnectionStore } from '../../store/connectionStore';
import { useOBDStore } from '../../store/obdStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { ConnectionState } from '../../types/obd';

/** カラーパレット */
const Colors = {
  background: '#1a1a2e',
  text: '#ffffff',
  subText: '#888888',
  success: '#00ff88',
  error: '#e94560',
  primary: '#00d4ff',
  recording: '#e94560',
} as const;

/** BLE接続状態に対応する色 */
const CONNECTION_STATE_COLORS: Record<ConnectionState, string> = {
  disconnected: Colors.error,
  scanning: Colors.primary,
  connecting: Colors.primary,
  connected: Colors.success,
  error: Colors.error,
};

/** BLE接続状態に対応するラベル */
const CONNECTION_STATE_LABELS: Record<ConnectionState, string> = {
  disconnected: 'Disconnected',
  scanning: 'Scanning...',
  connecting: 'Connecting...',
  connected: 'Connected',
  error: 'Error',
};

/**
 * 接続状態バー
 *
 * ダッシュボード上部に表示する40px高のステータスバー。
 * - 左: BLE接続状態アイコン (緑/赤の丸) + デバイス名
 * - 中央: ELM327プロトコル状態
 * - 右: ログ記録中インジケーター (赤点滅)
 *
 * connectionStore, obdStore, settingsStore をsubscribeして
 * リアルタイムに状態を反映する。
 */
export function ConnectionStatusBar(): React.JSX.Element {
  const connectionState = useConnectionStore(s => s.state);
  const device = useConnectionStore(s => s.device);
  const isElm327Ready = useConnectionStore(s => s.isElm327Ready);
  const pollingActive = useOBDStore(s => s.pollingActive);
  const autoLog = useSettingsStore(s => s.autoLog);

  const isRecording = pollingActive && autoLog;

  // 接続状態の色
  const connectionColor = CONNECTION_STATE_COLORS[connectionState];

  // デバイス名 or 接続状態ラベル
  const deviceLabel =
    connectionState === 'connected' && device?.name
      ? device.name
      : CONNECTION_STATE_LABELS[connectionState];

  // ELM327プロトコル状態テキスト
  const protocolStatus = isElm327Ready
    ? 'ELM327 Ready'
    : connectionState === 'connected'
      ? 'ELM327 Init...'
      : '--';

  return (
    <View style={styles.container}>
      {/* 左: BLE接続状態 */}
      <View style={styles.leftSection}>
        <View
          style={[styles.connectionDot, { backgroundColor: connectionColor }]}
        />
        <Text style={styles.deviceText} numberOfLines={1} ellipsizeMode="tail">
          {deviceLabel}
        </Text>
      </View>

      {/* 中央: ELM327プロトコル状態 */}
      <View style={styles.centerSection}>
        <Text style={styles.protocolText}>{protocolStatus}</Text>
      </View>

      {/* 右: ログ記録中インジケーター */}
      <View style={styles.rightSection}>
        {isRecording ? (
          <RecordingIndicator />
        ) : (
          <Text style={styles.noRecordingText}>--</Text>
        )}
      </View>
    </View>
  );
}

/**
 * ログ記録中インジケーター
 *
 * 赤い丸が点滅 (opacity 0.2 ~ 1.0) する Animated コンポーネント。
 * "REC" ラベルを併記する。
 */
function RecordingIndicator(): React.JSX.Element {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.2,
          duration: 500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [opacity]);

  return (
    <View style={styles.recordingContainer}>
      <Animated.View style={[styles.recordingDot, { opacity }]} />
      <Text style={styles.recordingText}>REC</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 40,
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a3e',
  },

  // 左セクション: BLE接続状態
  leftSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  deviceText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '500',
    maxWidth: 150,
  },

  // 中央セクション: ELM327プロトコル状態
  centerSection: {
    flex: 1,
    alignItems: 'center',
  },
  protocolText: {
    color: Colors.subText,
    fontSize: 12,
    fontWeight: '500',
  },

  // 右セクション: ログ記録中インジケーター
  rightSection: {
    flex: 1,
    alignItems: 'flex-end',
  },
  recordingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.recording,
    marginRight: 6,
  },
  recordingText: {
    color: Colors.recording,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  noRecordingText: {
    color: Colors.subText,
    fontSize: 12,
  },
});
