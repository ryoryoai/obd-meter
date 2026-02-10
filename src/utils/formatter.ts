import type { UnitSystem } from '../types/obd';

// Unit conversion constants
const KMH_TO_MPH = 0.621371192237334;
const KM_PER_L_TO_MPG_US = 2.3521458333333335;

// PID -> default decimals for meter display.
// Keep this focused on PIDs used by this app; fallback heuristics handle unknowns.
const PID_DECIMALS: Record<string, number> = {
  // --- Standard Mode 01 PIDs ---
  '0104': 0, // Engine Load (%)
  '0105': 0, // Coolant Temp (°C)
  '0106': 1, // STFT (%)
  '0107': 1, // LTFT (%)
  '010A': 0, // Fuel Pressure (kPa)
  '010B': 0, // MAP (kPa)
  '010C': 0, // RPM
  '010D': 0, // Speed (km/h)
  '010E': 1, // Timing Advance (°)
  '010F': 0, // IAT (°C)
  '0110': 2, // MAF (g/s)
  '0111': 0, // Throttle (%)
  '011F': 0, // Run Time (sec)
  '012F': 0, // Fuel Level (%)
  '0146': 0, // Ambient Temp (°C)
  '015C': 0, // Oil Temp (°C)
  '015E': 2, // Fuel Rate (L/h)

  // --- Toyota (ZVW30) Mode 21/22 (simplified) ---
  '2101': 0, // HV SOC (%). Raw is 0.5-step, but meters typically show integer.
  '2102': 1, // HV Voltage (V)
  '2103': 1, // HV Current (A)
  '2104': 0, // MG1 RPM
  '2105': 0, // MG2 RPM
  '2106': 0, // Inverter Temp (°C)
  '2107': 0, // HV Battery Temp (°C)
  '2108': 0, // EV Mode (0/1)
  '2109': 2, // HV Block Voltage (V) - 小数2桁
  '210A': 0, // HV Battery Temp Distribution (°C)
  '210B': 1, // 12V Auxiliary Battery (V)

  // --- App-calculated keys (if used by store/UI) ---
  CALC_INSTANT_FUEL: 1,
  CALC_AVG_FUEL: 1,
  CALC_EV_RATIO: 0,
  TOYOTA_HV_SOC: 0,
  TOYOTA_HV_VOLTAGE: 1,
  TOYOTA_HV_CURRENT: 1,
  TOYOTA_HV_TEMP: 0,
};

function normalizePid(pid: string): string {
  return (pid ?? '').trim().replace(/\s+/g, '').toUpperCase();
}

function clampNumber(value: number, min: number, max: number): number {
  let lo = min;
  let hi = max;
  if (lo > hi) [lo, hi] = [hi, lo];
  return Math.min(hi, Math.max(lo, value));
}

function toFixedSafe(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return '--';
  const d = Math.max(0, Math.min(20, Math.trunc(decimals)));
  const fixed = value.toFixed(d);

  // Avoid "-0" / "-0.0" etc.
  if (Number(fixed) === 0) {
    return (0).toFixed(d);
  }

  return fixed;
}

function guessDecimals(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const abs = Math.abs(value);

  // Heuristic: prefer fewer decimals when the value is close to a neat step.
  // (Use generous epsilons to tolerate float noise.)
  if (Math.abs(abs - Math.round(abs)) < 1e-9) return 0;
  if (Math.abs(abs * 10 - Math.round(abs * 10)) < 1e-6) return 1;
  if (Math.abs(abs * 100 - Math.round(abs * 100)) < 1e-4) return 2;
  return 3;
}

/**
 * Format a decoded PID value for meter display with PID-appropriate decimals.
 * This function does not append units.
 */
export function formatPidValue(value: number, pid: string): string {
  const key = normalizePid(pid);

  // Conventional O2 sensor voltage PIDs (0114-011B) are 0.005V steps.
  const o2VoltagePid = /^011[4-9A-B]$/i.test(key);

  const decimals =
    PID_DECIMALS[key] ?? (o2VoltagePid ? 3 : guessDecimals(value));

  return toFixedSafe(value, decimals);
}

