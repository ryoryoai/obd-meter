import type { FuelEconomyData } from '../types/obd';

/**
 * 空燃比 (Air-Fuel Ratio)
 * ガソリンエンジンの理論空燃比。MAFから燃料消費量を逆算する際に使用。
 */
const STOICHIOMETRIC_AFR = 14.7;

/**
 * ガソリン密度 (kg/L)
 * MAF(g/s)から体積流量(L/s)に変換する際に使用。
 */
const GASOLINE_DENSITY = 0.745;

/**
 * 燃費計算の最小速度閾値 (km/h)
 * これ以下の速度では瞬間燃費を計算しない（停車・極低速時のゼロ除算防止）
 */
const MIN_SPEED_THRESHOLD = 1.0;

/**
 * MAFの最小閾値 (g/s)
 * これ以下のMAF値はエンジン停止またはEV走行とみなす
 */
const MIN_MAF_THRESHOLD = 0.1;

/**
 * 燃費分析クラス
 *
 * MAF（Mass Air Flow）センサーの値と車速から瞬間燃費と平均燃費を計算する。
 * プリウス(ZVW30)のEVモード走行率も追跡する。
 *
 * 燃費計算の原理:
 *   燃料消費量(g/s) = MAF(g/s) / 空燃比(14.7)
 *   燃料消費量(L/s)  = 燃料消費量(g/s) / ガソリン密度(0.745 kg/L) / 1000
 *   瞬間燃費(km/L)   = 速度(km/h) / 3600 / 燃料消費量(L/s)
 *                     = 速度(km/h) / (MAF(g/s) * 3600 / (14.7 * 745))
 */
class FuelAnalysis {
  /** 累計走行距離 (km) */
  private totalDistance = 0;

  /** 累計燃料消費量 (L) */
  private totalFuel = 0;

  /** EV走行距離 (km) */
  private evDistance = 0;

  /** 前回のupdate()呼び出し時のタイムスタンプ (ms) */
  private lastTimestamp = 0;

  /** 前回の速度 (km/h) - 台形積分用 */
  private lastSpeed = 0;

  /** 最新の瞬間燃費 (km/L) */
  private currentInstantKmPerL = 0;

  /**
   * MAFセンサー値と速度から瞬間燃費(km/L)を計算する。
   *
   * 計算式:
   *   燃費(km/L) = 速度(km/h) / (MAF(g/s) * 3600 / (空燃比 * ガソリン密度 * 1000))
   *
   * MAFが0に近い場合やspeedが0の場合は0を返す。
   *
   * @param maf - MAFセンサー値 (g/s)
   * @param speed - 車速 (km/h)
   * @returns 瞬間燃費 (km/L)。計算不能な場合は0
   */
  calculateInstantFuelEconomy(maf: number, speed: number): number {
    if (maf < MIN_MAF_THRESHOLD || speed < MIN_SPEED_THRESHOLD) {
      return 0;
    }

    // 燃料流量 (L/h) = MAF(g/s) * 3600(s/h) / (空燃比 * ガソリン密度(g/L))
    // ガソリン密度(g/L) = 0.745(kg/L) * 1000 = 745 (g/L)
    const fuelFlowLPerH =
      (maf * 3600) / (STOICHIOMETRIC_AFR * GASOLINE_DENSITY * 1000);

    // 燃費(km/L) = 速度(km/h) / 燃料流量(L/h)
    const kmPerL = speed / fuelFlowLPerH;

    // 異常値をクランプ（センサーノイズ対策）
    return Math.min(kmPerL, 99.9);
  }

  /**
   * ポーリングごとに呼び出し、走行距離と燃料消費を積算する。
   *
   * 前回呼び出しからの経過時間と速度（台形積分）で走行距離を算出し、
   * MAF値から燃料消費量を算出して累計する。
   *
   * @param speed - 車速 (km/h)
   * @param maf - MAFセンサー値 (g/s)
   * @param isEvMode - EV走行モードか (ZVW30プリウス固有)
   * @param timestamp - 現在のタイムスタンプ (ms)
   */
  update(
    speed: number,
    maf: number,
    isEvMode: boolean,
    timestamp: number,
  ): void {
    // 初回呼び出し時は前回値を記録するだけ
    if (this.lastTimestamp === 0) {
      this.lastTimestamp = timestamp;
      this.lastSpeed = speed;
      this.currentInstantKmPerL = this.calculateInstantFuelEconomy(maf, speed);
      return;
    }

    // 経過時間 (秒)
    const deltaTimeSec = (timestamp - this.lastTimestamp) / 1000;

    // 経過時間が異常（負や極端に長い）場合はスキップ
    if (deltaTimeSec <= 0 || deltaTimeSec > 10) {
      this.lastTimestamp = timestamp;
      this.lastSpeed = speed;
      return;
    }

    // 走行距離の積算（台形積分: 前回速度と今回速度の平均 * 時間）
    // 速度(km/h) * 時間(s) / 3600(s/h) = 距離(km)
    const avgSpeed = (this.lastSpeed + speed) / 2;
    const distanceKm = (avgSpeed * deltaTimeSec) / 3600;
    this.totalDistance += distanceKm;

    // EV走行距離の積算
    if (isEvMode) {
      this.evDistance += distanceKm;
    }

    // 燃料消費量の積算
    if (maf >= MIN_MAF_THRESHOLD) {
      // 燃料流量 (L/s) = MAF(g/s) / (空燃比 * ガソリン密度(g/L))
      const fuelFlowLPerSec =
        maf / (STOICHIOMETRIC_AFR * GASOLINE_DENSITY * 1000);
      const fuelConsumedL = fuelFlowLPerSec * deltaTimeSec;
      this.totalFuel += fuelConsumedL;
    }

    // 瞬間燃費を更新
    this.currentInstantKmPerL = this.calculateInstantFuelEconomy(maf, speed);

    // 前回値を更新
    this.lastTimestamp = timestamp;
    this.lastSpeed = speed;
  }

  /**
   * 平均燃費 (km/L) を返す。
   * 燃料消費がない場合（全区間EV走行等）は0を返す。
   */
  getAverageFuelEconomy(): number {
    if (this.totalFuel <= 0) {
      return 0;
    }
    return this.totalDistance / this.totalFuel;
  }

  /**
   * EV走行率を0~1の割合で返す。
   * 総走行距離が0の場合は0を返す。
   */
  getEvRatio(): number {
    if (this.totalDistance <= 0) {
      return 0;
    }
    return this.evDistance / this.totalDistance;
  }

  /**
   * 現在の燃費サマリデータを返す。
   */
  getSummary(): FuelEconomyData {
    return {
      instantKmPerL: this.currentInstantKmPerL,
      averageKmPerL: this.getAverageFuelEconomy(),
      evRatio: this.getEvRatio(),
      distanceKm: this.totalDistance,
      fuelUsedL: this.totalFuel,
    };
  }

  /**
   * 全ての積算値をリセットする。
   * 新しいトリップ開始時に呼ぶ。
   */
  reset(): void {
    this.totalDistance = 0;
    this.totalFuel = 0;
    this.evDistance = 0;
    this.lastTimestamp = 0;
    this.lastSpeed = 0;
    this.currentInstantKmPerL = 0;
  }
}

export const fuelAnalysis = new FuelAnalysis();
