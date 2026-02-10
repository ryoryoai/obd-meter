/**
 * Web版エントリポイント
 *
 * React Navigationを使わず、タブ切替をシンプルなステートで実装。
 * デモモードを自動開始してメーターUIを即座に確認できる。
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import Svg, { Path, Circle, Rect, Line } from 'react-native-svg';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { BatteryHealthScreen } from './src/screens/BatteryHealthScreen';
import { HVSystemScreen } from './src/screens/HVSystemScreen';
import { ClimateScreen } from './src/screens/ClimateScreen';
import { AnalysisScreen } from './src/screens/AnalysisScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { useConnectionStore } from './src/store/connectionStore';
import { mockDataProvider } from './src/utils/mockDataProvider';
import { THEME } from './src/utils/theme';

type TabName = 'Dashboard' | 'Battery' | 'HV System' | 'Climate' | 'Analysis' | 'Settings';

// --- SVG Icon Components ---

const ICON_SIZE = 18;

/** Dashboard: タコメーター風（半円弧 + 針） */
function DashboardIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 18 18">
      {/* 半円弧 */}
      <Path
        d="M2 13 A7 7 0 0 1 16 13"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      {/* 針（右上を指す） */}
      <Line
        x1="9"
        y1="13"
        x2="13"
        y2="6"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      {/* 中心円 */}
      <Circle cx="9" cy="13" r="1.4" fill={color} />
    </Svg>
  );
}

/** Battery: バッテリー型 */
function BatteryIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 18 18">
      {/* バッテリー本体 */}
      <Rect
        x="1.5"
        y="5"
        width="13"
        height="8"
        rx="1.5"
        fill="none"
        stroke={color}
        strokeWidth={1.6}
      />
      {/* 端子 */}
      <Rect x="14.5" y="7.5" width="2" height="3" rx="0.5" fill={color} />
      {/* 充電レベル */}
      <Rect x="3.5" y="7" width="4" height="4" rx="0.5" fill={color} />
    </Svg>
  );
}

/** HV System: 稲妻マーク */
function HVSystemIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 18 18">
      <Path
        d="M10 1 L4 10 L8.5 10 L7 17 L14 8 L9.5 8 Z"
        fill={color}
        stroke="none"
      />
    </Svg>
  );
}

/** Climate: 温度計 */
function ClimateIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 18 18">
      {/* 温度計のバルブ */}
      <Circle cx="9" cy="14" r="3" fill="none" stroke={color} strokeWidth={1.6} />
      <Circle cx="9" cy="14" r="1.2" fill={color} />
      {/* 温度計の管 */}
      <Rect x="7.5" y="2" width="3" height="10" rx="1.5" fill="none" stroke={color} strokeWidth={1.4} />
      {/* 水銀柱 */}
      <Line x1="9" y1="12" x2="9" y2="6" stroke={color} strokeWidth={1.2} strokeLinecap="round" />
      {/* 目盛り */}
      <Line x1="10.8" y1="5" x2="12" y2="5" stroke={color} strokeWidth={0.8} />
      <Line x1="10.8" y1="7.5" x2="12" y2="7.5" stroke={color} strokeWidth={0.8} />
      <Line x1="10.8" y1="10" x2="12" y2="10" stroke={color} strokeWidth={0.8} />
    </Svg>
  );
}

/** Analysis: 棒グラフ風 */
function AnalysisIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 18 18">
      <Rect x="1.5" y="10" width="3" height="6.5" rx="0.6" fill={color} />
      <Rect x="5.8" y="6" width="3" height="10.5" rx="0.6" fill={color} />
      <Rect x="10.1" y="3" width="3" height="13.5" rx="0.6" fill={color} />
      <Rect x="14.4" y="7.5" width="3" height="9" rx="0.6" fill={color} />
    </Svg>
  );
}

