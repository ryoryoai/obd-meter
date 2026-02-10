/**
 * デモモード用モックデータプロバイダー
 *
 * OBD2接続なしでUIを確認するために、ZVW30プリウスの
 * リアルな走行データをシミュレーションする。
 */

import { useOBDStore } from '../store/obdStore';
import { useBatteryHealthStore } from '../store/batteryHealthStore';

/** シミュレーション走行シナリオ */
type DrivingPhase = 'idle' | 'accel' | 'cruise' | 'decel' | 'ev_cruise' | 'stop';

interface MockState {
  phase: DrivingPhase;
  phaseTime: number;      // 現フェーズ経過時間 (ms)
  phaseDuration: number;  // 現フェーズ持続時間 (ms)
  rpm: number;
  speed: number;
  coolant: number;
  throttle: number;
  soc: number;
  hvVoltage: number;
  hvCurrent: number;
  hvTemp: number;
  evMode: boolean;
  moduleVoltages: number[];     // 28モジュール個別電圧
  batteryTemps: number[];       // 3点温度センサー
  aux12v: number;               // 12V補機バッテリー電圧
  engineOnTime: number;         // エンジンON累計(ms)
  totalTime: number;            // 総走行時間(ms)
  lastEvObservationTemp: number; // 最後のEV閾値観測温度
  ambientTemp: number;          // 外気温 (°C)
  cabinTemp: number;            // 内気温 (°C)
  acOn: boolean;                // エアコンコンプレッサーON/OFF
  acSetTemp: number;            // エアコン設定温度 (°C)
}

const PHASE_SEQUENCE: DrivingPhase[] = [
  'idle', 'accel', 'cruise', 'decel', 'ev_cruise', 'accel', 'cruise', 'decel', 'stop',
];

/** フェーズごとの目標パラメータ */
const PHASE_TARGETS: Record<DrivingPhase, {
  rpm: [number, number];
  speed: [number, number];
  throttle: [number, number];
  duration: [number, number]; // min, max ms
  evMode: boolean;
}> = {
  idle:      { rpm: [750, 800],   speed: [0, 0],      throttle: [0, 2],     duration: [3000, 5000],   evMode: false },
  accel:     { rpm: [2000, 3500], speed: [40, 80],    throttle: [40, 75],   duration: [4000, 7000],   evMode: false },
  cruise:    { rpm: [1200, 1800], speed: [50, 80],    throttle: [15, 30],   duration: [8000, 15000],  evMode: false },
  decel:     { rpm: [800, 1200],  speed: [20, 40],    throttle: [0, 5],     duration: [3000, 5000],   evMode: false },
  ev_cruise: { rpm: [0, 0],       speed: [20, 45],    throttle: [10, 25],   duration: [5000, 10000],  evMode: true },
  stop:      { rpm: [0, 0],       speed: [0, 0],      throttle: [0, 0],     duration: [2000, 4000],   evMode: true },
};

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function lerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}

/** ノイズ付きの値変動 */
function jitter(value: number, amount: number): number {
  return value + (Math.random() - 0.5) * amount;
}

class MockDataProvider {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private state: MockState;
  private phaseIndex = 0;
  private targetRpm = 0;
  private targetSpeed = 0;
  private targetThrottle = 0;

  constructor() {
    this.state = {
      phase: 'idle',
      phaseTime: 0,
      phaseDuration: 4000,
      rpm: 750,
      speed: 0,
      coolant: 40, // エンジン冷間始動
      throttle: 0,
      soc: 65,
      hvVoltage: 201.6,
      hvCurrent: 0,
      hvTemp: 28,
      evMode: false,
      moduleVoltages: Array.from({ length: 28 }, () => 7.2),
      batteryTemps: [28, 29, 27],
      aux12v: 12.6,
      engineOnTime: 0,
      totalTime: 0,
      lastEvObservationTemp: 0,
      ambientTemp: 18,        // 春秋の外気温
      cabinTemp: 22,          // 初期内気温
      acOn: true,             // エアコンON
      acSetTemp: 24,          // 設定温度24°C
    };
    this.setPhaseTargets();
  }

  private setPhaseTargets(): void {
    const targets = PHASE_TARGETS[this.state.phase];
    this.targetRpm = rand(targets.rpm[0], targets.rpm[1]);
    this.targetSpeed = rand(targets.speed[0], targets.speed[1]);
    this.targetThrottle = rand(targets.throttle[0], targets.throttle[1]);
    this.state.phaseDuration = rand(targets.duration[0], targets.duration[1]);
    this.state.evMode = targets.evMode;
    this.state.phaseTime = 0;
  }

  private nextPhase(): void {
    this.phaseIndex = (this.phaseIndex + 1) % PHASE_SEQUENCE.length;
    this.state.phase = PHASE_SEQUENCE[this.phaseIndex];
    this.setPhaseTargets();
  }