/** Format speed from km/h into the configured unit system. */
export function formatSpeed(kmh: number, unit: UnitSystem): string {
  if (!Number.isFinite(kmh)) return '--';

  const kmhClamped = Math.max(0, kmh);
  if (unit === 'imperial') {
    const mph = kmhClamped * KMH_TO_MPH;
    return `${Math.round(mph)} mph`;
  }

  return `${Math.round(kmhClamped)} km/h`;
}

/** Format temperature from Celsius into the configured unit system. */
export function formatTemperature(celsius: number, unit: UnitSystem): string {
  if (!Number.isFinite(celsius)) return '--';

  if (unit === 'imperial') {
    const f = (celsius * 9) / 5 + 32;
    return `${Math.round(f)}\u00B0F`;
  }

  return `${Math.round(celsius)}\u00B0C`;
}

/** Format fuel economy from km/L into the configured unit system (mpg = US). */
export function formatFuelEconomy(kmPerL: number, unit: UnitSystem): string {
  if (!Number.isFinite(kmPerL) || kmPerL <= 0) return '--';

  if (unit === 'imperial') {
    const mpg = kmPerL * KM_PER_L_TO_MPG_US;
    return `${toFixedSafe(mpg, 1)} mpg`;
  }

  return `${toFixedSafe(kmPerL, 1)} km/L`;
}

/** Format HV battery SOC (%) as a clamped integer percentage string. */
export function formatBatterySOC(soc: number): string {
  if (!Number.isFinite(soc)) return '--';
  const clamped = clampNumber(soc, 0, 100);
  return `${Math.round(clamped)}%`;
}

/**
 * Format RPM for display.
 * >= 1000 is shown in "K" notation (e.g. 1500 -> "1.5K").
 */
export function formatRPM(rpm: number): string {
  if (!Number.isFinite(rpm)) return '--';

  const rounded = Math.round(rpm);
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);

  if (abs >= 1000) {
    const k = abs / 1000;
    let s = toFixedSafe(k, 1);
    s = s.replace(/\.0$/, '');
    return `${sign}${s}K`;
  }

  return `${rounded}`;
}

/** Format individual module voltage (e.g. "7.21V"). */
export function formatModuleVoltage(voltage: number): string {
  if (!Number.isFinite(voltage)) return '--';
  return `${voltage.toFixed(2)}V`;
}

/** Format State of Health percentage. */
export function formatSOH(soh: number): string {
  if (!Number.isFinite(soh)) return '--';
  return `${Math.round(clampNumber(soh, 0, 100))}%`;
}

/** Format internal resistance in milliohms (e.g. "2.1mΩ"). */
export function formatResistance(mohm: number): string {
  if (!Number.isFinite(mohm)) return '--';
  return `${mohm.toFixed(1)}m\u03A9`;
}

/**
 * Decode raw DTC bytes into standard OBD-II DTC code string.
 *
 * DTC format: 2 bytes per code
 *   Bits 15-14: Type (00=P, 01=C, 10=B, 11=U)
 *   Bits 13-12: Second digit
 *   Bits 11-8:  Third digit
 *   Bits 7-4:   Fourth digit
 *   Bits 3-0:   Fifth digit
 */
export function formatDTCCode(byte1: number, byte2: number): string {
  const typeMap = ['P', 'C', 'B', 'U'];
  const typeIndex = (byte1 >> 6) & 0x03;
  const digit2 = (byte1 >> 4) & 0x03;
  const digit3 = byte1 & 0x0F;
  const digit4 = (byte2 >> 4) & 0x0F;
  const digit5 = byte2 & 0x0F;
  return `${typeMap[typeIndex]}${digit2}${digit3.toString(16).toUpperCase()}${digit4.toString(16).toUpperCase()}${digit5.toString(16).toUpperCase()}`;
}

/** Format power in kilowatts with sign (e.g. "+12.3kW", "-5.6kW"). */
export function formatPowerKw(kw: number): string {
  if (!Number.isFinite(kw)) return '--';
  const sign = kw >= 0 ? '+' : '';
  return `${sign}${kw.toFixed(1)}kW`;
}

/** Format engine ON ratio as percentage (e.g. "62.3%"). */
export function formatEngineRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return '--';
  return `${(clampNumber(ratio, 0, 1) * 100).toFixed(1)}%`;
}
