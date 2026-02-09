import { BleManager as RNBleManager, Device, Subscription } from 'react-native-ble-plx';
import type { BLEDevice, ConnectionState } from '../types/obd';

// React Native環境で利用可能なグローバルBase64関数の型宣言
declare function btoa(input: string): string;
declare function atob(input: string): string;

// ELM327 BLE UUIDs
const ELM327_SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb';
const ELM327_WRITE_CHARACTERISTIC = '0000fff2-0000-1000-8000-00805f9b34fb';
const ELM327_NOTIFY_CHARACTERISTIC = '0000fff1-0000-1000-8000-00805f9b34fb';

// 設定定数
const SCAN_TIMEOUT_MS = 10000;
const RESPONSE_TIMEOUT_MS = 5000;
const MAX_RETRY_COUNT = 3;
const RETRY_DELAY_MS = 2000;

/**
 * ELM327 BLE接続マネージャー
 *
 * react-native-ble-plx を使用してELM327 OBDアダプタとの
 * BLE通信を管理する。スキャン、接続、コマンド送受信、
 * 自動再接続を担当する。
 */
export class BleConnectionManager {
  private manager: RNBleManager;
  private connectedDevice: Device | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private disconnectCallback: (() => void) | null = null;
  private disconnectSubscription: Subscription | null = null;
  private notifySubscription: Subscription | null = null;
  private responseBuffer = '';
  private responseResolve: ((value: string) => void) | null = null;
  private responseReject: ((reason: Error) => void) | null = null;
  private responseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.manager = new RNBleManager();
  }

  /**
   * 現在のBLE接続状態を返す
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * ELM327デバイスをスキャンして検出されたデバイス一覧を返す。
   * サービスUUIDでフィルタし、SCAN_TIMEOUT_MS後にスキャンを停止する。
   */
  async scanForDevices(): Promise<BLEDevice[]> {
    this.connectionState = 'scanning';
    const discovered: BLEDevice[] = [];
    const seenIds = new Set<string>();

    return new Promise<BLEDevice[]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.manager.stopDeviceScan();
        this.connectionState = discovered.length > 0 ? 'disconnected' : 'disconnected';
        resolve(discovered);
      }, SCAN_TIMEOUT_MS);

      this.manager.startDeviceScan(
        [ELM327_SERVICE_UUID],
        { allowDuplicates: false },
        (error, device) => {
          if (error) {
            clearTimeout(timeout);
            this.manager.stopDeviceScan();
            this.connectionState = 'error';
            reject(new Error(`Scan failed: ${error.message}`));
            return;
          }

          if (device && !seenIds.has(device.id)) {
            seenIds.add(device.id);
            discovered.push({
              id: device.id,
              name: device.name ?? device.localName ?? null,
              rssi: device.rssi ?? null,
            });
          }
        },
      );
    });
  }

  /**
   * 指定デバイスIDのELM327に接続する。
   * 接続失敗時は最大MAX_RETRY_COUNT回リトライする。
   */
  async connect(deviceId: string): Promise<void> {
    this.connectionState = 'connecting';

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRY_COUNT; attempt++) {
      try {
        const device = await this.manager.connectToDevice(deviceId, {
          requestMTU: 512,
        });

        await device.discoverAllServicesAndCharacteristics();

        // Notify characteristicを購読してレスポンスを受信する
        this.notifySubscription = device.monitorCharacteristicForService(
          ELM327_SERVICE_UUID,
          ELM327_NOTIFY_CHARACTERISTIC,
          (error, characteristic) => {
            if (error) {
              // notify エラーは接続切れの可能性
              this.handleUnexpectedDisconnect();
              return;
            }
            if (characteristic?.value) {
              this.handleIncomingData(characteristic.value);
            }
          },
        );

        // 切断検知の購読
        this.disconnectSubscription = this.manager.onDeviceDisconnected(
          deviceId,
          () => {
            this.handleUnexpectedDisconnect();
          },
        );

        this.connectedDevice = device;
        this.connectionState = 'connected';
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // 最後の試行でなければリトライ前に待機
        if (attempt < MAX_RETRY_COUNT - 1) {
          await this.delay(RETRY_DELAY_MS);
        }
      }
    }

    this.connectionState = 'error';
    throw new Error(
      `Failed to connect after ${MAX_RETRY_COUNT} attempts: ${lastError?.message ?? 'Unknown error'}`,
    );
  }

  /**
   * 現在接続中のデバイスを切断する
   */
  async disconnect(): Promise<void> {
    this.cleanupSubscriptions();
    this.clearPendingResponse('Disconnected by user');

    if (this.connectedDevice) {
      try {
        await this.manager.cancelDeviceConnection(this.connectedDevice.id);
      } catch {
        // 既に切断されている場合のエラーは無視
      }
      this.connectedDevice = null;
    }

    this.connectionState = 'disconnected';
  }

  /**
   * ATコマンドまたはOBDコマンドを送信し、レスポンスを受信して返す。
   * レスポンスは ">" プロンプトで完了を検知する。
   *
   * @param command - 送信するコマンド文字列 (e.g. "ATZ", "010C")
   * @returns ELM327からのレスポンス文字列
   */
  async sendCommand(command: string): Promise<string> {
    if (!this.connectedDevice) {
      throw new Error('No device connected');
    }

    if (this.connectionState !== 'connected') {
      throw new Error(`Cannot send command in state: ${this.connectionState}`);
    }

    // 前回のレスポンスが残っている場合はクリア
    this.clearPendingResponse('New command sent');
    this.responseBuffer = '';

    // コマンド文字列をBase64エンコードしてBLEで送信
    const commandWithCR = command + '\r';
    const encoded = this.stringToBase64(commandWithCR);

    await this.connectedDevice.writeCharacteristicWithResponseForService(
      ELM327_SERVICE_UUID,
      ELM327_WRITE_CHARACTERISTIC,
      encoded,
    );

    // レスポンス待ちのPromiseを返す
    return new Promise<string>((resolve, reject) => {
      this.responseResolve = resolve;
      this.responseReject = reject;

      this.responseTimer = setTimeout(() => {
        this.clearPendingResponse('Response timeout');
        reject(new Error(`Command timeout: ${command}`));
      }, RESPONSE_TIMEOUT_MS);
    });
  }

  /**
   * 予期しない切断時のコールバックを登録する
   */
  onDisconnect(callback: () => void): void {
    this.disconnectCallback = callback;
  }

  /**
   * BleManagerインスタンスを破棄する。
   * アプリ終了時に呼ぶこと。
   */
  destroy(): void {
    this.cleanupSubscriptions();
    this.clearPendingResponse('Manager destroyed');
    this.connectedDevice = null;
    this.connectionState = 'disconnected';
    this.manager.destroy();
  }

  // --- Private methods ---

  /**
   * BLE notifyから受信したBase64データを処理する。
   * ">" を検知したらレスポンス完了としてPromiseをresolveする。
   */
  private handleIncomingData(base64Value: string): void {
    const decoded = this.base64ToString(base64Value);
    this.responseBuffer += decoded;

    // ELM327は ">" プロンプトでレスポンス完了を示す
    if (this.responseBuffer.includes('>')) {
      const response = this.responseBuffer
        .replace(/>/g, '')
        .replace(/\r/g, '')
        .trim();

      if (this.responseResolve) {
        if (this.responseTimer) {
          clearTimeout(this.responseTimer);
          this.responseTimer = null;
        }
        const resolve = this.responseResolve;
        this.responseResolve = null;
        this.responseReject = null;
        resolve(response);
      }

      this.responseBuffer = '';
    }
  }

  /**
   * 予期しない切断を処理する
   */
  private handleUnexpectedDisconnect(): void {
    this.cleanupSubscriptions();
    this.clearPendingResponse('Device disconnected unexpectedly');
    this.connectedDevice = null;
    this.connectionState = 'disconnected';

    if (this.disconnectCallback) {
      this.disconnectCallback();
    }
  }

  /**
   * BLE購読をクリーンアップする
   */
  private cleanupSubscriptions(): void {
    if (this.notifySubscription) {
      this.notifySubscription.remove();
      this.notifySubscription = null;
    }
    if (this.disconnectSubscription) {
      this.disconnectSubscription.remove();
      this.disconnectSubscription = null;
    }
  }

  /**
   * 保留中のレスポンスPromiseをrejectする
   */
  private clearPendingResponse(reason: string): void {
    if (this.responseTimer) {
      clearTimeout(this.responseTimer);
      this.responseTimer = null;
    }
    if (this.responseReject) {
      const reject = this.responseReject;
      this.responseResolve = null;
      this.responseReject = null;
      reject(new Error(reason));
    }
  }

  /**
   * 文字列をBase64にエンコードする (BLE書き込み用)
   */
  private stringToBase64(str: string): string {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      bytes[i] = str.charCodeAt(i);
    }
    // React Native環境ではglobal.btoaが利用可能
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Base64を文字列にデコードする (BLE受信データ用)
   */
  private base64ToString(base64: string): string {
    const binary = atob(base64);
    let result = '';
    for (let i = 0; i < binary.length; i++) {
      result += binary.charAt(i);
    }
    return result;
  }

  /**
   * 指定ミリ秒待機する
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
