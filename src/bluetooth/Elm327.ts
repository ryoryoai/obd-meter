export interface Elm327Transport {
  sendCommand(command: string): Promise<string>;
}

/**
 * ELM327初期化シーケンスで送信するATコマンド群。
 * 順序が重要: リセット→エコーOFF→改行OFF→スペースOFF→ヘッダOFF→プロトコル自動検出
 */
const INIT_COMMANDS: ReadonlyArray<{ command: string; description: string }> = [
  { command: 'ATZ', description: 'Reset ELM327' },
  { command: 'ATE0', description: 'Echo off' },
  { command: 'ATL0', description: 'Linefeeds off' },
  { command: 'ATS0', description: 'Spaces off' },
  { command: 'ATH0', description: 'Headers off' },
  { command: 'ATSP0', description: 'Auto protocol detection' },
];

/** ATZリセット後の追加待機時間(ms) */
const RESET_SETTLE_MS = 1500;

/** 通常コマンド間の待機時間(ms) */
const COMMAND_INTERVAL_MS = 200;

/**
 * ELM327プロトコル処理クラス
 *
 * BleConnectionManager経由でELM327アダプタの初期化と
 * OBDコマンドの送受信・レスポンスパースを行う。
 */
export class Elm327 {
  private transport: Elm327Transport;
  private ready = false;

  constructor(transport: Elm327Transport) {
    this.transport = transport;
  }

  /**
   * ELM327が初期化済みかどうかを返す
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * ELM327初期化シーケンスを実行する。
   * ATZ → ATE0 → ATL0 → ATS0 → ATH0 → ATSP0 の順にコマンドを送信する。
   *
   * @returns 初期化成功でtrue、失敗でfalse
   */
  async initialize(): Promise<boolean> {
    this.ready = false;

    for (const { command, description } of INIT_COMMANDS) {
      try {
        const response = await this.transport.sendCommand(command);

        // ATZはリセットコマンドなので、応答後に追加待機が必要
        if (command === 'ATZ') {
          await this.delay(RESET_SETTLE_MS);
        } else {
          await this.delay(COMMAND_INTERVAL_MS);
        }

        // エラーレスポンスチェック
        if (this.isErrorResponse(response)) {
          console.warn(
            `ELM327 init command "${command}" (${description}) returned error: ${response}`,
          );
          return false;
        }
      } catch (err) {
        console.warn(
          `ELM327 init command "${command}" (${description}) failed:`,
          err instanceof Error ? err.message : String(err),
        );
        return false;
      }
    }

    this.ready = true;
    return true;
  }

  /**
   * OBDコマンド(PID)を送信してレスポンス文字列を取得する。
   *
   * @param pid - OBD PID文字列 (e.g. "010C" for Engine RPM)
   * @returns ELM327からの生レスポンス文字列
   * @throws ELM327が未初期化、またはエラーレスポンス時
   */
  async sendOBDCommand(pid: string): Promise<string> {
    if (!this.ready) {
      throw new Error('ELM327 is not initialized. Call initialize() first.');
    }

    const response = await this.transport.sendCommand(pid);

    if (this.isErrorResponse(response)) {
      throw new Error(`OBD command "${pid}" error: ${response}`);
    }

    return response;
  }

  /**
   * ELM327の生レスポンス文字列をバイト配列に変換する。
   *
   * ELM327レスポンスフォーマット例:
   *   "41 0C 1A F8" → ヘッダ部(41 0C)を除いたデータバイト [0x1A, 0xF8]
   *   "410C1AF8"    → スペースなし設定(ATS0)の場合も対応
   *
   * @param raw - ELM327の生レスポンス
   * @returns デコード用バイト配列 (ヘッダ2バイト除外後)
   */
  parseResponse(raw: string): number[] {
    // 空白・改行を除去し、純粋な16進文字列にする
    const cleaned = raw.replace(/[\s\r\n]/g, '').toUpperCase();

    // レスポンスが16進文字列として有効か検証
    if (!/^[0-9A-F]+$/.test(cleaned)) {
      return [];
    }

    // 2文字ずつ区切ってバイト配列に変換
    const allBytes: number[] = [];
    for (let i = 0; i < cleaned.length; i += 2) {
      const hexByte = cleaned.substring(i, i + 2);
      if (hexByte.length === 2) {
        allBytes.push(parseInt(hexByte, 16));
      }
    }

    // OBDレスポンスの先頭2バイトはモード応答+PID (e.g. 41 0C)
    // データバイトは3バイト目以降
    if (allBytes.length <= 2) {
      return [];
    }

    return allBytes.slice(2);
  }

  /**
   * ELM327をリセットして未初期化状態に戻す
   */
  async reset(): Promise<void> {
    try {
      await this.transport.sendCommand('ATZ');
      await this.delay(RESET_SETTLE_MS);
    } catch {
      // リセットコマンドの失敗は無視（接続切れ等）
    }
    this.ready = false;
  }

  // --- Private methods ---

  /**
   * ELM327のエラーレスポンスかどうかを判定する
   */
  private isErrorResponse(response: string): boolean {
    const errorPatterns = [
      'NO DATA',
      'UNABLE TO CONNECT',
      'BUS INIT',
      'BUS ERROR',
      'CAN ERROR',
      'ERROR',
      '?',
    ];
    const upper = response.toUpperCase().trim();
    return errorPatterns.some(pattern => upper.includes(pattern));
  }

  /**
   * 指定ミリ秒待機する
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
