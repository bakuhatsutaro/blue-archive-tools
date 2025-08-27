/**
 * TL Assistant 共通ライブラリ
 * input-processor.jsとtl-editor.jsで共有される機能を提供
 * 
 * 【概要】
 * - utilities.jsからの関数参照を一元化
 * - 両ファイルで共通で使用される定数・ユーティリティ関数
 * - グローバル変数の重複を避けて、クリーンな名前空間を提供
 * 
 * 【エクスポート内容】
 * - TimeUtils: 時間・フレーム変換関数群
 * - Constants: 共通定数
 * - Common: 共通ユーティリティ関数
 */

console.log('tl-common.js: 共通ライブラリ開始');

// ==============================
// 1. 外部依存関数の参照
// ==============================

let commonUtils = null;

if (typeof module !== 'undefined' && module.exports) {
  // Node.js環境
  commonUtils = require('./utilities.js');
} else if (typeof window !== 'undefined' && window.Utilities) {
  // ブラウザ環境
  commonUtils = window.Utilities;
} else {
  throw new Error('utilities.js が読み込まれていません。先に utilities.js を読み込んでください。');
}

// ==============================
// 2. 共通定数
// ==============================

/**
 * コスト計算の共通定数
 */
const COST_CONSTANTS = {
  COST_POINT_UNIT: 30 * 10000,  // コスト1.0 = 300,000ポイント
  MIN_COST: 0,
  MAX_COST: 20,
  PRECISION_DIGITS: 1
};

// ==============================
// 3. 時間・フレーム変換ユーティリティ
// ==============================

/**
 * 時間・フレーム変換関数群
 */
const TimeUtils = {
  /**
   * 時間文字列を秒に変換
   * @param {string} timeStr - "1:30"形式の時間文字列
   * @param {Object} settings - 設定オブジェクト（time_display_format, battle_timeを含む）
   * @param {boolean} flag_modifier - 修飾子処理フラグ（デフォルト：false）
   * @returns {number} 秒数
   */
  parseTimeToSeconds(timeStr, settings = {}, flag_modifier = false) {
    let timeSeconds = commonUtils.parseTimeToSeconds(timeStr);
    
    // 修飾子処理時は backward/forward 変換をスキップ
    if (!flag_modifier && settings.time_display_format === 'backward') {
      const battleTime = settings.battle_time || 180;
      timeSeconds = battleTime - timeSeconds;
    }
    
    return timeSeconds;
  },

  /**
   * 秒をフレーム数に変換
   * @param {number} seconds - 秒数
   * @returns {number} フレーム数
   */
  secondsToFrames(seconds) {
    return commonUtils.secondsToFrames(seconds);
  },

  /**
   * フレーム数を秒に変換
   * @param {number} frames - フレーム数
   * @returns {number} 秒数
   */
  framesToSeconds(frames) {
    return commonUtils.framesToSeconds(frames);
  },

  /**
   * フレーム計算（utilities.jsのcalculateFrame）
   * @param {number} time - 時間
   * @returns {number} フレーム数
   */
  calculateFrame(time) {
    return commonUtils.calculateFrame(time);
  }
};

// ==============================
// 4. 共通ユーティリティ関数
// ==============================

/**
 * 共通ユーティリティ関数群
 */
const CommonUtils = {
  /**
   * テキストの正規化
   * @param {string} text - 正規化対象のテキスト
   * @returns {string} 正規化されたテキスト
   */
  normalizeText(text) {
    return commonUtils.normalizeText(text);
  }
};

// ==============================
// 5. デバッグ・ログユーティリティ
// ==============================

// ==============================
// 6. モジュールエクスポート
// ==============================

console.log('tl-common.js: エクスポート処理開始');

// エクスポートオブジェクト
const TLCommon = {
  // 定数
  COST_CONSTANTS,
  
  // ユーティリティ関数群
  TimeUtils,
  CommonUtils,
  
  // 下位互換性のための直接アクセス
  parseTimeToSeconds: TimeUtils.parseTimeToSeconds.bind(TimeUtils),
  secondsToFrames: TimeUtils.secondsToFrames.bind(TimeUtils),
  framesToSeconds: TimeUtils.framesToSeconds.bind(TimeUtils),
  calculateFrame: TimeUtils.calculateFrame.bind(TimeUtils),
  normalizeText: CommonUtils.normalizeText.bind(CommonUtils)
};

// モジュールとしてエクスポート
if (typeof module !== 'undefined' && module.exports) {
  console.log('tl-common.js: Node.js環境でエクスポート');
  module.exports = TLCommon;
} else if (typeof window !== 'undefined') {
  console.log('tl-common.js: ブラウザ環境でエクスポート');
  window.TLCommon = TLCommon;
  console.log('tl-common.js: window.TLCommon =', window.TLCommon);
}

console.log('tl-common.js: 共通ライブラリ初期化完了');
