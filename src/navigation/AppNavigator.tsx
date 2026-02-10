import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DashboardScreen } from '../screens/DashboardScreen';
import { ConnectionScreen } from '../screens/ConnectionScreen';
import { BatteryHealthScreen } from '../screens/BatteryHealthScreen';
import { HVSystemScreen } from '../screens/HVSystemScreen';
import { ClimateScreen } from '../screens/ClimateScreen';
import { LogScreen } from '../screens/LogScreen';
import { AnalysisScreen } from '../screens/AnalysisScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

/** タブナビゲーションのルート定義 */
type TabParamList = {
  Connect: undefined;
  Dashboard: undefined;
  Battery: undefined;
  'HV System': undefined;
  Climate: undefined;
  Log: undefined;
  Analysis: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

/** タブバーのカラー設定 */
const TAB_COLORS = {
  background: '#0f0f1a',
  active: '#00d4ff',
  inactive: '#666666',
  border: '#1a1a2e',
} as const;

/**
 * タブアイコン用テキスト絵文字マッピング
 *
 * 外部アイコンライブラリを使用せず、React Nativeの標準Text
 * コンポーネントでUnicode絵文字を表示する。
 */
const TAB_ICONS: Record<keyof TabParamList, string> = {
  Connect: '\u{1F50C}',    // electric plug
  Dashboard: '\u{1F3CE}',  // racing car (speedometer風)
  Battery: '\u{1F50B}',    // battery
  'HV System': '\u{26A1}', // high voltage
  Climate: '\u{1F321}',    // thermometer
  Log: '\u{1F4CB}',        // clipboard (list風)
  Analysis: '\u{1F4CA}',   // bar chart (chart風)
  Settings: '\u{2699}',    // gear
};

/**
 * アプリのメインナビゲーター (Bottom Tabs)
 *
 * 4つのタブ:
 * 1. Dashboard - メインダッシュボード (リアルタイムメーター)
 * 2. Log - データログ一覧
 * 3. Analysis - 燃費分析
 * 4. Settings - 設定
 */
export function AppNavigator(): React.JSX.Element {
  return (
    <NavigationContainer>
      <Tab.Navigator
        initialRouteName="Connect"
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <Text
              style={[
                styles.tabIcon,
                { color: focused ? TAB_COLORS.active : TAB_COLORS.inactive },
              ]}
            >
              {TAB_ICONS[route.name]}
            </Text>
          ),
          tabBarActiveTintColor: TAB_COLORS.active,
          tabBarInactiveTintColor: TAB_COLORS.inactive,
          tabBarLabelStyle: styles.tabLabel,
          tabBarStyle: styles.tabBar,
        })}
      >
        <Tab.Screen
          name="Connect"
          component={ConnectionScreen}
          options={{ tabBarLabel: 'Connect' }}
        />
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ tabBarLabel: 'Dashboard' }}
        />
        <Tab.Screen
          name="Battery"
          component={BatteryHealthScreen}
          options={{ tabBarLabel: 'Battery' }}
        />
        <Tab.Screen
          name="HV System"
          component={HVSystemScreen}
          options={{ tabBarLabel: 'HV System' }}
        />
        <Tab.Screen
          name="Climate"
          component={ClimateScreen}
          options={{ tabBarLabel: 'Climate' }}
        />
        <Tab.Screen
          name="Log"
          component={LogScreen}
          options={{ tabBarLabel: 'Log' }}
        />
        <Tab.Screen
          name="Analysis"
          component={AnalysisScreen}
          options={{ tabBarLabel: 'Analysis' }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ tabBarLabel: 'Settings' }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: TAB_COLORS.background,
    borderTopColor: TAB_COLORS.border,
    borderTopWidth: 1,
    height: 60,
    paddingBottom: 6,
    paddingTop: 4,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  tabIcon: {
    fontSize: 22,
  },
});
