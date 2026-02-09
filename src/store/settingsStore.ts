import { create } from 'zustand';
import type {
  DashboardLayout,
  MeterConfig,
  ThemeMode,
  UnitSystem,
} from '../types/obd';

interface SettingsStoreState {
  /** ダッシュボードレイアウト設定 */
  dashboardLayout: DashboardLayout;
  /** テーマ (light / dark) */
  theme: ThemeMode;
  /** 単位系 (metric / imperial) */
  unit: UnitSystem;
  /** 画面スリープ防止 */
  keepScreenOn: boolean;
  /** ポーリング間隔 (ms) - 100~1000 */
  pollingInterval: number;
  /** 自動再接続 */
  autoReconnect: boolean;
  /** 自動ログ記録 */
  autoLog: boolean;
  /** ログバッファサイズ (件数) */
  logBufferSize: number;
}

interface SettingsStoreActions {
  /** ダッシュボードレイアウト全体を設定する */
  setLayout: (layout: DashboardLayout) => void;
  /** テーマを変更する */
  setTheme: (theme: ThemeMode) => void;
  /** 単位系を変更する */
  setUnit: (unit: UnitSystem) => void;
  /** 画面スリープ防止を切り替える */
  toggleKeepScreen: () => void;
  /** ポーリング間隔を設定する (100-1000ms) */
  setPollingInterval: (interval: number) => void;
  /** 自動再接続を切り替える */
  setAutoReconnect: (enabled: boolean) => void;
  /** 自動ログ記録を切り替える */
  setAutoLog: (enabled: boolean) => void;
  /** ログバッファサイズを更新する */
  setLogBufferSize: (size: number) => void;
  /** データをクリアする (ログバッファリセット) */
  clearData: () => void;
  /**
   * 特定のメーター設定を更新する。
   * 対象メーターが存在しない場合は何もしない。
   * @param meterId - 更新対象のメーターID
   * @param updates - 更新するフィールド (部分更新可)
   */
  updateMeterConfig: (
    meterId: string,
    updates: Partial<Omit<MeterConfig, 'id'>>,
  ) => void;
}

type SettingsStore = SettingsStoreState & SettingsStoreActions;

/** デフォルトのダッシュボードレイアウト */
const defaultLayout: DashboardLayout = {
  name: 'Default',
  meters: [],
};

const initialState: SettingsStoreState = {
  dashboardLayout: defaultLayout,
  theme: 'dark',
  unit: 'metric',
  keepScreenOn: true,
  pollingInterval: 250,
  autoReconnect: true,
  autoLog: false,
  logBufferSize: 0,
};

/**
 * アプリ設定を管理するZustandストア
 *
 * ダッシュボードのメーター配置、テーマ、単位系、
 * 画面スリープ防止などのユーザー設定を管理する。
 */
export const useSettingsStore = create<SettingsStore>((set) => ({
  ...initialState,

  setLayout: (layout: DashboardLayout) =>
    set({ dashboardLayout: layout }),

  setTheme: (theme: ThemeMode) =>
    set({ theme }),

  setUnit: (unit: UnitSystem) =>
    set({ unit }),

  toggleKeepScreen: () =>
    set(current => ({ keepScreenOn: !current.keepScreenOn })),

  setPollingInterval: (interval: number) =>
    set({ pollingInterval: Math.max(100, Math.min(1000, Math.round(interval))) }),

  setAutoReconnect: (enabled: boolean) =>
    set({ autoReconnect: enabled }),

  setAutoLog: (enabled: boolean) =>
    set({ autoLog: enabled }),

  setLogBufferSize: (size: number) =>
    set({ logBufferSize: size }),

  clearData: () =>
    set({ logBufferSize: 0 }),

  updateMeterConfig: (
    meterId: string,
    updates: Partial<Omit<MeterConfig, 'id'>>,
  ) =>
    set(current => {
      const meterIndex = current.dashboardLayout.meters.findIndex(
        m => m.id === meterId,
      );

      // 対象メーターが存在しない場合は変更なし
      if (meterIndex === -1) {
        return current;
      }

      const existingMeter = current.dashboardLayout.meters[meterIndex];
      const updatedMeter: MeterConfig = {
        ...existingMeter,
        ...updates,
        id: existingMeter.id, // idは上書き不可
      };

      const updatedMeters = [...current.dashboardLayout.meters];
      updatedMeters[meterIndex] = updatedMeter;

      return {
        dashboardLayout: {
          ...current.dashboardLayout,
          meters: updatedMeters,
        },
      };
    }),
}));
