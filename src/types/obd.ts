// BLE接続状態
export type ConnectionState =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'error';

// OBD PID定義
export interface PidDefinition {
  pid: string; // e.g. "010C"
  name: string; // e.g. "Engine RPM"
  shortName: string; // e.g. "RPM"
  unit: string; // e.g. "rpm"
  min: number;
  max: number;
  decode: (bytes: number[]) => number;
}

// リアルタイムOBDデータ（PIDごとの最新値）
export interface OBDData {
  [pid: string]: {
    value: number;
    timestamp: number;
    raw: string;
  };
}

// BLEデバイス情報
export interface BLEDevice {
  id: string;
  name: string | null;
  rssi: number | null;
}

// ログセッション
export interface LogSession {
  id: number;
  startTime: number;
  endTime: number | null;
  dataPointCount: number;
}

// データポイント (ログ用)
export interface DataPoint {
  sessionId: number;
  timestamp: number;
  pid: string;
  value: number;
}

// メーター表示タイプ
export type MeterType = 'gauge' | 'bar' | 'digital';

// メーター設定
export interface MeterConfig {
  id: string;
  pid: string;
  type: MeterType;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

// ダッシュボードレイアウト
export interface DashboardLayout {
  name: string;
  meters: MeterConfig[];
}

// 燃費データ
export interface FuelEconomyData {
  instantKmPerL: number;
  averageKmPerL: number;
  evRatio: number; // EV走行率 (ZVW30)
  distanceKm: number;
  fuelUsedL: number;
}

// テーマ設定
export type ThemeMode = 'light' | 'dark';

// 単位系
export type UnitSystem = 'metric' | 'imperial';
