import { create } from 'zustand';
import type { BLEDevice, ConnectionState } from '../types/obd';

interface ConnectionStoreState {
  /** BLE接続状態 */
  state: ConnectionState;
  /** 接続中のBLEデバイス情報 */
  device: BLEDevice | null;
  /** ELM327初期化完了フラグ */
  isElm327Ready: boolean;
  /** エラーメッセージ */
  error: string | null;
  /** デモモード有効フラグ */
  demoMode: boolean;
}

interface ConnectionStoreActions {
  setConnectionState: (state: ConnectionState) => void;
  setDevice: (device: BLEDevice | null) => void;
  setElm327Ready: (ready: boolean) => void;
  setError: (error: string | null) => void;
  setDemoMode: (enabled: boolean) => void;
  reset: () => void;
}

type ConnectionStore = ConnectionStoreState & ConnectionStoreActions;

const initialState: ConnectionStoreState = {
  state: 'disconnected',
  device: null,
  isElm327Ready: false,
  error: null,
  demoMode: false,
};

/**
 * BLE接続状態を管理するZustandストア
 *
 * BLEスキャン/接続/切断の状態遷移、接続デバイス情報、
 * ELM327初期化状態、エラー情報を一元管理する。
 */
export const useConnectionStore = create<ConnectionStore>(set => ({
  ...initialState,

  setConnectionState: (connectionState: ConnectionState) =>
    set(current => ({
      state: connectionState,
      // エラー状態以外に遷移する場合、エラーをクリア
      error: connectionState === 'error' ? current.error : null,
    })),

  setDevice: (device: BLEDevice | null) =>
    set({
      device,
      // デバイスがnullになった場合(切断時)はELM327もリセット
      ...(device === null ? { isElm327Ready: false } : {}),
    }),

  setElm327Ready: (ready: boolean) =>
    set({ isElm327Ready: ready }),

  setError: (error: string | null) =>
    set({
      error,
      // エラーが設定された場合、接続状態もerrorにする
      ...(error !== null ? { state: 'error' as ConnectionState } : {}),
    }),

  setDemoMode: (enabled: boolean) =>
    set({ demoMode: enabled }),

  reset: () => set(initialState),
}));
