import React, { useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  StatusBar,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { GaugeMeter } from '../components/meters/GaugeMeter';
import { BarMeter } from '../components/meters/BarMeter';
import { DigitalMeter } from '../components/meters/DigitalMeter';
import { BatteryIndicator } from '../components/meters/BatteryIndicator';
import { PriusSilhouette } from '../components/PriusSilhouette';
import { useOBDStore } from '../store/obdStore';
import { useConnectionStore } from '../store/connectionStore';
import { useSettingsStore } from '../store/settingsStore';
import { THEME } from '../utils/theme';

/**
 * KeepAwake: 画面常時点灯を制御する。
 * Android では NativeModules.KeepAwake を使う場合があるが、
 * ここでは useEffect 内で Platform 別に制御する。
 */

// 接続状態に応じたドットカラー
const CONNECTION_COLORS: Record<string, string> = {
  connected: THEME.success,
  connecting: THEME.warning,
  scanning: THEME.primary,
  disconnected: THEME.textDim,
  error: THEME.accent,
};

/**
 * PIDの最新値をストアから取得するヘルパー
 * 値が存在しない場合はデフォルト値を返す
 */
const usePidValue = (pid: string, defaultValue = 0): number => {
  const data = useOBDStore((s) => s.data[pid]);
  return data?.value ?? defaultValue;
};

/**
 * メインダッシュボード画面
 *
 * 10インチ横向きタブレットに最適化したメーターダッシュボード。
 * OBDストアからリアルタイムデータを購読し、各メーターに反映する。
 * settingsStoreのレイアウト情報に基づいてメーターを配置する。
 */
export const DashboardScreen: React.FC = () => {
  const connectionState = useConnectionStore((s) => s.state);
  const connectedDevice = useConnectionStore((s) => s.device);
  const keepScreenOn = useSettingsStore((s) => s.keepScreenOn);

  // 接続ドットの点滅 (connecting/scanning時)
  const dotOpacity = useSharedValue(1);

  useEffect(() => {
    if (connectionState === 'connecting' || connectionState === 'scanning') {
      dotOpacity.value = withRepeat(
        withTiming(0.2, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      dotOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [connectionState, dotOpacity]);

  const dotAnimatedStyle = useAnimatedStyle(() => ({
    opacity: dotOpacity.value,
  }));

  // KeepAwake制御 (Androidネイティブ)
  useEffect(() => {
    if (keepScreenOn && Platform.OS === 'android') {
      // FLAG_KEEP_SCREEN_ON をネイティブで設定する場合はここで制御
      // 現段階ではReact Nativeの KeepAwake ライブラリに委譲
    }
  }, [keepScreenOn]);

  // リアルタイムOBDデータの取得
  const rpm = usePidValue('010C', 0);
  const speed = usePidValue('010D', 0);
  const coolantTemp = usePidValue('0105', 0);
  const throttle = usePidValue('0111', 0);

  // HVバッテリーデータ (Toyota固有PID)
  const hvSoc = usePidValue('TOYOTA_HV_SOC', 0);
  const hvVoltage = usePidValue('TOYOTA_HV_VOLTAGE', 201.6);
  const hvCurrent = usePidValue('TOYOTA_HV_CURRENT', 0);
  const hvTemp = usePidValue('TOYOTA_HV_TEMP', 25);

  // 燃費データ (計算値)
  const instantFuel = usePidValue('CALC_INSTANT_FUEL', 0);
  const averageFuel = usePidValue('CALC_AVG_FUEL', 0);
  const evRatio = usePidValue('CALC_EV_RATIO', 0);

  // 環境データ
  const ambientTemp = usePidValue('0146', 20);
  const cabinTemp = usePidValue('TOYOTA_CABIN_TEMP', 22);
  const acStatus = usePidValue('TOYOTA_AC_STATUS', 0);
  const acSetTemp = usePidValue('TOYOTA_AC_SET_TEMP', 24);

  const demoMode = useConnectionStore((s) => s.demoMode);

  const connectionLabel =
    demoMode
      ? 'Demo Mode'
      : connectionState === 'connected'
        ? connectedDevice?.name ?? 'ELM327'
        : connectionState.charAt(0).toUpperCase() + connectionState.slice(1);

  return (
    <View style={styles.screen}>
      <StatusBar hidden />

      {/* 上部: 接続状態バー */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Animated.View
            style={[
              styles.connectionDot,
              { backgroundColor: CONNECTION_COLORS[connectionState] ?? THEME.textDim },
              dotAnimatedStyle,
            ]}
          />
          <Text style={styles.connectionText}>{connectionLabel}</Text>
        </View>

        <Text style={styles.headerTitle}>OBD Meter</Text>

        <View style={styles.headerRight}>
          <Text style={styles.vehicleText}>ZVW30 Prius</Text>
        </View>
      </View>

      {/* 環境情報バー */}
      <View style={styles.envBar}>
        <View style={styles.envItem}>
          <Text style={styles.envLabel}>OUT</Text>
          <Text style={styles.envValue}>{ambientTemp.toFixed(1)}</Text>
          <Text style={styles.envUnit}>{'\u00B0C'}</Text>
        </View>
        <View style={styles.envSeparator} />
        <View style={styles.envItem}>
          <Text style={styles.envLabel}>IN</Text>
          <Text style={styles.envValue}>{cabinTemp.toFixed(1)}</Text>
          <Text style={styles.envUnit}>{'\u00B0C'}</Text>
        </View>
        <View style={styles.envSeparator} />
        <View style={styles.envItem}>
          <Text style={styles.envLabel}>A/C</Text>
          <Text style={[
            styles.envValue,
            { color: acStatus > 0 ? THEME.primary : THEME.textDim },
          ]}>
            {acStatus > 0 ? 'ON' : 'OFF'}
          </Text>
        </View>
        <View style={styles.envSeparator} />
        <View style={styles.envItem}>
          <Text style={styles.envLabel}>SET</Text>
          <Text style={styles.envValue}>{acSetTemp.toFixed(0)}</Text>
          <Text style={styles.envUnit}>{'\u00B0C'}</Text>
        </View>
      </View>

      {/* プリウス線画背景 */}
      <View style={styles.silhouetteContainer} pointerEvents="none">
        <PriusSilhouette width={700} height={334} opacity={0.12} />
      </View>

      {/* メインメーターエリア */}
      <View style={styles.meterArea}>
        {/* 上段: 大ゲージ2つ (RPM, Speed) */}
        <View style={styles.topRow}>
          <View style={styles.largeGaugeContainer}>
            <GaugeMeter
              value={rpm}
              min={0}
              max={6000}
              unit="rpm"
              label="ENGINE RPM"
              size={220}
              warningThreshold={4500}
              dangerThreshold={5500}
            />
          </View>

          <View style={styles.largeGaugeContainer}>
            <GaugeMeter
              value={speed}
              min={0}
              max={180}
              unit="km/h"
              label="SPEED"
              size={220}
              warningThreshold={120}
              dangerThreshold={140}
            />
          </View>
        </View>

        {/* 中段: 冷却水温ゲージ, HVバッテリー, スロットルバー */}
        <View style={styles.middleRow}>
          <View style={styles.smallGaugeContainer}>
            <GaugeMeter
              value={coolantTemp}
              min={0}
              max={130}
              unit={'\u00B0C'}
              label="COOLANT"
              size={140}
              warningThreshold={100}
              dangerThreshold={110}
            />
          </View>

          <View style={styles.batteryContainer}>
            <BatteryIndicator
              soc={hvSoc}
              voltage={hvVoltage}
              current={hvCurrent}
              temperature={hvTemp}
            />
          </View>

          <View style={styles.barContainer}>
            <BarMeter
              value={throttle}
              min={0}
              max={100}
              unit="%"
              label="THROTTLE"
              width={200}
              height={80}
              warningThreshold={80}
            />
          </View>
        </View>

        {/* 下段: デジタルメーター3つ (瞬間燃費, 平均燃費, EV率) */}
        <View style={styles.bottomRow}>
          <View style={styles.digitalContainer}>
            <DigitalMeter
              value={instantFuel}
              unit="km/L"
              label="INSTANT"
              decimals={1}
              fontSize={28}
            />
          </View>

          <View style={styles.digitalContainer}>
            <DigitalMeter
              value={averageFuel}
              unit="km/L"
              label="AVERAGE"
              decimals={1}
              fontSize={28}
            />
          </View>

          <View style={styles.digitalContainer}>
            <DigitalMeter
              value={evRatio}
              unit="%"
              label="EV RATIO"
              decimals={0}
              fontSize={28}
            />
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: THEME.bg,
  },

  // ヘッダー
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
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  connectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  connectionText: {
    color: THEME.text,
    fontSize: 13,
    fontWeight: '500',
  },
  headerTitle: {
    color: THEME.primary,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1.5,
    flex: 1,
    textAlign: 'center',
  },
  headerRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  vehicleText: {
    color: THEME.textDim,
    fontSize: 12,
    fontWeight: '500',
  },

  // プリウス線画背景
  silhouetteContainer: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
  },

  // 環境情報バー
  envBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.bgElevated,
    paddingVertical: 6,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  envItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: 12,
  },
  envLabel: {
    color: THEME.textDim,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginRight: 6,
  },
  envValue: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'] as any,
  },
  envUnit: {
    color: THEME.textDim,
    fontSize: 10,
    marginLeft: 2,
  },
  envSeparator: {
    width: 1,
    height: 16,
    backgroundColor: THEME.border,
  },

  // メーターエリア
  meterArea: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'space-between',
  },

  // 上段 (大ゲージ)
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    flex: 3,
  },
  largeGaugeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 中段
  middleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flex: 2,
    paddingHorizontal: 16,
  },
  smallGaugeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  batteryContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    marginHorizontal: 8,
  },
  barContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 下段 (デジタル)
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    flex: 1,
    paddingBottom: 4,
  },
  digitalContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
});
