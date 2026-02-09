import { database } from './database';

/**
 * バックグラウンドでOBDデータをバッファリングしてDBに書き込むクラス
 *
 * リアルタイムポーリングで取得したPIDデータを一旦メモリバッファに貯め、
 * BUFFER_SIZE件に達するかFLUSH_INTERVAL経過でDBにバッチ挿入する。
 * これにより書き込み頻度を抑えてI/O負荷を低減する。
 */
class LogWriter {
  private sessionId: number | null = null;
  private buffer: Array<{ pid: string; value: number; timestamp: number }> = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  /** バッファがこの件数に達したらバッチ書き込みを実行する */
  private readonly BUFFER_SIZE = 50;

  /** この間隔(ms)ごとにバッファを強制フラッシュする */
  private readonly FLUSH_INTERVAL = 5000;

  /**
   * 新しいログセッションを開始する。
   * DBにセッションレコードを作成し、定期フラッシュタイマーを開始する。
   *
   * @returns 作成されたセッションID
   * @throws 既にセッションが記録中の場合
   */
  async startSession(): Promise<number> {
    if (this.sessionId !== null) {
      throw new Error('A recording session is already active. Stop it before starting a new one.');
    }

    const id = await database.createSession();
    this.sessionId = id;
    this.buffer = [];

    // 定期的にバッファをフラッシュするタイマーを開始
    this.flushInterval = setInterval(() => {
      this.flush().catch((err) => {
        console.warn('LogWriter periodic flush failed:', err);
      });
    }, this.FLUSH_INTERVAL);

    return id;
  }

  /**
   * データポイントをバッファに追加する。
   * バッファサイズがBUFFER_SIZEに達したらバッチ書き込みをトリガーする。
   *
   * セッションが開始されていない場合は何もしない（ログは捨てる）。
   */
  addDataPoint(pid: string, value: number): void {
    if (this.sessionId === null) {
      return;
    }

    this.buffer.push({
      pid,
      value,
      timestamp: Date.now(),
    });

    // バッファが上限に達したら非同期でフラッシュ
    if (this.buffer.length >= this.BUFFER_SIZE) {
      this.flush().catch((err) => {
        console.warn('LogWriter buffer flush failed:', err);
      });
    }
  }

  /**
   * 現在のセッションを終了する。
   * 残りのバッファをフラッシュし、タイマーを停止し、
   * DBのセッションレコードにend_timeを設定する。
   */
  async stopSession(): Promise<void> {
    if (this.sessionId === null) {
      return;
    }

    // タイマーを停止
    if (this.flushInterval !== null) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // 残りのバッファを全てDBに書き込む
    await this.flush();

    // セッション終了をDBに記録
    await database.endSession(this.sessionId);

    this.sessionId = null;
    this.buffer = [];
  }

  /**
   * バッファの内容をDBにバッチ挿入する。
   * 同時実行を防ぐためflushingフラグで排他制御する。
   */
  private async flush(): Promise<void> {
    // フラッシュ中の再入を防止
    if (this.flushing) {
      return;
    }

    if (this.sessionId === null || this.buffer.length === 0) {
      return;
    }

    this.flushing = true;

    // バッファの内容をローカルにコピーして即座にクリアする
    // これにより、DB書き込み中に新しいデータポイントが追加されても安全
    const pointsToWrite = [...this.buffer];
    this.buffer = [];

    try {
      await database.insertDataPoints(this.sessionId, pointsToWrite);
    } catch (err) {
      // 書き込み失敗時はデータをバッファ先頭に戻す（次回フラッシュで再試行）
      this.buffer = [...pointsToWrite, ...this.buffer];
      throw err;
    } finally {
      this.flushing = false;
    }
  }

  /**
   * 現在ログ記録中かどうかを返す
   */
  isRecording(): boolean {
    return this.sessionId !== null;
  }

  /**
   * 現在のセッションIDを返す。記録中でなければnull。
   */
  getSessionId(): number | null {
    return this.sessionId;
  }
}

export const logWriter = new LogWriter();
