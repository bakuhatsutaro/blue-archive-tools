/**
 * 共通ユーティリティライブラリ
 * 時間変換、フレーム変換、文字列処理など共通機能を提供
 */

// ==============================
// 定数定義
// ==============================
const FPS = 30;  // 30 FPS

// ==============================
// 時間・フレーム変換ユーティリティ
// ==============================

/**
 * 時間文字列を秒数（浮動小数点）に変換
 * @param {string} timeStr - 時間文字列（例：2:34.543）
 * @returns {number|null} 秒数、変換できない場合はnull
 */
function parseTimeToSeconds(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') {
    return null;
  }

  // コロンが含まれる場合（分:秒.ミリ秒形式）
  if (timeStr.includes(':')) {
    const parts = timeStr.split(':');
    if (parts.length !== 2) {
      return null;
    }

    const minutes = parseFloat(parts[0]);
    const seconds = parseFloat(parts[1]);

    if (isNaN(minutes) || isNaN(seconds)) {
      return null;
    }

    return minutes * 60 + seconds;
  } else {
    // 秒のみの場合
    const seconds = parseFloat(timeStr);
    return isNaN(seconds) ? null : seconds;
  }
}

/**
 * 秒数をフレーム数に変換
 * @param {number} seconds - 秒数（浮動小数点可）
 * @returns {number} フレーム数（整数）
 */
function secondsToFrames(seconds) {
  if (typeof seconds !== 'number' || isNaN(seconds)) {
    return 0;
  }
  return Math.round(seconds * FPS);
}

/**
 * フレーム数を秒数に変換
 * @param {number} frames - フレーム数
 * @returns {number} 秒数（浮動小数点）
 */
function framesToSeconds(frames) {
  if (typeof frames !== 'number' || isNaN(frames)) {
    return 0;
  }
  return frames / FPS;
}

/**
 * 戦闘時間とタイムライン方向を考慮してフレーム数を計算
 * @param {number} timeInSeconds - 秒数
 * @param {string} direction - 方向性（'forward' or 'backward'）
 * @param {number} totalTime - 総戦闘時間（秒）
 * @returns {number} フレーム数
 */
function calculateFrame(timeInSeconds, direction = 'forward', totalTime = 180) {
  if (direction === 'forward') {
    // 経過時間での指定
    return secondsToFrames(timeInSeconds);
  } else {
    // 残り時間での指定（ゲーム内時間表記）
    return secondsToFrames(totalTime - timeInSeconds);
  }
}

// ==============================
// 文字列処理ユーティリティ
// ==============================

/**
 * 全角文字の半角化、前後の空白削除、連続空白の正規化
 * @param {string} text - 整形対象の文字列
 * @returns {string} 整形後の文字列
 */
function normalizeText(text) {
  if (typeof text !== 'string') {
    return '';
  }

  // 全角文字の半角化
  let normalized = text.replace(/[Ａ-Ｚａ-ｚ０-９！＠＃＄％＾＆＊（）＋＝｛｝［］｜￥：；"'＜＞？，．／｀～]/g, function(char) {
    return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
  });

  // 前後の空白削除
  normalized = normalized.trim();

  // 連続空白の正規化（複数の空白を半角スペース1つに）
  normalized = normalized.replace(/\s+/g, ' ');

  return normalized;
}

// ==============================
// モジュールエクスポート
// ==============================

// モジュールとしてエクスポート（ブラウザ環境では window オブジェクトに追加）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FPS,
    parseTimeToSeconds,
    secondsToFrames,
    framesToSeconds,
    calculateFrame,
    normalizeText
  };
} else if (typeof window !== 'undefined') {
  window.Utilities = {
    FPS,
    parseTimeToSeconds,
    secondsToFrames,
    framesToSeconds,
    calculateFrame,
    normalizeText
  };
}
