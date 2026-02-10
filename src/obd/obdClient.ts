import type { BLEDevice } from '../types/obd';

import { useConnectionStore } from '../store/connectionStore';
import { useOBDStore } from '../store/obdStore';
import { useSettingsStore } from '../store/settingsStore';
import { mockDataProvider } from '../utils/mockDataProvider';
import { ClassicBluetoothConnectionManager } from '../bluetooth/ClassicBluetoothManager';
import { Elm327 } from '../bluetooth/Elm327';
import { OBDProtocol } from './protocol';

const DEFAULT_PIDS: ReadonlyArray<string> = [
  // Dashboard required
  '010C', // RPM
  '010D', // Speed
  '0105', // Coolant
  '0111', // Throttle
  '0146', // Ambient

  // Useful extras (polled only if supported)
  '0110', // MAF
  '015E', // Fuel rate
];

/**
 * App-level OBD client (singleton).
 *
 * For now we support the common case:
 * - Bluetooth Classic (SPP) ELM327 adapters (PIN 1234/0000).
 *
 * BLE adapters exist but typically don't ask for a PIN; that can be added later.
 */
class ObdClient {
  private transport: ClassicBluetoothConnectionManager | null = null;
  private protocol: OBDProtocol | null = null;
  private sessionId = 0;

  async listPairedDevices(): Promise<BLEDevice[]> {
    this.ensureTransport();
    return this.transport!.listBondedDevices();
  }

  async connect(device: BLEDevice): Promise<void> {
    const session = ++this.sessionId;

    // Stop demo / existing connections first (without bumping session).
    await this.disconnectInternal();

    const connStore = useConnectionStore.getState();
    connStore.setDemoMode(false);
    connStore.setElm327Ready(false);
    connStore.setError(null);
    connStore.setConnectionState('connecting');

    this.ensureTransport();
    const transport = this.transport!;

    try {
      await transport.connect(device.id);
      transport.onDisconnect(() => {
        void this.disconnect();
      });

      // Update store device info using the connected device (name may be available).
      const connected = transport.getConnectedDevice();
      connStore.setDevice({
        id: device.id,
        name: connected?.name ?? device.name ?? null,
        rssi: null,
      });
      connStore.setConnectionState('connected');

      // Initialize ELM327 (echo off, spaces off, protocol auto, etc).
      const elm = new Elm327(transport);
      const ok = await elm.initialize();
      if (!ok) {
        throw new Error('ELM327 initialization failed');
      }

      // If a newer connect/disconnect started while we were initializing, stop now.
      if (session !== this.sessionId) {
        await transport.disconnect().catch(() => undefined);
        return;
      }

      connStore.setElm327Ready(true);

      // Start polling using OBDProtocol.
      this.protocol = new OBDProtocol(transport);
      const settings = useSettingsStore.getState();
      const intervalMs = settings.pollingInterval;

      // Keep store in sync (used by some UI).
      useOBDStore.getState().setPollingInterval(intervalMs);
      useOBDStore.getState().startPolling();

      // Try to reduce noise by polling only supported standard PIDs.
      let pidsToPoll = [...DEFAULT_PIDS];
      try {
        const supported = await this.protocol.querySupportedPids();
        const supportedSet = new Set(supported);
        pidsToPoll = pidsToPoll.filter((pid) => supportedSet.has(pid));
      } catch {
        // If support query fails, fall back to the default list (errors are handled per PID).
      }

      if (session !== this.sessionId) {
        this.protocol.stopPolling();
        this.protocol = null;
        useOBDStore.getState().stopPolling();
        await transport.disconnect().catch(() => undefined);
        return;
      }

      // In case nothing was detected, keep at least the required ones.
      if (pidsToPoll.length === 0) {
        pidsToPoll = ['010C', '010D', '0105', '0111'];
      }

      this.protocol.startPolling(pidsToPoll, intervalMs, (pid, result) => {
        if (!result) return;
        useOBDStore.getState().updatePidValue(pid, result.value, result.raw);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      connStore.setError(message);
      connStore.setElm327Ready(false);
      connStore.setDevice(null);
      // best-effort cleanup without clearing the error banner
      try {
        this.protocol?.stopPolling();
      } catch {
        // ignore
      }
      this.protocol = null;
      useOBDStore.getState().stopPolling();
      await transport.disconnect().catch(() => undefined);
    }
  }

  startDemoMode(): void {
    const session = ++this.sessionId;

    // Stop any real connection/polling first (without bumping again).
    void this.disconnectInternal().then(() => {
      if (session !== this.sessionId) {
        return;
      }

      const connStore = useConnectionStore.getState();
      connStore.setDemoMode(true);
      connStore.setDevice({ id: 'DEMO', name: 'Demo Mode', rssi: null });
      connStore.setElm327Ready(true);
      connStore.setConnectionState('connected');

      mockDataProvider.start(200);
    });
  }

  async disconnect(): Promise<void> {
    // Bump session to cancel any in-flight connect/init.
    ++this.sessionId;
    await this.disconnectInternal();
  }

  private ensureTransport(): void {
    if (!this.transport) {
      this.transport = new ClassicBluetoothConnectionManager();
    }
  }

  private async disconnectInternal(): Promise<void> {
    // Stop demo mode if running.
    if (useConnectionStore.getState().demoMode) {
      mockDataProvider.stop();
    }

    // Stop protocol polling.
    if (this.protocol) {
      this.protocol.stopPolling();
      this.protocol = null;
    }
    useOBDStore.getState().stopPolling();

    // Disconnect transport.
    if (this.transport) {
      await this.transport.disconnect().catch(() => undefined);
    }

    // Reset connection store.
    const connStore = useConnectionStore.getState();
    connStore.setDemoMode(false);
    connStore.setElm327Ready(false);
    connStore.setDevice(null);
    connStore.setConnectionState('disconnected');
  }
}

export const obdClient = new ObdClient();
