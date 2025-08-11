// ==============================
// タイムライン解析ユーティリティ
// ==============================

/**
 * 入力テキストの表記ゆれを正規化
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
  return text
  .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)) // 全角数字→半角
  .replace(/：/g, ':')
  .replace(/[［｛]/g, '[')
  .replace(/[］｝]/g, ']')
  .replace(/．/g, '.')
  .replace(/，/g, ',')
  .replace(/\{/g, '[')
  .replace(/\}/g, ']')
  .replace(/　/g, ' ')
  .replace(/[ \t]/g, ''); // 改行以外の空白・タブ除去
}

/**
 * タイム文字列を秒数に変換
 * @param {string} timeStr
 * @returns {number|null}
 */
function parseTimeToSeconds(timeStr) {
  const clean = timeStr.replace(/[^0-9:.]/g, '');
  if (clean !== timeStr || clean === '') return null;
  if (clean.includes(':')) {
    const [min, sec] = clean.split(':');
    return (parseFloat(min) || 0) * 60 + (parseFloat(sec) || 0);
  } else if ((clean.match(/\./g) || []).length === 2) {
    const [min, sec, ms] = clean.split('.');
    return (parseFloat(min) || 0) * 60 + (parseFloat(sec) || 0) + (parseFloat('0.' + ms) || 0);
  } else if (clean.includes('.')) {
    return parseFloat(clean) || null;
  } else {
    const num = parseFloat(clean);
    return isNaN(num) ? null : num;
  }
}

/**
 * タイムライン入力を正規化・秒数変換
 * @param {string} inputText
 * @returns {string}
 */
function processTimelineInput(inputText) {
  const lines = normalizeText(inputText).split('\n');
  return lines.map(line => {
    if (!line.trim()) return '';
    const idx = line.indexOf('[');
    if (idx > 0) {
      const sec = parseTimeToSeconds(line.substring(0, idx));
      return sec !== null ? `${sec.toFixed(2)}秒 ${line.substring(idx)}` : line;
    }
    return line;
  }).join('\n');
}

/**
 * タイムライン1行を解析しイベント情報抽出
 * @param {string} line
 * @returns {Object|null}
 */
function parseTimelineEvent(line) {
  if (!line || !line.trim()) return null;
  let txt = line;
  let time = null, costBefore = null, eventName = null, costUsed = 0;
  // 1. 時間情報抽出
  const timeMatch = txt.match(/^([0-9:.]+)/);
  if (timeMatch) {
    time = parseTimeToSeconds(timeMatch[1]);
    txt = txt.substring(timeMatch[1].length);
  }
  // 2. 最初の[数値]をコストとして抽出
  const firstBracket = txt.match(/^\[([^\]]+)\]/);
  if (firstBracket) {
    const val = parseFloat(firstBracket[1]);
    if (!isNaN(val)) {
      costBefore = val;
      txt = txt.substring(firstBracket[0].length);
    } else {
      eventName = firstBracket[1];
      txt = txt.substring(firstBracket[0].length);
    }
  }
  // 3. イベント名抽出
  if (eventName === null) {
    const nextBracket = txt.indexOf('[');
    if (nextBracket > 0) {
      eventName = txt.substring(0, nextBracket);
      txt = txt.substring(nextBracket);
    } else if (nextBracket === -1 && txt.length > 0) {
      eventName = txt;
      txt = '';
    }
  }
  // 4. 最後の[数値]をスキル使用コストとして抽出
  const lastBracket = txt.match(/\[([^\]]+)\]$/);
  if (lastBracket) {
    const val = parseFloat(lastBracket[1]);
    if (!isNaN(val)) costUsed = val;
  }
  // イベント名必須
  if (!eventName || !eventName.trim()) return null;
  // 時間・コスト未指定時はスキル使用コストを使用前コストに
  if (time === null && costBefore === null) costBefore = costUsed;
  return {
    time,
    cost_before_use: costBefore,
    event_name: eventName.trim(),
    cost_used: costUsed
  };
}

/**
 * タイムライン方向（forward/backward）判定
 * @param {Array} events
 * @returns {string}
 */
function detectTimelineDirection(events) {
  const times = events.map(e => e.time).filter(t => t !== null && t !== undefined);
  if (times.length < 2) return 'backward';
  let fwd = 0, bwd = 0;
  for (let i = 1; i < times.length; i++) {
    if (times[i] > times[i - 1]) fwd++;
    else if (times[i] < times[i - 1]) bwd++;
  }
  return bwd >= fwd ? 'backward' : 'forward';
}

/**
 * タイムラインテキスト→イベント配列
 * @param {string} inputText
 * @returns {Array}
 */
function parseTimelineToJSON(inputText) {
  return normalizeText(inputText)
    .split('\n')
    .map(parseTimelineEvent)
    .filter(e => e !== null);
}
