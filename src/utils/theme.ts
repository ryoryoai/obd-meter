/**
 * OBD Meter - 統一テーマ定数
 *
 * 全画面・全コンポーネントでこのファイルのカラーを使用する。
 * Dark Mode (OLED) ベースの車載ダッシュボード向けパレット。
 */

export const THEME = {
  // ── 背景 ──
  bg: '#0a0a14',          // 最深背景 (OLED black寄り)
  bgCard: '#12122a',      // カード背景
  bgElevated: '#1a1a35',  // 浮き上がりカード / ヘッダー
  bgInput: '#0e0e20',     // 入力フィールド背景

  // ── ボーダー ──
  border: '#1e1e3a',       // 通常ボーダー
  borderSubtle: '#16162e', // 薄いボーダー
  borderFocus: '#00d4ff33', // フォーカス時ボーダー

  // ── プライマリ / アクセント ──
  primary: '#00d4ff',       // メインアクセント (シアン)
  primaryDim: '#00a8cc',    // 暗めプライマリ
  primaryGlow: '#00d4ff22', // グロー効果用

  accent: '#e94560',       // 危険・エラー (赤系)
  success: '#00ff88',      // 成功・正常 (緑)
  warning: '#ffd700',      // 警告 (イエロー)

  // ── テキスト ──
  text: '#e8eaf6',         // プライマリテキスト (やや青味白)
  textSecondary: '#8892a4', // セカンダリテキスト
  textDim: '#5a6478',       // 薄い補助テキスト
  textMuted: '#3a4258',     // 非常に薄いテキスト

  // ── セマンティック ──
  engineColor: '#ff6b35',   // エンジン表示
  batteryColor: '#00d4ff',  // バッテリー表示
  motorColor: '#00ff88',    // モーター表示
  wheelColor: '#ffd700',    // 駆動輪表示

  // ── 共通寸法 ──
  radiusSm: 6,
  radiusMd: 10,
  radiusLg: 14,

  // ── タブバー ──
  tabBarBg: '#0c0c1a',
  tabBarBorder: '#1a1a30',
  tabActive: '#00d4ff',
  tabInactive: '#4a5068',
} as const;

export type ThemeColors = typeof THEME;
