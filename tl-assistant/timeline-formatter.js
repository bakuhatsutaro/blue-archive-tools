/**
 * Timeline Formatter
 * timeline_json からテキスト形式のタイムラインを生成
 */

(function() {
  'use strict';

  console.log('timeline-formatter.js: スクリプト開始');

  // コストポイント変換定数
  const COST_POINT_UNIT = 30 * 10000;  // コスト1.0 = 300,000ポイント

  /**
   * 時間を mm:ss.fff 形式にフォーマット
   * @param {number} seconds - 秒数
   * @returns {string} フォーマットされた時間文字列
   */
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds <= 0) {
      return "00:00.000";
    }
    
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const wholeSeconds = Math.floor(secs);
    const milliseconds = Math.round((secs - wholeSeconds) * 1000);
    
    const result = `${minutes.toString().padStart(2, '0')}:${wholeSeconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
    
    return result;
  }

  /**
   * タイムライン行の生成（新フォーマット対応）
   * @param {Object} event - イベントデータ
   * @param {number} battleTime - 戦闘時間
   * @param {string} format - 出力フォーマット ('text' | 'html')
   * @returns {string} タイムライン行のテキスト
   */
  function generateTimelineLineNew(event, battleTime, format = 'text') {
    // フレーム数から時間を計算（30FPS前提）
    const timeFromFrame = event.frame ? (event.frame / 30.0) : 0;
    const remainingTime = battleTime - timeFromFrame;
    const gameTimeText = formatTime(remainingTime);
    
    // コストポイントからコスト値への変換
    const currentCost = event.remaining_cost_points ? (event.remaining_cost_points / COST_POINT_UNIT) : 0;
    const usedCost = event.cost_used || 0;
    
    // イベント名
    const eventName = event.event_name || 'イベント';
    
    // コストタイミング（使用時のコスト）
    const costTiming = usedCost > 0 ? (currentCost + usedCost) : currentCost;
    
    // 基本フォーマット: カウントダウン形式のタイム [コストタイミング] AUTO（もしあれば） イベント名
    let line = `${gameTimeText} [${costTiming.toFixed(1)}]`;
    
    // AUTO撃ちの場合はAUTO表示を追加
    if (event.is_auto) {
      line += ' AUTO';
    }
    
    line += ` ${eventName}`;
    
    // 使用コスト表示
    if (usedCost > 0) {
      if (format === 'html') {
        line += ` ⟨${Math.round(usedCost)}⟩`;
      } else {
        line += ` ${Math.round(usedCost)}`;
      }
    }
    
    // 残りコスト表示
    if (format === 'html') {
      line += ` <span style="color: blue;">${currentCost.toFixed(1)}</span>`;
    } else {
      line += ` 残:${currentCost.toFixed(1)}`;
    }
    
    // あふれたコスト表示（もしあふれたコストが>0なら）
    const overflowCost = event.overflow_cost || 0;
    if (overflowCost > 0) {
      if (format === 'html') {
        line += ` <span style="color: red;">${overflowCost.toFixed(1)}</span>`;
      } else {
        line += ` 溢:${overflowCost.toFixed(1)}`;
      }
    }

    // 警告文（note）の表示
    if (event.note && Array.isArray(event.note) && event.note.length > 0) {
      for (const noteText of event.note) {
        if (format === 'html') {
          line += ` <span style="color: red; font-weight: bold;">[${noteText}]</span>`;
        } else {
          line += ` [警告: ${noteText}]`;
        }
      }
    }
    
    return line;
  }

  /**
   * タイムライン行の生成（内部用・旧フォーマット）
   * @param {Object} event - イベントデータ
   * @param {number} battleTime - 戦闘時間
   * @returns {string} タイムライン行のテキスト
   */
  function generateTimelineLine(event, battleTime) {
    // フレーム数から時間を計算（30FPS前提）
    const timeFromFrame = event.frame ? (event.frame / 30.0) : 0;
    const remainingTime = battleTime - timeFromFrame;
    const gameTimeText = formatTime(remainingTime);
    
    // コストポイントからコスト値への変換
    const currentCost = event.remaining_cost_points ? (event.remaining_cost_points / COST_POINT_UNIT) : 0;
    const usedCost = event.cost_used || 0;
    
    // イベント名
    const eventName = event.event_name || 'イベント';
    
    // 時間表示
    let line = gameTimeText;
    
    // コスト情報表示[使用時コスト]
    if (usedCost > 0) {
      const costBeforeUse = currentCost + usedCost;
      line += ` [${costBeforeUse.toFixed(1)}]`;
    } else {
      line += ` [${currentCost.toFixed(1)}]`;
    }
    
    // AUTO撃ちの場合はAUTO表示を追加
    if (event.is_auto) {
      line += ' AUTO';
    }
    
    // イベント名
    line += ` ${eventName}`;
    
    // 使用コスト表示（空白区切り）
    if (usedCost > 0) {
      line += ` ${Math.round(usedCost)}`;
    }

    // 警告文（note）の表示（旧フォーマット用）
    if (event.note && Array.isArray(event.note) && event.note.length > 0) {
      for (const noteText of event.note) {
        line += ` [警告: ${noteText}]`;
      }
    }
    
    return line;
  }

  /**
   * timeline_json からテキスト形式のタイムラインを生成
   * @param {Object} timelineJSON - タイムラインのJSONデータ
   * @param {Object} settings - 設定オプション
   * @returns {string} テキスト形式のタイムライン
   */
  function generateTimelineText(timelineJSON, settings = {}) {
    console.log('generateTimelineText called with:', timelineJSON, settings);
    
    if (!timelineJSON || !timelineJSON.timeline) {
      throw new Error('無効なタイムラインデータです');
    }

    const timeline = timelineJSON.timeline;
    const battleTime = timelineJSON.metadata?.battle_time || settings.battle_time || 180;
    
    console.log('Timeline events:', timeline);
    console.log('Battle time:', battleTime);
    
    let textOutput = '';
    
    // ヘッダー情報
    textOutput += '=== タイムライン（処理済み） ===\n';
    textOutput += `戦闘時間: ${battleTime}秒\n`;
    textOutput += `総イベント数: ${timeline.length}\n`;
    if (timelineJSON.metadata?.final_cost !== undefined) {
      textOutput += `最終コスト: ${timelineJSON.metadata.final_cost.toFixed(2)}\n`;
    }
    textOutput += '\n';

    // タイムラインイベント
    for (const event of timeline) {
      console.log('Processing event:', event);
      
      const line = generateTimelineLine(event, battleTime);
      textOutput += line + '\n';
    }

    return textOutput;
  }

  /**
   * timeline_json からHTML形式のタイムラインを生成
   * @param {Object} timelineJSON - タイムラインのJSONデータ
   * @param {Object} settings - 設定オプション
   * @returns {string} HTML形式のタイムライン
   */
  function generateTimelineHTML(timelineJSON, settings = {}) {
    console.log('generateTimelineHTML called with:', timelineJSON, settings);
    
    if (!timelineJSON || !timelineJSON.timeline) {
      throw new Error('無効なタイムラインデータです');
    }

    const timeline = timelineJSON.timeline;
    const battleTime = timelineJSON.metadata?.battle_time || settings.battle_time || 180;
    
    // HTML形式の出力開始
    let htmlOutput = '<h3 style="margin: 0 0 12px 0; font-size: 1.1rem;">タイムライン（処理済み）</h3>';
    htmlOutput += '<pre style="line-height: 1.2; margin: 0; padding: 0; font-family: \'Courier New\', Courier, monospace; font-size: 13px; white-space: pre-wrap; overflow-x: auto; word-break: break-all;">';
    
    // 各イベントを処理
    for (const event of timeline) {
      const line = generateTimelineLine(event, battleTime);
      const usedCost = event.cost_used || 0;
      
      // HTML版では空白区切りの使用コストを削除してからlangle rangleで置換
      let htmlLine = line;
      if (usedCost > 0) {
        // 末尾の " 数字" パターンを削除
        htmlLine = htmlLine.replace(/ \d+$/, '');
        htmlLine += ` ⟨${Math.round(usedCost)}⟩`;
      }
      htmlOutput += htmlLine + '\n';
    }
    
    htmlOutput += '</pre>';
    
    return htmlOutput;
  }

  /**
   * timeline_json からHTML形式とテキスト形式のタイムラインを同時生成
   * @param {Object} timelineJSON - タイムラインのJSONデータ
   * @param {Object} settings - 設定オプション
   * @returns {Object} { html: string, text: string } - HTML形式とテキスト形式のタイムライン
   */
  function generateTimelineBoth(timelineJSON, settings = {}) {
    console.log('generateTimelineBoth called with:', timelineJSON, settings);
    
    if (!timelineJSON || !timelineJSON.timeline) {
      throw new Error('無効なタイムラインデータです');
    }

    const timeline = timelineJSON.timeline;
    const battleTime = timelineJSON.metadata?.battle_time || settings.battle_time || 180;
    
    // テキスト形式用の文字列を蓄積
    let textLines = [];
    
    // HTML形式の出力開始
    let htmlOutput = '<h3 style="margin: 0 0 12px 0; font-size: 1.1rem;">タイムライン（処理済み）</h3>';
    htmlOutput += '<pre style="line-height: 1.2; margin: 0; padding: 0; font-family: \'Courier New\', Courier, monospace; font-size: 13px; white-space: pre-wrap; overflow-x: auto; word-break: break-all;">';
    
    // 各イベントを処理
    for (const event of timeline) {
      const line = generateTimelineLine(event, battleTime);
      textLines.push(line);
      
      const usedCost = event.cost_used || 0;
      
      // HTML版では空白区切りの使用コストを削除してからlangle rangleで置換
      let htmlLine = line;
      if (usedCost > 0) {
        // 末尾の " 数字" パターンを削除
        htmlLine = htmlLine.replace(/ \d+$/, '');
        htmlLine += ` ⟨${Math.round(usedCost)}⟩`;
      }
      htmlOutput += htmlLine + '\n';
    }
    
    htmlOutput += '</pre>';
    
    // テキスト形式の完全版を組み立て
    let textOutput = '';
    textOutput += '=== タイムライン（処理済み） ===\n';
    textOutput += `戦闘時間: ${battleTime}秒\n`;
    textOutput += `総イベント数: ${timeline.length}\n`;
    if (timelineJSON.metadata?.final_cost !== undefined) {
      textOutput += `最終コスト: ${timelineJSON.metadata.final_cost.toFixed(2)}\n`;
    }
    textOutput += '\n';
    textOutput += textLines.join('\n');
    
    return {
      html: htmlOutput,
      text: textOutput
    };
  }

  /**
   * timeline_json から新フォーマットでHTML形式とテキスト形式のタイムラインを同時生成
   * @param {Object} timelineJSON - タイムラインのJSONデータ
   * @param {Object} settings - 設定オプション
   * @returns {Object} { html: string, text: string } - HTML形式とテキスト形式のタイムライン
   */
  function generateTimelineNew(timelineJSON, settings = {}) {
    console.log('generateTimelineNew called with:', timelineJSON, settings);
    
    if (!timelineJSON || !timelineJSON.timeline) {
      throw new Error('無効なタイムラインデータです');
    }

    const timeline = timelineJSON.timeline;
    const battleTime = timelineJSON.metadata?.battle_time || settings.battle_time || 180;
    
    // テキスト形式用の文字列を蓄積
    let textLines = [];
    
    // HTML形式の出力開始
    let htmlOutput = '<h3 style="margin: 0 0 12px 0; font-size: 1.1rem;">タイムライン（処理済み）</h3>';
    htmlOutput += '<div style="margin: 0 0 8px 0; font-size: 0.9rem; color: #666;">';
    htmlOutput += '<span style="color: blue;">■</span> 残りコスト　';
    htmlOutput += '<span style="color: red;">■</span> 溢れたコスト';
    htmlOutput += '</div>';
    htmlOutput += '<pre style="line-height: 1.2; margin: 0; padding: 0; font-family: \'Courier New\', Courier, monospace; font-size: 13px; white-space: pre-wrap; overflow-x: auto; word-break: break-all;">';
    
    // 各イベントを処理
    for (const event of timeline) {
      const textLine = generateTimelineLineNew(event, battleTime, 'text');
      const htmlLine = generateTimelineLineNew(event, battleTime, 'html');
      
      textLines.push(textLine);
      htmlOutput += htmlLine + '\n';
    }
    
    htmlOutput += '</pre>';
    
    // テキスト形式の完全版を組み立て
    let textOutput = '';
    textOutput += '=== タイムライン（処理済み） ===\n';
    textOutput += `戦闘時間: ${battleTime}秒\n`;
    textOutput += `総イベント数: ${timeline.length}\n`;
    if (timelineJSON.metadata?.final_cost !== undefined) {
      textOutput += `最終コスト: ${timelineJSON.metadata.final_cost.toFixed(2)}\n`;
    }
    textOutput += '\n';
    textOutput += textLines.join('\n');
    
    return {
      html: htmlOutput,
      text: textOutput
    };
  }

  // エクスポート
  const TimelineFormatter = {
    formatTime,
    generateTimelineLine,        // 旧フォーマット（後方互換性のため保持）
    generateTimelineLineNew,     // 新フォーマット対応
    generateTimelineText,        // 後方互換性のため保持
    generateTimelineHTML,        // 後方互換性を保持（HTML文字列のみ返す）
    generateTimelineBoth,        // 旧フォーマットでHTML形式とテキスト形式を同時生成
    generateTimelineNew          // 新フォーマットでHTML形式とテキスト形式を同時生成
  };

  console.log('timeline-formatter.js: エクスポート処理開始');

  // モジュールとしてエクスポート
  if (typeof module !== 'undefined' && module.exports) {
    console.log('timeline-formatter.js: Node.js環境でエクスポート');
    module.exports = TimelineFormatter;
  } else if (typeof window !== 'undefined') {
    console.log('timeline-formatter.js: ブラウザ環境でエクスポート');
    window.TimelineFormatter = TimelineFormatter;
    console.log('timeline-formatter.js: window.TimelineFormatter =', window.TimelineFormatter);
  }

  console.log('timeline-formatter.js: 初期化完了');

})();