  private tick(dt: number): void {
    this.state.phaseTime += dt;

    // フェーズ終了判定
    if (this.state.phaseTime >= this.state.phaseDuration) {
      this.nextPhase();
    }

    const smoothFactor = dt / 1000; // 1秒で完全追従

    // エンジン系
    this.state.rpm = Math.max(0, lerp(this.state.rpm, this.targetRpm, smoothFactor * 1.5));
    this.state.speed = Math.max(0, lerp(this.state.speed, this.targetSpeed, smoothFactor * 0.8));
    this.state.throttle = Math.max(0, Math.min(100, lerp(this.state.throttle, this.targetThrottle, smoothFactor * 2)));

    // 冷却水温: 徐々に上昇して90°C付近で安定
    if (this.state.coolant < 90) {
      this.state.coolant += dt / 1000 * 0.5; // 0.5°C/s で上昇
    } else {
      this.state.coolant = lerp(this.state.coolant, 90, smoothFactor * 0.1);
    }

    // HVバッテリー
    if (this.state.phase === 'accel') {
      // 加速時: 放電 (SOC減少, 電流マイナス)
      this.state.soc = Math.max(20, this.state.soc - dt / 1000 * 0.3);
      this.state.hvCurrent = lerp(this.state.hvCurrent, -rand(30, 80), smoothFactor * 1.2);
    } else if (this.state.phase === 'decel') {
      // 減速時: 回生充電 (SOC増加, 電流プラス)
      this.state.soc = Math.min(80, this.state.soc + dt / 1000 * 0.5);
      this.state.hvCurrent = lerp(this.state.hvCurrent, rand(20, 50), smoothFactor * 1.2);
    } else if (this.state.phase === 'ev_cruise') {
      // EV走行: 放電 (控えめ)
      this.state.soc = Math.max(20, this.state.soc - dt / 1000 * 0.15);
      this.state.hvCurrent = lerp(this.state.hvCurrent, -rand(10, 30), smoothFactor);
    } else {
      this.state.hvCurrent = lerp(this.state.hvCurrent, 0, smoothFactor);
    }

    // HV電圧: SOCに連動 (190V ~ 220V)
    this.state.hvVoltage = lerp(this.state.hvVoltage, 190 + (this.state.soc / 100) * 30, smoothFactor * 0.5);

    // HVバッテリー温度: ゆっくり上昇 (25-40°C)
    const tempTarget = 30 + Math.abs(this.state.hvCurrent) * 0.05;
    this.state.hvTemp = lerp(this.state.hvTemp, Math.min(40, tempTarget), smoothFactor * 0.05);

    // 28モジュール電圧: SOCに連動したベース電圧 + 個別ばらつき
    const baseModuleV = 6.8 + (this.state.soc / 100) * 1.2; // 6.8-8.0V
    for (let i = 0; i < 28; i++) {
      // 劣化シミュレーション: 3段階の劣化モジュール
      // Module 4 (idx=3):  重度劣化 → Δ≈-0.30V (SOHに大きく影響)
      // Module 18 (idx=17): 中度劣化 → Δ≈-0.18V
      // Module 11 (idx=10): 軽度劣化 → Δ≈-0.08V
      let degradation = 0;
      if (i === 3)  degradation = -0.30;
      else if (i === 17) degradation = -0.18;
      else if (i === 10) degradation = -0.08;
      this.state.moduleVoltages[i] = jitter(baseModuleV + degradation, 0.02);
    }

    // 3点バッテリー温度センサー
    const baseBatTemp = 26 + Math.abs(this.state.hvCurrent) * 0.08;
    this.state.batteryTemps[0] = jitter(Math.min(42, baseBatTemp), 0.5);
    this.state.batteryTemps[1] = jitter(Math.min(42, baseBatTemp + 1.5), 0.5);
    this.state.batteryTemps[2] = jitter(Math.min(42, baseBatTemp - 0.5), 0.5);

    // 12V補機バッテリー: エンジンON時はオルタネータで充電
    const aux12Target = this.state.rpm > 0 ? 14.2 : 12.4;
    this.state.aux12v = lerp(this.state.aux12v, aux12Target, smoothFactor * 0.3);

    // 外気温: ゆっくり変動 (15-25°C の範囲でゆらぐ)
    this.state.ambientTemp = jitter(this.state.ambientTemp, 0.02);
    this.state.ambientTemp = Math.max(5, Math.min(38, this.state.ambientTemp));

    // 内気温: エアコンONなら設定温度に向かって変化、OFFなら外気温に近づく
    if (this.state.acOn) {
      this.state.cabinTemp = lerp(this.state.cabinTemp, this.state.acSetTemp, smoothFactor * 0.02);
    } else {
      this.state.cabinTemp = lerp(this.state.cabinTemp, this.state.ambientTemp, smoothFactor * 0.005);
    }
    this.state.cabinTemp = jitter(this.state.cabinTemp, 0.05);

    // エアコン設定: たまにON/OFF切り替え (約60秒に1回の確率)
    if (Math.random() < dt / 60000) {
      this.state.acOn = !this.state.acOn;
    }

    // エンジン稼働時間トラッキング
    this.state.totalTime += dt;
    if (this.state.rpm > 100) {
      this.state.engineOnTime += dt;
    }

    this.pushToStore(dt);
  }

