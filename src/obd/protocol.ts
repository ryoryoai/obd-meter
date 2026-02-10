import { PidDefinition } from '../types/obd';
import { STANDARD_PIDS, SUPPORTED_PID_QUERIES, decodeSupportedPids } from './pid/standard';
import { TOYOTA_PIDS } from './pid/toyota';

/** Default functional CAN header for Mode 01 queries (broadcast). */
const DEFAULT_TX_HEADER = '7DF';

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
  private currentTxHeader: string | null = null;

  constructor(elm327: Elm327Interface) {
    this.elm327 = elm327;
    // Merge standard and Toyota PID definitions into a single lookup
    this.allPidDefinitions = { ...STANDARD_PIDS, ...TOYOTA_PIDS };
  }

  private formatObdCommand(request: string): string {
    const compact = request.replace(/\s+/g, '').toUpperCase();
    const parts = compact.match(/.{1,2}/g);
    return parts ? parts.join(' ') : compact;
  }

  private async ensureTxHeader(header: string | undefined): Promise<void> {
    const desired = (header ?? DEFAULT_TX_HEADER).trim().toUpperCase();
    if (!desired) return;

    if (this.currentTxHeader === desired) {
      return;
    }

    // ELM327 sets the transmit CAN identifier with ATSH (11-bit header like 7E2/7C4).
    await this.elm327.sendCommand(`ATSH ${desired}`);
    this.currentTxHeader = desired;
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

    // Supported PID bitmasks are Mode 01 and should be queried using functional header.
    await this.ensureTxHeader(DEFAULT_TX_HEADER);

    const supported: string[] = [];

    for (const query of SUPPORTED_PID_QUERIES) {
      try {
        const rawResponse = await this.elm327.sendCommand(this.formatObdCommand(query));

        const bytes = this.parseResponseBytes(rawResponse, query);
        if (bytes.length >= 4) {
          const pids = decodeSupportedPids(query, bytes);
          supported.push(...pids);

          const mode = query.substring(0, 2);
          const pid = query.substring(2, 4);

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

    const request = (definition.request ?? pid).replace(/\s+/g, '').toUpperCase();
    await this.ensureTxHeader(definition.header);

    const rawResponse = await this.elm327.sendCommand(this.formatObdCommand(request));

    const bytes = this.parseResponseBytes(rawResponse, request);
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

    // Group signal ids by the underlying OBD request (plus ECU header) so we only
    // send each request once per cycle, even if multiple metrics are derived from it.
    const groups: Array<{ request: string; header: string | undefined; ids: string[] }> = [];
    const groupIndex = new Map<string, number>();
    for (const id of pids) {
      const def = this.allPidDefinitions[id];
      const request = (def?.request ?? id).replace(/\s+/g, '').toUpperCase();
      const header = def?.header;
      const key = `${(header ?? DEFAULT_TX_HEADER).trim().toUpperCase()}|${request}`;

      const idx = groupIndex.get(key);
      if (idx === undefined) {
        groupIndex.set(key, groups.length);
        groups.push({ request, header, ids: [id] });
      } else {
        groups[idx].ids.push(id);
      }
    }

    const pollCycle = async () => {
      if (!this.isPolling) {
        return;
      }

      for (const group of groups) {
        if (!this.isPolling) {
          return;
        }

        try {
          await this.ensureTxHeader(group.header);
          const raw = await this.elm327.sendCommand(this.formatObdCommand(group.request));
          const bytes = this.parseResponseBytes(raw, group.request);
          if (bytes.length === 0) {
            throw new Error(`No data received for request ${group.request}`);
          }

          for (const id of group.ids) {
            const def = this.allPidDefinitions[id];
            if (!def) {
              callback(id, null, new Error(`Unknown PID: ${id}`));
              continue;
            }
            try {
              const value = def.decode(bytes);
              callback(id, { value, raw });
            } catch (err) {
              callback(id, null, err instanceof Error ? err : new Error(String(err)));
            }
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          for (const id of group.ids) {
            callback(id, null, err);
          }
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
   * Read Diagnostic Trouble Codes (DTCs) from the vehicle.
   * Sends OBD-II Mode 03 (Show stored DTCs).
   *
   * Response format: 43 [count] [DTC byte pairs...]
   * Each DTC is 2 bytes. Decode using formatDTCCode pattern:
   *   Bits 15-14: Type (00=P, 01=C, 10=B, 11=U)
   *   Bits 13-12: Second digit
   *   Remaining bits: hex digits
   *
   * @returns Array of DTC code strings (e.g. ["P0301", "C1234"])
   */
  async readDTCs(): Promise<{ code: string; isPending: boolean }[]> {
    if (!this.elm327.isConnected()) {
      throw new Error('ELM327 adapter is not connected');
    }

    const results: { code: string; isPending: boolean }[] = [];

    // DTC reads are Mode 03/07 and should use functional header.
    await this.ensureTxHeader(DEFAULT_TX_HEADER);

    // Mode 03: Stored DTCs
    try {
      const rawResponse = await this.elm327.sendCommand('03');
      const dtcs = this.parseDTCResponse(rawResponse, false);
      results.push(...dtcs);
    } catch {
      // No stored DTCs or communication error
    }

    // Mode 07: Pending DTCs
    try {
      const rawResponse = await this.elm327.sendCommand('07');
      const dtcs = this.parseDTCResponse(rawResponse, true);
      results.push(...dtcs);
    } catch {
      // No pending DTCs or communication error
    }

    return results;
  }

  /**
   * Clear all DTCs and reset MIL (Check Engine Light).
   * Sends OBD-II Mode 04.
   *
   * WARNING: This clears stored freeze frame data and resets monitors.
   *
   * @returns true if clear was successful
   */
  async clearDTCs(): Promise<boolean> {
    if (!this.elm327.isConnected()) {
      throw new Error('ELM327 adapter is not connected');
    }

    try {
      await this.ensureTxHeader(DEFAULT_TX_HEADER);
      const rawResponse = await this.elm327.sendCommand('04');
      // Positive response is 44
      return rawResponse.includes('44');
    } catch {
      return false;
    }
  }

  /**
   * Parse DTC response bytes into code strings.
   */
  private parseDTCResponse(
    rawResponse: string,
    isPending: boolean,
  ): { code: string; isPending: boolean }[] {
    const cleaned = rawResponse
      .replace(/>/g, '')
      .replace(/\r/g, ' ')
      .replace(/\n/g, ' ')
      .trim();

    if (
      cleaned.includes('NO DATA') ||
      cleaned.includes('ERROR') ||
      cleaned.trim() === ''
    ) {
      return [];
    }

    const tokens = cleaned.split(/\s+/).filter((t) => /^[0-9A-Fa-f]{2}$/.test(t));
    const allBytes = tokens.map((t) => parseInt(t, 16));

    // Find response header (43 for Mode 03, 47 for Mode 07)
    const responseHeader = isPending ? 0x47 : 0x43;
    const headerIndex = allBytes.indexOf(responseHeader);
    if (headerIndex === -1) return [];

    // Skip header byte and count byte
    const dataStart = headerIndex + 1;
    const results: { code: string; isPending: boolean }[] = [];

    // Each DTC is 2 bytes
    for (let i = dataStart; i + 1 < allBytes.length; i += 2) {
      const byte1 = allBytes[i];
      const byte2 = allBytes[i + 1];

      // Skip padding (0x00 0x00)
      if (byte1 === 0 && byte2 === 0) continue;

      const typeMap = ['P', 'C', 'B', 'U'];
      const typeIndex = (byte1 >> 6) & 0x03;
      const digit2 = (byte1 >> 4) & 0x03;
      const digit3 = byte1 & 0x0F;
      const digit4 = (byte2 >> 4) & 0x0F;
      const digit5 = byte2 & 0x0F;
      const code = `${typeMap[typeIndex]}${digit2}${digit3.toString(16).toUpperCase()}${digit4.toString(16).toUpperCase()}${digit5.toString(16).toUpperCase()}`;

      results.push({ code, isPending });
    }

    return results;
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
    // Clean up the response: remove prompt chars and normalize case.
    const cleaned = rawResponse.replace(/>/g, '').trim().toUpperCase();

    if (
      cleaned.includes('NO DATA') ||
      cleaned.includes('ERROR') ||
      cleaned.includes('UNABLE TO CONNECT') ||
      cleaned.includes('?')
    ) {
      return [];
    }

    const request = pid.replace(/\s+/g, '').toUpperCase();
    if (request.length < 2 || request.length % 2 !== 0) {
      return [];
    }

    const mode = parseInt(request.substring(0, 2), 16);
    const responseMode = mode + 0x40;

    // Requested PID bytes can be 0, 1 or more bytes depending on the service.
    const pidHex = request.substring(2);
    const pidBytes: number[] = [];
    for (let i = 0; i + 1 < pidHex.length; i += 2) {
      const pair = pidHex.substring(i, i + 2);
      if (!/^[0-9A-F]{2}$/.test(pair)) {
        return [];
      }
      pidBytes.push(parseInt(pair, 16));
    }

    // Extract all byte pairs from the response (works for both spaces-on and spaces-off),
    // then locate the expected header sequence in the byte stream.
    const pairs = cleaned.match(/[0-9A-F]{2}/g);
    if (!pairs || pairs.length === 0) {
      return [];
    }
    const allBytes = pairs.map((p) => parseInt(p, 16));

    const headerSeq = [responseMode, ...pidBytes];

    // Find the first occurrence of [responseMode, ...pidBytes]
    for (let i = 0; i + headerSeq.length <= allBytes.length; i++) {
      let ok = true;
      for (let j = 0; j < headerSeq.length; j++) {
        if (allBytes[i + j] !== headerSeq[j]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      const dataStart = i + headerSeq.length;
      if (dataStart >= allBytes.length) {
        return [];
      }
      return allBytes.slice(dataStart);
    }

    return [];
  }
}
