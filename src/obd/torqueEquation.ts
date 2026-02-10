/**
 * Torque/Hybrid Assistant style equation compiler.
 *
 * PriusChat custom PID sheets often provide formulas in the same syntax used by
 * Torque Pro:
 * - Bytes are referenced as A, B, C... Z, AA, AB, ... (spreadsheet-style columns)
 * - Bit extraction uses {A:6} meaning "bit 6 of byte A" (0 or 1)
 * - Operators: +, -, *, / and parentheses
 *
 * This module compiles an equation string into a pure function:
 *   (bytes: number[]) => number
 *
 * No eval/new Function is used so it remains safe on-device and compatible with
 * Hermes / constrained JS runtimes.
 */

type Token =
  | { type: 'number'; value: number }
  | { type: 'var'; name: string }
  | { type: 'bit'; name: string; bit: number }
  | { type: 'op'; op: '+' | '-' | '*' | '/' | 'NEG' }
  | { type: 'lparen' }
  | { type: 'rparen' };

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isUpperAlpha(ch: string): boolean {
  return ch >= 'A' && ch <= 'Z';
}

/**
 * Convert Torque byte variable names to a 0-based index.
 *
 * A=0, B=1, ... Z=25, AA=26, AB=27, ..., AZ=51, BA=52, ...
 */