  private pushToStore(dt: number): void {
    const store = useOBDStore.getState();

    // 標準PID
    store.updatePidValue('010C', jitter(this.state.rpm, 30), 'MOCK');
    store.updatePidValue('010D', jitter(Math.max(0, this.state.speed), 1), 'MOCK');
    store.updatePidValue('0105', jitter(this.state.coolant, 0.5), 'MOCK');
    store.updatePidValue('0111', jitter(Math.max(0, this.state.throttle), 1), 'MOCK');

    // Toyota固有PID
    store.updatePidValue('TOYOTA_HV_SOC', jitter(this.state.soc, 0.3), 'MOCK');
    store.updatePidValue('TOYOTA_HV_VOLTAGE', jitter(this.state.hvVoltage, 0.5), 'MOCK');
    store.updatePidValue('TOYOTA_HV_CURRENT', jitter(this.state.hvCurrent, 2), 'MOCK');
    store.updatePidValue('TOYOTA_HV_TEMP', jitter(this.state.hvTemp, 0.3), 'MOCK');

    // 環境データ
    store.updatePidValue('0146', jitter(this.state.ambientTemp, 0.3), 'MOCK');          // 外気温
    store.updatePidValue('TOYOTA_CABIN_TEMP', jitter(this.state.cabinTemp, 0.2), 'MOCK'); // 内気温
    store.updatePidValue('TOYOTA_AC_STATUS', this.state.acOn ? 1 : 0, 'MOCK');           // AC ON/OFF
    store.updatePidValue('TOYOTA_AC_SET_TEMP', this.state.acSetTemp, 'MOCK');             // AC設定温度

    // 計算値 (燃費系)
    const instantFuel = this.state.speed > 5 && this.state.rpm > 0
      ? 10 + this.state.speed / this.state.rpm * 30 + (Math.random() - 0.5) * 3
      : 0;
    const avgFuel = instantFuel > 0 ? instantFuel * 0.8 + 5 : 0;
    const evRatio = this.state.evMode ? rand(60, 90) : rand(10, 30);

    store.updatePidValue('CALC_INSTANT_FUEL', Math.max(0, instantFuel), 'MOCK');
    store.updatePidValue('CALC_AVG_FUEL', Math.max(0, avgFuel), 'MOCK');
    store.updatePidValue('CALC_EV_RATIO', evRatio, 'MOCK');

    // batteryHealthStore にデータプッシュ
    const bhStore = useBatteryHealthStore.getState();
    bhStore.updateModuleVoltages(this.state.moduleVoltages);
    bhStore.updateTemperatures(this.state.batteryTemps);
    bhStore.update12V(this.state.aux12v);
    bhStore.updatePackElectrical(this.state.hvVoltage, this.state.hvCurrent);

    // エンジン稼働統計
    bhStore.tickEngineStats(this.state.rpm > 100, dt);

    // パワーフロー計算
    const engineKw = this.state.rpm > 100 ? (this.state.rpm / 6000) * 57 * (this.state.throttle / 100) : 0;
    const mg2Kw = this.state.hvCurrent < 0
      ? Math.abs(this.state.hvCurrent) * this.state.hvVoltage / 1000 * 0.85 // 放電→駆動
      : -(this.state.hvCurrent * this.state.hvVoltage / 1000 * 0.9);         // 充電→回生
    const batteryKw = -(this.state.hvCurrent * this.state.hvVoltage / 1000);
    const mg1Kw = this.state.rpm > 100 ? engineKw * 0.3 : 0; // エンジンの30%がMG1で発電
    const wheelKw = Math.max(0, mg2Kw + (this.state.rpm > 100 ? engineKw * 0.7 : 0));

    bhStore.updatePowerFlow({
      engineKw: jitter(engineKw, 0.5),
      mg1Kw: jitter(mg1Kw, 0.3),
      mg2Kw: jitter(mg2Kw, 0.3),
      batteryKw: jitter(batteryKw, 0.5),
      wheelKw: jitter(Math.max(0, wheelKw), 0.3),
      evMode: this.state.evMode,
    });

    // EV閾値観測: 冷却水温が変化したタイミングで記録
    if (Math.abs(this.state.coolant - this.state.lastEvObservationTemp) > 2) {
      bhStore.addEvThresholdObservation({
        coolantTemp: this.state.coolant,
        engineRpm: this.state.rpm,
        timestamp: Date.now(),
        wasEvMode: this.state.evMode,
      });
      this.state.lastEvObservationTemp = this.state.coolant;
    }
  }

  /** デモデータのポーリング開始 */
  start(intervalMs = 200): void {
    if (this.intervalId !== null) return;

    const store = useOBDStore.getState();
    store.startPolling();

    this.intervalId = setInterval(() => {
      this.tick(intervalMs);
    }, intervalMs);
  }

  /** デモデータのポーリング停止 */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    const store = useOBDStore.getState();
    store.stopPolling();
    store.clearData();
    useBatteryHealthStore.getState().reset();
  }

  /** 現在の走行フェーズ */
  get currentPhase(): DrivingPhase {
    return this.state.phase;
  }
}

/** シングルトンインスタンス */
export const mockDataProvider = new MockDataProvider();
