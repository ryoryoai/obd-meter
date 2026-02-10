import { Platform } from 'react-native';
import RNBluetoothClassic from 'react-native-bluetooth-classic';
import type {
  BluetoothDevice,
  BluetoothDeviceReadEvent,
  BluetoothEventSubscription,
} from 'react-native-bluetooth-classic';

import type { BLEDevice, ConnectionState } from '../types/obd';
import type { Elm327Interface } from '../obd/protocol';

const RESPONSE_TIMEOUT_MS = 5000;

/**
 * Classic Bluetooth (SPP/RFCOMM) connection manager for ELM327 adapters.
 *
 * Notes:
 * - Most cheap ELM327 adapters are "Bluetooth Classic" and require pairing PIN like 1234/0000.
 * - We configure the native connection as "delimited" with delimiter ">" so each ELM327 response
 *   is delivered as a single message (prompt is dropped by native side).
 */
export class ClassicBluetoothConnectionManager implements Elm327Interface {
  private connectedDevice: BluetoothDevice | null = null;
  private connectionState: ConnectionState = 'disconnected';

  private disconnectCallback: (() => void) | null = null;
  private disconnectSubscription: BluetoothEventSubscription | null = null;
  private readSubscription: BluetoothEventSubscription | null = null;

  private responseResolve: ((value: string) => void) | null = null;
  private responseReject: ((reason: Error) => void) | null = null;
  private responseTimer: ReturnType<typeof setTimeout> | null = null;

  /** Get paired (bonded) devices from OS Bluetooth settings. */
  async listBondedDevices(): Promise<BLEDevice[]> {
    const devices = await RNBluetoothClassic.getBondedDevices();
    return devices.map((d) => ({
      id: d.address,
      name: d.name ?? null,
      // RSSI isn't always available for bonded devices. Normalize to null if missing/invalid.
      rssi: typeof d.rssi === 'number' && Number.isFinite(d.rssi) ? d.rssi : null,
    }));
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  isConnected(): boolean {
    return this.connectedDevice !== null && this.connectionState === 'connected';
  }

  getConnectedDevice(): BluetoothDevice | null {
    return this.connectedDevice;
  }

  async connect(address: string): Promise<void> {
    this.connectionState = 'connecting';

    const isAvailable = await RNBluetoothClassic.isBluetoothAvailable().catch(() => false);
    if (!isAvailable) {
      this.connectionState = 'error';
      throw new Error('Bluetooth is not available on this device');
    }

    let enabled = await RNBluetoothClassic.isBluetoothEnabled().catch(() => false);
    if (!enabled && Platform.OS === 'android') {
      enabled = await RNBluetoothClassic.requestBluetoothEnabled().catch(() => false);
    }
    if (!enabled) {
      this.connectionState = 'error';
      throw new Error('Bluetooth is disabled');
    }

    // Clean up any prior state.
    await this.disconnect().catch(() => undefined);

    const device = await RNBluetoothClassic.connectToDevice(address, {
      connectionType: 'delimited',
      delimiter: '>',
      charset: 'ascii',
      // Some ELM327 adapters are flaky with secure sockets even after pairing.
      secureSocket: false,
    });

    this.connectedDevice = device;

    // Read events (each event is one response due to delimiter=">").
    this.readSubscription = device.onDataReceived((event: BluetoothDeviceReadEvent) => {
      this.handleIncomingMessage(event.data);
    });

    // Unexpected disconnect events.
    this.disconnectSubscription = RNBluetoothClassic.onDeviceDisconnected((event) => {
      if (event.device?.address === address) {
        this.handleUnexpectedDisconnect();
      }
    });

    // Flush any queued bytes/prompt after connect.
    await device.clear().catch(() => undefined);

    this.connectionState = 'connected';
  }

  async disconnect(): Promise<void> {
    this.cleanupSubscriptions();
    this.clearPendingResponse('Disconnected');

    const device = this.connectedDevice;
    this.connectedDevice = null;

    if (device) {
      try {
        await device.disconnect();
      } catch {
        // ignore (already disconnected)
      }
    }

    this.connectionState = 'disconnected';
  }

  onDisconnect(callback: () => void): void {
    this.disconnectCallback = callback;
  }

  /**
   * Send an AT/OBD command and await a full ELM327 response.
   * The response is delimited by the ELM327 prompt ('>'), which is handled by native delimiter config.
   */
  async sendCommand(command: string): Promise<string> {
    if (!this.connectedDevice) {
      throw new Error('No device connected');
    }
    if (this.connectionState !== 'connected') {
      throw new Error(`Cannot send command in state: ${this.connectionState}`);
    }

    // Prevent overlapping in-flight commands.
    if (this.responseResolve) {
      throw new Error('Another command is already in-flight');
    }

    // Flush any stale buffered content.
    await this.connectedDevice.clear().catch(() => undefined);

    const commandWithCR = `${command}\r`;
    await this.connectedDevice.write(commandWithCR, 'ascii');

    return new Promise<string>((resolve, reject) => {
      this.responseResolve = resolve;
      this.responseReject = reject;

      this.responseTimer = setTimeout(() => {
        this.clearPendingResponse('Response timeout');
        reject(new Error(`Command timeout: ${command}`));
      }, RESPONSE_TIMEOUT_MS);
    });
  }

  destroy(): void {
    this.cleanupSubscriptions();
    this.clearPendingResponse('Manager destroyed');
    this.connectedDevice = null;
    this.connectionState = 'disconnected';
    this.disconnectCallback = null;
  }

  private handleIncomingMessage(message: string): void {
    // Defensive cleanup: the native delimiter drops '>' but some configs might include it.
    const cleaned = message.replace(/>/g, '').replace(/\u0000/g, '').trim();

    if (this.responseResolve) {
      if (this.responseTimer) {
        clearTimeout(this.responseTimer);
        this.responseTimer = null;
      }

      const resolve = this.responseResolve;
      this.responseResolve = null;
      this.responseReject = null;

      resolve(cleaned);
    }
  }

  private handleUnexpectedDisconnect(): void {
    this.cleanupSubscriptions();
    this.clearPendingResponse('Device disconnected unexpectedly');
    this.connectedDevice = null;
    this.connectionState = 'disconnected';

    this.disconnectCallback?.();
  }

  private cleanupSubscriptions(): void {
    if (this.readSubscription) {
      this.readSubscription.remove();
      this.readSubscription = null;
    }
    if (this.disconnectSubscription) {
      this.disconnectSubscription.remove();
      this.disconnectSubscription = null;
    }
  }

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
}
