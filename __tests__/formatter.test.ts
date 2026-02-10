import {
  formatBatterySOC,
  formatFuelEconomy,
  formatPidValue,
  formatRPM,
  formatSpeed,
  formatTemperature,
} from '../src/utils/formatter';

describe('formatter', () => {
  test('formatPidValue uses PID-specific decimals', () => {
    expect(formatPidValue(12.345, '0110')).toBe('12.35'); // MAF: 2 decimals
    expect(formatPidValue(0.12345, '0114')).toBe('0.123'); // O2 voltage: 3 decimals
    expect(formatPidValue(1234.4, '010C')).toBe('1234'); // RPM: integer
  });

  test('formatSpeed converts to mph for imperial', () => {
    expect(formatSpeed(100, 'metric')).toBe('100 km/h');
    expect(formatSpeed(100, 'imperial')).toBe('62 mph');
  });

  test('formatTemperature converts to Fahrenheit for imperial', () => {
    expect(formatTemperature(25, 'metric')).toBe('25\u00B0C');
    expect(formatTemperature(25, 'imperial')).toBe('77\u00B0F');
  });

  test('formatFuelEconomy converts to mpg (US) for imperial', () => {
    expect(formatFuelEconomy(20, 'metric')).toBe('20.0 km/L');
    expect(formatFuelEconomy(20, 'imperial')).toBe('47.0 mpg');
    expect(formatFuelEconomy(0, 'metric')).toBe('--');
  });

  test('formatBatterySOC clamps and rounds', () => {
    expect(formatBatterySOC(50.6)).toBe('51%');
    expect(formatBatterySOC(120)).toBe('100%');
    expect(formatBatterySOC(-5)).toBe('0%');
  });

  test('formatRPM uses K notation for >= 1000', () => {
    expect(formatRPM(950)).toBe('950');
    expect(formatRPM(1000)).toBe('1K');
    expect(formatRPM(1500)).toBe('1.5K');
    expect(formatRPM(10500)).toBe('10.5K');
    expect(formatRPM(-1500)).toBe('-1.5K');
  });
});

