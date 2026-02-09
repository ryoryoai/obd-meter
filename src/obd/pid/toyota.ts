import { PidDefinition } from '../../types/obd';

/**
 * Toyota ZVW30 Prius (3rd generation, 2009-2015) Hybrid-specific PIDs.
 *
 * These use OBD-II Mode 21 (Toyota-specific) and Mode 22 (enhanced diagnostic).
 * PID addresses and decode formulas are based on known ZVW30 ECU data from
 * community-sourced PID databases (Torque app, Hybrid Assistant, PriusChat).
 *
 * IMPORTANT: Actual PID addresses and byte positions may vary depending on
 * ECU firmware version and market region (JDM/USDM/EDM). The values below
 * represent the most commonly documented mappings.
 *
 * Mode 22 requests are sent as: 22 XX XX (2-byte PID)
 * The response format is: 62 XX XX [data bytes...]
 *
 * For this module, PID keys use a simplified 4-char format where the first
 * two characters represent the mode (21/22) and the last two are a logical index.
 */
export const TOYOTA_PIDS: Record<string, PidDefinition> = {
  // --- HV Battery State of Charge ---
  // Source: Hybrid battery ECU (HV ECU)
  // Torque PID: 0x22, 0x0138 (example mapping)
  // Raw byte represents SOC as a direct percentage value.
  // ZVW30 typically shows SOC in the range of ~20-80% during normal operation
  // (the ECU manages this window to preserve battery life).
  '2101': {
    pid: '2101',
    name: 'HV Battery SOC',
    shortName: 'SOC',
    unit: '%',
    min: 0,
    max: 100,
    decode: (b) => b[0] / 2,
  },

  // --- HV Battery Pack Voltage ---
  // The NiMH battery pack in ZVW30 is nominally 201.6V (28 modules x 7.2V).
  // Under load it ranges roughly 180-252V.
  // Two data bytes: voltage = (A * 256 + B) / 10
  '2102': {
    pid: '2102',
    name: 'HV Battery Voltage',
    shortName: 'HV Volt',
    unit: 'V',
    min: 0,
    max: 300,
    decode: (b) => (b[0] * 256 + b[1]) / 10,
  },

  // --- HV Battery Current ---
  // Signed value. Positive = discharging, negative = charging (regen).
  // Two bytes, signed: current = ((A * 256 + B) - 32768) / 100
  // This gives a range of approximately -327.68A to +327.67A,
  // though ZVW30 typically stays within -150A to +150A.
  '2103': {
    pid: '2103',
    name: 'HV Battery Current',
    shortName: 'HV Amp',
    unit: 'A',
    min: -150,
    max: 150,
    decode: (b) => ((b[0] * 256 + b[1]) - 32768) / 100,
  },

  // --- MG1 (Motor/Generator 1) RPM ---
  // MG1 is connected to the sun gear of the power-split device.
  // It primarily functions as a starter/generator.
  // Signed 16-bit value: RPM = (A * 256 + B) - 32768
  // MG1 can spin in both directions depending on vehicle state.
  '2104': {
    pid: '2104',
    name: 'MG1 RPM',
    shortName: 'MG1',
    unit: 'rpm',
    min: -10000,
    max: 10000,
    decode: (b) => (b[0] * 256 + b[1]) - 32768,
  },

  // --- MG2 (Traction Motor) RPM ---
  // MG2 is the primary traction motor connected to the ring gear.
  // It provides direct drive torque to the wheels.
  // Signed 16-bit value: RPM = (A * 256 + B) - 32768
  '2105': {
    pid: '2105',
    name: 'MG2 RPM',
    shortName: 'MG2',
    unit: 'rpm',
    min: -10000,
    max: 10000,
    decode: (b) => (b[0] * 256 + b[1]) - 32768,
  },

  // --- Inverter Temperature ---
  // The inverter converts DC from the HV battery to 3-phase AC for MG1/MG2.
  // Temperature is reported with a -40 offset (same as standard OBD coolant temp).
  '2106': {
    pid: '2106',
    name: 'Inverter Temperature',
    shortName: 'Inv Temp',
    unit: '\u00B0C',
    min: -40,
    max: 150,
    decode: (b) => b[0] - 40,
  },

  // --- HV Battery Temperature ---
  // Average temperature of the NiMH battery pack.
  // Reported with -40 offset.
  // The battery cooling fan adjusts based on this value.
  '2107': {
    pid: '2107',
    name: 'HV Battery Temperature',
    shortName: 'Bat Temp',
    unit: '\u00B0C',
    min: -40,
    max: 100,
    decode: (b) => b[0] - 40,
  },

  // --- EV Mode Status ---
  // Indicates whether the vehicle is currently in EV (electric-only) mode.
  // 0 = HV mode (engine may run), 1 = EV mode (engine off, electric only).
  // On ZVW30, EV mode is limited to low speeds (~40 km/h) and light throttle.
  '2108': {
    pid: '2108',
    name: 'EV Mode',
    shortName: 'EV',
    unit: '',
    min: 0,
    max: 1,
    decode: (b) => b[0] & 0x01,
  },
};

/**
 * Toyota-specific supported PID query.
 * Unlike standard Mode 01 queries, Toyota enhanced PIDs typically require
 * direct addressing - there is no standardized "supported PIDs" bitmask query
 * for Mode 21/22. Discovery is done by attempting to read each known PID
 * and checking for a valid response vs. a "no data" / "7F" error.
 */
export const TOYOTA_PID_LIST = Object.keys(TOYOTA_PIDS);

/**
 * Probe which Toyota-specific PIDs are supported by the connected ECU.
 * Returns the subset of known PIDs that the vehicle responds to.
 *
 * @param sendCommand - Function that sends an OBD command and returns the raw response
 * @returns Array of supported Toyota PID strings
 */
export async function probeToyotaPids(
  sendCommand: (command: string) => Promise<string>,
): Promise<string[]> {
  const supported: string[] = [];

  for (const pid of TOYOTA_PID_LIST) {
    try {
      const mode = pid.substring(0, 2);
      const pidCode = pid.substring(2, 4);
      const response = await sendCommand(`${mode} ${pidCode}`);

      // Check for valid response (should start with positive response code).
      // Mode 22 positive response = 62, Mode 21 positive response = 61.
      // Error responses contain "7F" (negative response) or "NO DATA".
      const isError =
        response.includes('NO DATA') ||
        response.includes('7F') ||
        response.includes('ERROR') ||
        response.trim() === '';

      if (!isError) {
        supported.push(pid);
      }
    } catch {
      // PID not supported or communication error - skip
    }
  }

  return supported;
}
