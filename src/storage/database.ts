import type { LogSession, DataPoint } from '../types/obd';
import type { SQLiteDatabase } from 'expo-sqlite';
import { TurboModuleRegistry } from 'react-native';

const DB_NAME = 'obd_meter.db';

type ExpoSQLiteModule = typeof import('expo-sqlite');

let cachedSQLite: ExpoSQLiteModule | null | undefined;
let warnedMissingSQLite = false;

function getExpoSQLite(): ExpoSQLiteModule | null {
  if (cachedSQLite !== undefined) {
    return cachedSQLite;
  }

  // Avoid loading expo-sqlite unless its native side is present.
  // If we try to load it while Expo modules aren't installed, Metro can treat the thrown
  // exception as fatal (even if we wrap require() in try/catch), crashing the app.
  const hasExpoModulesCore = TurboModuleRegistry.get('ExpoModulesCore') != null;
  const hasExpoSQLite = TurboModuleRegistry.get('ExpoSQLite') != null;

  if (!hasExpoModulesCore || !hasExpoSQLite) {
    cachedSQLite = null;
    if (!warnedMissingSQLite) {
      warnedMissingSQLite = true;
      console.warn('ExpoSQLite native module is missing; logging features are disabled.');
    }
    return cachedSQLite;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  cachedSQLite = require('expo-sqlite') as ExpoSQLiteModule;

  return cachedSQLite;
}

/**
 * OBDデータログ用SQLiteデータベース管理クラス
 *
 * sessions テーブルでログセッションを管理し、
 * data_points テーブルで各PIDの計測値を時系列で保存する。
 */
class Database {
  private db: SQLiteDatabase | null = null;

  /**
   * データベースを開き、テーブルとインデックスを作成する。
   * アプリ起動時に一度呼ぶこと。
   */
  async initialize(): Promise<void> {
    const SQLite = getExpoSQLite();
    if (!SQLite) {
      return;
    }

    this.db = await SQLite.openDatabaseAsync(DB_NAME);

    await this.db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        data_point_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS data_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
        timestamp INTEGER NOT NULL,
        pid TEXT NOT NULL,
        value REAL NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_data_points_session_time
        ON data_points(session_id, timestamp);

      CREATE INDEX IF NOT EXISTS idx_data_points_pid
        ON data_points(pid);
    `);
  }

  /**
   * 初期化済みのDBインスタンスを返す (内部用)。未初期化の場合はエラーを投げる。
   */
  private getDbInternal(): SQLiteDatabase {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * 新しいログセッションを作成し、そのIDを返す。
   * start_time は現在時刻(Unix ms)で自動設定される。
   */
  async createSession(): Promise<number> {
    const db = this.getDbInternal();
    const now = Date.now();
    const result = await db.runAsync(
      'INSERT INTO sessions (start_time) VALUES (?)',
      now,
    );
    return result.lastInsertRowId;
  }

  /**
   * セッションを終了する。end_time を現在時刻に設定する。
   */
  async endSession(sessionId: number): Promise<void> {
    const db = this.getDbInternal();
    const now = Date.now();
    await db.runAsync(
      'UPDATE sessions SET end_time = ? WHERE id = ?',
      now,
      sessionId,
    );
  }

  /**
   * 単一のデータポイントを挿入する。
   * セッションの data_point_count も同時にインクリメントする。
   */
  async insertDataPoint(
    sessionId: number,
    pid: string,
    value: number,
  ): Promise<void> {
    const db = this.getDbInternal();
    const now = Date.now();

    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.runAsync(
        'INSERT INTO data_points (session_id, timestamp, pid, value) VALUES (?, ?, ?, ?)',
        sessionId,
        now,
        pid,
        value,
      );
      await txn.runAsync(
        'UPDATE sessions SET data_point_count = data_point_count + 1 WHERE id = ?',
        sessionId,
      );
    });
  }

  /**
   * 複数のデータポイントをバッチ挿入する。
   * トランザクション内で一括処理することでI/O効率を高める。
   */
  async insertDataPoints(
    sessionId: number,
    points: Array<{ pid: string; value: number; timestamp: number }>,
  ): Promise<void> {
    if (points.length === 0) {
      return;
    }

    const db = this.getDbInternal();

    await db.withExclusiveTransactionAsync(async (txn) => {
      const stmt = await txn.prepareAsync(
        'INSERT INTO data_points (session_id, timestamp, pid, value) VALUES ($sessionId, $timestamp, $pid, $value)',
      );

      try {
        for (const point of points) {
          await stmt.executeAsync({
            $sessionId: sessionId,
            $timestamp: point.timestamp,
            $pid: point.pid,
            $value: point.value,
          });
        }
      } finally {
        await stmt.finalizeAsync();
      }

      await txn.runAsync(
        'UPDATE sessions SET data_point_count = data_point_count + ? WHERE id = ?',
        points.length,
        sessionId,
      );
    });
  }

  /**
   * 全セッション一覧を開始時刻の降順で取得する。
   */
  async getSessions(): Promise<LogSession[]> {
    const db = this.getDbInternal();
    const rows = await db.getAllAsync<{
      id: number;
      start_time: number;
      end_time: number | null;
      data_point_count: number;
    }>('SELECT id, start_time, end_time, data_point_count FROM sessions ORDER BY start_time DESC');

    return rows.map((row) => ({
      id: row.id,
      startTime: row.start_time,
      endTime: row.end_time,
      dataPointCount: row.data_point_count,
    }));
  }

  /**
   * 指定セッションのデータポイントを取得する。
   * pidを指定した場合はそのPIDのみにフィルタする。
   * タイムスタンプ昇順で返す。
   */
  async getSessionData(
    sessionId: number,
    pid?: string,
  ): Promise<DataPoint[]> {
    const db = this.getDbInternal();

    let query: string;
    let params: (number | string)[];

    if (pid) {
      query =
        'SELECT session_id, timestamp, pid, value FROM data_points WHERE session_id = ? AND pid = ? ORDER BY timestamp ASC';
      params = [sessionId, pid];
    } else {
      query =
        'SELECT session_id, timestamp, pid, value FROM data_points WHERE session_id = ? ORDER BY timestamp ASC';
      params = [sessionId];
    }

    const rows = await db.getAllAsync<{
      session_id: number;
      timestamp: number;
      pid: string;
      value: number;
    }>(query, params);

    return rows.map((row) => ({
      sessionId: row.session_id,
      timestamp: row.timestamp,
      pid: row.pid,
      value: row.value,
    }));
  }

  /**
   * セッションとそれに紐づく全データポイントを削除する。
   * ON DELETE CASCADE により data_points も自動削除される。
   * ただしPRAGMA foreign_keysの設定に依存するため、明示的にも削除する。
   */
  async deleteSession(sessionId: number): Promise<void> {
    const db = this.getDbInternal();

    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.runAsync(
        'DELETE FROM data_points WHERE session_id = ?',
        sessionId,
      );
      await txn.runAsync('DELETE FROM sessions WHERE id = ?', sessionId);
    });
  }

  /**
   * 初期化済みのDBインスタンスを外部に公開する。
   * 未初期化の場合はエラーを投げる。
   */
  getDb(): SQLiteDatabase {
    return this.getDbInternal();
  }

  /**
   * 全データを削除する (全セッション・全データポイント)
   */
  async clearAllData(): Promise<void> {
    const db = this.getDbInternal();
    await db.execAsync(`
      DELETE FROM data_points;
      DELETE FROM sessions;
    `);
  }

  /**
   * セッションデータをCSV文字列としてエクスポートする。
   * ヘッダ行: timestamp,pid,value
   * 各行: Unixタイムスタンプ(ms), PID文字列, 数値
   */
  async exportSessionToCSV(sessionId: number): Promise<string> {
    const db = this.getDbInternal();

    // セッション情報を取得
    const session = await db.getFirstAsync<{
      id: number;
      start_time: number;
      end_time: number | null;
    }>('SELECT id, start_time, end_time FROM sessions WHERE id = ?', sessionId);

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // データポイントを時系列順で取得
    const rows = await db.getAllAsync<{
      timestamp: number;
      pid: string;
      value: number;
    }>(
      'SELECT timestamp, pid, value FROM data_points WHERE session_id = ? ORDER BY timestamp ASC',
      sessionId,
    );

    // CSVヘッダとデータ行を構築
    const lines: string[] = [];
    lines.push('timestamp,pid,value');

    for (const row of rows) {
      // 値に特殊文字が含まれる場合はクオート（PIDに","は通常含まれないが安全策）
      const pidEscaped = row.pid.includes(',')
        ? `"${row.pid}"`
        : row.pid;
      lines.push(`${row.timestamp},${pidEscaped},${row.value}`);
    }

    return lines.join('\n');
  }
}

export const database = new Database();
