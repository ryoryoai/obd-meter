import React, { useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  SlideInRight,
} from 'react-native-reanimated';

import { useConnectionStore } from '../store/connectionStore';
import { BleConnectionManager } from '../bluetooth/BleManager';
import { mockDataProvider } from '../utils/mockDataProvider';
import type { BLEDevice } from '../types/obd';

const COLORS = {
  background: '#0f0f1a',
  cardBg: '#1a1a2e',
  primary: '#00d4ff',
  accent: '#e94560',
  success: '#00ff88',
  warning: '#ffd700',
  text: '#ffffff',
  textDim: '#64748b',
  border: '#16213e',
  ripple: 'rgba(0, 212, 255, 0.1)',
};

// RSSI強度レベル
const getRssiLevel = (rssi: number | null): { bars: number; color: string; label: string } => {
  if (rssi === null) {
    return { bars: 0, color: COLORS.textDim, label: 'Unknown' };
  }
  if (rssi >= -50) {
    return { bars: 4, color: COLORS.success, label: 'Excellent' };
  }
  if (rssi >= -65) {
    return { bars: 3, color: COLORS.success, label: 'Good' };
  }
  if (rssi >= -80) {
    return { bars: 2, color: COLORS.warning, label: 'Fair' };
  }
  return { bars: 1, color: COLORS.accent, label: 'Weak' };
};

/** RSSI信号強度バー表示 */
const RssiIndicator: React.FC<{ rssi: number | null }> = ({ rssi }) => {
  const { bars, color } = getRssiLevel(rssi);
  const maxBars = 4;
  const barWidth = 4;
  const barGap = 2;

  return (
    <View style={styles.rssiContainer}>
      {Array.from({ length: maxBars }, (_, i) => {
        const barHeight = 6 + (i + 1) * 4;
        const isActive = i < bars;
        return (
          <View
            key={`rssi-bar-${i}`}
            style={[
              styles.rssiBar,
              {
                width: barWidth,
                height: barHeight,
                marginRight: i < maxBars - 1 ? barGap : 0,
                backgroundColor: isActive ? color : COLORS.border,
              },
            ]}
          />
        );
      })}
      {rssi !== null && (
        <Text style={[styles.rssiText, { color }]}>{rssi}dBm</Text>
      )}
    </View>
  );
};

