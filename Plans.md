# OBD Meter - ZVW30 Prius Edition

## プロジェクト概要

ZVW30プリウス専用のOBDリアルタイムメーターアプリ。
Androidタブレット（10"以上・横向き固定）で動作し、ELM327 Bluetooth経由でOBDデータを取得・表示する。

## 技術スタック

- **フレームワーク**: React Native + TypeScript
- **Bluetooth**: react-native-ble-plx
- **メーター描画**: react-native-svg + react-native-reanimated
- **チャート**: victory-native
- **ストレージ**: expo-sqlite (ローカルDB)
- **状態管理**: zustand
- **テスト**: jest + @testing-library/react-native

## アーキテクチャ

```
src/
├── bluetooth/          # ELM327 BLE通信層
│   ├── BleManager.ts   # BLE接続管理
│   └── Elm327.ts       # ELM327プロトコル
├── obd/                # OBD-IIプロトコル
│   ├── pid/            # PID定義・デコード
│   │   ├── standard.ts # 標準OBD-II PID
│   │   └── toyota.ts   # Toyota固有PID (ZVW30)
│   ├── protocol.ts     # OBD通信プロトコル
│   └── types.ts        # 型定義
├── components/         # UIコンポーネント
│   ├── meters/         # メーターウィジェット
│   ├── charts/         # チャート表示
│   └── layout/         # レイアウト管理
├── screens/            # 画面
│   ├── DashboardScreen.tsx   # メインダッシュボード
│   ├── LogScreen.tsx         # データログ一覧
│   ├── AnalysisScreen.tsx    # 燃費分析
│   ├── SettingsScreen.tsx    # 設定
│   └── ConnectionScreen.tsx  # BLE接続画面
├── storage/            # データ永続化
│   ├── database.ts     # SQLiteスキーマ・操作
│   └── logWriter.ts    # ログ書き込み
├── analysis/           # 燃費分析ロジック
│   └── fuelAnalysis.ts
├── store/              # 状態管理 (zustand)
│   ├── obdStore.ts     # OBDデータストア
│   ├── connectionStore.ts
│   └── settingsStore.ts
└── utils/              # ユーティリティ
```

---

## Phase 1: プロジェクト基盤セットアップ

- [x] P1-1: React Native プロジェクト初期化 (TypeScript テンプレート)
- [x] P1-2: 基本ディレクトリ構造の作成
- [x] P1-3: 依存パッケージのインストール
- [x] P1-4: Android固有設定 (Bluetooth権限, 横向き固定)
- [x] P1-5: ESLint + Prettier 設定
- [x] P1-6: Jest テスト環境セットアップ

## Phase 2: Bluetooth & ELM327通信

- [x] P2-1: BLE接続マネージャー実装 (スキャン・接続・切断・再接続)
- [x] P2-2: ELM327初期化コマンド送信 (ATZ, ATE0, ATL0, ATS0, ATH0, ATSP0)
- [x] P2-3: ELM327レスポンスパーサー実装
- [x] P2-4: OBDコマンド送受信ラッパー
- [x] P2-5: 接続状態管理 (zustand store)
- [x] P2-6: BLE接続画面UI (デバイス一覧・接続状態表示)
- [x] P2-7: 接続エラーハンドリング・自動再接続

## Phase 3: OBD-II PID処理

- [x] P3-1: 標準OBD-II PID定義 (Mode 01) - 22 PIDs
- [x] P3-2: PIDレスポンスデコーダー実装
- [x] P3-3: サポートPID自動検出 (0100, 0120, 0140)
- [x] P3-4: マルチPIDリクエスト最適化 (ポーリング間隔制御)
- [x] P3-5: PID型定義 (TypeScript型安全性確保)

## Phase 4: Toyota固有PID (ZVW30プリウス)

- [x] P4-1: ZVW30固有PID定義 (8 PIDs: SOC, 電圧, 電流, MG1/MG2, インバーター温度, バッテリー温度, EVモード)
- [x] P4-2: Toyota拡張PIDデコーダー実装
- [x] P4-3: Toyota PIDプローブ関数

## Phase 5: リアルタイムメーターUI

- [x] P5-1: 円形アナログゲージコンポーネント (SVG, 270度アーク, アニメーション)
- [x] P5-2: バーメーターコンポーネント (グラデーション)
- [x] P5-3: デジタル数値表示コンポーネント (フェードアニメーション)
- [x] P5-4: HVバッテリーインジケーター (SOC, 充放電アニメーション)
- [x] P5-5: ダッシュボード画面レイアウト (10"横向き最適化)
- [x] P5-6: リアルタイムデータバインディング (OBD → UI)
- [ ] P5-7: メーター配置カスタマイズ機能 (将来対応)

## Phase 6: データログ機能

- [x] P6-1: SQLiteスキーマ設計 (sessions, data_points テーブル)
- [x] P6-2: ログセッション管理 (バッファ付きライター)
- [x] P6-3: バックグラウンドデータ記録 (50件バッチ, 5秒フラッシュ)
- [x] P6-4: ログ一覧画面 (セッション詳細, スパークライン)
- [x] P6-5: CSVエクスポート機能 (Share API連携)

## Phase 7: 燃費分析

- [x] P7-1: 瞬間燃費計算ロジック (MAF + 速度ベース, 空燃比14.7)
- [x] P7-2: 区間平均燃費計算 (台形積分)
- [x] P7-3: 燃費推移グラフ表示 (victory-native CartesianChart)
- [x] P7-4: EV走行率表示 (ZVW30固有)
- [x] P7-5: 分析画面UI (サマリカード + リアルタイムグラフ + 統計)

## Phase 8: 設定・仕上げ

- [x] P8-1: 設定画面 (ポーリング間隔, 自動再接続, 単位系, 画面常時点灯)
- [x] P8-2: テーマ設定 (ダークテーマ実装済み)
- [x] P8-3: 画面常時点灯 (KeepAwake)
- [x] P8-4: ナビゲーション (Bottom Tabs, 4画面)
- [x] P8-5: 接続状態バー (BLE状態 + REC点滅)
- [ ] P8-6: アプリアイコン・スプラッシュスクリーン (将来対応)
- [ ] P8-7: パフォーマンス最適化・結合テスト (将来対応)

---

## ステータス

| Phase | 状態 | 備考 |
|-------|------|------|
| Phase 1 | ✅ 完了 | プロジェクト基盤 |
| Phase 2 | ✅ 完了 | BLE通信 |
| Phase 3 | ✅ 完了 | 標準PID (22種) |
| Phase 4 | ✅ 完了 | Toyota PID (8種) |
| Phase 5 | ✅ 完了 | メーターUI (カスタマイズ以外) |
| Phase 6 | ✅ 完了 | データログ |
| Phase 7 | ✅ 完了 | 燃費分析 |
| Phase 8 | ✅ 完了 | 設定・ナビゲーション (アイコン以外) |

## 残タスク (将来対応)
- [ ] メーター配置カスタマイズ (ドラッグ&ドロップ)
- [ ] アプリアイコン・スプラッシュスクリーン
- [ ] パフォーマンス最適化 (60fps)
- [ ] 全体結合テスト
- [ ] Inter フォントファイル配置 (assets/fonts/inter-medium.ttf)
