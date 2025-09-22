/**
 * ユーザー入力処理ライブラリ
 * 仕様に基づいてinput_originalからinput_jsonへの変換を行う
 * 
 * 【目次・構成】
 * 1. 外部依存関数の参照
 * 
 * 2. 前処理 (Step 0)
 *    - normalizeText(): 文書の整形
 * 
 * 3. 文字列分解処理 (Step 1.1-2.2)
 *    - extractReference(): ラベル参照の抽出
 *    - splitIntoThreeParts(): beginning/event_name/endingへの3分割
 *    - processBeginning(): beginning部分の解析（時間・コスト・修飾子）
 *    - processEnding(): ending部分の解析（ラベル・コスト使用量）
 * 
 * 4. メイン処理
 *    - createInputJSON(): input_originalからinput_jsonへの変換
 * 
 * 5. モジュールエクスポート
 */

console.log('input-processor.js: スクリプト開始');

// ==============================
// 1. 外部依存関数の参照
// ==============================

// 共通ライブラリの参照（関数名の重複を避けるため直接参照）
const InputProcessorCommon = (() => {
  if (typeof module !== 'undefined' && module.exports) {
    // Node.js環境
    return require('./utilities.js');
  } else if (typeof window !== 'undefined' && window.Utilities) {
    // ブラウザ環境
    return window.Utilities;
  } else {
    throw new Error('utilities.js が読み込まれていません。先に utilities.js を読み込んでください。');
  }
})();

// ==============================
// 0. 前処理
// ==============================

/**
 * Step 0: 文書の整形
 * @param {string} text - 整形対象の文字列
 * @returns {string} 整形済み文字列
 */
function normalizeText(text) {
  if (typeof text !== 'string') {
    return '';
  }
  
  // 前後の空白を削除し、全角スペースを半角スペースに変換、全角！を半角!に変換
  return text.trim().replace(/　/g, ' ').replace(/！/g, '!');
}

// ==============================
// 1. 文字列分解処理 (Step 1.1-2.2)
// ==============================

/**
 * 文字列分解 Step 1.1：ラベル参照情報(reference)の抽出
 * @param {string} line - 解析対象の行
 * @returns {Object} { reference, remainingText }
 */