/** 検出デバイスカード */
const DeviceCard: React.FC<{
  device: BLEDevice;
  onConnect: (id: string) => void;
  isConnecting: boolean;
  connectedId: string | null;
}> = ({ device, onConnect, isConnecting, connectedId }) => {
  const isThisConnecting = isConnecting && connectedId === device.id;
  const isConnected = !isConnecting && connectedId === device.id;

  return (
    <Animated.View entering={SlideInRight.duration(300)} style={styles.deviceCard}>
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceName}>
          {device.name ?? 'Unknown Device'}
        </Text>
        <Text style={styles.deviceId}>{device.id}</Text>
      </View>

      <RssiIndicator rssi={device.rssi} />

      <TouchableOpacity
        style={[
          styles.connectButton,
          isConnected && styles.connectedButton,
          isThisConnecting && styles.connectingButton,
        ]}
        onPress={() => onConnect(device.id)}
        disabled={isConnecting}
        activeOpacity={0.7}
      >
        {isThisConnecting ? (
          <ActivityIndicator size="small" color={COLORS.text} />
        ) : (
          <Text
            style={[
              styles.connectButtonText,
              isConnected && styles.connectedButtonText,
            ]}
          >
            {isConnected ? 'Connected' : 'Connect'}
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

interface ConnectionScreenProps {
  navigation?: {
    navigate: (screen: string) => void;
    replace: (screen: string) => void;
  };
}

/**
 * BLE接続画面
 *
 * ELM327デバイスをスキャンして一覧表示し、
 * 選択したデバイスに接続する。接続成功後は
 * DashboardScreenに自動遷移する。
 */
export const ConnectionScreen: React.FC<ConnectionScreenProps> = ({
  navigation,
}) => {
  const bleManagerRef = useRef<BleConnectionManager | null>(null);

  const connectionState = useConnectionStore((s) => s.state);
  const connectedDevice = useConnectionStore((s) => s.device);
  const errorMessage = useConnectionStore((s) => s.error);
  const setConnectionState = useConnectionStore((s) => s.setConnectionState);
  const setDevice = useConnectionStore((s) => s.setDevice);
  const setError = useConnectionStore((s) => s.setError);
  const setDemoMode = useConnectionStore((s) => s.setDemoMode);

  // 検出デバイスはBleConnectionManager.scanForDevices()が返すため
  // ローカルステートで管理する
  const [localDevices, setLocalDevices] = React.useState<BLEDevice[]>([]);

  // スキャンパルスアニメーション
  const scanPulse = useSharedValue(1);

  useEffect(() => {
    if (connectionState === 'scanning') {
      scanPulse.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(scanPulse);
      scanPulse.value = withTiming(1, { duration: 200 });
    }
  }, [connectionState, scanPulse]);

  const scanButtonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scanPulse.value }],
  }));

  // BleManagerの初期化
  useEffect(() => {
    bleManagerRef.current = new BleConnectionManager();

    return () => {
      bleManagerRef.current?.destroy();
      bleManagerRef.current = null;
    };
  }, []);

  // 接続成功時のDashboard遷移
  useEffect(() => {
    if (connectionState === 'connected' && navigation) {
      // 少し待ってから遷移 (接続完了のフィードバックを見せるため)
      const timer = setTimeout(() => {
        navigation.replace('Dashboard');
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [connectionState, navigation]);

  // スキャン開始
  const handleScan = useCallback(async () => {
    if (!bleManagerRef.current) { return; }
    if (connectionState === 'scanning') { return; }

    setError(null);
    setConnectionState('scanning');
    setLocalDevices([]);

    try {
      const devices = await bleManagerRef.current.scanForDevices();
      setLocalDevices(devices);
      setConnectionState('disconnected');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scan failed';
      // setError はストア側で state を 'error' に設定する
      setError(message);
    }
  }, [connectionState, setConnectionState, setError]);

  // デバイス接続
  const handleConnect = useCallback(
    async (deviceId: string) => {
      if (!bleManagerRef.current) { return; }

      const device = localDevices.find((d) => d.id === deviceId);
      setError(null);
      setConnectionState('connecting');

      try {
        await bleManagerRef.current.connect(deviceId);
        setDevice(device ?? { id: deviceId, name: null, rssi: null });
        setConnectionState('connected');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Connection failed';
        // setError はストア側で state を 'error' に設定する
        setError(message);
      }
    },
    [localDevices, setConnectionState, setDevice, setError],
  );

  // デモモード開始
  const handleDemoMode = useCallback(() => {
    setDemoMode(true);
    setDevice({ id: 'DEMO', name: 'Demo Mode', rssi: null });
    setConnectionState('connected');
    mockDataProvider.start(200);
  }, [setDemoMode, setDevice, setConnectionState]);

  const isScanning = connectionState === 'scanning';
  const isConnecting = connectionState === 'connecting';

  // デバイスリストアイテムのレンダラー
  const renderDevice = useCallback(
    ({ item }: { item: BLEDevice }) => (
      <DeviceCard
        device={item}
        onConnect={handleConnect}
        isConnecting={isConnecting}
        connectedId={connectedDevice?.id ?? null}
      />
    ),
    [handleConnect, isConnecting, connectedDevice],
  );

  const keyExtractor = useCallback((item: BLEDevice) => item.id, []);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      {/* ヘッダー */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Connect to ELM327</Text>
        <Text style={styles.headerSubtitle}>
          Scan for nearby Bluetooth OBD adapters
        </Text>
      </View>

      {/* スキャンボタン */}
      <View style={styles.scanSection}>
        <Animated.View style={scanButtonAnimatedStyle}>
          <TouchableOpacity
            style={[
              styles.scanButton,
              isScanning && styles.scanButtonActive,
              isConnecting && styles.scanButtonDisabled,
            ]}
            onPress={handleScan}
            disabled={isScanning || isConnecting}
            activeOpacity={0.7}
          >
            {isScanning ? (
              <View style={styles.scanningRow}>
                <ActivityIndicator size="small" color={COLORS.text} />
                <Text style={styles.scanButtonText}>Scanning...</Text>
              </View>
            ) : (
              <Text style={styles.scanButtonText}>
                {localDevices.length > 0 ? 'Scan Again' : 'Start Scan'}
              </Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* エラー表示 */}
      {errorMessage && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
          style={styles.errorBanner}
        >
          <Text style={styles.errorText}>{errorMessage}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <Text style={styles.errorDismiss}>Dismiss</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* 接続成功バナー */}
      {connectionState === 'connected' && (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={styles.successBanner}
        >
          <Text style={styles.successText}>
            Connected to {connectedDevice?.name ?? 'ELM327'}
          </Text>
          <Text style={styles.successSubtext}>
            Navigating to dashboard...
          </Text>
        </Animated.View>
      )}

      {/* デモモードボタン */}
      <View style={styles.demoSection}>
        <TouchableOpacity
          style={styles.demoButton}
          onPress={handleDemoMode}
          activeOpacity={0.7}
        >
          <Text style={styles.demoButtonText}>Demo Mode</Text>
          <Text style={styles.demoButtonHint}>OBD接続なしでUIを確認</Text>
        </TouchableOpacity>
      </View>

      {/* デバイス一覧 */}
      <View style={styles.deviceListContainer}>
        <Text style={styles.sectionTitle}>
          {localDevices.length > 0
            ? `Found ${localDevices.length} device${localDevices.length > 1 ? 's' : ''}`
            : 'No devices found'}
        </Text>

        <FlatList
          data={localDevices}
          renderItem={renderDevice}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.deviceList}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            !isScanning ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  Tap "Start Scan" to search for ELM327 devices
                </Text>
                <Text style={styles.emptyHint}>
                  Make sure your ELM327 adapter is powered on
                </Text>
              </View>
            ) : null
          }
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // ヘッダー
  header: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 16,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: COLORS.textDim,
    fontSize: 14,
    fontWeight: '400',
    marginTop: 4,
  },

  // スキャンセクション
  scanSection: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  scanButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 28,
    minWidth: 200,
    alignItems: 'center',
  },
  scanButtonActive: {
    backgroundColor: '#0099bb',
  },
  scanButtonDisabled: {
    backgroundColor: COLORS.border,
    opacity: 0.6,
  },
  scanButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  scanningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  // デモモード
  demoSection: {
    alignItems: 'center',
    marginBottom: 12,
  },
  demoButton: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderWidth: 1,
    borderColor: COLORS.warning,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 10,
    alignItems: 'center',
    minWidth: 200,
  },
  demoButtonText: {
    color: COLORS.warning,
    fontSize: 14,
    fontWeight: '600',
  },
  demoButtonHint: {
    color: COLORS.textDim,
    fontSize: 11,
    marginTop: 2,
  },

  // エラーバナー
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(233, 69, 96, 0.15)',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    marginHorizontal: 24,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  errorText: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  errorDismiss: {
    color: COLORS.textDim,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 12,
    textTransform: 'uppercase',
  },

  // 成功バナー
  successBanner: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.success,
    marginHorizontal: 24,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  successText: {
    color: COLORS.success,
    fontSize: 15,
    fontWeight: '600',
  },
  successSubtext: {
    color: COLORS.textDim,
    fontSize: 12,
    marginTop: 2,
  },

  // デバイス一覧
  deviceListContainer: {
    flex: 1,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    color: COLORS.textDim,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  deviceList: {
    paddingBottom: 24,
  },
  separator: {
    height: 8,
  },

  // デバイスカード
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
  deviceId: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: '400',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },

  // RSSI表示
  rssiContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginRight: 16,
    gap: 0,
  },
  rssiBar: {
    borderRadius: 1,
  },
  rssiText: {
    fontSize: 10,
    fontWeight: '500',
    marginLeft: 6,
    fontVariant: ['tabular-nums'],
  },

  // 接続ボタン
  connectButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 90,
    alignItems: 'center',
  },
  connectingButton: {
    backgroundColor: COLORS.warning,
  },
  connectedButton: {
    backgroundColor: COLORS.success,
  },
  connectButtonText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },
  connectedButtonText: {
    color: '#0f0f1a',
  },

  // 空の状態
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: COLORS.textDim,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  emptyHint: {
    color: COLORS.textDim,
    fontSize: 12,
    fontWeight: '400',
    marginTop: 8,
    opacity: 0.7,
    textAlign: 'center',
  },
});