export function torqueVarToIndex(name: string): number {
  const upper = name.toUpperCase();
  if (!/^[A-Z]+$/.test(upper)) {
    return -1;
  }

  // Spreadsheet-style base-26 with A=1 .. Z=26
  let n = 0;
  for (let i = 0; i < upper.length; i++) {
    n *= 26;
    n += upper.charCodeAt(i) - 64; // 'A' => 1
  }
  return n - 1;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  const s = expr.trim().toUpperCase();
  let i = 0;

  while (i < s.length) {
    const ch = s[i];

    if (isWhitespace(ch)) {
      i++;
      continue;
    }

    // Bit extraction: {AA:7}
    if (ch === '{') {
      const end = s.indexOf('}', i + 1);
      if (end === -1) {
        throw new Error('Unterminated bit extraction');
      }
      const inner = s.substring(i + 1, end).trim(); // e.g. "A:6"
      const m = inner.match(/^([A-Z]+)\s*:\s*(\d+)$/);
      if (!m) {
        throw new Error(`Invalid bit extraction: {${inner}}`);
      }
      const name = m[1];
      const bit = Number(m[2]);
      tokens.push({ type: 'bit', name, bit });
      i = end + 1;
      continue;
    }

    // Number (supports decimals): 36.36, .5, 0.25
    if (isDigit(ch) || (ch === '.' && i + 1 < s.length && isDigit(s[i + 1]))) {
      let j = i;
      let hasDot = false;
      while (j < s.length) {
        const c = s[j];
        if (isDigit(c)) {
          j++;
          continue;
        }
        if (c === '.' && !hasDot) {
          hasDot = true;
          j++;
          continue;
        }
        break;
      }
      const numStr = s.substring(i, j);
      const value = Number(numStr);
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid number: ${numStr}`);
      }
      tokens.push({ type: 'number', value });
      i = j;
      continue;
    }

    // Variable name: A, B, ... Z, AA, AB, ...
    if (isUpperAlpha(ch)) {
      let j = i + 1;
      while (j < s.length && isUpperAlpha(s[j])) {
        j++;
      }
      const name = s.substring(i, j);
      tokens.push({ type: 'var', name });
      i = j;
      continue;
    }

    // Operators and parentheses
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'op', op: ch });
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i++;
      continue;
    }

    throw new Error(`Unexpected character: "${ch}"`);
  }

  return tokens;
}

function precedence(op: Token & { type: 'op' }): number {
  switch (op.op) {
    case 'NEG':
      return 3;
    case '*':
    case '/':
      return 2;
    case '+':
    case '-':
      return 1;
    default:
      return 0;
  }
}

function isRightAssociative(op: Token & { type: 'op' }): boolean {
  return op.op === 'NEG';
}

function toRpn(tokens: Token[]): Token[] {
  const out: Token[] = [];
  const stack: Token[] = [];

  let prev: Token | null = null;
  for (const t of tokens) {
    if (t.type === 'op' && t.op === '-') {
      // Determine unary minus. It is unary if it appears:
      // - at the start, or
      // - after another operator, or
      // - after a left parenthesis.
      const isUnary =
        prev === null ||
        prev.type === 'op' ||
        prev.type === 'lparen';

      if (isUnary) {
        // Replace '-' with unary NEG operator
        t.op = 'NEG';
      }
    }

    if (t.type === 'number' || t.type === 'var' || t.type === 'bit') {
      out.push(t);
      prev = t;
      continue;
    }

    if (t.type === 'op') {
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.type !== 'op') break;

        const p1 = precedence(t);
        const p2 = precedence(top);

        const shouldPop = isRightAssociative(t) ? p1 < p2 : p1 <= p2;
        if (!shouldPop) break;

        out.push(stack.pop() as Token);
      }

      stack.push(t);
      prev = t;
      continue;
    }

    if (t.type === 'lparen') {
      stack.push(t);
      prev = t;
      continue;
    }

    if (t.type === 'rparen') {
      let found = false;
      while (stack.length > 0) {
        const top = stack.pop() as Token;
        if (top.type === 'lparen') {
          found = true;
          break;
        }
        out.push(top);
      }
      if (!found) {
        throw new Error('Mismatched parentheses');
      }
      prev = t;
      continue;
    }
  }

  while (stack.length > 0) {
    const top = stack.pop() as Token;
    if (top.type === 'lparen' || top.type === 'rparen') {
      throw new Error('Mismatched parentheses');
    }
    out.push(top);
  }

  return out;
}

function getByte(bytes: number[], name: string): number {
  const idx = torqueVarToIndex(name);
  if (idx < 0) return 0;
  const v = bytes[idx];
  return Number.isFinite(v) ? v : 0;
}

function evalRpn(rpn: Token[], bytes: number[]): number {
  const stack: number[] = [];

  for (const t of rpn) {
    if (t.type === 'number') {
      stack.push(t.value);
      continue;
    }
    if (t.type === 'var') {
      stack.push(getByte(bytes, t.name));
      continue;
    }
    if (t.type === 'bit') {
      const b = getByte(bytes, t.name);
      const bit = Math.max(0, Math.min(31, t.bit));
      stack.push(((b >> bit) & 1) >>> 0);
      continue;
    }
    if (t.type === 'op') {
      if (t.op === 'NEG') {
        const a = stack.pop();
        stack.push(-(a ?? 0));
        continue;
      }

      const b = stack.pop();
      const a = stack.pop();
      const aa = a ?? 0;
      const bb = b ?? 0;

      switch (t.op) {
        case '+':
          stack.push(aa + bb);
          break;
        case '-':
          stack.push(aa - bb);
          break;
        case '*':
          stack.push(aa * bb);
          break;
        case '/':
          stack.push(bb === 0 ? 0 : aa / bb);
          break;
      }
      continue;
    }
  }

  if (stack.length === 0) return 0;
  return stack[stack.length - 1];
}

/**
 * Compile a Torque equation into a decoder function.
 * If the expression is empty or invalid, the decoder returns 0.
 */
export function compileTorqueEquation(expression: string): (bytes: number[]) => number {
  const expr = (expression ?? '').trim();
  if (expr === '') {
    return () => 0;
  }

  try {
    const rpn = toRpn(tokenize(expr));
    return (bytes: number[]) => evalRpn(rpn, bytes);
  } catch (err) {
    console.warn(
      `Failed to compile Torque equation "${expression}":`,
      err instanceof Error ? err.message : String(err),
    );
    return () => 0;
  }
}