function extractReference(line) {
    let reference = null;
    let remainingText = line;

    // 行頭が#で始まる場合の処理
    if (line.startsWith('#')) {
        // +, -, または空白が最初に現れるまでの最長の文字列を抽出
        const match = line.match(/^#([^+\-\s]*)/);
        if (match) {
            reference = '#' + match[1];
            remainingText = line.substring(reference.length);
        }
    }
    
    return { reference, remainingText };
}

/**
 * 文字列分解 Step 1.2：3分割の実行
 * beginning, event_name, endingに分解
 * @param {string} text - 分解対象の文字列
 * @returns {Object} { beginning, event_name, ending }
 */
function splitIntoThreeParts(text) {
  // beginning: 行頭から始まり、数字・記号・空白・AUTOのみで構成される最長の文字列
  const beginningMatch = text.match(/^(?:AUTO|[0-9\s\[\]:\.+\-])*/i);
  const beginning = beginningMatch ? beginningMatch[0] : '';
  
  const afterBeginning = text.substring(beginning.length);
  
  // event_name: [, 空白, #, ⟨, < のいずれかが最初に出現するまでの部分文字列
  const eventMatch = afterBeginning.match(/^[^\[\s#⟨<]*/);
  const event_name = eventMatch ? eventMatch[0] : '';
  
  // ending: event_nameの直後から行末までの残りの文字列
  const ending = afterBeginning.substring(event_name.length);

  return { beginning, event_name, ending };
}

/**
 * 文字列分解 Step 2.1: beginningの処理
 * Step 1では行から行頭のラベル情報（reference）を抽出し、その後beginning, event_name, endingに分解
 * この関数ではbeginning部分の処理を行う
 * 【処理の内容】
 * ２つの大きく異なるケースに分けて処理を行う
 * 1. referenceが存在しない場合
 *    - 時間指定を優先して確認し、存在する場合は秒数を抽出
 *    - 時間指定が存在しない場合のみ、コスト指定を確認し、存在する場合はコストを抽出
 * 2. referenceが存在する場合
 *    - referenceで与えられるラベルの指定時間に対し、時間を追加するか減少させるかの情報(modifier)を抽出
 *    - その後、何秒の時間を追加または減少させるか(modified_amount)を抽出
 * @param {string} beginning - beginning文字列
 * @param {string|null} reference - ラベル参照（reference）
 * @param {Object} settings - 設定オブジェクト（number_interpretationを含む）
 * @returns {Object} 処理結果のオブジェクト
 */
function processBeginning(beginning, reference, settings = {}) {
  const result = {
    time: null,
    cost_timing: null,
    modifier: null,
    modified_amount: null,
    is_auto: false
  };

  // beginningになにも含まれない場合は何もしない
  if (!beginning) {
    return result;
  }

  // デフォルト設定
  console.log('processBeginning: 受け取ったsettings =', settings);
  const numberInterpretation = settings.number_interpretation || 'cost';
  const timeInterpretation = settings.time_display_format || 'backward'; // 'forward' または 'backward'
  const battleTime = settings.battle_time || 240;
  console.log('processBeginning: 解釈設定 =', { numberInterpretation, timeInterpretation, battleTime });

  // AUTO文字列の検出と除去
  let processedBeginning = beginning;
  if (processedBeginning.toUpperCase().includes('AUTO')) {
    result.is_auto = true;
    // AUTO文字列を除去（大文字小文字を問わず）
    processedBeginning = processedBeginning.replace(/AUTO/gi, '').trim();
  }
  
  // referenceが存在しない場合（空文字列またはnull）
  if (!reference) {
    // "["が含まれる場合その前に空白を挿入
    if (processedBeginning.includes('[')) {
      processedBeginning = processedBeginning.replace(/\[/g, ' [');
    }

    // 空白区切りで最初の非空文字列を抽出
    const tokens = processedBeginning.split(' ').filter(token => token.length > 0);
    if (tokens.length === 0) {
      return result;
    }

    const time_or_cost_timing = tokens[0];

    // []で囲まれているかをチェック
    const costMatch = time_or_cost_timing.match(/\[([^\]]*)\]/);
    
    if (costMatch) {
      // []で囲まれている場合は常にコスト指定として処理
      const cost_timing_str = costMatch[1];
      const cost_timing_float = parseFloat(cost_timing_str);
      
      if (!isNaN(cost_timing_float)) {
        result.cost_timing = cost_timing_float;
        result.explicit_cost_timing = true; // 明示的なコスト指定フラグ
      }
      // キャストができない場合はタイム・コスト指定なしとして扱う（何もしない）
    } else if (time_or_cost_timing.includes(':')) {
      // ":"が含まれる場合は設定に関係なく常にタイムとして解釈
      result.time = InputProcessorCommon.parseTimeToSeconds(time_or_cost_timing, settings);
    } else {
      // []で囲まれておらず":"も含まれていない場合は設定に基づいて判断
      if (numberInterpretation === 'time') {
        // タイムとして解釈
        result.time = InputProcessorCommon.parseTimeToSeconds(time_or_cost_timing, settings);
      } else if (numberInterpretation === 'cost') {
        // コストタイミングとして解釈
        const cost_timing_float = parseFloat(time_or_cost_timing);
        if (!isNaN(cost_timing_float)) {
          result.cost_timing = cost_timing_float;
        }
      }
    }
  } else {
    // referenceが存在する場合
    
    // beginningから+か-が含まれているか確認
    const plusIndex = processedBeginning.indexOf('+');
    const minusIndex = processedBeginning.indexOf('-');
    
    if (plusIndex !== -1) {
      result.modifier = '+';
      processedBeginning = processedBeginning.replace('+', '');
    } else if (minusIndex !== -1) {
      result.modifier = '-';
      processedBeginning = processedBeginning.replace('-', '');
    }

    // 空白区切りで最初の非空文字列を抽出
    const tokens = processedBeginning.split(' ').filter(token => token.length > 0);
    if (tokens.length > 0) {
      const timeStr = tokens[0];
      // 修飾子処理時は flag_modifier = true を渡して backward/forward 変換をスキップ
      result.modified_amount = InputProcessorCommon.parseTimeToSeconds(timeStr, settings, true);
    }
  }

  return result;
}

/**
 * 文字列分解 Step 2.2：ending部分の処理
 * ending部分から以下の情報を抽出する：
 * 1. ラベル情報（label）: #で始まり空白や[で区切られるまでの文字列
 * 2. コスト使用量（cost_used）: 数字と"."のみで構成される文字列（[]囲みも対応）
 * 
 * 【処理の流れ】
 * 1. #で始まるラベル情報を検索・抽出し、ending文字列から削除
 * 2. 残った文字列から数字（[]で囲まれている場合も含む）を検索してコスト使用量として抽出
 * 3. 処理後の残り文字列は使用しないが、念のためremaining_endingとして保持
 * 
 * 新しい処理として特殊コマンドの秒数指定等が入っている可能性も扱う
 * 具体的には
 * 1) 量を表す数字（将来的には%も指定）
 * 2) 秒数
 * も含まれている可能性を加味して処理を行う
 * 
 * @param {string} ending - ending文字列
 * @returns {Object} { label, cost_used, remaining_ending }
 */
function processEnding(ending) {
  const result = {
    label: null,
    cost_used: null,
    value: null,
    duration: null,
    target: null,
    remaining_ending: ending
  };

  if (!ending) {
    return result;
  }

  let processedEnding = ending;

  // #文字列を探す
  const hashIndex = processedEnding.indexOf('#');
  if (hashIndex !== -1) {
    // #以降の文字列を取得
    const afterHash = processedEnding.substring(hashIndex);
    
    // #と空白文字あるいは[あるいは⟨あるいは<の間に挟まれる範囲で文字列を取得
    const labelMatch = afterHash.match(/^#([^\s\[⟨<]*)/);
    if (labelMatch) {
      result.label = '#' + labelMatch[1]; // #を含む形で保存
      
      // その文字列の部分（#を含む）をendingから削除
      const labelToRemove = labelMatch[0];
      processedEnding = processedEnding.replace(labelToRemove, '');
    }
  }

  // 空白区切りで数字と"."だけから構成される最初の文字列を取得
  // []、⟨⟩、<>に囲まれた数字の場合は囲み文字を無視して数字部分を抽出
  const tokens = processedEnding.split(/\s+/).filter(token => token.length > 0);
  
  // 特殊コマンド用：数値を順次検出するためのフラグ
  let valueSet = false;
  let durationSet = false;
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    
    // target抽出：数字や-,.,カッコ系の記号以外の文字も含むもので一番最初のものをtargetとする
    if (result.target === null) {
      // 数字、-、.、カッコ系の記号（[], ⟨⟩, <>, ()）のみで構成されているかチェック
      const isOnlyNumbersAndSymbols = /^[\d\-\.\[\]⟨⟩<>()秒sSs]*$/.test(token);
      
      // 数字や記号以外の文字も含む場合、それをtargetとして保存
      if (!isOnlyNumbersAndSymbols) {
        result.target = token;
        continue; // targetが見つかったら数値処理はスキップ
      }
    }
    
    let numberStr = token;
    let isSurrounded = false; // 囲み文字があるかどうかのフラグ
    
    // []、⟨⟩、<>のいずれかで囲まれている場合は囲み文字を除去
    const surroundedMatch = token.match(/^[\[⟨<]([^\]⟩>]+)[\]⟩>]$/);
    if (surroundedMatch) {
      isSurrounded = true;
      numberStr = surroundedMatch[1];
    }

    // 秒数パターンの検出
    let isSeconds = false;
    if (/秒|s|S/.test(numberStr)) {
      isSeconds = true;
      numberStr = numberStr.replace(/(.*?)(秒|s|S).*/, '$1');
    }
    
    // parseFloat()で数値変換を試行
    const extractedNumber = parseFloat(numberStr);
    
    if (!isNaN(extractedNumber)) {
      if (isSeconds) {
        if (result.duration === null) {
          result.duration = extractedNumber;
          durationSet = true;
        }
      } else if (isSurrounded) {
        // []で囲まれている場合は常にcost_used
        if (result.cost_used === null) {
          result.cost_used = extractedNumber;
        }
      } else {
        // 囲み文字がない数値の場合、cost_usedとvalue両方に設定を試みる
        if (result.cost_used === null) {
          result.cost_used = extractedNumber;
        }
        if (!valueSet && result.value === null) {
          // 最初の数値をvalueに設定
          result.value = extractedNumber;
          valueSet = true;
        } // 2つ目以降の数値は秒数指定出ない限りは無視
      }
    }
  }

  // 残りのending部分を更新
  result.remaining_ending = processedEnding.trim();

  return result;
}

/*
/**
 * フレーム変換情報を含むrow_objectを拡張して作成
 * @param {string} input_original - ユーザー入力文字列
 * @param {string} direction - タイムライン方向（'forward' or 'backward'）
 * @param {number} totalTime - 総戦闘時間（秒）
 * @returns {Array} input_json配列（フレーム情報付き）
 */
/*
function processUserInputWithFrames(input_original, direction = 'forward', totalTime = 180) {
  const input_json = createInputJSON(input_original);
  
  // 各要素にフレーム情報を追加
  return input_json.map(row_object => {
    const enhanced = { ...row_object };
    
    if (enhanced.time !== null) {
      enhanced.frame = calculateFrame(enhanced.time, direction, totalTime);
    }
    
    if (enhanced.modified_amount !== null) {
      enhanced.modified_amount_frames = InputProcessorCommon.secondsToFrames(enhanced.modified_amount);
    }
    
    return enhanced;
  });
}
*/

// ==============================
// 4. メイン処理
// ==============================

/**
 * メイン処理：input_originalからinput_jsonへの変換
 * 各行(rowLine)に対し以下の処理を行う：
 *   - Step 0-2.2までの処理を順次行い結果を一つのobjectにまとめる(row_object)
 *   - これをinput_jsonに追加する
 * @param {string} input_original - ユーザー入力文字列
 * @param {Object} settings - 設定オブジェクト
 * @returns {Array} input_json - 配列
 */
function createInputJSON(input_original, settings = {}) {
  console.log('createInputJSON called with settings:', settings);
  
  if (typeof input_original !== 'string') {
    return [];
  }

  const lines = input_original.split('\n');
  const input_json = [];

  for (const rawLine of lines) {
    // Step 0：文書の整形
    const normalizedLine = normalizeText(rawLine);
    
    // 空行は無視
    if (!normalizedLine) {
      continue;
    }

    // 行頭が!で始まる行（コメント行）は無視
    const is_comment = normalizedLine.startsWith('!');
    if (is_comment) {
      continue;
    }

    // Step 1.1：ラベル参照の抽出
    const { reference, remainingText } = extractReference(normalizedLine);

    // Step 1.2：3分割の実行
    const { beginning, event_name, ending } = splitIntoThreeParts(remainingText);

    // event_nameが空の場合はフォーマットを満たさない行として無視
    if (!event_name) {
      continue;
    }

    // Step 2.1：beginningの処理
    const beginningResult = processBeginning(beginning, reference, settings);

    // Step 2.2：ending部分の処理
    const endingResult = processEnding(ending);

    // cost_timingとcost_usedの調整
    let finalCostTiming = beginningResult.cost_timing;
    let finalCostUsed = endingResult.cost_used;

    // cost_timingが空でcost_usedが存在する場合、cost_timingにcost_usedと同じ値を設定
    if (finalCostTiming === null && finalCostUsed !== null) {
      finalCostTiming = finalCostUsed;
    }

    // cost_usedがnullの場合は明示的に0に設定
    if (finalCostUsed === null) {
      finalCostUsed = 0;
    }

    // row_objectの構築
    const row_object = {
      reference: reference,
      time: beginningResult.time,
      cost_timing: finalCostTiming,
      modifier: beginningResult.modifier,
      modified_amount: beginningResult.modified_amount,
      is_auto: beginningResult.is_auto,
      event_name: event_name,
      label: endingResult.label,
      cost_used: finalCostUsed,
      value: endingResult.value,        // 特殊コマンド用の値
      duration: endingResult.duration,  // 特殊コマンド用の秒数
      target: endingResult.target,      // 特殊コマンド用のターゲット
      ending: ending, // オリジナルのending文字列を保存
      ending_processed: endingResult.remaining_ending, // 加工後の文字列も保存
      original_line: rawLine, // デバッグ用
      note: [] // エラーや警告メッセージを格納する配列として初期化
    };

    // input_jsonに追加
    input_json.push(row_object);
  }

  return input_json;
}

// ==============================
// 5. モジュールエクスポート
// ==============================

// モジュールとしてエクスポート（ブラウザ環境では window オブジェクトに追加）
if (typeof module !== 'undefined' && module.exports) {
  console.log('input-processor.js: Node.js環境でエクスポート');
  module.exports = {
    createInputJSON
  };
} else if (typeof window !== 'undefined') {
  console.log('input-processor.js: ブラウザ環境でエクスポート');
  window.InputProcessor = {
    createInputJSON
  };
  console.log('input-processor.js: window.InputProcessor =', window.InputProcessor);
}
