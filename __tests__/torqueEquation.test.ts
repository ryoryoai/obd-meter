import { compileTorqueEquation, torqueVarToIndex } from '../src/obd/torqueEquation';

describe('torqueEquation', () => {
  test('torqueVarToIndex maps A..Z, AA..AD', () => {
    expect(torqueVarToIndex('A')).toBe(0);
    expect(torqueVarToIndex('Z')).toBe(25);
    expect(torqueVarToIndex('AA')).toBe(26);
    expect(torqueVarToIndex('AB')).toBe(27);
    expect(torqueVarToIndex('AC')).toBe(28);
    expect(torqueVarToIndex('AD')).toBe(29);
  });

  test('basic arithmetic works', () => {
    const decode = compileTorqueEquation('A * 32 / 25');
    expect(decode([100])).toBeCloseTo(128, 6);
  });

  test('bit extraction works', () => {
    const decode = compileTorqueEquation('{A:6}');
    expect(decode([0b0000_0000])).toBe(0);
    expect(decode([0b0100_0000])).toBe(1);
  });

  test('signed 8-bit pattern (A - {A:7} * 256) works', () => {
    const decode = compileTorqueEquation('(A - {A:7} * 256)');
    expect(decode([0x00])).toBe(0);
    expect(decode([0x7f])).toBe(127);
    expect(decode([0x80])).toBe(-128);
    expect(decode([0xff])).toBe(-1);
  });

  test('multi-letter variables work (AC and AD)', () => {
    // (AC * 256 + AD)
    const decode = compileTorqueEquation('AC * 256 + AD');

    const bytes = Array.from({ length: 30 }, () => 0);
    bytes[28] = 0x12; // AC
    bytes[29] = 0x34; // AD

    expect(decode(bytes)).toBe(0x1234);
  });

  test('unary minus works', () => {
    const decode = compileTorqueEquation('-A / 2');
    expect(decode([10])).toBe(-5);
  });
});

