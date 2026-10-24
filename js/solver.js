/**
 * 簡単！美容サロン用シフト自動生成アプリ Ver2.0
 * 汎用シフト最適化ソルバー (ShiftSolver)
 * 店舗ルール・勤務時間帯・希望休・雇用形態・最大50名対応
 */

const ShiftSolver = (function() {

  // 日本の祝日算出
  function getHolidays(year, month) {
    const holidays = {};
    function setH(m, d, name) {
      if (m === month) holidays[d] = name;
    }

    setH(1, 1, '元日');
    setH(2, 11, '建国記念の日');
    setH(2, 23, '天皇誕生日');
    setH(4, 29, '昭和の日');
    setH(5, 3, '憲法記念日');
    setH(5, 4, 'みどりの日');
    setH(5, 5, 'こどもの日');
    setH(8, 11, '山の日');
    setH(11, 3, '文化の日');
    setH(11, 23, '勤労感謝の日');

    function getNthMonday(y, m, n) {
      let count = 0;
      for (let d = 1; d <= 31; d++) {
        const dt = new Date(y, m - 1, d);
        if (dt.getMonth() !== m - 1) break;
        if (dt.getDay() === 1) {
          count++;
          if (count === n) return d;
        }
      }
      return null;
    }

    const adultDay = getNthMonday(year, 1, 2);
    if (adultDay) setH(1, adultDay, '成人の日');

    const oceanDay = getNthMonday(year, 7, 3);
    if (oceanDay) setH(7, oceanDay, '海の日');

    const respectDay = getNthMonday(year, 9, 3);
    if (respectDay) setH(9, respectDay, '敬老の日');

    const sportsDay = getNthMonday(year, 10, 2);
    if (sportsDay) setH(10, sportsDay, 'スポーツの日');

    const springDay = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
    setH(3, springDay, '春分の日');

    const autumnDay = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
    setH(9, autumnDay, '秋分の日');

    if (respectDay && autumnDay === respectDay + 2) {
      setH(9, respectDay + 1, '国民の休日');
    }

    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      if (holidays[d]) {
        const dt = new Date(year, month - 1, d);
        if (dt.getDay() === 0) {
          let subD = d + 1;
          while (holidays[subD] && subD <= daysInMonth) subD++;
          if (subD <= daysInMonth) holidays[subD] = '振替休日';
        }
      }
    }

    return holidays;
  }

  /**
   * シフト自動生成メイン関数
   * @param {number} year - 対象年
   * @param {number} month - 対象月 (1-12)
   * @param {Object} config - サロン設定
   */
  function generateShift(year, month, config = {}) {
    const {
      staffList = [],             // 登録スタッフ（最大50名）
      closedDaysOfWeek = [],      // 定休日の曜日番号 [0:日, 1:月, 2:火, 3:水, 4:木, 5:金, 6:土]
      specialHolidays = [],       // 特別休業日 (例: [1, 2, 3])
      requiredStaffWeekday = 2,   // 平日必要人数
      requiredStaffWeekend = 4,   // 土日祝必要人数
      maxConsecutiveDays = 5,     // 連続勤務上限日数
      shiftSlots = [              // 勤務時間帯
        { id: 'early', name: '早番', ratio: 0.4 },
        { id: 'mid',   name: '中番', ratio: 0.4 },
        { id: 'late',  name: '遅番', ratio: 0.2 }
      ],
      staffRequests = {}          // 希望休/有給/業務委託出勤希望
    } = config;

    const daysInMonth = new Date(year, month, 0).getDate();
    const holidays = getHolidays(year, month);

    // 日ごとのカレンダー基本構造を初期化
    const dayMeta = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month - 1, d);
      const dayOfWeek = dt.getDay(); // 0:日, 6:土
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      const isNationalHoliday = !!holidays[d];
      const isClosed = closedDaysOfWeek.includes(dayOfWeek) || specialHolidays.includes(d);

      let reqCount = 0;
      if (!isClosed) {
        reqCount = (isWeekend || isNationalHoliday) ? Number(requiredStaffWeekend) : Number(requiredStaffWeekday);
      }

      dayMeta[d] = {
        day: d,
        dayOfWeek,
        isWeekend,
        isNationalHoliday,
        holidayName: holidays[d] || null,
        isClosed,
        requiredStaff: reqCount,
        assignedStaff: [] // [{ staffId, name, slotId, slotName }]
      };
    }

    // スタッフごとの状態管理マップ
    const staffState = {};
    staffList.forEach(s => {
      const targetDays = s.targetDays || (s.workType === 'contractor' ? 14 : 20);
      staffState[s.id] = {
        info: s,
        assignedDays: [],
        consecutiveDays: 0,
        targetDays: Number(targetDays)
      };
    });

    // 各スタッフの希望確認ヘルパー
    function getStaffRequest(staffId) {
      return staffRequests[staffId] || { offDays: [], paidLeaveDays: [], workCandidateDays: [] };
    }

    function isStaffUnavailable(staffId, day) {
      const req = getStaffRequest(staffId);
      if (req.offDays && req.offDays.includes(day)) return true;
      if (req.paidLeaveDays && req.paidLeaveDays.includes(day)) return true;
      return false;
    }

    // 1日ずつ割り当てシミュレーション
    for (let d = 1; d <= daysInMonth; d++) {
      const curDay = dayMeta[d];
      if (curDay.isClosed || curDay.requiredStaff <= 0) {
        // 定休日のため全員オフ
        staffList.forEach(s => {
          staffState[s.id].consecutiveDays = 0;
        });
        continue;
      }

      const needed = curDay.requiredStaff;
      const candidates = [];

      // 候補スタッフのスコアリングと選出
      staffList.forEach(s => {
        const state = staffState[s.id];
        const req = getStaffRequest(s.id);

        // 希望休・有給はスキップ
        if (isStaffUnavailable(s.id, d)) return;

        // 連続勤務上限チェック
        if (state.consecutiveDays >= maxConsecutiveDays) return;

        // 業務委託（出勤候補日指定）の場合、候補日外はスキップ
        if (s.workType === 'contractor' && req.workCandidateDays && req.workCandidateDays.length > 0) {
          if (!req.workCandidateDays.includes(d)) return;
        }

        // 月間目標日数達成済みの業務委託は優先度を下げる
        const isQuotaReached = state.assignedDays.length >= state.targetDays;

        // スコア計算（出勤意欲、残日数、連続勤務回避）
        let score = 100;
        score -= state.consecutiveDays * 15; // 連続勤務が多いほど減点
        score -= (state.assignedDays.length / (state.targetDays || 1)) * 30; // 目標達成に近いほど減点

        // 正社員常勤で土日出勤フラグがある場合加点
        if (curDay.isWeekend && s.workType === 'regular') score += 25;

        // 業務委託で候補日指定がある場合加点
        if (s.workType === 'contractor' && req.workCandidateDays && req.workCandidateDays.includes(d)) {
          score += 20;
        }

        if (isQuotaReached) score -= 50;

        candidates.push({ staff: s, score });
      });

      // スコア降順ソート
      candidates.sort((a, b) => b.score - a.score);

      // 必要人数分を配置
      const assigned = candidates.slice(0, needed);
      const assignedIds = new Set(assigned.map(c => c.staff.id));

      // スロット（早番・中番・遅番）の割り振り
      const availableSlots = [...shiftSlots];
      assigned.forEach((c, idx) => {
        const s = c.staff;
        const slot = availableSlots[idx % availableSlots.length] || { id: 'regular', name: '通常' };

        curDay.assignedStaff.push({
          staffId: s.id,
          name: s.name,
          slotId: slot.id,
          slotName: slot.name
        });

        staffState[s.id].assignedDays.push(d);
        staffState[s.id].consecutiveDays += 1;
      });

      // 未配置スタッフの連続勤務日数をリセット
      staffList.forEach(s => {
        if (!assignedIds.has(s.id)) {
          staffState[s.id].consecutiveDays = 0;
        }
      });
    }

    // 全体サマリーの集計
    const summary = {
      year,
      month,
      daysInMonth,
      totalRequiredSlots: 0,
      totalAssignedSlots: 0,
      staffSummary: {}
    };

    for (let d = 1; d <= daysInMonth; d++) {
      summary.totalRequiredSlots += dayMeta[d].requiredStaff;
      summary.totalAssignedSlots += dayMeta[d].assignedStaff.length;
    }

    staffList.forEach(s => {
      const state = staffState[s.id];
      const req = getStaffRequest(s.id);
      summary.staffSummary[s.id] = {
        name: s.name,
        assignedCount: state.assignedDays.length,
        offCount: (req.offDays || []).length,
        paidLeaveCount: (req.paidLeaveDays || []).length,
        fulfillmentRate: Math.round((state.assignedDays.length / (state.targetDays || 20)) * 100)
      };
    });

    return {
      success: true,
      year,
      month,
      daysInMonth,
      dayMeta,
      summary
    };
  }

  return {
    getHolidays,
    generateShift
  };
})();
