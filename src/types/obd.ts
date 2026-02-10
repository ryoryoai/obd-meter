// BLE接続状態
export type ConnectionState =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'error';

// OBD PID定義
export interface PidDefinition {
  /**
   * App-level signal id (store key).
   * Standard OBD-II signals typically use the same value as `request` (e.g. "010C").
   * PriusChat/Torque-derived signals may use a different id that maps to a shared request.
   */
  pid: string; // e.g. "010C" or "TOYOTA_HV_SOC" or "PC_7E2_2181_V01"
  name: string; // e.g. "Engine RPM"
  shortName: string; // e.g. "RPM"
  unit: string; // e.g. "rpm"
  min: number;
  max: number;
  decode: (bytes: number[]) => number;

  /**
   * Raw OBD request bytes as a hex string (no spaces), e.g.:
   * - "010C" (Mode 01 PID 0C)
   * - "2181" (Mode 21 PID 81)
   * - "220138" (Mode 22 PID 0138, 2-byte PID)
   *
   * If omitted, the protocol layer will use `pid` as the request.
   */
  request?: string;

  /**
   * Optional CAN TX header (11-bit) for ELM327 `ATSH`, e.g. "7E2", "7C4".
   * If omitted, the protocol layer will use functional header "7DF".
   */
  header?: string;
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

// バッテリーモジュールデータ (28モジュール)
export interface BatteryModuleData {
  moduleIndex: number;     // 0-27
  voltage: number;         // 個別モジュール電圧 (V) 通常7.0-8.4V
  temperature?: number;    // モジュール近傍温度 (°C) (センサーがあれば)
}

// バッテリー健全性サマリ
export interface BatteryHealthSummary {
  modules: BatteryModuleData[];  // 28モジュール
  packVoltage: number;           // パック総電圧 (V)
  packCurrent: number;           // パック電流 (A)
  avgTemp: number;               // 平均温度 (°C)
  minTemp: number;
  maxTemp: number;
  soh: number;                   // State of Health (0-100%)
  internalResistance: number;    // 推定内部抵抗 (mΩ)
  aux12v: number;                // 12V補機バッテリー電圧
  maxMinDelta: number;           // Max-Min電圧差 (V)
}

// DTC (Diagnostic Trouble Code)
export interface DiagnosticTroubleCode {
  code: string;          // e.g. "P0301"
  description: string;   // e.g. "Cylinder 1 Misfire Detected"
  isPending: boolean;    // 保留中のDTCか
}

// パワーフロー状態
export interface PowerFlowState {
  engineKw: number;     // エンジン出力 (kW)
  mg1Kw: number;        // MG1出力 (kW) 正=発電, 負=モーター
  mg2Kw: number;        // MG2出力 (kW) 正=駆動, 負=回生
  batteryKw: number;    // バッテリー出力 (kW) 正=放電, 負=充電
  wheelKw: number;      // ホイール出力 (kW)
  evMode: boolean;
}

// エンジン稼働統計
export interface EngineRunTimeStats {
  engineOnSeconds: number;
  totalSeconds: number;
  engineOnRatio: number;   // 0.0 - 1.0
}

// EV閾値観測ログ
export interface EvThresholdObservation {
  coolantTemp: number;     // 冷却水温 (°C)
  engineRpm: number;       // エンジンRPM
  timestamp: number;       // タイムスタンプ
  wasEvMode: boolean;      // EV走行中だったか
}
