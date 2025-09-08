/**
 * TL Editor - タイムライン編集・計算ライブラリ
 * input_jsonからtimeline_jsonへの変換とコスト計算を担当
 * 
 * 【概要】
 * input_processor.jsで生成されたinput_jsonを受け取り、
 * フレーム情報や特殊処理を加えてtimeline_jsonを生成する。
 * また、コスト回復上昇バフなどの特殊イベントをadditional_eventsで管理する。
 * 
 * 【目次・構成】
 * 1. 外部依存関数の参照
 * 2. 定数・設定値
 * 3. データ構造定義
 * 4. 基本処理関数
 * 5. コスト計算関連
 * 6. 特殊イベント処理
 * 7. メイン変換処理
 * 8. ユーティリティ関数
 * 9. モジュールエクスポート
 */


/**
 * AI向け指示
 * 
 * A. ブルーアーカイブの仕様、特にコストに関する仕様
 * 
 * A.1. 時間
 * A.1.a. 多くの場合一つの戦闘の制限時間は180秒あるいは240秒である。
 * そのためhtmlで戦闘時間を180秒にするか240秒にするかはユーザーに選択させなくてはならない。
 * A.1.b. ブルーアーカイブの戦闘は30FPSである。すなわち0.033秒区切りで行動の入力やイベントの発生が処理される。
 * 少なくともそう考えられており、本スクリプトはその考えに従う。
 * （後述するように秒数は小数点第三位まで表示される）
 * A.1.c. ブルーアーカイブの時間表示はカウントダウンで形式であり、秒数は小数点第３位まで表示される。
 * 例えば戦闘時間が180秒の場合は3:00.000から時間がスタートし、2:59.967, 2:59.933, ...と時間が経過していく。
 * A.1.d コスト回復の発生は2秒(60フレーム)経過後であると考えられており、本スクリプトではそれに従う。
 * コスト発生の処理はA.2.で記述する。
 * 
 * A.2. コストの回復と使用
 * 
 * A.2.a. コスト回復力(cost recovery)は各生徒ごとに設定されており、この数値はバフあるいはデバフの発生などにより変化する。
 * ブルーアーカイブの戦闘では６人の生徒が参加し、それぞれ基礎値として700を持っており、その合計値は4200である。
 * 戦闘中に脱落する場合、その分総コスト回復力は減少する。
 * このスクリプトではコスト回復力に関する変数を単にcost recoveryとしているが、
 * 最終的には変数名をtotal cost recovery（総コスト回復力）とすることによって個人のレベルの回復力と区別する。
 * 
 * A.2.b. 総コスト回復力は、それを10000で割った数が1秒間に回復するコストの量である。例えば総コスト回復量が4200の場合、
 * 1秒ごとにコストは0.42回復する。50秒経過すると21コストとなるが、コストの上限を超えた分は溢れ、保存されない。
 * 
 * A.2.c. コストの上限は cost_max = 10, 10.5, 11の場合のみをいったん考える。
 * 制約解除決戦というコンテンツでは20から22までの数字が0.5刻みで発生し得るが、現段階では考えない。
 * 
 * A.2.d. 本スクリプトでは、コスト回復は内部的にフレーム単位で整数値で処理されていると想定する。
 * 具体的には、iフレーム目からi+1フレーム目に到達した場合、
 * iフレーム時点における総コスト回復力をコストポイント(cost points)として獲得するとみなす。
 * コストポイントは COST_POINTS_UNIT = 30 * 10000ポイントたまった段階で1コスト扱いとなり、
 * コストポイントの上限 cost_points_max = cost_max * COST_POINTS_UNIT を超えた場合は
 * 現状残っているコストポイント remaining_cost_points は cost_points_max に置換される。
 * 
 * 【重要】内部処理におけるフレーム単位計算の徹底
 * - 全ての内部計算はフレーム単位で行う
 * - 秒数ベース（recovery_per_second等）の計算は内部では使用しない
 * - 秒数への変換は最終的な表示段階でのみ行う
 * - この方針によりA.2.dの仕様に正確に準拠する
 * 
 * A.2.e. 使用コストが cost_used であるスキルを利用する場合は remaining_cost_points から
 * cots_used * COST_POINTS_UNIT を引くことで処理する。A.2.dで記述されているコスト回復処理と
 * どちらが先に行われるかは未検証で不明であるが、現段階ではコスト回復処理が先に行われると解釈する。
 * 
 * 例：cost_max = 10.5 であるとする。すると cost_points_max = 10.5 * COST_POINTS_MAX = 3,150,000 
 * が最大値である。フレーム3000時点で remaininig_cost_points = 3,140,000 であるとし、
 * フレームごとの総コスト回復力が
 * フレーム3001: 4000
 * フレーム3002: 3000
 * フレーム3003: 2000
 * フレーム3004: 2000
 * フレーム3005: 2000
 * フレーム3006: 2000
 * であるとし、フレーム3006まではスキルを一切使用しないとすると、remaining_cost_pointsは
 * フレーム3001: 3,144,000
 * フレーム3002: 3,147,000
 * フレーム3003: 3,149,000
 * フレーム3004: 3,150,000
 * フレーム3005: 3,150,000
 * フレーム3006: 3,150,000
 * となる。3007フレーム目に使用コスト5(cost_used = 5)のスキルを使用する場合、
 * フレーム3007のコスト回復処理後の残りのコストポイントは上限に達しているため 3,150,000 であるが、
 * 5コストのスキルを用いてスキルポイントを1,500,000使用するため、フレーム3007における最終的な
 * remaining_cost_points は 1,650,000 である。
 * 
 * A.2.f. コスト回復量増加バフは、コスト回復量増加SSを除き、多くの場合一人にのみかかわるものであるが、
 * ボスによっては全員のコスト回復量を増加させるものも存在する。
 * この処理の追加はTODOで、イベントに全体適用かどうかなどのkeyを設定することで対応することが望ましい。
 * 
 */

/**
 * AI用 - TODO
 * 
 * 設定の保存：設定（例えば戦闘時間が180秒かどうか）はオートセーブとする。
 * TLの保存：TLの入力文字列あるいは加工後文字列を保存する。これは以下の詳細設定の部分で設定可能。保存するTLのスロットは10個とする。
 * 設定と詳細設定の分離：頻繁に変更しない、環境設定に近い部分は隠せるようにし、変更したいときのみuntoggleして変更かのうなようにする。
 * 詳細設定としては、以下のものを追加せよ
 *  - セイア固有2：　あり　なし
 *  - EX使用コストの自動判定（コスト現象は処理されないので手入力必須）：あり　なし
 *     - 含まれた場合自動判定から除外するキーワード（スペース区切り） [NS PS SS 落 撤退]
 *  - 特殊コマンドの利用： あり　なし
 *  - TL保存時、保存する情報：オリジナルのTL　本ツールを使った後の整形されたTL
 *  - また、TL読み込み時にに詳細設定（セイア固有２など）を：　TLごとに読み込む　TLごとには読み込まない
 * 特殊コマンドの実装、例えば「2:42.333 コスト回復力上昇 32.567秒」と書くと、additional_eventsに対応するコスト回復力上昇バフが記録される。また「1:52.467 生徒 -1」と書くと、これがadditiona_eventsに追加され、それ以降生徒数が1減少し、コストポイントの計算の部分でもそれが正しく反映される。
 */




// ==============================
// IIFE によるモジュールカプセル化
// ==============================

