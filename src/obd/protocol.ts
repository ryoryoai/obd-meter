import { PidDefinition } from '../types/obd';
import { STANDARD_PIDS, SUPPORTED_PID_QUERIES, decodeSupportedPids } from './pid/standard';
import { TOYOTA_PIDS } from './pid/toyota';

/**
 * Interface for ELM327 adapter communication.
 * The OBDProtocol class depends on this interface rather than a concrete class,
 * allowing different transport implementations (BLE, USB, WiFi, mock).
 */
export interface Elm327Interface {
  /**
   * Send an AT or OBD command to the ELM327 adapter and return the raw response.
   * The implementation should handle framing, line endings (\\r), and
   * stripping the ELM327 prompt character (>).
   */
  sendCommand(command: string): Promise<string>;

  /** Whether the adapter is currently connected. */
  isConnected(): boolean;
}

/** Result of a single PID read operation. */
export interface PidReadResult {
  value: number;
  raw: string;
}

/** Callback invoked for each PID value during polling. */
export type PollingCallback = (
  pid: string,
  result: PidReadResult | null,
  error?: Error,
) => void;

/**
 * OBD-II protocol controller.
 *
 * Manages communication with vehicle ECUs through an ELM327 adapter.
 * Supports both standard OBD-II (Mode 01) and Toyota-specific (Mode 21/22) PIDs.
 *
 * ELM327 adapters are half-duplex: only one command can be in-flight at a time.
 * All PID reads are therefore sequential, and polling iterates through the
 * requested PID list round-robin.
 */
export class OBDProtocol {
  private elm327: Elm327Interface;
  private pollingTimer: ReturnType<typeof setTimeout> | null = null;
  private isPolling = false;
  private allPidDefinitions: Record<string, PidDefinition>;

  constructor(elm327: Elm327Interface) {
    this.elm327 = elm327;
    // Merge standard and Toyota PID definitions into a single lookup
    this.allPidDefinitions = { ...STANDARD_PIDS, ...TOYOTA_PIDS };
  }

  /**
   * Query the vehicle ECU for supported standard OBD-II PIDs.
   *
   * Sends the three standard "supported PIDs" queries (0100, 0120, 0140)
   * and decodes the bitmask responses to determine which PIDs the vehicle supports.
   *
   * @returns Array of supported PID strings (e.g. ['0104', '0105', '010C', ...])
   */
  async querySupportedPids(): Promise<string[]> {
    if (!this.elm327.isConnected()) {
      throw new Error('ELM327 adapter is not connected');
    }

    const supported: string[] = [];

    for (const query of SUPPORTED_PID_QUERIES) {
      try {
        const mode = query.substring(0, 2);
        const pid = query.substring(2, 4);
        const rawResponse = await this.elm327.sendCommand(`${mode} ${pid}`);

        const bytes = this.parseResponseBytes(rawResponse, query);
        if (bytes.length >= 4) {
          const pids = decodeSupportedPids(query, bytes);
          supported.push(...pids);

          // If the last bit (PID+0x20) is not set, there are no more ranges to query
          const lastPidInRange = parseInt(pid, 16) + 0x20;
          const lastPidHex = lastPidInRange
            .toString(16)
            .toUpperCase()
            .padStart(2, '0');
          const nextQuery = `${mode}${lastPidHex}`;
          if (!pids.includes(nextQuery)) {
            break; // ECU does not support the next range query
          }
        }
      } catch {
        // If a range query fails, stop querying further ranges
        break;
      }
    }

    return supported;
  }

  /**
   * Read a single PID value from the vehicle.
   *
   * @param pid - The PID to read in "MMPP" format (e.g. '010C' for Engine RPM)
   * @returns The decoded value and raw response string
   * @throws Error if the PID is unknown, the adapter is disconnected, or communication fails
   */
  async readPid(pid: string): Promise<PidReadResult> {
    if (!this.elm327.isConnected()) {
      throw new Error('ELM327 adapter is not connected');
    }

    const definition = this.allPidDefinitions[pid];
    if (!definition) {
      throw new Error(`Unknown PID: ${pid}`);
    }

    const mode = pid.substring(0, 2);
    const pidCode = pid.substring(2, 4);
    const rawResponse = await this.elm327.sendCommand(`${mode} ${pidCode}`);

    const bytes = this.parseResponseBytes(rawResponse, pid);
    if (bytes.length === 0) {
      throw new Error(`No data received for PID ${pid}`);
    }

    const value = definition.decode(bytes);

    return {
      value,
      raw: rawResponse,
    };
  }

