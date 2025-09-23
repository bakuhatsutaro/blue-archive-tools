/**
 * RadiatorManager - ラジエーター関連イベントの管理クラス
 * ラジエーター開始・終了イベントを検出し、有効区間を計算する
 * 
 * 【概要】
 * ラジエーター過負荷は、開始イベントと終了イベントのペアで構成される特殊なバフです。
 * このクラスは、タイムライン内のラジエーター関連イベントを検出し、
 * 有効区間（start_frame～end_frame）を計算して管理します。
 * 
 * 【主な機能】
 * 1. ラジエーター関連イベントの検出・抽出
 * 2. 開始・終了イベントペアからの有効区間計算
 * 3. 指定フレームでのラジエーター状態判定
 * 
 * 【使用方法】
 * const radiatorManager = new RadiatorManager(battle_time);
 * radiatorManager.extractAndProcessRadiatorEvents(timeline, additional_events);
 * const isActive = radiatorManager.isRadiatorActiveAt(frame);
 */

(function() {
'use strict';

/**
 * RadiatorManager - ラジエーター関連イベントの管理クラス
 */
class RadiatorManager {
  /**
   * コンストラクタ
   */
  constructor() {
    this.radiator_events = [];      // ラジエーター関連イベントのリスト
    this.radiator_intervals = [];   // ラジエーター有効区間のリスト
  }

  /**
   * イベント名がラジエーター関連かどうかを判定
   * @param {string} event_name - イベント名
   * @returns {boolean} ラジエーター関連の場合true
   */
  isRadiatorEvent(event_name) {
    if (!event_name) return false;
    return /ラジエータ|過負荷/.test(event_name);
  }

  /**
   * イベント名がラジエーター開始イベントかどうかを判定
   * @param {string} event_name - イベント名
   * @returns {boolean} ラジエーター開始イベントの場合true
   */
  isRadiatorStart(event_name) {
    if (!event_name) return false;
    return /(ラジエータ|過負荷).*[始起]/.test(event_name);
  }

  /**
   * イベント名がラジエーター終了イベントかどうかを判定
   * @param {string} event_name - イベント名
   * @returns {boolean} ラジエーター終了イベントの場合true
   */
  isRadiatorEnd(event_name) {
    if (!event_name) return false;
    return /(ラジエータ|過負荷).*[終了停止]/.test(event_name);
  }

  /**
   * ラジエーター関連イベントの抽出と処理
   * @param {Array} timeline - timelineイベントリスト（input_json.timeline - 既に時間変換済み）
   */
  extractAndProcessRadiatorEvents(timeline) {
    // radiator_eventsをクリア
    this.radiator_events = [];
    
    // timelineからラジエーター関連イベントを抽出
    for (const event of timeline) {
      if (this.isRadiatorEvent(event.event_name)) {
        // ラジエーター関連イベントを特殊コマンドとして認定（参照渡しで直接設定）
        event.is_special_command = true;
        console.log(`ラジエーター関連コマンドを特殊コマンド認定: ${event.event_name}`);
        
        // フレーム計算：event.frameがない場合はtimeから計算
        let frame = event.frame;
        if (frame === undefined) {
          if (event.time !== undefined) {
            // event.timeは既にInputProcessorでbackward/forward変換済みの経過時間
            // utilities.jsの共通関数を使用してフレーム計算
            frame = window.Utilities ? window.Utilities.secondsToFrames(event.time) : Math.round(event.time * 30);
          } else {
            // frameもtimeも指定されていない場合は不正なデータとしてスキップ
            console.warn(`ラジエーターイベントにフレーム情報がありません。スキップします: ${event.event_name}`);
            continue;
          }
        }
        
        const radiator_event = {
          frame: frame,
          event_name: event.event_name,
          is_start: this.isRadiatorStart(event.event_name),
          is_end: this.isRadiatorEnd(event.event_name),
          source: 'timeline'
        };
        console.log(`RadiatorManager: ラジエーターイベント作成:`, radiator_event);
        this.radiator_events.push(radiator_event);
      }
    }

    // フレーム順にソート
    this.radiator_events.sort((a, b) => a.frame - b.frame);

    // デバッグ: 抽出されたラジエーターイベントを出力
    console.log('RadiatorManager: 抽出されたラジエーターイベント:', this.radiator_events);

    // ラジエーター区間の計算は外部から呼び出し
    // this.calculateRadiatorIntervals() は tl-editor 側で battle_time_frames と共に呼び出される
  }

  /**
   * ラジエーター有効区間の計算
   * 開始イベントから終了イベントまでの区間を計算し、radiator_intervalsに格納
   * 
   * @param {number} battle_time_frames - 戦闘終了フレーム（自動延長用）
   * 
   * 【アルゴリズム】
   * 1. radiator_eventsを前から順に処理
   * 2. 開始イベント検出時：current_start_frameに記録
   * 3. 終了イベント検出時：区間をradiator_intervalsに追加、current_start_frameをクリア
   * 4. 最後に開始されたままの区間：battle_time_framesまで延長
   * 
   * 【エラーハンドリング】
   * - 開始されていない終了イベント：無視
   * - 複数の開始イベントが連続：前の区間をbattle_time_framesまで延長
   */
  calculateRadiatorIntervals(battle_time_frames = null) {
    this.radiator_intervals = [];
    let current_start_frame = null;

    for (const event of this.radiator_events) {
      // 開始フレームがnullかつ現在のeventが開始イベントの場合のみ処理
      if (current_start_frame === null && event.is_start) {
        current_start_frame = event.frame;
        console.log(`RadiatorManager: ラジエーター開始設定: ${current_start_frame}`);
        continue;
      }

      // 開始フレームが設定済みかつ現在のeventが終了イベントの場合のみ処理
      if (current_start_frame !== null && event.is_end) {
        this.radiator_intervals.push({
          start_frame: current_start_frame,
          end_frame: event.frame,
          auto_extended: false
        });
        console.log(`RadiatorManager: ラジエーター区間作成: ${current_start_frame} ～ ${event.frame}`);
        current_start_frame = null;
        continue;
      }

      // 上記条件を満たさない場合はスキップ
      continue;
    }

    // 最後に開始されたままの区間がある場合は戦闘終了まで延長
    if (current_start_frame !== null && battle_time_frames !== null) {
      this.radiator_intervals.push({
        start_frame: current_start_frame,
        end_frame: battle_time_frames,
        auto_extended: true
      });
      console.log(`ラジエーター区間を戦闘終了まで延長: ${current_start_frame} → ${battle_time_frames}`);
    }

    // デバッグ: 計算されたラジエーター区間を出力
    console.log('RadiatorManager: 計算されたラジエーター区間:', this.radiator_intervals);
  }

  /**
   * 指定フレームでラジエーターが有効かどうかを判定
   * @param {number} frame - 判定するフレーム
   * @returns {boolean} ラジエーターが有効な場合true
   */
  isRadiatorActiveAt(frame) {
    for (const interval of this.radiator_intervals) {
      if (frame >= interval.start_frame && frame < interval.end_frame) {
        return true;
      }
    }
    return false;
  }

  /**
   * 指定フレームで有効なラジエーター区間を取得
   * 【削除候補】現在未使用、削除検討対象
   * @param {number} frame - 判定するフレーム
   * @returns {Object|null} 有効な区間オブジェクト、なければnull
   */
  getActiveRadiatorInterval(frame) {
    for (const interval of this.radiator_intervals) {
      if (frame >= interval.start_frame && frame < interval.end_frame) {
        return interval;
      }
    }
    return null;
  }

  /**
   * ラジエーター区間の数を取得
   * 【削除候補】現在未使用、削除検討対象
   * @returns {number} ラジエーター区間の数
   */
  getRadiatorIntervalCount() {
    return this.radiator_intervals.length;
  }

  // getRadiatorInfo()とtoString()メソッドは削除されました
  // 理由：デバッグ用途で使用可能性が低く、必要に応じて再実装可能
}

// モジュールエクスポート
if (typeof module !== 'undefined' && module.exports) {
  // Node.js環境
  module.exports = { RadiatorManager };
} else if (typeof window !== 'undefined') {
  // ブラウザ環境
  window.RadiatorManager = RadiatorManager;
}

})(); // IIFE終了