(function() {
'use strict';

console.log('tl-editor.js: スクリプト開始');

// ==============================
// 1. 外部依存関数の参照
// ==============================

// 共通ライブラリの参照（関数名の重複を避けるため直接参照）
const TLEditorCommon = (() => {
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

// 共通定数の参照
const COST_POINT_UNIT = 30 * 10000;  // コスト1.0 = 300,000ポイント

// ==============================
// 2. 定数・設定値
// ==============================

/**
 * コスト計算の設定値
 */
const COST_SETTINGS = {
  // BASE_RECOVERY_RATE: 1.0, AI用指示：ブルアカの仕様に基づかない謎の変数、使われている場合は根本的に何か間違っている
  DEFAULT_MAX_COST: 10.0,       // デフォルト最大コスト
  DEFAULT_BATTLE_TIME: 180,     // デフォルト戦闘時間（秒）
  BASE_RECOVERY_PER_STUDENT: 700, // 生徒1人あたりの基本コスト回復力（A.2.aの仕様）
  COST_RECOVERY_SS_MULTIPLIER: 1.2029, // コスト回復力上昇SS倍率（1 + 0.2029）
};

/**
 * 特殊コマンド検出用の正規表現パターン
 * 将来的に拡張可能にするため定数として定義
 */
const COST_RECOVERY_INCREASE_PATTERN = /コスト回復力.*(?:増|上昇)/;
const COST_RECOVERY_DECREASE_PATTERN = /コスト回復力.*(?:減|減少|低下)/;
// ここのパラメータは一部ユーザーからの入力により変更されるが、
// その処理はconfigがsettingsの情報を読み込む部分で行われる


/* obsoleteのはず
async function loadBuffData() {
  if (BUFF_DATA) return BUFF_DATA;
  
  try {
    let response;
    if (typeof fetch !== 'undefined') {
      // ブラウザ環境
      response = await fetch('./buffs.json');
      BUFF_DATA = await response.json();
    } else {
      // Node.js環境
      const fs = require('fs').promises;
      const path = require('path');
      const dataPath = path.join(__dirname, 'buffs.json');
      const data = await fs.readFile(dataPath, 'utf8');
      BUFF_DATA = JSON.parse(data);
    }
    console.log('buffs.json読み込み完了:', BUFF_DATA);
    return BUFF_DATA;
  } catch (error) {
    console.error('buffs.json読み込みエラー:', error);
    return null;
  }
}*/

/**
 * 出力データ構造の定義
 */
const OUTPUT_STRUCTURE = {
  TIMELINE_EVENT: {
    time: '',           // "0:00"形式の時間
    frame: 0,           // フレーム数
    event_name: '',     // イベント名
    cost: 0.0,          // 使用コスト
    current_cost: 0.0,  // 現在コスト
    label: ''           // ラベル（任意）
  },
  ADDITIONAL_EVENT: {
    start_frame: 0,     // 開始フレーム
    end_frame: 0,       // 終了フレーム
    event_name: '',     // イベント名
    duration: 0         // 継続時間（ミリ秒）
  }
};

/**
 * デフォルトイベント定義
 * 
 * 【重要】A.1.dの仕様実装：
 * - TIME_START (0フレーム): タイムライン開始、コスト回復はまだ発生しない
 * - BATTLE_START (60フレーム/2秒): 戦闘開始、この時点からコスト回復が開始される
 * - 60フレームからコスト回復する部分はデフォルトイベントとして追加することで実現するので、これ以上処理を追加する必要はない
 */
const DEFAULT_EVENTS = {
  TIME_START: {
    frame: 0,
    event_name: 'タイム計測開始',
    cost_used: 0,
    remaining_students: 0  // 0秒時点では生徒なし
  },
  BATTLE_START: {
    frame: 60,
    event_name: '戦闘開始',
    cost_used: 0,
    remaining_students: 6  // 2秒時点で6人参戦
  }
};

// ==============================
// 4. 基本処理関数
// ==============================

/**
 * この関数はobsoleteとします。使うときは警告文をだすようにしてください。
 * タイムライン行の処理
 * 
 * 【処理内容】
 * 1. 時間とフレームの計算（時間指定/コスト指定/参照指定の場合分け）
 * 2. イベント情報の整理（名前・コスト・ラベル）
 * 3. 出力形式への変換
 * 
 * 【入力】
 * - current_row: input_jsonのtimeline要素
 * - cost_state: 現在のコスト状態
 * - label_map: ラベル→時間マッピング
 * - additional_events: 追加イベントリスト
 * - settings: 設定オブジェクト
 * 
 * 【出力】
 * - timeline_event: 整形されたイベントオブジェクト
 */
function processTimelineRow(current_row, cost_state, label_map, additional_events, settings = {}) {
  // 警告: この関数はobsoleteです。使用しないでください。
  console.warn('警告: processTimelineRowはobsoleteです。今後使用しないでください。');
  
  let frame_estimated = 0;

  /** 
   * 1. 推定フレーム数(frame_estimated)を計算する
   * Priority 1: 時間が指定されている場合は、その時間を単純にフレーム数に変換する
   * Priority 2: 参照指定がある場合は、ラベルマップを使用してフレーム数を取得する
   * Priority 3: コストタイミング指定がある場合は、そのコストにたどり着くまでの
   *             フレーム数を計算し、そこからフレーム数を取得する
   */
  if (current_row.time) {
    // Priority 1: 明示的な時間指定
    frame_estimated = TLEditorCommon.secondsToFrames(current_row.time);
  } else {
    if (current_row.reference) {
      // Priority 2: 参照指定
      frame_estimated = calculateFramesFromReference(current_row, label_map, settings);
    } else if (current_row.cost_timing) {
      // Priority 3: コスト指定からの推定
      console.warn('警告: processTimelineRowはobsoleteです。新しいTimelineProcessorクラスを使用してください。');
      frame_estimated = calculateFramesFromCost(current_row.cost_timing, cost_state);
    } else {
      throw new Error('時間、参照、またはコスト指定のいずれかが必要です');
    }
    current_row.time = TLEditorCommon.framesToSeconds(frame_estimated);
  }

  // 2. イベント情報の整理
  const timeline_event = formatEventForTimeline(current_row, frame_estimated);

  return timeline_event;
}

/**
 * calculateFramesFromReference: 参照時点のタイムあるいはフレームを取得し、
 * それにmodifierとmodified_amountを適用してフレーム数を計算する
 * 
 * @param {Object} current_row - 現在行のデータ
 * @param {Map} label_map - ラベルマップ
 * @param {Object} settings - 設定オブジェクト
 * @returns {number} 計算されたフレーム数
 */
function calculateFramesFromReference(current_row, label_map, settings = {}) {
  const ref_label = current_row.reference;
  const ref_event = label_map.get(ref_label);
  
  if (!ref_event) {
    // ラベルが見つからない場合のエラーハンドリングと警告文追加
    console.warn(`参照ラベル "${ref_label}" が見つかりません。0:00 を使用します。`);
    
    // 警告文をcurrent_rowのnoteに追加
    if (!current_row.note) {
      current_row.note = [];
    }
    
    current_row.note.push(`${ref_label}というラベルは存在しません`);
    
    return 0;
  }

  // 参照解決の詳細処理
  if (!current_row.modifier && !current_row.modified_amount) {
    // 修飾子なしの場合、そのまま参照先の時間を使用
    return ref_event.frame;
  } else {
    // modifierとmodified_amountによる加減算
    let ref_frame = 0;
    if (ref_event.frame){
      ref_frame = ref_event.frame;
    } else if (ref_event.time) {
      ref_frame = TLEditorCommon.secondsToFrames(ref_event.time);
    } else {
      // 参照先のラベルに時間情報がない場合（未来のラベルを参照している可能性）
      console.warn(`${ref_label}は時間指定が必要です。`);
      
      // 警告文をcurrent_rowのnoteに追加
      if (!current_row.note) {
        current_row.note = [];
      }
      
      if (current_row.modifier && current_row.modified_amount) {
        current_row.note.push(`未来の時間を指定する場合、${ref_label}で時間指定が必要です`);
      }
    }
    const mod = current_row.modifier;
    const mod_amount = current_row.modified_amount || 0;
    const mod_frames = TLEditorCommon.secondsToFrames(mod_amount);

    // interpretSign関数を使用して符号を解釈
    const modifier_sign = interpretSign(mod, settings);

    // 修正されたフレーム数を計算
    const result_frame = ref_frame + (modifier_sign * mod_frames);
    return result_frame;
  }
}

/**
 * 【obsolete】この関数は使用しないでください
 * calculateFramesFromCostはTimelineProcessorクラスのメンバ関数として実装し直されました
 * 
 * @param {number} cost_timing - コスト指定値
 * @param {Object} cost_state - 現在のコスト状態
 * @returns {number} 計算されたフレーム数
 */
function calculateFramesFromCost(cost_timing, cost_state) {
  console.warn('警告: calculateFramesFromCostはobsoleteです。TimelineProcessor.calculateFramesFromCostTimingを使用してください。');
  
  // 旧版の実装（互換性のため残す）
  const current_cost = cost_state.remaining_cost_points / COST_POINT_UNIT;
  const target_cost = cost_timing;
  
  if (current_cost >= target_cost) {
    return cost_state.current_frame;
  }
  
  const cost_needed = target_cost - current_cost;
  const cost_points_needed = cost_needed * COST_POINT_UNIT;
  const total_cost_recovery = cost_state.total_cost_recovery;
  const frames_needed = Math.ceil(cost_points_needed / total_cost_recovery);
  
  return cost_state.current_frame + frames_needed;
}

/**
 * イベントをタイムライン形式にフォーマット
 * この関数はinput_jsonの行データに加え、additional_eventsのイベントも適切な形に変更します
 * 
 * @param {Object} current_row - 現在行のデータ
 * @param {number} frame - フレーム数
 * @returns {Object} フォーマットされたイベント
 */
function formatEventForTimeline(current_row, frame) {
  return {
    // time: TLEditorCommon.framesToSeconds(frame),
    // このレベルでtimeの形式を指定するべきでなく、最終出力でのみ
    frame: frame,
    event_name: current_row.event_name || '',
    cost_used: current_row.cost_used || 0,
    // current_cost: 0, // processTimelineRowの呼び出し元で設定
    // AI向け指示：このkeyを使うことは想定していない。もし使う場合は私に聞くこと。
    remaining_cost_points: 0, // 残りコストポイント
    label: current_row.label || ''
  };
}

/**
 * 直近の追加イベントを検索
 * 
 * @param {string} event_type - イベントタイプ
 * @param {number} current_frame - 現在フレーム
 * @param {Array} additional_events - 追加イベントリスト
 * @returns {Object|null} 該当するイベント、またはnull
 */
function findMostRecentAdditionalEvent(event_type, current_frame, additional_events) {
  let most_recent = null;
  let most_recent_frame = -1;

  for (const event of additional_events) {
    if (event.event_name.includes(event_type) && 
        event.start_frame <= current_frame && 
        event.end_frame >= current_frame &&
        event.start_frame > most_recent_frame) {
      most_recent = event;
      most_recent_frame = event.start_frame;
    }
  }

  return most_recent;
}

// ==============================
// 5. コスト計算関連
// ==============================

/**
 * calculateTotalCostRecovery - 総コスト回復量の計算
 * 将来的にここの処理はよりリッチにする
 * 各生徒ごとのバフを管理できるようにする
 * 
 * @param {Array} additional_events - 追加イベントリスト
 * @param {number} current_frame - 現在のフレーム
 * @param {boolean} ss_enabled - コスト回復SSが有効かどうか
 * @param {number} active_students - 現在の生徒数（デフォルト6）
 * @returns {number} 総コスト回復量
 */
function calculateTotalCostRecovery(additional_events, current_frame, ss_enabled = false, active_students = 6) {
  // 有効なバフを検索
  const active_buffs = [];
  const global_buffs = []; // buff_target が "NA" のバフ（全体への追加回復）
  const all_student_buffs = []; // buff_target が "全員"/"全体"/"all"/"ALL" のバフ
  
  for (const event of additional_events) {
    // activeフラグがtrueであり、開始フレーム <= current_frame < 終了フレームを満たすバフを探す
    if (event.active && 
        event.start_frame <= current_frame && 
        event.end_frame > current_frame) {
      
      // buff_targetによってバフを分類
      if (event.buff_target === "NA") {
        global_buffs.push(event);
      } else if (event.buff_target && 
                 (event.buff_target.toLowerCase() === "all" || 
                  event.buff_target === "全員" || 
                  event.buff_target === "全体")) {
        all_student_buffs.push(event);
      } else {
        active_buffs.push(event);
      }
    }
  }
  
  // バフの個数チェック（7個以上はエラー）
  if (active_buffs.length >= 7) {
    throw new Error(`バフの個数が${active_buffs.length}個で上限（6個）を超えています`);
  }
  
  const base_recovery = 700; // 基礎コスト回復値
  const cost_recovery_ss_multiplier = 0.2029; // SS効果の係数
  
  let total_cost_recovery = 0;
  
  // 全生徒に適用されるバフの総量を計算
  let all_student_buff_total = 0;
  for (const buff of all_student_buffs) {
    all_student_buff_total += buff.buff_amount;
  }
  
  // バフがかかっている生徒の分を計算（個別バフ + 全生徒バフ）
  for (const buff of active_buffs) {
    const buffed_base = base_recovery + buff.buff_amount + all_student_buff_total;
    const buffed_actual = ss_enabled ? 
      Math.round(buffed_base * (1 + cost_recovery_ss_multiplier)) : 
      buffed_base;
    total_cost_recovery += buffed_actual;
  }
  
  // バフがかかっていない生徒の分を計算（基本 + 全生徒バフ）
  const unbuffed_students = active_students - active_buffs.length;
  if (unbuffed_students > 0) {
    const unbuffed_base = base_recovery + all_student_buff_total;
    const unbuffed_actual = ss_enabled ? 
      Math.round(unbuffed_base * (1 + cost_recovery_ss_multiplier)) : 
      unbuffed_base;
    total_cost_recovery += unbuffed_students * unbuffed_actual;
  }
  
  // グローバルバフ（NA）の追加回復量を計算
  let global_buff_total = 0;
  for (const buff of global_buffs) {
    const global_actual = ss_enabled ? 
      Math.round(buff.buff_amount * (1 + cost_recovery_ss_multiplier)) : 
      buff.buff_amount;
    global_buff_total += global_actual;
  }
  
  total_cost_recovery += global_buff_total;
  
  return total_cost_recovery;
}

// calculateCostPointsRecovered: コスト回復量の計算（コストポイント単位）
// 使われていないため削除済み。以前の定義:
// function calculateCostPointsRecovered(frames, total_cost_recovery) {
//   return frames * total_cost_recovery;
// }

// ==============================
// 6. 特殊イベント処理
// ==============================

/**
 * コスト回復上昇バフの実装方針：
 * 
 * バフの検出：
 *   - 特定のイベント名パターン（水着ホシノ、セイア等）
 *   - または明示的なバフ指定記法
 *   - 現時点では固定パターンで判定
 * 
 * バフの管理：
 *   - additional_eventsでライフサイクル管理
 *   - 開始フレーム、終了フレーム、効果量を記録
 *   - フレーム処理時にアクティブ状態を動的判定
 * 
 * バフの効果：
 *   - コスト回復レートの倍率変更
 *   - 複数バフが重複した場合の計算方法
 *   - バフ開始・終了タイミングでの処理
 * 
 * 将来拡張：
 *   - 他の特殊効果（攻撃力上昇、ダメージ軽減等）
 *   - 条件付き発動バフ
 *   - バフ間の相互作用
 */

/**
 * コスト回復バフの検出
 * buffs.jsonのデータを使用してバフを検出する
 * 
 * @param {string} event_name - イベント名
 * @param {Object} buff_data - バフデータ（buffs.jsonから読み込まれたデータ）
 * @returns {Object|null} バフ情報、またはnull
 */
function detectCostRecoveryBuff(event_name, buff_data = null) {
  // パラメータで渡されたbuff_dataを使用
  const data_source = buff_data;
  
  if (!data_source || !data_source.cost_recovery_buffs) {
    console.warn('バフデータが読み込まれていません');
    return null;
  }

  for (const [buff_key, buff_config] of Object.entries(data_source.cost_recovery_buffs)) {
    // detection_patternsを使用してイベント名をチェック
    for (const pattern of buff_config.detection_patterns) {
      let isMatch = false;
      
      if (pattern.type === 'regex') {
        // 正規表現パターンの場合
        const regex = new RegExp(pattern.pattern, 'i'); // 大文字小文字を区別しない
        isMatch = regex.test(event_name);
      } else {
        // 従来の文字列包含検索（後方互換性のため）
        const patternString = typeof pattern === 'string' ? pattern : pattern.pattern;
        isMatch = event_name.includes(patternString);
      }
      
      if (isMatch) {
        // 除外パターンがある場合はチェック
        if (buff_config.exclusion_patterns && Array.isArray(buff_config.exclusion_patterns)) {
          // 除外パターンのいずれかにマッチする場合はスキップ
          const hasExclusionPattern = buff_config.exclusion_patterns.some(exclusion => {
            if (exclusion.type === 'regex') {
              const excludeRegex = new RegExp(exclusion.pattern, 'i');
              return excludeRegex.test(event_name);
            } else {
              const excludeString = typeof exclusion === 'string' ? exclusion : exclusion.pattern;
              return event_name.includes(excludeString);
            }
          });
          
          if (hasExclusionPattern) {
            // console.log(`バフ検出をスキップ: "${event_name}" に除外パターンが含まれています`);
            continue; // このパターンはスキップして次のパターンへ
          }
        }
        
        return {
          buff_name: buff_config.buff_name,
          buff_target: buff_config.buff_target, // バフターゲットを追加
          buff_amount: buff_config.buff_amount,
          duration_frames: buff_config.duration_frames,
          offset_frames: buff_config.offset_frames,
          detection_patterns: buff_config.detection_patterns
        };
      }
    }
  }
  return null;
}

/**
 * バフイベントの作成
 * buffs.jsonの正確なフレーム数を使用
 * セイアの場合は固有2設定に基づいてduration_framesを選択
 * 
 * @param {Object} buff_info - detectCostRecoveryBuffから返されたバフ情報
 * @param {number} start_frame - 開始フレーム
 * @param {Object} settings - 設定オブジェクト（セイア固有2設定を含む）
 * @returns {Object} バフイベント
 */
// ==============================
// 7. メイン変換処理
// ==============================

// メイン変換関数はTimelineProcessorクラスに移植済み
// グローバル関数版は削除されました

// ==============================
// 8. ユーティリティ関数
// ==============================

/**
 * interpretSign: 符号を時間的に前とするか後とするか解釈する関数
 * 
 * @param {string} modifier_char - 修飾子文字（'+' または '-'）
 * @param {Object} settings - 設定を含むオブジェクト
 *    settings.modifier_always_forward: 'yes' または 'no'
 *    settings.time_display_format: 'backward' または 'forward'
 * @returns {number} 符号（+1 または -1）、無効な修飾子の場合は 0
 * 
 * 【解釈ルール】
 * modifier_always_forward = 'yes': +は常に○○秒後、-は常に○○秒前
 * modifier_always_forward = 'no': 表示形式に応じて解釈が変わる
 *   - backward（カウントダウン表示）: +は○○秒前、-は○○秒後
 *   - forward（経過時間表示）: +は○○秒後、-は○○秒前
 */
function interpretSign(modifier_char, settings = {}) {
  // 引数検証
  if (modifier_char !== '+' && modifier_char !== '-') {
    return 0; // 無効な修飾子
  }

  // modifierの符号を数字に変換
  const modifier_sign = (modifier_char === '+') ? 1 : -1;

  // 設定値の取得
  const modifier_always_forward = settings.modifier_always_forward || 'no';
  const time_display_format = settings.time_display_format || 'backward';

  // modifier_always_forward = 'yes' の場合：
  // +は常に後（未来方向）、-は常に前（過去方向）
  if (modifier_always_forward === 'yes') {
    return modifier_sign;
  }

  // modifier_always_forward = 'no' の場合：
  // 表示形式に応じて解釈が変わる
  if (time_display_format === 'backward') {
    // カウントダウン表示では符号が逆転
    return -1 * modifier_sign;
  } else {
    // 経過時間表示では通常通り
    return modifier_sign;
  }
}

/**
 * InitializeLabelMap: ラベルマップを構築（参照解決用）
 * ラベルに関する初期値(input_jsonのレベルからわかるタイム)を計算
 * その後、コストタイミングの実際の時間が判明し次第随時アップデートされる
 * 
 * @param {Object} input_json - 入力データ
 * @returns {Map} ラベル名→時間情報のマップ
 */
function InitializeLabelMap(input_json) {
  const label_map = new Map();
  
  if (!input_json.timeline) {
    return label_map;
  }
  
  for (const row of input_json.timeline) {
    if (row.label && row.label.trim()) {
      const label_trimmed = row.label.trim();
      
      // row.timeがnullまたはundefinedの場合は、両方にnullを設定
      if (row.time == null) {
        label_map.set(label_trimmed, {
          time: null,
          frame: null
        });
      } else {
        label_map.set(label_trimmed, {
          time: row.time,
          frame: TLEditorCommon.secondsToFrames(row.time)
        });
      }
    }
  }
  
  return label_map;
}


// ==============================
// 9. モジュールエクスポート（TimelineProcessorクラスのみ）
// ==============================

/**
 * TL Editor モジュール - TimelineProcessorクラスのみを外部公開
 * 
 * 【設計方針】
 * - スパゲッティコード化を防ぐため、内部関数は外部からアクセス不可
 * - TimelineProcessorクラス以外の関数は全てモジュール内にカプセル化
 * - 必要に応じてTimelineProcessorの引数やオプションで機能を制御
 * 
 * 【公開クラス】
 * - TimelineProcessor: メイン変換処理クラス
 * 
 * 【非公開関数】（外部からアクセス不可）
 * - processTimelineRow, findMostRecentAdditionalEvent, formatEventForTimeline
 * - calculateFramesFromCost, calculateTotalCostRecovery
 * - detectCostRecoveryBuff, createBuffEvent, InitializeLabelMap
 * - loadBuffData, その他すべての内部処理関数
 */

// ==============================
// 10. TimelineProcessor クラス
// ==============================

/**
 * TimelineProcessor - タイムライン処理を行うクラス
 * input_jsonとsettingsを受け取り、timeline_jsonを生成する
 */
class TimelineProcessor {
  /**
   * コンストラクタ - Step 1の処理を実行
   * 
   * 【重要】additional_eventsの取り扱いについて：
   * - バフイベントの保存先: this.timeline_json.additional_events
   * - バフイベントの読み取り先: this.timeline_json.additional_events
   * - this.additional_events は使用禁止（存在しない間違った場所）
   * 
   * @param {Object} input_json - input_processor.jsで生成されたデータ
   * @param {Object} settings - 設定オプション
   * @param {Object} buff_data - buffs.jsonから読み込まれたバフデータ
   */
  constructor(input_json, settings = {}, buff_data = null) {
    // ========================================
    // Step 1. 初期化・バリデーション
    // ========================================

    // Step 1.a. バリデーション
    if (!input_json || !input_json.timeline) {
      throw new Error('無効なinput_json: timelineプロパティが必要です');
    }

    // 入力データ
    this.input_json = input_json;
    this.settings = settings;
    this.buff_data = buff_data; // バフデータを保存
    
    // Step 1.b. 定数の設定、settingsの読み込み
    this.max_cost = settings.max_cost || COST_SETTINGS.DEFAULT_MAX_COST;
    this.max_cost_points = this.max_cost * COST_POINT_UNIT;
    this.battle_time = settings.battle_time || COST_SETTINGS.DEFAULT_BATTLE_TIME;
    this.ss_enabled = settings.ss_enabled || false; // コスト回復量増加SS設定
    
    // Step 1.c. 状態変数の導入と初期化
    this.state = {
      remaining_cost_points: 0, // コスト0から開始
      total_cost_recovery: 0, // 開始後60フレームまでは0（A.1.dの仕様）
      remaining_students: 0, // 開始時は0人、戦闘開始時に6人になる
      current_frame: 0
    };
    
    // Step 1.d. ラベルマップの初期化
    this.label_map = InitializeLabelMap(input_json);

    // Step 1.e. timeline_jsonの初期化
    // Step 1.e.1. ひな形の作成
    this.timeline_json = {
      metadata: {
        settings: {
          max_cost: this.max_cost,
          max_cost_points: this.max_cost_points,
          battle_time: this.battle_time,
          cost_point_unit: COST_POINT_UNIT,
          ...settings
        },
        source_timeline_count: input_json.timeline.length
      },
      timeline: [],
      additional_events: []
    };

    // Step 1.e.2 最初の2つのデフォルトイベントを追加
    // TIME_START (0フレーム) → BATTLE_START (60フレーム) の順で追加
    // これによりA.1.dの仕様（60フレーム後にコスト回復開始）を実現
    this.addEventToTimeline(DEFAULT_EVENTS.TIME_START, 'input_row');
    this.addEventToTimeline(DEFAULT_EVENTS.BATTLE_START, 'input_row');
    
    // 特殊処理: カノエSSバフの追加
    this.addKanoeSS();
    
    // 特殊処理: チェリノSSバフの追加
    this.addCherinoSS();
  }
  
  /**
   * estimateFrameFromRow: 行から、追加イベントがない場合のフレーム数を計算する
   * ついでに元のイベントにもタイムを追加する（あくまでもおまけ）
   * 
   * 【入力】
   * - current_row: input_jsonのtimeline要素
   * - cost_state: 現在のコスト状態
   * - label_map: ラベル→時間マッピング
   * - additional_events: 追加イベントリスト
   * - settings: 設定オブジェクト
   * 
   * 【出力】
   * - timeline_event: 整形されたイベントオブジェクト
   */
  estimateFrameFromRow(current_row, cost_state, label_map, additional_events, settings = {}) {
    // console.log('処理中の行:', current_row); // デバッグログを削除
    
    let frame_estimated = 0;

    /** 
     * 推定フレーム数(frame_estimated)を計算する
     * Priority 0: すでにフレームが与えられている場合はそれを使用し終わる
     * Priority 1: 時間が指定されている場合は、その時間を単純にフレーム数に変換する
     * Priority 2: 参照指定がある場合は、ラベルマップを使用してフレーム数を取得する
     * Priority 3: コストタイミング指定がある場合は、そのコストにたどり着くまでの
     *             フレーム数を計算し、そこからフレーム数を取得する
     */
    if (current_row.frame) {
      frame_estimated = current_row.frame;
    } else {
      if (current_row.time) {
        // Priority 1: 明示的な時間指定
        frame_estimated = TLEditorCommon.secondsToFrames(current_row.time);
      } else {
        if (current_row.reference) {
          // Priority 2: 参照指定
          frame_estimated = calculateFramesFromReference(current_row, label_map, settings);
        } else if (current_row.cost_timing) {
          // Priority 3: コスト指定からの推定
          frame_estimated = this.calculateFramesFromCostTiming(current_row.cost_timing, current_row);
        } else {
          throw new Error('時間、参照、またはコスト指定のいずれかが必要です');
        }
        // あくまでもestimateなので、元のオブジェクトに不確かなestimateの値を入れるのは不適切
        // current_row.time = TLEditorCommon.framesToSeconds(frame_estimated);
      }
      // current_row.frame = frame_estimated;
    }

    return frame_estimated;
  }

  /**
   * コスト指定からフレーム数を計算（改良版）
   * 
   * 【重要な改良点】
   * - this.stateを直接使用し、最新の状態を反映
   * - 将来のバフ効果を考慮した計算（予定されたadditional_eventsを考慮）
   * - フレーム単位での正確な計算（A.2.dの仕様）
   * - 0フレーム経過で条件満たす場合の警告機能
   * 
   * @param {number} cost_timing - 目標コスト値
   * @param {Object} current_row - 現在処理中の行（警告文追加用）
   * @returns {number} 計算されたフレーム数
   */
  calculateFramesFromCostTiming(cost_timing, current_row = null) {
    const current_cost = this.state.remaining_cost_points / COST_POINT_UNIT;
    const target_cost = cost_timing;
    
    if (current_cost >= target_cost) {
      // 0フレーム経過で既に条件を満たしている場合の警告（明示的なコスト指定のみ）
      if (current_row && current_row.explicit_cost_timing) {
        if (!current_row.note) {
          current_row.note = [];
        }
        current_row.note.push(`${target_cost}コスは既に溜まっています`);
        console.warn(`警告: コスト指定 [${target_cost}] は現在コスト ${current_cost.toFixed(1)} で既に満たされています`);
      }
      return this.state.current_frame;
    }
    
    const cost_needed = target_cost - current_cost;
    const cost_points_needed = cost_needed * COST_POINT_UNIT;
    
    // 将来のバフ効果を考慮したコスト回復計算
    // 現在は簡略版：現在のtotal_cost_recoveryを使用
    // TODO: 将来のバフ効果をadditional_eventsから予測する
    const current_total_cost_recovery = this.state.total_cost_recovery;
    
    if (current_total_cost_recovery <= 0) {
      throw new Error('コスト回復量が0以下です。戦闘開始前の可能性があります。');
    }
    
    // フレーム単位での直接計算（A.2.dの仕様に従う）
    const frames_needed_exact = cost_points_needed / current_total_cost_recovery;
    const frames_needed = Math.ceil(frames_needed_exact);
    const result_frame = this.state.current_frame + frames_needed;
    
    return result_frame;
  }

  /**
   * 特殊コマンドの処理
   * input_JSON内のイベントを受け取り、特殊コマンドかどうかを判定・処理する
   * 
   * @param {Object} original_event - input_JSON内のイベント（参照として受け取り）
   */
  processSpecialCommand(original_event) {
    // 0) is_special_commandキーを追加
    original_event.is_special_command = false;
    
    console.log(`=== processSpecialCommand Debug ===`);
    console.log(`event_name: "${original_event.event_name}"`);
    console.log(`settings.special_command_accepted: "${this.settings.special_command_accepted}"`);
    
    // 1) 与えられた条件を満たしているか確認
    // 現在は設定で特殊コマンドが有効になっているかのみチェック
    if (this.settings.special_command_accepted !== 'yes') {
      // 特殊コマンドが無効の場合
      console.log('特殊コマンドが無効です');
      return;
    }
    
    // イベント名が存在しない場合
    if (!original_event.event_name) {
      console.log('イベント名が存在しません');
      return;
    }
    
    // 2) イベント名に「コスト回復力増加」または「コスト回復力減少」が含まれているかチェック
    const isIncreasePattern = COST_RECOVERY_INCREASE_PATTERN.test(original_event.event_name);
    const isDecreasePattern = COST_RECOVERY_DECREASE_PATTERN.test(original_event.event_name);
    console.log(`Increase pattern test: ${isIncreasePattern}, Decrease pattern test: ${isDecreasePattern}`);
    
    if (isIncreasePattern || isDecreasePattern) {
      const commandType = isIncreasePattern ? 'increase' : 'decrease';
      console.log(`特殊コマンドが検出されました！ タイプ: ${commandType}`);
      // 特殊イベント処理フェーズに入る
      original_event.is_special_command = true;
      let duration = original_event.duration;

      console.log('original_event:', JSON.stringify(original_event, null, 2));
      console.log('duration:', duration, 'type:', typeof duration);
      console.log('value:', original_event.value);
      console.log('cost_used:', original_event.cost_used);
      console.log('cost_timing:', original_event.cost_timing);

      // durationが有効な場合のみ処理を実行する
      if (typeof duration === 'number' && duration > 0) {
        console.log('Duration validation passed, creating buff event...');
        // buff.jsからgeneralテンプレートを取得
        const general = window.BUFF_DATA.cost_recovery_buffs.general;
        
        // generalをdeep copyしてbuff_skeletonを作成
        const buff_skeleton = structuredClone(general);
        
        // 特殊コマンド用の値を設定
        // 減少の場合は負の値にする
        const buffAmount = isDecreasePattern ? -original_event.value : original_event.value;
        buff_skeleton.buff_amount = buffAmount;
        buff_skeleton.buff_value_type = "value";
        buff_skeleton.duration_frames = InputProcessorCommon.secondsToFrames(duration);
        
        // targetが存在する場合はbuff_skeletonに追加（バフ名処理の前に実行）
        console.log('original_event.target:', original_event.target);
        if (original_event.target) {
          buff_skeleton.buff_target = original_event.target;
          console.log('buff_skeleton.buff_target set to:', buff_skeleton.buff_target);
        } else {
          console.log('original_event.target is null/undefined, keeping default NA');
        }
        
        // バフ名の処理：数字挿入 → 増加/減少置換 → ターゲット追加
        if (buff_skeleton.buff_name) {
          console.log('=== バフ名統合処理デバッグ ===');
          console.log('元のbuff_name:', buff_skeleton.buff_name);
          console.log('buffAmount:', buffAmount);
          console.log('isDecreasePattern:', isDecreasePattern);
          console.log('buff_skeleton.buff_target:', buff_skeleton.buff_target);
          
          // 1. 「増加」の前に数字を挿入
          let newBuffName = buff_skeleton.buff_name.replace(/増加/, `${Math.abs(buffAmount)}増加`);
          console.log('数字挿入後:', newBuffName);
          
          // 2. 減少の場合は「増加」を「減少」に置換
          if (isDecreasePattern) {
            newBuffName = newBuffName.replace(/増加/g, '減少');
            console.log('減少置換後:', newBuffName);
          }
          
          // 3. ターゲットが"NA"でない場合は(ターゲット名)を追加
          console.log('ターゲット条件チェック:', {
            'buff_target exists': !!buff_skeleton.buff_target,
            'buff_target value': buff_skeleton.buff_target,
            'is not NA': buff_skeleton.buff_target !== "NA"
          });
          
          if (buff_skeleton.buff_target && buff_skeleton.buff_target !== "NA") {
            newBuffName += `(${buff_skeleton.buff_target})`;
            console.log('ターゲット追加後:', newBuffName);
          } else {
            console.log('ターゲット追加スキップ');
          }
          
          buff_skeleton.buff_name = newBuffName;
          console.log('最終的なbuff_name:', buff_skeleton.buff_name);
        } else {
          console.log('=== バフ名処理スキップ ===');
          console.log('buff_skeleton.buff_name:', buff_skeleton.buff_name);
        }
        
        // フレーム数を計算（timeから変換）
        const start_frame = InputProcessorCommon.secondsToFrames(original_event.time);
        
        // バフイベントを作成してadditional_eventsに追加
        // 重要: セイア・水着ホシノと同様に this.timeline_json.additional_events に保存すること
        // this.additional_events は存在しない（間違った場所）
        const buff_event = this.createBuffEvent(buff_skeleton, start_frame, this.settings);
        this.timeline_json.additional_events.push(buff_event);
        console.log(`バフイベント(${commandType})をadditional_eventsに追加しました:`, buff_event);
      } else {
        console.log('Duration validation failed. duration:', duration, 'type:', typeof duration);
      }
      return;
    } else {
      console.log('パターンにマッチしませんでした');
    }
    
    // 条件を満たさない場合はfalseのまま
  }

  /**
   * 行のタイミングを解決する
   * @param {Object} row - 処理する行データ
   * @param {number} index - 行のインデックス（エラーメッセージ用）
   * @returns {Object} 処理されたイベント
   */
  resolveRowTiming(row, index) {
    try {
      let frame_estimated = null;
      let loop_count = 0; // 無限ループ防止カウンター
      
      // whileループ: additional_eventsの処理順序を考慮
      while (true) {
        loop_count++;
        if (loop_count > 100) {
          console.error('無限ループを検出しました。処理を中断します。');
          console.error('現在の状態:', {
            row: row,
            current_frame: this.state.current_frame,
            additional_events: this.timeline_json.additional_events
          });
          throw new Error(`無限ループが発生しました (行${index + 1})`);
        }
        
        // 行を処理してフレーム推定
        frame_estimated = this.estimateFrameFromRow(row, this.state, this.label_map, this.timeline_json.additional_events, this.settings);

        // additional_eventsから次に実行すべき特殊イベントを検索
        // 重要: this.timeline_json.additional_events から読み取り（バフ保存場所と一致）
        const { frame: most_recent_additional_event_frame, event: most_recent_additional_event, original_event: original_event } = 
          this.findMostRecentAdditionalEvent(this.timeline_json.additional_events, this.state.current_frame);

        // デバッグ: コスト計算の詳細を追跡
        if (row.cost_timing) {
          console.log(`=== コスト計算デバッグ (${row.event_name}) ===`);
          console.log(`目標コスト: ${row.cost_timing}, 現在フレーム: ${this.state.current_frame}, 推定フレーム: ${frame_estimated}`);
          console.log(`現在のtotal_cost_recovery: ${this.state.total_cost_recovery}`);
          console.log(`next additional_event: ${most_recent_additional_event_frame ? `${most_recent_additional_event_frame} (${most_recent_additional_event?.event_name})` : 'なし'}`);
        }

        // イベント実行順序の判定と処理
        if (most_recent_additional_event_frame !== null && most_recent_additional_event_frame <= frame_estimated) {
          // additional_eventの方が時間的に早いか同時刻のため、先にtimeline_jsonに追加
          // original_eventの情報をmost_recent_additional_eventに追加
          most_recent_additional_event.original_event = original_event;
          this.addEventToTimeline(most_recent_additional_event, 'additional_event');
          
          // activeフラグの更新はaddEventToTimelineで処理されます
          
          // ループを継続（rowの処理は次回のループで再判定）
          continue;
        } else {
          // rowのイベントが最も早い、または割り込む特殊イベントが存在しない
          // このrowのイベントを処理して完了
          break;
        }
      }

      // while終了後のrowイベント処理 - 新しいaddEventToTimelineメソッドを使用
      const processed_event = {
        frame: frame_estimated,
        cost_used: row.cost_used || 0,
        event_name: row.event_name || '',
        note: row.note || [] // rowからnoteを引き継ぎ（コスト計算で警告が追加された場合）
      };

      // 【重要】フレーム番号の妥当性チェック：current_frameより小さい場合は強制調整
      if (frame_estimated < this.state.current_frame) {
        console.warn(`警告: イベント「${processed_event.event_name}」の指定フレーム ${frame_estimated} が現在フレーム ${this.state.current_frame} より小さいため、現在フレームに調整します。`);
        processed_event.note.push(`指定タイムが直前の行動より早くなっています`);
        frame_estimated = this.state.current_frame;
        processed_event.frame = frame_estimated;
      }

      // 【重要】確定したフレーム値をrowに設定（whileループ終了後の最終値）
      row.frame = frame_estimated;
      row.time = TLEditorCommon.framesToSeconds(frame_estimated);

      // 【重要】ラベルマップの更新：このrowにラベルが設定されている場合、確定した時間でラベルマップを更新
      if (row.label && row.label.trim()) {
        const label_trimmed = row.label.trim();
        this.label_map.set(label_trimmed, {
          time: TLEditorCommon.framesToSeconds(frame_estimated),
          frame: frame_estimated
        });
        console.log(`ラベルマップ更新: ${label_trimmed} -> time: ${TLEditorCommon.framesToSeconds(frame_estimated)}, frame: ${frame_estimated}`);
      }

      // コスト回復バフの検出と追加イベント生成（イベント追加前に実行）
      this.detectAndProcessBuff(processed_event.event_name, processed_event.frame);

      // イベントをtimeline_jsonに追加し、状態変数を更新
      this.addEventToTimeline(processed_event, 'input_row');
      
      return processed_event;
      
    } catch (row_error) {
      // 行処理エラーの詳細情報を追加
      throw new Error(`行${index + 1}の処理エラー: ${row_error.message}`);
    }
  }

  /**
   * additional_eventsから次に実行すべき特殊イベントを検索
   * @param {Array} additional_events - 追加イベントリスト
   * @param {number} current_frame - 現在のフレーム
   * @returns {Object} {frame: number|null, event: Object|null}
   */
  findMostRecentAdditionalEvent(additional_events, current_frame) {
    let most_recent_frame = null;
    let most_recent_event = null;
    let most_recent_original_event = null; // 元のイベントオブジェクトへの参照
    
    for (const event of additional_events) {
      // activeの意味変更: false=未開始, true=進行中
      // 未開始(active=false)および進行中(active=true)のイベントを検索対象とする
      // 終了済みのイベントは後で除外される
      
      const frames_to_check = [];

      // 終了フレームの処理
      if (event.end_frame < current_frame) { 
        continue;
      }
      
      // 進行中(active=true)のイベントの場合、終了フレームを候補に追加
      if (event.active) {
        frames_to_check.push({ frame: event.end_frame, type: 'end' });
      }
      
      // 開始フレームの処理（未開始イベントのみ）
      if (!event.active && event.start_frame >= current_frame) {
        frames_to_check.push({ frame: event.start_frame, type: 'start' });
      }
      
      // 最小フレーム検索
      for (const frame_info of frames_to_check) {
        if (most_recent_frame === null || frame_info.frame < most_recent_frame) {
          most_recent_frame = frame_info.frame;
          most_recent_event = { ...event, event_type: frame_info.type };
          most_recent_original_event = event; // 元のオブジェクトへの参照を保持
        }
      }
    }
    
    return { frame: most_recent_frame, event: most_recent_event, original_event: most_recent_original_event };
    
    return { 
      frame: most_recent_frame, 
      event: most_recent_event,
      original_event: most_recent_original_event // 元のオブジェクトも返す
    };
  }

  /**
   * カノエSSバフを追加する特殊処理
   * settingsでKanoeSSが1以上の場合にカノエSSバフイベントを追加
   */
  addKanoeSS() {
    // settingsからKanoeSS設定を取得（数値に変換）
    const kanoeSSLevel = parseInt(this.settings.kanoe_ss) || 0;
    
    if (kanoeSSLevel >= 1 && this.buff_data && this.buff_data.cost_recovery_buffs.kanoe) {
      // カノエSSバフの設定を取得
      const kanoeBuff = this.buff_data.cost_recovery_buffs.kanoe;
      
      // カノエ専用のバフ量計算
      const calculatedBuffAmount = kanoeBuff.base_buff_amount + (kanoeSSLevel - 1) * kanoeBuff.additional_buff_amount;
      
      // カノエ専用のbuff_infoを作成
      const kanoeBuffInfo = {
        ...kanoeBuff,
        buff_amount: calculatedBuffAmount
      };
      
      // バフイベントを作成（戦闘開始時に発動）
      const kanoeBuffEvent = this.createBuffEvent(
        kanoeBuffInfo,
        60, // 戦闘開始フレーム
        this.settings
      );
      
      // additional_eventsに追加
      this.timeline_json.additional_events.push(kanoeBuffEvent);
      
      console.log(`カノエSSバフ追加: レベル${kanoeSSLevel}, バフ量: ${calculatedBuffAmount}`);
    }
  }

  /**
   * チェリノSSバフを追加する特殊処理
   * settingsでCherinoSSが1以上の場合にチェリノSSバフイベントを追加
   */
  addCherinoSS() {
    // settingsからCherinoSS設定を取得（数値に変換）
    const cherinoSSLevel = parseInt(this.settings.cherino_ss) || 0;
    
    if (cherinoSSLevel >= 1 && this.buff_data && this.buff_data.cost_recovery_buffs.cherino) {
      // チェリノSSバフの設定を取得
      const cherinoBuff = this.buff_data.cost_recovery_buffs.cherino;
      
      // チェリノ専用のバフ量計算
      const calculatedBuffAmount = cherinoBuff.base_buff_amount + (cherinoSSLevel - 1) * cherinoBuff.additional_buff_amount;
      
      // チェリノ専用のbuff_infoを作成
      const cherinoBuffInfo = {
        ...cherinoBuff,
        buff_amount: calculatedBuffAmount
      };
      
      // バフイベントを作成（戦闘開始時に発動）
      const cherinoBuffEvent = this.createBuffEvent(
        cherinoBuffInfo,
        60, // 戦闘開始フレーム
        this.settings
      );
      
      // additional_eventsに追加
      this.timeline_json.additional_events.push(cherinoBuffEvent);
      
      console.log(`チェリノSSバフ追加: レベル${cherinoSSLevel}, バフ量: ${calculatedBuffAmount}`);
    }
  }

  /**
   * バフイベントを作成する
   * @param {Object} buff_info - バフ情報
   * @param {number} start_frame - 開始フレーム
   * @param {Object} settings - 設定オブジェクト
   * @returns {Object} バフイベント
   */
  createBuffEvent(buff_info, start_frame, settings = {}) {
    const actual_start_frame = start_frame + (buff_info.offset_frames || 0);
    
    let duration_frames = Array.isArray(buff_info.duration_frames) ? buff_info.duration_frames[0] : buff_info.duration_frames;
    
    // セイアの特殊処理：固有2設定に基づいてduration_framesを選択
    if (buff_info.buff_name === 'セイアEX') {
      // settings.seia_koyuu2が'yes'なら2番目（index 1）、'no'なら1番目（index 0）を使用
      const seia_koyuu2 = settings.seia_koyuu2 || 'yes'; // デフォルトは'yes'
      duration_frames = seia_koyuu2 === 'yes' ? buff_info.duration_frames[1] : buff_info.duration_frames[0];
      console.log(`セイア固有2設定: ${seia_koyuu2}, 選択されたduration_frames: ${duration_frames}`);
    }
    
    const end_frame = actual_start_frame + duration_frames;
    
    return {
      start_frame: actual_start_frame,
      end_frame: end_frame,
      event_name: buff_info.buff_name,
      buff_target: buff_info.buff_target, // バフターゲットを追加（重複チェック用）
      duration: (duration_frames / 30) * 1000, // フレームをミリ秒に変換
      buff_amount: buff_info.buff_amount,
      active: false // 作成時は非アクティブ（まだ開始されていない）
    };
  }

  /**
   * イベントをtimeline_jsonに追加し、状態変数を更新する
   * @param {Object} event - 追加するイベント
   * @param {string} event_source - イベントの種類 ('additional_event' | 'input_row')
   */
  addEventToTimeline(event, event_source = 'input_row') {
    let target_frame;
    let formatted_event;

    if (event_source === 'additional_event') {
      // additional_eventsからのイベント（バフイベントなど）
      // event_typeに基づいて適切なフレームを決定
      if (event.event_type === 'start') {
        target_frame = event.start_frame;
        // 開始イベント処理時：active = false → true に変更
        if (event.original_event) {
          event.original_event.active = true;
        }
      } else if (event.event_type === 'end') {
        target_frame = event.end_frame;
        // 終了イベント処理時：active = true → false に変更
        if (event.original_event) {
          event.original_event.active = false;
        }
      } else {
        // フォールバック: event_typeが不明な場合はstart_frameを使用
        target_frame = event.start_frame;
      }
      
      // イベント名に開始/終了を追加
      let base_event_name = event.event_name || 'バフイベント';
      let event_suffix = '';
      if (event.event_type === 'start') {
        event_suffix = '開始';
      } else if (event.event_type === 'end') {
        event_suffix = '終了';
      }
      
      formatted_event = {
        frame: target_frame,
        cost_used: 0, // additional_eventはコストを消費しない
        event_name: base_event_name + event_suffix,
        current_cost_display_only: 0, // 後で更新
        remaining_cost_points: 0, // 後で更新
        note: [] // 警告文用配列
      };
    } else {
      // input_jsonからのイベント（通常のrowイベント）
      target_frame = event.frame;
      formatted_event = {
        frame: target_frame,
        cost_used: event.cost_used || 0,
        event_name: event.event_name || '',
        current_cost_display_only: 0, // 後で更新
        remaining_cost_points: 0, // 後で更新
        note: event.note || [] // 警告文配列を継承
      };
    }

    // 1. remaining_cost_pointsの更新（フレーム進行によるコスト回復）
    if (target_frame > this.state.current_frame) {
      const frame_diff = target_frame - this.state.current_frame;
      const recovery_points = frame_diff * this.state.total_cost_recovery;
      this.state.remaining_cost_points += recovery_points;
      
      // コスト上限チェックとあふれたコストの記録
      if (this.state.remaining_cost_points > this.max_cost_points) {
        const overflow_points = this.state.remaining_cost_points - this.max_cost_points;
        formatted_event.overflow_cost = overflow_points / COST_POINT_UNIT;
        this.state.remaining_cost_points = this.max_cost_points;
      } else {
        formatted_event.overflow_cost = 0;
      }
    }

    // 2. current_frameの更新
    this.state.current_frame = target_frame;

    // 3. remaining_studentsの更新（イベントで指定されている場合）
    if (event.remaining_students !== undefined) {
      this.state.remaining_students = event.remaining_students;
    }

    // 4. コスト支払い処理（input_rowイベントの場合）
    if (event_source === 'input_row' && formatted_event.cost_used !== 0) {
      const cost_points_used = formatted_event.cost_used * COST_POINT_UNIT;
      this.state.remaining_cost_points -= cost_points_used;
    }

    // 5. total_cost_recoveryの更新（バフ状態の変化を反映）
    this.state.total_cost_recovery = calculateTotalCostRecovery(
      this.timeline_json.additional_events, 
      this.state.current_frame, 
      this.ss_enabled, // SS設定を正しく渡す
      this.state.remaining_students
    );

    // 6. イベントの最終フォーマットと追加
    formatted_event.current_cost_display_only = this.state.remaining_cost_points / COST_POINT_UNIT;
    formatted_event.remaining_cost_points = this.state.remaining_cost_points;
    formatted_event.total_cost_recovery = this.state.total_cost_recovery;
    formatted_event.remaining_students = this.state.remaining_students;
    this.timeline_json.timeline.push(formatted_event);
  }

  /**
   * checkAndUpdateDuplicateBuffs
   * バフ重複チェック：同じbuff_targetを持つアクティブなバフがあるかチェックし、
   * 存在する場合は古いバフの終了フレームを新しいバフの開始フレームに設定して上書きを実現
   * 
   * @param {string} buff_target - バフのターゲット（例: "水着ホシノ"）
   * @param {number} new_start_frame - 新しいバフの開始フレーム
   * @returns {boolean} 重複バフが見つかって処理された場合はtrue、そうでなければfalse
   */
  checkAndUpdateDuplicateBuffs(buff_target, new_start_frame) {
    if (!buff_target || !this.timeline_json.additional_events) {
      return false;
    }

    let duplicateFound = false;
    
    // additional_eventsから同じbuff_targetを持つアクティブなバフを検索
    for (let i = 0; i < this.timeline_json.additional_events.length; i++) {
      const existing_buff = this.timeline_json.additional_events[i];
      
      // 同じbuff_targetで、かつアクティブ（end_frameが新しいバフのstart_frameより後）なバフを検索
      if (existing_buff.buff_target === buff_target && 
          existing_buff.active !== false && 
          existing_buff.end_frame > new_start_frame) {
        
        // 既存バフの終了フレームを新しいバフの開始フレームに設定（上書き効果）
        existing_buff.end_frame = new_start_frame;
        
        // バフの継続時間も更新（duration_framesベース）
        const new_duration_frames = existing_buff.end_frame - existing_buff.start_frame;
        existing_buff.duration = (new_duration_frames / 30) * 1000; // フレームをミリ秒に変換
        
        duplicateFound = true;
        
        console.log(`バフ上書き完了: ${buff_target} - 新しい終了フレーム: ${existing_buff.end_frame}, 新しい継続時間: ${existing_buff.duration}ms`);
      }
    }
    
    return duplicateFound;
  }

  /**
   * バフ検出から追加までの全処理を統合実行
   * 重複チェック機能も含む
   * @param {string} event_name - イベント名
   * @param {number} start_frame - 開始フレーム
   */
  detectAndProcessBuff(event_name, start_frame) {
    const buff_info = detectCostRecoveryBuff(event_name, this.buff_data);
    if (buff_info) {
      // バフイベントを作成（セイア固有2設定を含むsettingsを渡す）
      const buff_event = this.createBuffEvent(buff_info, start_frame, this.settings);
      
      // 重複チェック: 同じbuff_targetを持つアクティブなバフがあるかチェック
      if (buff_info.buff_target) {
        const duplicateHandled = this.checkAndUpdateDuplicateBuffs(buff_info.buff_target, buff_event.start_frame);
      }
      
      // additional_eventsに追加
      // 注意: バフイベントは必ずthis.timeline_json.additional_eventsに保存すること
      // 理由: コスト計算時にここから読み取られるため（969行目参照）
      this.timeline_json.additional_events.push(buff_event);
    }
  }

  /**
   * タイムラインJSONを生成する（同期）
   * @returns {Object} timeline_json - 生成されたタイムラインデータ
   */
  createTimelineJSON() {
    try {
      // ========================================
      // Step 2. メインループ: 各タイムライン行を処理    
      // ========================================
      for (let i = 0; i < this.input_json.timeline.length; i++) {
        const row = this.input_json.timeline[i];
        
        // 特殊コマンドの処理を最初に実行
        this.processSpecialCommand(row);
        
        // 特殊コマンドの場合は通常の処理をスキップ
        if (row.is_special_command) {
          continue;
        }
        
        // resolveRowTimingメソッドがaddEventToTimelineを呼び出してイベントを追加済み
        this.resolveRowTiming(row, i);
      }

      // ========================================
      // Step 3. 最終出力の構築
      // ========================================
      this.timeline_json.metadata.final_cost = this.state.remaining_cost_points / COST_POINT_UNIT;
      this.timeline_json.metadata.final_frame = this.state.current_frame;
      this.timeline_json.metadata.total_duration = TLEditorCommon.framesToSeconds(this.state.current_frame);

      return this.timeline_json;

    } catch (error) {
      throw new Error(`TimelineProcessor.createTimelineJSON実行エラー: ${error.message}`);
    }
  }

  /**
   * timeline_jsonの各イベントを1行のテキストとして出力
   * @param {Object} options - 出力オプション
   * @param {boolean} options.show_cost - コスト情報を表示するかどうか（デフォルト: false）
   * @param {boolean} options.show_cost_points - コストポイント情報を表示するかどうか（デバッグ用、デフォルト: false）
   * @param {string} options.time_format - 時間表示形式 ('backward'|'forward'、デフォルト: 'backward')
   * @returns {string} 整形されたタイムライン文字列
   */
  formatTimelineAsText(options = {}) {
    const {
      show_cost = false,
      show_cost_points = false,
      time_format = 'backward'
    } = options;

    if (!this.timeline_json || !this.timeline_json.timeline) {
      return 'タイムラインデータがありません';
    }

    const lines = [];
    const battle_time = this.battle_time || COST_SETTINGS.DEFAULT_BATTLE_TIME;

    // ヘッダー行を追加
    lines.push('タイムライン（処理済み）');

    for (const event of this.timeline_json.timeline) {
      const time_str = this.formatGameTimeDisplay(event.frame, battle_time, time_format);
      let line = `${time_str} ${event.event_name}`;

      // コスト情報の追加
      if (show_cost) {
        const cost_display = (event.current_cost_display_only || 0).toFixed(1);
        line += ` (コスト: ${cost_display})`;
      }

      // デバッグ用コストポイント情報
      if (show_cost_points) {
        const cost_points = event.remaining_cost_points || 0;
        line += ` [CP: ${cost_points}]`;
      }

      lines.push(line);
    }

    return lines.join('\n');
  }

  /**
   * フレーム数からブルーアーカイブ形式の時間表示文字列を生成
   * 
   * 【機能】
   * - 既存のTLEditorCommon.framesToSeconds()とは異なり、ブルアカの表示形式に対応
   * - TLEditorCommon.framesToSeconds()は単純にフレーム→秒数変換のみ
   * - この関数は分:秒.ミリ秒形式での表示とカウントダウン/経過時間の選択が可能
   * 
   * @param {number} frame - フレーム数
   * @param {number} battle_time - 戦闘時間（秒）
   * @param {string} format - 表示形式（'backward'|'forward'）
   * @returns {string} 時間表示文字列（例: "2:58.567"）
   */
  formatGameTimeDisplay(frame, battle_time, format = 'backward') {
    const seconds = frame / 30.0; // 30FPSでフレームを秒に変換

    let display_seconds;
    if (format === 'backward') {
      // カウントダウン表示（ブルアカ標準）
      display_seconds = battle_time - seconds;
      if (display_seconds < 0) display_seconds = 0;
    } else {
      // 経過時間表示
      display_seconds = seconds;
    }

    // 分:秒.ミリ秒の形式に変換
    const minutes = Math.floor(display_seconds / 60);
    const remaining_seconds = display_seconds % 60;
    
    // 秒部分は小数点第3位まで表示（ブルアカ仕様）
    const seconds_str = remaining_seconds.toFixed(3).padStart(6, '0');
    
    return `${minutes}:${seconds_str}`;
  }
}

console.log('tl-editor.js: エクスポート処理開始');

// モジュールエクスポート（TimelineProcessorクラスを公開）
if (typeof module !== 'undefined' && module.exports) {
  // Node.js環境
  console.log('tl-editor.js: Node.js環境でエクスポート');
  module.exports = {
    TimelineProcessor
  };
} else if (typeof window !== 'undefined') {
  // ブラウザ環境
  console.log('tl-editor.js: ブラウザ環境でエクスポート');
  window.TLEditor = {
    TimelineProcessor
  };
  console.log('tl-editor.js: window.TLEditor =', window.TLEditor);
}

console.log('tl-editor.js: 初期化完了');

// ==============================
// IIFE 終了
// ==============================

})(); // IIFE終了