  /**
   * Start polling multiple PIDs at a regular interval.
   *
   * PIDs are queried sequentially in round-robin order because the ELM327
   * adapter cannot handle concurrent commands. Each cycle iterates through
   * all requested PIDs, then waits for the specified interval before
   * starting the next cycle.
   *
   * If a PID read fails, the error is reported via the callback and
   * polling continues with the next PID. This prevents a single
   * intermittent failure from stopping all data collection.
   *
   * @param pids - Array of PID strings to poll
   * @param intervalMs - Delay between polling cycles in milliseconds
   * @param callback - Invoked for each PID result (or error)
   */
  startPolling(
    pids: string[],
    intervalMs: number,
    callback: PollingCallback,
  ): void {
    if (this.isPolling) {
      this.stopPolling();
    }

    if (pids.length === 0) {
      return;
    }

    this.isPolling = true;

    const pollCycle = async () => {
      if (!this.isPolling) {
        return;
      }

      for (const pid of pids) {
        if (!this.isPolling) {
          return;
        }

        try {
          const result = await this.readPid(pid);
          callback(pid, result);
        } catch (error) {
          callback(pid, null, error instanceof Error ? error : new Error(String(error)));
        }
      }

      // Schedule next cycle only if still polling
      if (this.isPolling) {
        this.pollingTimer = setTimeout(pollCycle, intervalMs);
      }
    };

    // Start the first cycle immediately
    pollCycle();
  }

  /**
   * Stop the polling loop.
   * Any in-flight PID read will complete, but no further reads will be initiated.
   */
  stopPolling(): void {
    this.isPolling = false;
    if (this.pollingTimer !== null) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  /**
   * Parse the raw ELM327 response string into data bytes.
   *
   * ELM327 responses follow this format:
   *   "41 0C 1A F8"  (for Mode 01 PID 0C)
   *   "62 01 38 7D"  (for Mode 22 PID 0138)
   *
   * The first byte is the response mode (request mode + 0x40).
   * The following byte(s) echo the requested PID.
   * The remaining bytes are the data payload.
   *
   * This method strips the header bytes and returns only the data bytes.
   *
   * @param rawResponse - Raw string response from ELM327
   * @param pid - The requested PID (used to determine how many header bytes to skip)
   * @returns Array of data bytes
   */
  private parseResponseBytes(rawResponse: string, pid: string): number[] {
    // Clean up the response: remove whitespace artifacts, prompt chars, line breaks
    const cleaned = rawResponse
      .replace(/>/g, '')
      .replace(/\r/g, ' ')
      .replace(/\n/g, ' ')
      .trim();

    if (
      cleaned.includes('NO DATA') ||
      cleaned.includes('ERROR') ||
      cleaned.includes('UNABLE TO CONNECT') ||
      cleaned.includes('?')
    ) {
      return [];
    }

    // Split into hex byte tokens and parse
    const tokens = cleaned.split(/\s+/).filter((t) => /^[0-9A-Fa-f]{2}$/.test(t));
    const allBytes = tokens.map((t) => parseInt(t, 16));

    if (allBytes.length === 0) {
      return [];
    }

    // Determine header length based on the mode
    const mode = parseInt(pid.substring(0, 2), 16);
    const responseMode = mode + 0x40;

    // Find the start of our response (in case of multi-line or extra data)
    const responseStart = allBytes.indexOf(responseMode);
    if (responseStart === -1) {
      return [];
    }

    // Skip: response mode byte (1) + PID echo byte(s)
    // Mode 01: 1 header byte (response mode) + 1 PID byte = 2 bytes to skip
    // Mode 21/22: 1 header byte (response mode) + 1 PID byte = 2 bytes to skip
    // (For 2-byte PIDs in Mode 22, it would be 3 bytes to skip, but our simplified
    // PID format uses single-byte PID codes)
    const headerLength = 2;
    const dataStart = responseStart + headerLength;

    if (dataStart >= allBytes.length) {
      return [];
    }

    return allBytes.slice(dataStart);
  }
}