/** Settings: 歯車 */
function SettingsIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 18 18">
      {/* 歯車外形 */}
      <Path
        d="M9 1.5 L10.2 3.2 L12.3 2.8 L12.8 5 L15 5.8 L14 7.8 L16 9.2 L14.5 10.8 L15.5 13 L13.3 13.3 L12.8 15.5 L10.5 14.8 L9 16.5 L7.5 14.8 L5.2 15.5 L4.7 13.3 L2.5 13 L3.5 10.8 L2 9.2 L4 7.8 L3 5.8 L5.2 5 L5.7 2.8 L7.8 3.2 Z"
        fill="none"
        stroke={color}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      {/* 中心円 */}
      <Circle cx="9" cy="9" r="2.5" fill="none" stroke={color} strokeWidth={1.4} />
    </Svg>
  );
}

const TAB_ICONS: Record<TabName, React.FC<{ color: string }>> = {
  Dashboard: DashboardIcon,
  Battery: BatteryIcon,
  'HV System': HVSystemIcon,
  Climate: ClimateIcon,
  Analysis: AnalysisIcon,
  Settings: SettingsIcon,
};

const TABS: TabName[] = ['Dashboard', 'Battery', 'HV System', 'Climate', 'Analysis', 'Settings'];

const ASPECT = 16 / 9;

function App(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabName>('Dashboard');
  const setDemoMode = useConnectionStore((s) => s.setDemoMode);
  const setDevice = useConnectionStore((s) => s.setDevice);
  const setConnectionState = useConnectionStore((s) => s.setConnectionState);
  const { width: winW, height: winH } = useWindowDimensions();

  // 16:9 固定サイズ計算 (letterbox)
  const windowAspect = winW / winH;
  const appW = windowAspect > ASPECT ? winH * ASPECT : winW;
  const appH = windowAspect > ASPECT ? winH : winW / ASPECT;

  // デモモード自動開始
  useEffect(() => {
    setDemoMode(true);
    setDevice({ id: 'DEMO', name: 'Demo Mode', rssi: null });
    setConnectionState('connected');
    mockDataProvider.start(200);

    return () => {
      mockDataProvider.stop();
    };
  }, [setDemoMode, setDevice, setConnectionState]);

  const renderScreen = () => {
    switch (activeTab) {
      case 'Dashboard':
        return <DashboardScreen />;
      case 'Battery':
        return <BatteryHealthScreen />;
      case 'HV System':
        return <HVSystemScreen />;
      case 'Climate':
        return <ClimateScreen />;
      case 'Analysis':
        return <AnalysisScreen />;
      case 'Settings':
        return <SettingsScreen />;
      default:
        return <DashboardScreen />;
    }
  };

  return (
    <View style={styles.outerContainer}>
      <View style={[styles.appContainer, { width: appW, height: appH }]}>
      <View style={styles.content}>{renderScreen()}</View>
      <View style={styles.tabBar}>
        {TABS.map((tabName) => {
          const isActive = activeTab === tabName;
          const color = isActive ? THEME.tabActive : THEME.tabInactive;
          const IconComponent = TAB_ICONS[tabName];

          return (
            <TouchableOpacity
              key={tabName}
              style={styles.tab}
              onPress={() => setActiveTab(tabName)}
              activeOpacity={0.7}
              testID={`tab-${tabName.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {/* アクティブタブインジケーター: 上部2pxライン */}
              <View
                style={[
                  styles.activeIndicator,
                  { backgroundColor: isActive ? THEME.primary : 'transparent' },
                ]}
              />
              <View style={styles.tabContent}>
                <IconComponent color={color} />
                <Text style={[styles.tabLabel, { color }]}>{tabName}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appContainer: {
    backgroundColor: THEME.bg,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: THEME.tabBarBg,
    borderTopWidth: 1,
    borderTopColor: THEME.tabBarBorder,
    height: 56,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
  },
  activeIndicator: {
    width: '60%',
    height: 2,
    borderRadius: 1,
  },
  tabContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 4,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 3,
  },
});

export default App;
