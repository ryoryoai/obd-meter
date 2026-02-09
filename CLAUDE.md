# OBD Meter - ZVW30 Prius Edition

## プロジェクト概要
ZVW30プリウス専用OBDリアルタイムメーターアプリ (Android タブレット)

## 技術スタック
- React Native + TypeScript
- ELM327 Bluetooth (react-native-ble-plx)
- zustand (状態管理)
- expo-sqlite (ローカルDB)
- react-native-svg + react-native-reanimated (メーターUI)
- victory-native (チャート)

## ワークフロー
- **計画・設計・レビュー**: Claude (Opus 4.6)
- **実装**: Codex CLI (`/codex` スキル経由)
- **進捗管理**: Plans.md

## コーディング規約
- TypeScript strict mode
- 関数コンポーネント + hooks
- ファイル名: PascalCase (コンポーネント), camelCase (ユーティリティ)
- テスト: `__tests__/` ディレクトリ or `*.test.ts(x)`

## 対象車両
- ZVW30 プリウス (3代目, 2009-2015)
- 標準OBD-II PID + Toyota固有PID対応

## 画面仕様
- 10インチ以上タブレット横向き固定
- 昼間/夜間モード対応
