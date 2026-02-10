import { create } from 'zustand';
import type {
  BatteryModuleData,
  BatteryHealthSummary,
  DiagnosticTroubleCode,
  PowerFlowState,
  EngineRunTimeStats,
  EvThresholdObservation,
} from '../types/obd';

/** 28モジュールの初期データ */
const INITIAL_MODULES: BatteryModuleData[] = Array.from({ length: 28 }, (_, i) => ({
  moduleIndex: i,
  voltage: 7.2,
}));

const INITIAL_SUMMARY: BatteryHealthSummary = {
  modules: INITIAL_MODULES,
  packVoltage: 201.6,
  packCurrent: 0,
  avgTemp: 25,
  minTemp: 25,
  maxTemp: 25,
  soh: 100,
  internalResistance: 0,
  aux12v: 12.6,
  maxMinDelta: 0,
};

const INITIAL_POWER_FLOW: PowerFlowState = {
  engineKw: 0,
  mg1Kw: 0,
  mg2Kw: 0,
  batteryKw: 0,
  wheelKw: 0,
  evMode: false,
};

const INITIAL_ENGINE_STATS: EngineRunTimeStats = {
  engineOnSeconds: 0,
  totalSeconds: 0,
  engineOnRatio: 0,
};

/** SOH推定: Max-Minブロック電圧差から算出 */
function estimateSOH(modules: BatteryModuleData[]): number {
  if (modules.length === 0) return 100;
  const voltages = modules.map((m) => m.voltage);
  const maxV = Math.max(...voltages);
  const minV = Math.min(...voltages);
  const delta = maxV - minV;

  // 0.20V差 = 100%, 1.20V差 = 0% (線形補間)
  const soh = Math.max(0, Math.min(100, ((1.2 - delta) / 1.0) * 100));
  return soh;
}

/** 内部抵抗推定: ΔV / |ΔI| */
function estimateInternalResistance(
  prevVoltage: number,
  currVoltage: number,
  prevCurrent: number,
  currCurrent: number,
): number {
  const deltaV = Math.abs(currVoltage - prevVoltage);
  const deltaI = Math.abs(currCurrent - prevCurrent);
  if (deltaI < 1) return 0; // 電流変化が小さすぎる場合は推定不可
  // mΩ単位で返す
  return (deltaV / deltaI) * 1000;
}

interface BatteryHealthState {
  summary: BatteryHealthSummary;
  dtcList: DiagnosticTroubleCode[];
  powerFlow: PowerFlowState;
  engineStats: EngineRunTimeStats;
  evThresholdLog: EvThresholdObservation[];

  // 内部抵抗推定用の前回値
  _prevVoltage: number;
  _prevCurrent: number;
}

interface BatteryHealthActions {
  /** 28モジュールの電圧を一括更新 */
  updateModuleVoltages: (voltages: number[]) => void;
  /** 温度センサー値を更新 (3点) */
  updateTemperatures: (temps: number[]) => void;
  /** 12V補機バッテリー電圧を更新 */
  update12V: (voltage: number) => void;
  /** パック電圧・電流を更新 */
  updatePackElectrical: (voltage: number, current: number) => void;
  /** DTCリストを設定 */
  setDTCs: (codes: DiagnosticTroubleCode[]) => void;
  /** パワーフロー状態を更新 */
  updatePowerFlow: (state: PowerFlowState) => void;
  /** エンジン稼働統計を更新 */
  tickEngineStats: (engineRunning: boolean, deltaMs: number) => void;
  /** EV閾値観測を追加 */
  addEvThresholdObservation: (obs: EvThresholdObservation) => void;
  /** 全データリセット */
  reset: () => void;
}

type BatteryHealthStore = BatteryHealthState & BatteryHealthActions;

export const useBatteryHealthStore = create<BatteryHealthStore>((set, _get) => ({
  summary: { ...INITIAL_SUMMARY },
  dtcList: [],
  powerFlow: { ...INITIAL_POWER_FLOW },
  engineStats: { ...INITIAL_ENGINE_STATS },
  evThresholdLog: [],
  _prevVoltage: 201.6,
  _prevCurrent: 0,

  updateModuleVoltages: (voltages: number[]) =>
    set((state) => {
      const modules = state.summary.modules.map((m, i) => ({
        ...m,
        voltage: i < voltages.length ? voltages[i] : m.voltage,
      }));
      const soh = estimateSOH(modules);
      const vArr = modules.map((m) => m.voltage);
      const maxMinDelta = Math.max(...vArr) - Math.min(...vArr);

      return {
        summary: {
          ...state.summary,
          modules,
          soh,
          maxMinDelta,
        },
      };
    }),

  updateTemperatures: (temps: number[]) =>
    set((state) => {
      const validTemps = temps.filter((t) => Number.isFinite(t));
      if (validTemps.length === 0) return state;

      const avgTemp = validTemps.reduce((a, b) => a + b, 0) / validTemps.length;
      const minTemp = Math.min(...validTemps);
      const maxTemp = Math.max(...validTemps);

      return {
        summary: {
          ...state.summary,
          avgTemp,
          minTemp,
          maxTemp,
        },
      };
    }),

  update12V: (voltage: number) =>
    set((state) => ({
      summary: { ...state.summary, aux12v: voltage },
    })),

  updatePackElectrical: (voltage: number, current: number) =>
    set((state) => {
      const resistance = estimateInternalResistance(
        state._prevVoltage,
        voltage,
        state._prevCurrent,
        current,
      );

      return {
        summary: {
          ...state.summary,
          packVoltage: voltage,
          packCurrent: current,
          internalResistance:
            resistance > 0
              ? resistance
              : state.summary.internalResistance,
        },
        _prevVoltage: voltage,
        _prevCurrent: current,
      };
    }),

  setDTCs: (codes: DiagnosticTroubleCode[]) => set({ dtcList: codes }),

  updatePowerFlow: (state: PowerFlowState) => set({ powerFlow: state }),

  tickEngineStats: (engineRunning: boolean, deltaMs: number) =>
    set((state) => {
      const deltaSec = deltaMs / 1000;
      const newOn = state.engineStats.engineOnSeconds + (engineRunning ? deltaSec : 0);
      const newTotal = state.engineStats.totalSeconds + deltaSec;
      return {
        engineStats: {
          engineOnSeconds: newOn,
          totalSeconds: newTotal,
          engineOnRatio: newTotal > 0 ? newOn / newTotal : 0,
        },
      };
    }),

  addEvThresholdObservation: (obs: EvThresholdObservation) =>
    set((state) => {
      // 最新100件のみ保持
      const log = [...state.evThresholdLog, obs];
      if (log.length > 100) {
        return { evThresholdLog: log.slice(log.length - 100) };
      }
      return { evThresholdLog: log };
    }),

  reset: () =>
    set({
      summary: { ...INITIAL_SUMMARY },
      dtcList: [],
      powerFlow: { ...INITIAL_POWER_FLOW },
      engineStats: { ...INITIAL_ENGINE_STATS },
      evThresholdLog: [],
      _prevVoltage: 201.6,
      _prevCurrent: 0,
    }),
}));
