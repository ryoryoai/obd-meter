import { create } from 'zustand';
import type { OBDData } from '../types/obd';

/** デフォルトのポーリング間隔(ms) */
const DEFAULT_POLLING_INTERVAL_MS = 200;

/** 最小ポーリング間隔(ms) */
const MIN_POLLING_INTERVAL_MS = 50;

/** 最大ポーリング間隔(ms) */
const MAX_POLLING_INTERVAL_MS = 5000;

interface OBDStoreState {
  /** 全PIDの最新値マップ */
  data: OBDData;
  /** ポーリングが有効かどうか */
  pollingActive: boolean;
  /** ポーリング間隔(ms) */
  pollingInterval: number;
}

interface OBDStoreActions {
  /**
   * 指定PIDの値を更新する
   * @param pid - OBD PID (e.g. "010C")
   * @param value - デコード済みの数値
   * @param raw - ELM327からの生レスポンス
   */
  updatePidValue: (pid: string, value: number, raw: string) => void;

  /** ポーリングを開始する */
  startPolling: () => void;

  /** ポーリングを停止する */
  stopPolling: () => void;

  /**
   * ポーリング間隔を設定する。
   * MIN_POLLING_INTERVAL_MS ~ MAX_POLLING_INTERVAL_MS の範囲にクランプされる。
   */
  setPollingInterval: (intervalMs: number) => void;

  /** 全PIDデータをクリアする */
  clearData: () => void;
}

type OBDStore = OBDStoreState & OBDStoreActions;

const initialState: OBDStoreState = {
  data: {},
  pollingActive: false,
  pollingInterval: DEFAULT_POLLING_INTERVAL_MS,
};

/**
 * OBDリアルタイムデータを管理するZustandストア
 *
 * 各PIDの最新値をマップとして保持し、ポーリング制御
 * (開始/停止/間隔設定)の状態を管理する。
 * 実際のポーリングループはこのストアの外で実装し、
 * このストアの pollingActive / pollingInterval を参照して制御する。
 */
export const useOBDStore = create<OBDStore>(set => ({
  ...initialState,

  updatePidValue: (pid: string, value: number, raw: string) =>
    set(current => ({
      data: {
        ...current.data,
        [pid]: {
          value,
          timestamp: Date.now(),
          raw,
        },
      },
    })),

  startPolling: () => set({ pollingActive: true }),

  stopPolling: () => set({ pollingActive: false }),

  setPollingInterval: (intervalMs: number) => {
    // 入力値を有効範囲にクランプする
    const clamped = Math.max(
      MIN_POLLING_INTERVAL_MS,
      Math.min(MAX_POLLING_INTERVAL_MS, Math.round(intervalMs)),
    );
    set({ pollingInterval: clamped });
  },

  clearData: () => set({ data: {} }),
}));
