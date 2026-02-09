import { PidDefinition } from '../../types/obd';

/**
 * Standard OBD-II Mode 01 PID definitions.
 * Decode formulas follow SAE J1979 / ISO 15031-5.
 */
export const STANDARD_PIDS: Record<string, PidDefinition> = {
  // --- Engine Load & Temperature ---
  '0104': {
    pid: '0104',
    name: 'Calculated Engine Load',
    shortName: 'Load',
    unit: '%',
    min: 0,
    max: 100,
    decode: (b) => (b[0] * 100) / 255,
  },
  '0105': {
    pid: '0105',
    name: 'Engine Coolant Temperature',
    shortName: 'Coolant',
    unit: '\u00B0C',
    min: -40,
    max: 215,
    decode: (b) => b[0] - 40,
  },

  // --- Fuel Trim ---
  '0106': {
    pid: '0106',
    name: 'Short Term Fuel Trim - Bank 1',
    shortName: 'STFT B1',
    unit: '%',
    min: -100,
    max: 99.2,
    decode: (b) => ((b[0] - 128) * 100) / 128,
  },
  '0107': {
    pid: '0107',
    name: 'Long Term Fuel Trim - Bank 1',
    shortName: 'LTFT B1',
    unit: '%',
    min: -100,
    max: 99.2,
    decode: (b) => ((b[0] - 128) * 100) / 128,
  },

  // --- Fuel & Intake Pressure ---
  '010A': {
    pid: '010A',
    name: 'Fuel Pressure',
    shortName: 'Fuel Pres',
    unit: 'kPa',
    min: 0,
    max: 765,
    decode: (b) => b[0] * 3,
  },
  '010B': {
    pid: '010B',
    name: 'Intake Manifold Absolute Pressure',
    shortName: 'MAP',
    unit: 'kPa',
    min: 0,
    max: 255,
    decode: (b) => b[0],
  },

  // --- RPM & Speed ---
  '010C': {
    pid: '010C',
    name: 'Engine RPM',
    shortName: 'RPM',
    unit: 'rpm',
    min: 0,
    max: 16383.75,
    decode: (b) => (b[0] * 256 + b[1]) / 4,
  },
  '010D': {
    pid: '010D',
    name: 'Vehicle Speed',
    shortName: 'Speed',
    unit: 'km/h',
    min: 0,
    max: 255,
    decode: (b) => b[0],
  },

  // --- Timing & Temperature ---
  '010E': {
    pid: '010E',
    name: 'Timing Advance',
    shortName: 'Timing',
    unit: '\u00B0',
    min: -64,
    max: 63.5,
    decode: (b) => b[0] / 2 - 64,
  },
  '010F': {
    pid: '010F',
    name: 'Intake Air Temperature',
    shortName: 'IAT',
    unit: '\u00B0C',
    min: -40,
    max: 215,
    decode: (b) => b[0] - 40,
  },

  // --- MAF & Throttle ---
  '0110': {
    pid: '0110',
    name: 'MAF Air Flow Rate',
    shortName: 'MAF',
    unit: 'g/s',
    min: 0,
    max: 655.35,
    decode: (b) => (b[0] * 256 + b[1]) / 100,
  },
  '0111': {
    pid: '0111',
    name: 'Throttle Position',
    shortName: 'Throttle',
    unit: '%',
    min: 0,
    max: 100,
    decode: (b) => (b[0] * 100) / 255,
  },

  // --- O2 Sensors (Bank 1, Sensors 1-4 & Bank 2, Sensors 1-4) ---
  // PID 0114-011B: Conventional O2 sensors (narrow-band)
  // Byte A = O2 voltage (0-1.275 V), Byte B = Short term fuel trim (-100 to 99.2%)
  // If STFT B = 0xFF ($FF), sensor is not used for fuel trim calculation.
  '0114': {
    pid: '0114',
    name: 'O2 Sensor Voltage - Bank 1, Sensor 1',
    shortName: 'O2 B1S1',
    unit: 'V',
    min: 0,
    max: 1.275,
    decode: (b) => b[0] / 200,
  },
  '0115': {
    pid: '0115',
    name: 'O2 Sensor Voltage - Bank 1, Sensor 2',
    shortName: 'O2 B1S2',
    unit: 'V',
    min: 0,
    max: 1.275,
    decode: (b) => b[0] / 200,
  },
  '0116': {
    pid: '0116',
    name: 'O2 Sensor Voltage - Bank 1, Sensor 3',
    shortName: 'O2 B1S3',
    unit: 'V',
    min: 0,
    max: 1.275,
    decode: (b) => b[0] / 200,
  },
  '0117': {
    pid: '0117',
    name: 'O2 Sensor Voltage - Bank 1, Sensor 4',
    shortName: 'O2 B1S4',
    unit: 'V',
    min: 0,
    max: 1.275,
    decode: (b) => b[0] / 200,
  },
  '0118': {
    pid: '0118',
    name: 'O2 Sensor Voltage - Bank 2, Sensor 1',
    shortName: 'O2 B2S1',
    unit: 'V',
    min: 0,
    max: 1.275,
    decode: (b) => b[0] / 200,
  },
  '0119': {
    pid: '0119',
    name: 'O2 Sensor Voltage - Bank 2, Sensor 2',
    shortName: 'O2 B2S2',
    unit: 'V',
    min: 0,
    max: 1.275,
    decode: (b) => b[0] / 200,
  },
  '011A': {
    pid: '011A',
    name: 'O2 Sensor Voltage - Bank 2, Sensor 3',
    shortName: 'O2 B2S3',
    unit: 'V',
    min: 0,
    max: 1.275,
    decode: (b) => b[0] / 200,
  },
  '011B': {
    pid: '011B',
    name: 'O2 Sensor Voltage - Bank 2, Sensor 4',
    shortName: 'O2 B2S4',
    unit: 'V',
    min: 0,
    max: 1.275,
    decode: (b) => b[0] / 200,
  },

  // --- Run Time ---
  '011F': {
    pid: '011F',
    name: 'Run Time Since Engine Start',
    shortName: 'Run Time',
    unit: 'sec',
    min: 0,
    max: 65535,
    decode: (b) => b[0] * 256 + b[1],
  },

  // --- Fuel Tank Level ---
  '012F': {
    pid: '012F',
    name: 'Fuel Tank Level Input',
    shortName: 'Fuel Lvl',
    unit: '%',
    min: 0,
    max: 100,
    decode: (b) => (b[0] * 100) / 255,
  },

  // --- Ambient & Oil Temperature ---
  '0146': {
    pid: '0146',
    name: 'Ambient Air Temperature',
    shortName: 'Ambient',
    unit: '\u00B0C',
    min: -40,
    max: 215,
    decode: (b) => b[0] - 40,
  },
  '015C': {
    pid: '015C',
    name: 'Engine Oil Temperature',
    shortName: 'Oil Temp',
    unit: '\u00B0C',
    min: -40,
    max: 210,
    decode: (b) => b[0] - 40,
  },

  // --- Fuel Rate ---
  '015E': {
    pid: '015E',
    name: 'Engine Fuel Rate',
    shortName: 'Fuel Rate',
    unit: 'L/h',
    min: 0,
    max: 3276.75,
    decode: (b) => (b[0] * 256 + b[1]) / 20,
  },
};

