/**
 * バフデータ定義ファイル
 * CORSエラー回避のため、JSONではなくJavaScriptファイルとして定義
 */

window.BUFF_DATA = {
  "cost_recovery_buffs": {
    "mizugi_hoshino": {
      "event_type": "cost_recovery_buff",
      "buff_name": "水着ホシノEX",
      "buff_target": "水着ホシノ",
      "buff_amount": 684,
      "duration_frames": 1500,
      "offset_frames": 21,
      "detection_patterns": [
        {
          "type": "regex",
          "pattern": ".*水.*(ホシノ|おじ).*",
          "description": "「水」と（「ホシノ」あるいは「おじ」）を含む"
        }
      ]
    },
    "seia": {
      "event_type": "cost_recovery_buff",
      "buff_name": "セイアEX",
      "buff_target": "セイア",
      "buff_amount": 718,
      "duration_frames": [450, 535],
      "offset_frames": 98,
      "detection_patterns": [
        {
          "type": "regex",
          "pattern": ".*セイア.*",
          "description": "「セイア」を含む"
        }
      ],
      "exclusion_patterns": [
        {
          "type": "regex", 
          "pattern": ".*水.*",
          "description": "「水」を含む場合は除外"
        }
      ]
    },
    "kanoe": {
      "event_type": "cost_recovery_buff",
      "buff_name": "カノエSS",
      "buff_target": "カノエ",
      "buff_amount": null,
      "base_buff_amount": 342,
      "additional_buff_amount": 85,
      "duration_frames": 1000000,
      "offset_frames": 0,
      "detection_patterns": []
    },
    "cherino": {
      "event_type": "cost_recovery_buff",
      "buff_name": "チェリノSS",
      "buff_target": "チェリノ",
      "buff_amount": null,
      "base_buff_amount": 511,
      "additional_buff_amount": 146,
      "duration_frames": 1000000,
      "offset_frames": 0,
      "detection_patterns": []
    },
    "general": {
      "event_type": "cost_recovery_buff",
      "buff_name": "コスト回復力増加",
      "buff_target": "NA",
      "buff_amount": null,
      "buff_value_type": null,
      "duration_frames": null,
      "offset_frames": 0,
      "detection_patterns": []
    }
  }
};

console.log('buffs.js: バフデータ読み込み完了', window.BUFF_DATA);