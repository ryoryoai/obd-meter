import type { PidDefinition } from '../../types/obd';

import { compileTorqueEquation } from '../torqueEquation';
import { PRIUSCHAT_METRIC_PIDS } from './priuschatMetric';

/**
 * Toyota ZVW30 Prius (3rd gen) signals and PriusChat/Torque-derived custom PIDs.
 *
 * Data source for the large PID list:
 * - PriusChat community sheet (Vincent1449p) "Metric" tab (Torque format)
 *   See `src/obd/pid/priuschatMetric.ts` (generated).
 *
 * Notes:
 * - Many Toyota signals require targeting a specific ECU by setting the CAN TX header
 *   using ELM327 `ATSH` (e.g. 7E2 = Hybrid ECU, 7C4 = A/C ECU).
 * - ModeAndPID values in that sheet are 1-byte PIDs using services like 01 and 21.
 */

// --- App-facing alias signals used by the existing UI ------------------------

function decodeHvPackVoltageFrom2181(bytes: number[]): number {
  // PriusChat metric rows V01..V14 are 14 block voltages packed as 14x 16-bit values.
  // Each block voltage: (hi*256+lo) * 79.99 / 65535
  // Pack voltage ~ sum(block voltages)
  const needed = 28;
  if (bytes.length < needed) return 0;

  const scale = 79.99 / 65535;
  let sum = 0;
  for (let i = 0; i < needed; i += 2) {
    sum += (bytes[i] * 256 + bytes[i + 1]) * scale;
  }
  return sum;
}

function decodeHvBatteryTempAvgFrom2187(bytes: number[]): number {
  // PriusChat metric rows TB 1..TB 3 (2187):
  // (hi*256+lo) * 255.9 / 65535 - 50
  // TB1 uses bytes C,D (index 2,3), TB2 uses E,F (4,5), TB3 uses G,H (6,7)
  if (bytes.length < 8) return 0;

  const scale = 255.9 / 65535;
  const toTemp = (hi: number, lo: number) => (hi * 256 + lo) * scale - 50;
  const t1 = toTemp(bytes[2], bytes[3]);
  const t2 = toTemp(bytes[4], bytes[5]);
  const t3 = toTemp(bytes[6], bytes[7]);
  return (t1 + t2 + t3) / 3;
}

/**
 * These ids are used by the UI directly (DashboardScreen etc.).
 * They map to PriusChat/Torque requests + headers under the hood.
 */
export const ZVW30_ALIAS_PIDS: Record<string, PidDefinition> = {
  TOYOTA_HV_SOC: {
    pid: 'TOYOTA_HV_SOC',
    request: '015B', // State of Charge, requires Hybrid ECU header
    header: '7E2',
    name: 'HV Battery State of Charge',
    shortName: 'SOC',
    unit: '%',
    min: 0,
    max: 100,
    decode: compileTorqueEquation('A * 20 / 51'),
  },

  TOYOTA_HV_CURRENT: {
    pid: 'TOYOTA_HV_CURRENT',
    request: '2198', // Batt Pack Current Val
    header: '7E2',
    name: 'HV Battery Pack Current',
    shortName: 'HV Amp',
    unit: 'A',
    min: -200,
    max: 200,
    decode: compileTorqueEquation('(A * 256 + B) / 100 - 327.68'),
  },

  TOYOTA_HV_VOLTAGE: {
    pid: 'TOYOTA_HV_VOLTAGE',
    request: '2181', // Battery block voltages V01..V14 are contained in this response
    header: '7E2',
    name: 'HV Battery Pack Voltage',
    shortName: 'HV Volt',
    unit: 'V',
    min: 0,
    max: 300,
    decode: decodeHvPackVoltageFrom2181,
  },

  TOYOTA_HV_TEMP: {
    pid: 'TOYOTA_HV_TEMP',
    request: '2187', // TB Intake / TB1-3 are contained in this response
    header: '7E2',
    name: 'HV Battery Temperature (avg)',
    shortName: 'HV Temp',
    unit: 'C',
    min: -50,
    max: 80,
    decode: decodeHvBatteryTempAvgFrom2187,
  },

  TOYOTA_CABIN_TEMP: {
    pid: 'TOYOTA_CABIN_TEMP',
    request: '2121', // Room Temp Sensor (A/C ECU)
    header: '7C4',
    name: 'Cabin Temperature (Room Sensor)',
    shortName: 'Cabin',
    unit: 'C',
    min: -20,
    max: 60,
    decode: compileTorqueEquation('A * 63.75 / 255 - 6.5'),
  },

  TOYOTA_AC_STATUS: {
    pid: 'TOYOTA_AC_STATUS',
    request: '2175', // Aircon Gate Status (Hybrid ECU)
    header: '7E2',
    name: 'A/C Status',
    shortName: 'A/C',
    unit: '',
    min: 0,
    max: 1,
    decode: compileTorqueEquation('{A:5}'),
  },

  TOYOTA_AC_SET_TEMP: {
    pid: 'TOYOTA_AC_SET_TEMP',
    request: '2129', // Set Temperature (Driver side) (A/C ECU)
    header: '7C4',
    name: 'A/C Set Temperature (Driver)',
    shortName: 'SET',
    unit: 'C',
    min: 17.5,
    max: 32.5,
    decode: compileTorqueEquation('A / 2 + 17.5'),
  },
};

// Merge alias signals with the full PriusChat metric list.
export const TOYOTA_PIDS: Record<string, PidDefinition> = {
  ...ZVW30_ALIAS_PIDS,
  ...PRIUSCHAT_METRIC_PIDS,
};

export const ZVW30_ALIAS_PID_LIST = Object.keys(ZVW30_ALIAS_PIDS);

/**
 * Toyota PID probing.
 *
 * The PriusChat list is large; by default we probe only the alias signals used by the UI.
 * Pass an explicit list to probe more.
 */
export async function probeToyotaPids(
  sendCommand: (command: string) => Promise<string>,
  signalIds: string[] = ZVW30_ALIAS_PID_LIST,
): Promise<string[]> {
  const supported: string[] = [];

  let currentHeader: string | null = null;
  const ensureHeader = async (hdr: string) => {
    const header = hdr.trim().toUpperCase();
    if (!header) return;
    if (currentHeader === header) return;
    await sendCommand(`ATSH ${header}`);
    currentHeader = header;
  };

  for (const id of signalIds) {
    const def = TOYOTA_PIDS[id];
    if (!def) continue;

    const request = (def.request ?? def.pid).trim().toUpperCase();
    const header = (def.header ?? '').trim().toUpperCase();

    try {
      if (header) {
        await ensureHeader(header);
      }

      const cmd = request.match(/.{1,2}/g)?.join(' ') ?? request;
      const response = await sendCommand(cmd);

      const isError =
        response.toUpperCase().includes('NO DATA') ||
        response.toUpperCase().includes('7F') ||
        response.toUpperCase().includes('ERROR') ||
        response.trim() === '';

      if (!isError) {
        supported.push(id);
      }
    } catch {
      // skip
    }
  }

  return supported;
}