/**
 * Supported PID query commands (Mode 01).
 * Each returns a 4-byte bitmask indicating support for the next 32 PIDs.
 *   0100 -> PIDs 01-20
 *   0120 -> PIDs 21-40
 *   0140 -> PIDs 41-60
 */
export const SUPPORTED_PID_QUERIES = ['0100', '0120', '0140'] as const;

/**
 * Decode a "Supported PIDs" response bitmask into a list of supported PID strings.
 *
 * Each query (0100/0120/0140) returns 4 data bytes (32 bits).
 * Bit 0 (MSB of byte A) = first PID in that range, bit 31 (LSB of byte D) = last PID.
 *
 * @param query - The supported-PID query command, e.g. '0100'
 * @param bytes - The 4 response data bytes
 * @returns Array of supported PID strings in "MMPP" format (e.g. ['0101', '0103', ...])
 */
export function decodeSupportedPids(
  query: string,
  bytes: number[],
): string[] {
  if (bytes.length < 4) {
    return [];
  }

  // Extract mode and base PID offset from the query.
  // e.g. query='0100' -> mode='01', basePid=0x00
  //      query='0120' -> mode='01', basePid=0x20
  const mode = query.substring(0, 2);
  const basePid = parseInt(query.substring(2, 4), 16);

  const supported: string[] = [];

  // Combine 4 bytes into a 32-bit integer
  const bitmask =
    ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;

  for (let bit = 0; bit < 32; bit++) {
    // Bit 0 is the MSB (bit 31 of the integer)
    const mask = (1 << (31 - bit)) >>> 0;
    if ((bitmask & mask) !== 0) {
      const pidNumber = basePid + bit + 1; // PIDs are 1-indexed from the base
      const pidHex = pidNumber.toString(16).toUpperCase().padStart(2, '0');
      supported.push(`${mode}${pidHex}`);
    }
  }

  return supported;
}
