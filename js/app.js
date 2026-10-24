/**
 * 簡単！美容サロン用シフト自動生成アプリ Ver2.0
 * アプリケーションメインロジック (app.js)
 */

(function() {
  'use strict';

  // ローカルストレージキー
  const STORAGE_KEYS = {
    CONFIG: 'salon_shift_v2_config',
    STAFF: 'salon_shift_v2_staff_list',
    SETTINGS: 'salon_shift_v2_settings',
    RULES: 'salon_shift_v2_rules',
    SESSION: 'salon_shift_v2_session',
    REQUESTS: 'salon_shift_v2_requests'
  };

  // プラン定義
  const PLANS = {
    free: { id: 'free', name: '無料プラン', price: 0, maxStaff: 4, label: '4名まで無料' },
    petit: { id: 'petit', name: 'プチプラン', price: 980, maxStaff: 10, label: '5〜10名' },
    standard: { id: 'standard', name: 'スタンダードプラン', price: 1280, maxStaff: 25, label: '11〜25名' },
    premium: { id: 'premium', name: 'プレミアムプラン', price: 2980, maxStaff: 50, label: '26〜50名' }
  };

  // アプリケーション状態
  const state = {
    currentStep: 1, // 1: 認証・登録, 2: サロン基本設定&雇用者リスト, 3: シフト条件設定, 4: シフトカレンダー出力
    selectedPlan: 'free',
    accountType: 'corporate', // corporate, individual_business, individual
    currentUser: null,
    staffList: [],
    settings: {
      salonName: 'サンプル美容サロン',
      openTime: '10:00',
      closeTime: '20:00',
      closedDays: [3], // 水曜定休（初期値）
      shiftSlots: {
        early: { active: true, name: '早番', start: '09:30', end: '18:30', breakMin: 60 },
        mid:   { active: true, name: '中番', start: '11:00', end: '20:00', breakMin: 60 },
        late:  { active: true, name: '遅番', start: '12:30', end: '21:30', breakMin: 60 }
      }
    },
    rules: {
      requiredStaffWeekday: 2,
      requiredStaffWeekend: 4,
      maxConsecutiveDays: 5,
      targetYear: 2026,
      targetMonth: 12,
      specialHolidays: [31] // 年末休業等
    },
    staffRequests: {},
    generatedResult: null
  };

  // 日付計算ユーティリティ
  function calculateAge(birthDateStr) {
    if (!birthDateStr) return '';
    const birth = new Date(birthDateStr);
    if (isNaN(birth.getTime())) return '';
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age >= 0 ? `${age}歳` : '';
  }

  function calculateTenure(hireDateStr) {
    if (!hireDateStr) return '';
    const hire = new Date(hireDateStr);
    if (isNaN(hire.getTime())) return '';
    const today = new Date();
    let totalMonths = (today.getFullYear() - hire.getFullYear()) * 12 + (today.getMonth() - hire.getMonth());
    if (today.getDate() < hire.getDate()) {
      totalMonths--;
    }
    if (totalMonths < 0) return '入社予定';
    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    if (years === 0) return `${months}ヶ月`;
    if (months === 0) return `${years}年`;
    return `${years}年${months}ヶ月`;
  }

  // 初期化
  function init() {
    loadStoredData();
    renderPlanCards();
    setupEventListeners();
    setupInitialStaffRows();
    updateNavigationUI();
  }

  // ストレージから読み込み
  function loadStoredData() {
    try {
      const savedConfig = localStorage.getItem(STORAGE_KEYS.CONFIG);
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        state.selectedPlan = parsed.selectedPlan || 'free';
        state.accountType = parsed.accountType || 'corporate';
        state.currentUser = parsed.currentUser || null;
      }
      const savedStaff = localStorage.getItem(STORAGE_KEYS.STAFF);
      if (savedStaff) {
        state.staffList = JSON.parse(savedStaff);
      }
      const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (savedSettings) {
        state.settings = Object.assign(state.settings, JSON.parse(savedSettings));
      }
      const savedRules = localStorage.getItem(STORAGE_KEYS.RULES);
      if (savedRules) {
        state.rules = Object.assign(state.rules, JSON.parse(savedRules));
      }
    } catch (e) {
      console.warn('Storage load error:', e);
    }
  }

  // ストレージへ保存
  function saveAllData() {
    try {
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify({
        selectedPlan: state.selectedPlan,
        accountType: state.accountType,
        currentUser: state.currentUser
      }));
      localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify(state.staffList));
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
      localStorage.setItem(STORAGE_KEYS.RULES, JSON.stringify(state.rules));
    } catch (e) {
      console.warn('Storage save error:', e);
    }
  }

  // プランカード描画
  function renderPlanCards() {
    const container = document.getElementById('plans-grid-container');
    if (!container) return;

    let html = '';
    Object.values(PLANS).forEach(plan => {
      const isSelected = plan.id === state.selectedPlan;
      const isPopular = plan.id === 'standard';
      const isFree = plan.id === 'free';

      html += `
        <div class="plan-card ${isSelected ? 'selected' : ''}" data-plan-id="${plan.id}">
          <div>
            ${isPopular ? '<span class="plan-badge popular">一番人気</span>' : (isFree ? '<span class="plan-badge trial">ずっと無料</span>' : '<span class="plan-badge trial">1ヶ月無料体験</span>')}
            <div class="plan-name">${plan.name}</div>
            <div class="plan-capacity">${plan.label}</div>
            <div class="plan-price-row">
              <span class="plan-price">¥${plan.price.toLocaleString()}</span>
              <span class="plan-period">/ 月 (税込)</span>
            </div>
            <ul class="plan-features">
              <li>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                最大スタッフ登録人数: ${plan.maxStaff}名
              </li>
              <li>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                シフト自動作成エンジン無制限
              </li>
              <li>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                Excel / CSVダウンロード対応
              </li>
              <li>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                初期1か月無料トライアル付き
              </li>
            </ul>
          </div>
          <div style="margin-top: 1.25rem;">
            <button type="button" class="btn ${isSelected ? 'btn-primary' : 'btn-secondary'}" style="width:100%; font-size:0.85rem;">
              ${isSelected ? '選択中' : 'このプランを選択'}
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // クリックイベント設定
    container.querySelectorAll('.plan-card').forEach(card => {
      card.addEventListener('click', () => {
        const planId = card.getAttribute('data-plan-id');
        selectPlan(planId);
      });
    });
  }

  function selectPlan(planId) {
    state.selectedPlan = planId;
    renderPlanCards();
    updatePlanPillUI();
    showToast(`${PLANS[planId].name} を選択しました（1ヶ月無料体験適用）`, 'info');
  }

  function updatePlanPillUI() {
    const pill = document.getElementById('header-plan-name');
    if (pill) {
      pill.textContent = PLANS[state.selectedPlan].name;
    }
  }

  // ステップナビゲーションUI更新
  function goToStep(stepNumber) {
    state.currentStep = stepNumber;
    updateNavigationUI();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateNavigationUI() {
    // ステップインジケーター
    document.querySelectorAll('.step-item').forEach(item => {
      const step = parseInt(item.getAttribute('data-step'), 10);
      item.classList.remove('active', 'completed');
      if (step === state.currentStep) {
        item.classList.add('active');
      } else if (step < state.currentStep) {
        item.classList.add('completed');
      }
    });

    // ページビュー切り替え
    document.querySelectorAll('.page-view').forEach(view => {
      view.classList.remove('active');
    });

    const targetView = document.getElementById(`page-step-${state.currentStep}`);
    if (targetView) {
      targetView.classList.add('active');
    }

    // ステップに応じた個別処理
    if (state.currentStep === 2) {
      renderStaffTable();
      populateSettingsInputs();
    } else if (state.currentStep === 3) {
      renderRuleStaffSummary();
    } else if (state.currentStep === 4) {
      runShiftSolverAndRender();
    }
  }

  // 雇用者リストテーブルの初期5行セットアップ
  function setupInitialStaffRows() {
    if (state.staffList.length === 0) {
      // 5行の空・初期テンプレートを用意
      for (let i = 1; i <= 5; i++) {
        state.staffList.push({
          id: `staff_${Date.now()}_${i}`,
          name: '',
          hireDate: '',
          birthDate: '',
          phone: '',
          address: '',
          notes: '',
          workType: 'regular',
          targetDays: 20
        });
      }
    }
  }

  // 雇用者リストテーブルの描画
  function renderStaffTable() {
    const tbody = document.getElementById('staff-table-body');
    if (!tbody) return;

    const maxCapacity = PLANS[state.selectedPlan].maxStaff;
    const capacityNotice = document.getElementById('staff-capacity-count');
    if (capacityNotice) {
      const validCount = state.staffList.filter(s => s.name.trim() !== '').length;
      capacityNotice.textContent = `登録状況: ${validCount}名 / 上限${maxCapacity}名（${PLANS[state.selectedPlan].name}）`;
      if (validCount > maxCapacity) {
        capacityNotice.style.color = '#ef4444';
      } else {
        capacityNotice.style.color = 'var(--accent-light)';
      }
    }

    let rowsHtml = '';
    state.staffList.forEach((staff, index) => {
      const ageStr = calculateAge(staff.birthDate);
      const tenureStr = calculateTenure(staff.hireDate);

      rowsHtml += `
        <tr data-index="${index}">
          <td style="text-align:center; font-family:var(--font-mono); font-size:0.8rem; color:var(--text-muted);">${index + 1}</td>
          <td>
            <input type="text" class="staff-input staff-name" placeholder="例: 木下 遥" value="${escapeHtml(staff.name)}" required>
          </td>
          <td>
            <input type="date" class="staff-input staff-hire-date" value="${staff.hireDate}">
          </td>
          <td>
            <input type="date" class="staff-input staff-birth-date" value="${staff.birthDate}">
          </td>
          <td style="text-align:center;">
            <span class="staff-calc-badge staff-age-badge">${ageStr || '未計算'}</span>
          </td>
          <td style="text-align:center;">
            <span class="staff-calc-badge staff-tenure-badge">${tenureStr || '未計算'}</span>
          </td>
          <td>
            <select class="staff-input staff-work-type">
              <option value="regular" ${staff.workType === 'regular' ? 'selected' : ''}>正社員(常勤)</option>
              <option value="alternate" ${staff.workType === 'alternate' ? 'selected' : ''}>正社員(隔週)</option>
              <option value="contractor" ${staff.workType === 'contractor' ? 'selected' : ''}>業務委託</option>
              <option value="part" ${staff.workType === 'part' ? 'selected' : ''}>パート・アルバイト</option>
            </select>
          </td>
          <td>
            <input type="tel" class="staff-input staff-phone" placeholder="090-0000-0000" value="${escapeHtml(staff.phone || '')}">
          </td>
          <td>
            <input type="text" class="staff-input staff-address" placeholder="東京都..." value="${escapeHtml(staff.address || '')}">
          </td>
          <td>
            <input type="text" class="staff-input staff-notes" placeholder="希望等" value="${escapeHtml(staff.notes || '')}">
          </td>
          <td style="text-align:center;">
            <button type="button" class="btn btn-danger-outline btn-delete-row" data-index="${index}" title="この行を削除">削除</button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = rowsHtml;

    // テーブル内のイベントリスナー設定
    tbody.querySelectorAll('tr').forEach(row => {
      const idx = parseInt(row.getAttribute('data-index'), 10);

      const nameInput = row.querySelector('.staff-name');
      const hireInput = row.querySelector('.staff-hire-date');
      const birthInput = row.querySelector('.staff-birth-date');
      const workTypeSelect = row.querySelector('.staff-work-type');
      const phoneInput = row.querySelector('.staff-phone');
      const addressInput = row.querySelector('.staff-address');
      const notesInput = row.querySelector('.staff-notes');
      const ageBadge = row.querySelector('.staff-age-badge');
      const tenureBadge = row.querySelector('.staff-tenure-badge');
      const deleteBtn = row.querySelector('.btn-delete-row');

      // 生年月日変更で即時年齢計算
      birthInput.addEventListener('change', () => {
        state.staffList[idx].birthDate = birthInput.value;
        const calc = calculateAge(birthInput.value);
        ageBadge.textContent = calc || '未計算';
        saveAllData();
      });

      // 入社日変更で即時入社後経過年月計算
      hireInput.addEventListener('change', () => {
        state.staffList[idx].hireDate = hireInput.value;
        const calc = calculateTenure(hireInput.value);
        tenureBadge.textContent = calc || '未計算';
        saveAllData();
      });

      nameInput.addEventListener('input', () => {
        state.staffList[idx].name = nameInput.value;
        saveAllData();
      });

      workTypeSelect.addEventListener('change', () => {
        state.staffList[idx].workType = workTypeSelect.value;
        saveAllData();
      });

      phoneInput.addEventListener('input', () => {
        state.staffList[idx].phone = phoneInput.value;
        saveAllData();
      });

      addressInput.addEventListener('input', () => {
        state.staffList[idx].address = addressInput.value;
        saveAllData();
      });

      notesInput.addEventListener('input', () => {
        state.staffList[idx].notes = notesInput.value;
        saveAllData();
      });

      deleteBtn.addEventListener('click', () => {
        if (state.staffList.length <= 1) {
          showToast('最低1行は必要です', 'error');
          return;
        }
        state.staffList.splice(idx, 1);
        saveAllData();
        renderStaffTable();
        showToast('スタッフ行を削除しました', 'info');
      });
    });
  }

  // スタッフ行の追加
  function addNewStaffRow() {
    const maxCapacity = PLANS[state.selectedPlan].maxStaff;
    if (state.staffList.length >= maxCapacity) {
      showToast(`現在のプラン（${PLANS[state.selectedPlan].name}）の上限${maxCapacity}名に達しています。プランアップグレードをご検討ください。`, 'error');
      return;
    }

    state.staffList.push({
      id: `staff_${Date.now()}_${state.staffList.length + 1}`,
      name: '',
      hireDate: '',
      birthDate: '',
      phone: '',
      address: '',
      notes: '',
      workType: 'regular',
      targetDays: 20
    });

    saveAllData();
    renderStaffTable();
    showToast('新しいスタッフ入力行を追加しました', 'success');
  }

  // デモ用サンプルスタッフの一括入力
  function loadDemoStaff() {
    state.staffList = [
      { id: 's1', name: '山田 花子', hireDate: '2022-04-01', birthDate: '1995-06-15', phone: '090-1111-2222', address: '東京都中央区銀座1-2', notes: '店長/土日出勤', workType: 'regular', targetDays: 21 },
      { id: 's2', name: '佐藤 美咲', hireDate: '2023-01-10', birthDate: '1998-11-20', phone: '080-2222-3333', address: '東京都江東区豊洲3-4', notes: '正社員・早番希望', workType: 'regular', targetDays: 20 },
      { id: 's3', name: '鈴木 菜々', hireDate: '2023-09-01', birthDate: '2001-03-08', phone: '090-3333-4444', address: '千葉県浦安市北栄1-1', notes: '隔週勤務(3/4日)', workType: 'alternate', targetDays: 16 },
      { id: 's4', name: '高橋 凛',   hireDate: '2024-02-15', birthDate: '1993-08-25', phone: '090-4444-5555', address: '東京都墨田区錦糸2-3', notes: '業務委託/月14日希望', workType: 'contractor', targetDays: 14 },
      { id: 's5', name: '田中 友香', hireDate: '2024-06-01', birthDate: '2000-12-05', phone: '080-5555-6666', address: '東京都江戸川区西葛西5-6', notes: 'パート/平日メイン', workType: 'part', targetDays: 12 }
    ];
    saveAllData();
    renderStaffTable();
    showToast('デモ用のサンプル雇用者リストを反映しました', 'success');
  }

  // 設定入力値の反映
  function populateSettingsInputs() {
    const salonNameInput = document.getElementById('setting-salon-name');
    if (salonNameInput) salonNameInput.value = state.settings.salonName || '';

    const openInput = document.getElementById('setting-open-time');
    const closeInput = document.getElementById('setting-close-time');
    if (openInput) openInput.value = state.settings.openTime || '10:00';
    if (closeInput) closeInput.value = state.settings.closeTime || '20:00';

    // 定休日チェックボックス
    document.querySelectorAll('.closed-day-check').forEach(cb => {
      const dayVal = parseInt(cb.value, 10);
      cb.checked = state.settings.closedDays.includes(dayVal);
      const pill = cb.closest('.day-pill-checkbox');
      if (pill) {
        if (cb.checked) pill.classList.add('checked');
        else pill.classList.remove('checked');
      }
    });

    // シフト枠
    const earlyCheck = document.getElementById('slot-early-active');
    const midCheck = document.getElementById('slot-mid-active');
    const lateCheck = document.getElementById('slot-late-active');
    if (earlyCheck) earlyCheck.checked = state.settings.shiftSlots.early.active;
    if (midCheck) midCheck.checked = state.settings.shiftSlots.mid.active;
    if (lateCheck) lateCheck.checked = state.settings.shiftSlots.late.active;
  }

  function saveSettingsFromUI() {
    const salonNameInput = document.getElementById('setting-salon-name');
    if (salonNameInput && salonNameInput.value.trim()) {
      state.settings.salonName = salonNameInput.value.trim();
    }

    const openInput = document.getElementById('setting-open-time');
    const closeInput = document.getElementById('setting-close-time');
    if (openInput) state.settings.openTime = openInput.value;
    if (closeInput) state.settings.closeTime = closeInput.value;

    const checkedDays = [];
    document.querySelectorAll('.closed-day-check:checked').forEach(cb => {
      checkedDays.push(parseInt(cb.value, 10));
    });
    state.settings.closedDays = checkedDays;

    saveAllData();
  }

  // ステップ3: シフト作成条件ページのスタッフ一覧サマリー描画
  function renderRuleStaffSummary() {
    const listContainer = document.getElementById('rule-staff-preference-list');
    if (!listContainer) return;

    const activeStaff = state.staffList.filter(s => s.name.trim() !== '');
    if (activeStaff.length === 0) {
      listContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">有効なスタッフが登録されていません。ステップ2に戻って雇用者リストを入力してください。</p>';
      return;
    }

    let html = '';
    activeStaff.forEach(s => {
      const req = state.staffRequests[s.id] || { offDays: [], paidLeaveDays: [], workCandidateDays: [] };
      const offCount = (req.offDays || []).length;
      const paidCount = (req.paidLeaveDays || []).length;

      html += `
        <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-md); padding:1rem; margin-bottom:0.75rem; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.75rem;">
          <div>
            <div style="font-weight:700; color:var(--text-main); font-size:0.95rem;">${escapeHtml(s.name)} <span style="font-size:0.75rem; color:var(--accent-light); font-weight:normal;">(${getRoleLabel(s.workType)})</span></div>
            <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.2rem;">
              希望休日: ${offCount}日 | 有給申請: ${paidCount}日 | 月間目標: ${s.targetDays || 20}日出勤
            </div>
          </div>
          <div style="display:flex; gap:0.5rem;">
            <button type="button" class="btn btn-secondary btn-set-off-days" data-staff-id="${s.id}" style="font-size:0.8rem; padding:0.4rem 0.85rem;">
              希望休を設定 (${offCount})
            </button>
          </div>
        </div>
      `;
    });

    listContainer.innerHTML = html;

    // 希望休モーダルオープン
    listContainer.querySelectorAll('.btn-set-off-days').forEach(btn => {
      btn.addEventListener('click', () => {
        const staffId = btn.getAttribute('data-staff-id');
        openOffDayModal(staffId);
      });
    });
  }

  function getRoleLabel(type) {
    switch (type) {
      case 'regular': return '正社員(常勤)';
      case 'alternate': return '正社員(隔週)';
      case 'contractor': return '業務委託';
      case 'part': return 'パート・アルバイト';
      default: return 'スタッフ';
    }
  }

  // 希望休設定モーダル
  function openOffDayModal(staffId) {
    const staff = state.staffList.find(s => s.id === staffId);
    if (!staff) return;

    const modal = document.getElementById('offday-modal');
    const modalTitle = document.getElementById('offday-modal-staff-name');
    const calendarGrid = document.getElementById('offday-modal-calendar');

    modalTitle.textContent = `${staff.name} さんの希望休・休暇設定`;

    const year = state.rules.targetYear || 2026;
    const month = state.rules.targetMonth || 12;
    const daysInMonth = new Date(year, month, 0).getDate();

    const req = state.staffRequests[staffId] || { offDays: [], paidLeaveDays: [], workCandidateDays: [] };
    const curOff = new Set(req.offDays || []);
    const curPaid = new Set(req.paidLeaveDays || []);

    let calHtml = '';
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month - 1, d);
      const dw = dt.getDay();
      let cls = '';
      if (curOff.has(d)) cls = 'selected-off';
      else if (curPaid.has(d)) cls = 'selected-paid';

      calHtml += `
        <div class="modal-day-box ${cls}" data-day="${d}" style="cursor:pointer; padding:0.5rem; border-radius:6px; border:1px solid var(--border); text-align:center; font-size:0.85rem; background:var(--bg-input);">
          <div style="font-weight:700;">${d}日</div>
          <div style="font-size:0.7rem; color:var(--text-muted);">${['日','月','火','水','木','金','土'][dw]}</div>
          <div class="day-status-tag" style="font-size:0.65rem; margin-top:2px;">${curOff.has(d) ? '希望休' : (curPaid.has(d) ? '有給' : '')}</div>
        </div>
      `;
    }

    calendarGrid.innerHTML = calHtml;

    // クリックで状態切り替え: なし -> 希望休 -> 有給 -> なし
    calendarGrid.querySelectorAll('.modal-day-box').forEach(box => {
      box.addEventListener('click', () => {
        const d = parseInt(box.getAttribute('data-day'), 10);
        const tag = box.querySelector('.day-status-tag');
        if (curOff.has(d)) {
          curOff.delete(d);
          curPaid.add(d);
          box.classList.remove('selected-off');
          box.classList.add('selected-paid');
          box.style.borderColor = '#8b5cf6';
          box.style.background = 'rgba(139, 92, 246, 0.2)';
          tag.textContent = '有給';
        } else if (curPaid.has(d)) {
          curPaid.delete(d);
          box.classList.remove('selected-paid');
          box.style.borderColor = 'var(--border)';
          box.style.background = 'var(--bg-input)';
          tag.textContent = '';
        } else {
          curOff.add(d);
          box.classList.add('selected-off');
          box.style.borderColor = '#ef4444';
          box.style.background = 'rgba(239, 68, 68, 0.2)';
          tag.textContent = '希望休';
        }
      });
    });

    // 保存ボタン
    const saveBtn = document.getElementById('btn-save-offdays');
    saveBtn.onclick = () => {
      state.staffRequests[staffId] = {
        offDays: Array.from(curOff),
        paidLeaveDays: Array.from(curPaid)
      };
      saveAllData();
      modal.classList.remove('active');
      renderRuleStaffSummary();
      showToast(`${staff.name} さんの希望休を保存しました`, 'success');
    };

    modal.classList.add('active');
  }

  // ステップ4: シフト自動生成実行およびカレンダー描画
  function runShiftSolverAndRender() {
    const activeStaff = state.staffList.filter(s => s.name.trim() !== '');
    if (activeStaff.length === 0) {
      showToast('スタッフが登録されていません', 'error');
      goToStep(2);
      return;
    }

    const weekdayReq = parseInt(document.getElementById('rule-weekday-count')?.value || state.rules.requiredStaffWeekday, 10);
    const weekendReq = parseInt(document.getElementById('rule-weekend-count')?.value || state.rules.requiredStaffWeekend, 10);
    const maxConsec = parseInt(document.getElementById('rule-max-consec')?.value || state.rules.maxConsecutiveDays, 10);

    state.rules.requiredStaffWeekday = weekdayReq;
    state.rules.requiredStaffWeekend = weekendReq;
    state.rules.maxConsecutiveDays = maxConsec;

    // ソルバー実行
    const solverConfig = {
      staffList: activeStaff,
      closedDaysOfWeek: state.settings.closedDays || [],
      specialHolidays: state.rules.specialHolidays || [],
      requiredStaffWeekday: weekdayReq,
      requiredStaffWeekend: weekendReq,
      maxConsecutiveDays: maxConsec,
      staffRequests: state.staffRequests
    };

    const year = state.rules.targetYear || 2026;
    const month = state.rules.targetMonth || 12;

    const result = ShiftSolver.generateShift(year, month, solverConfig);
    state.generatedResult = result;

    renderCalendarMatrix(result);
  }

  // カレンダーマトリクステーブル描画
  function renderCalendarMatrix(result) {
    const table = document.getElementById('calendar-matrix-table');
    const headerTitle = document.getElementById('calendar-view-title');
    if (!table) return;

    headerTitle.textContent = `${state.settings.salonName} - ${result.year}年${result.month}月度 確定シフト表`;

    const { daysInMonth, dayMeta, summary } = result;
    const activeStaff = state.staffList.filter(s => s.name.trim() !== '');

    // ヘッダー行作成
    let theadHtml = '<thead><tr><th style="min-width:110px; position:sticky; left:0; z-index:5; background:rgba(15, 23, 42, 0.98);">スタッフ名</th>';
    for (let d = 1; d <= daysInMonth; d++) {
      const meta = dayMeta[d];
      let dayClass = '';
      if (meta.dayOfWeek === 6) dayClass = 'col-sat';
      else if (meta.dayOfWeek === 0) dayClass = 'col-sun';
      else if (meta.isNationalHoliday) dayClass = 'col-holiday';

      const dwName = ['日','月','火','水','木','金','土'][meta.dayOfWeek];
      theadHtml += `
        <th class="${dayClass}" title="${meta.holidayName || ''}">
          <div>${d}</div>
          <div style="font-size:0.68rem; font-weight:normal;">${dwName}</div>
        </th>
      `;
    }
    theadHtml += '<th style="min-width:70px;">出勤計</th></tr></thead>';

    // ボディ行作成
    let tbodyHtml = '<tbody>';
    activeStaff.forEach(staff => {
      const sum = summary.staffSummary[staff.id] || { assignedCount: 0 };
      tbodyHtml += `<tr><td style="position:sticky; left:0; z-index:3; background:rgba(21, 29, 45, 0.95); font-weight:700; text-align:left; padding-left:0.6rem;">${escapeHtml(staff.name)}</td>`;

      for (let d = 1; d <= daysInMonth; d++) {
        const meta = dayMeta[d];
        const isAssigned = meta.assignedStaff.find(a => a.staffId === staff.id);
        const req = state.staffRequests[staff.id] || {};
        const isOff = (req.offDays || []).includes(d);
        const isPaid = (req.paidLeaveDays || []).includes(d);

        let cellContent = '';
        if (meta.isClosed) {
          cellContent = '<span style="color:var(--text-dim); font-size:0.7rem;">定休</span>';
        } else if (isAssigned) {
          const slotClass = isAssigned.slotId === 'early' ? 'work-early' : (isAssigned.slotId === 'mid' ? 'work-mid' : 'work-late');
          cellContent = `<span class="shift-badge-cell ${slotClass}">${isAssigned.slotName}</span>`;
        } else if (isPaid) {
          cellContent = '<span class="shift-badge-cell paid">有給</span>';
        } else if (isOff) {
          cellContent = '<span class="shift-badge-cell off">希休</span>';
        } else {
          cellContent = '<span style="color:var(--text-dim); font-size:0.7rem;">公休</span>';
        }

        tbodyHtml += `<td>${cellContent}</td>`;
      }

      tbodyHtml += `<td style="font-weight:700; font-family:var(--font-mono); color:var(--accent-light);">${sum.assignedCount}日</td></tr>`;
    });

    // 必要人数・充足人数フッター行
    tbodyHtml += '<tr style="background:rgba(15, 23, 42, 0.9); font-weight:700;"><td style="position:sticky; left:0; z-index:3; background:rgba(15, 23, 42, 0.95); text-align:left; padding-left:0.6rem;">配置 / 必要</td>';
    for (let d = 1; d <= daysInMonth; d++) {
      const meta = dayMeta[d];
      if (meta.isClosed) {
        tbodyHtml += '<td style="color:var(--text-dim);">-</td>';
      } else {
        const ok = meta.assignedStaff.length >= meta.requiredStaff;
        const color = ok ? 'var(--color-success)' : 'var(--color-danger)';
        tbodyHtml += `<td style="color:${color}; font-size:0.75rem;">${meta.assignedStaff.length}/${meta.requiredStaff}</td>`;
      }
    }
    tbodyHtml += `<td>${summary.totalAssignedSlots}/${summary.totalRequiredSlots}</td></tr>`;
    tbodyHtml += '</tbody>';

    table.innerHTML = theadHtml + tbodyHtml;
  }

  // Excel / CSVエクスポート
  function exportShiftCSV() {
    if (!state.generatedResult) {
      showToast('シフトが生成されていません', 'error');
      return;
    }

    const { year, month, daysInMonth, dayMeta } = state.generatedResult;
    const activeStaff = state.staffList.filter(s => s.name.trim() !== '');

    let csvContent = '\uFEFF'; // UTF-8 BOM
    // ヘッダー
    const headerRow = ['氏名'];
    for (let d = 1; d <= daysInMonth; d++) {
      const dw = ['日','月','火','水','木','金','土'][dayMeta[d].dayOfWeek];
      headerRow.push(`${d}日(${dw})`);
    }
    headerRow.push('合計出勤日数');
    csvContent += headerRow.join(',') + '\r\n';

    // 各スタッフ
    activeStaff.forEach(staff => {
      const row = [staff.name];
      let totalWork = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const meta = dayMeta[d];
        const assigned = meta.assignedStaff.find(a => a.staffId === staff.id);
        const req = state.staffRequests[staff.id] || {};
        if (meta.isClosed) {
          row.push('定休');
        } else if (assigned) {
          row.push(assigned.slotName);
          totalWork++;
        } else if ((req.paidLeaveDays || []).includes(d)) {
          row.push('有給');
        } else if ((req.offDays || []).includes(d)) {
          row.push('希望休');
        } else {
          row.push('公休');
        }
      }
      row.push(`${totalWork}日`);
      csvContent += row.join(',') + '\r\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${state.settings.salonName}_${year}年${month}月_シフト表.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('シフト表CSVファイルをダウンロードしました', 'success');
  }

  // イベントリスナー全般の設定
  function setupEventListeners() {
    // ステップインジケータークリック
    document.querySelectorAll('.step-item').forEach(item => {
      item.addEventListener('click', () => {
        const step = parseInt(item.getAttribute('data-step'), 10);
        goToStep(step);
      });
    });

    // 認証タブ切り替え（1ページ目）
    document.querySelectorAll('.auth-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const targetFormId = btn.getAttribute('data-target');
        document.querySelectorAll('.auth-form-panel').forEach(panel => panel.style.display = 'none');
        const activePanel = document.getElementById(targetFormId);
        if (activePanel) activePanel.style.display = 'block';
      });
    });

    // 登録区分ラジオタイル（法人/個人事業主/個人）
    document.querySelectorAll('.radio-tile').forEach(tile => {
      tile.addEventListener('click', () => {
        document.querySelectorAll('.radio-tile').forEach(t => t.classList.remove('selected'));
        tile.classList.add('selected');
        const val = tile.getAttribute('data-type');
        state.accountType = val;
        const nameLabel = document.getElementById('company-name-label');
        if (nameLabel) {
          nameLabel.textContent = val === 'individual' ? 'お名前（個人名）' : '会社名 / 屋号';
        }
      });
    });

    // 管理者登録フォーム送信
    const adminRegForm = document.getElementById('admin-register-form');
    if (adminRegForm) {
      adminRegForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('admin-email').value.trim();
        const pw = document.getElementById('admin-pw').value;
        const company = document.getElementById('admin-company').value.trim();
        const phone = document.getElementById('admin-phone').value.trim();
        const address = document.getElementById('admin-address').value.trim();

        if (pw.length < 8 || pw.length > 16) {
          showToast('パスワードは8〜16桁の英数字で入力してください', 'error');
          return;
        }

        state.currentUser = {
          role: 'admin',
          email,
          company,
          phone,
          address,
          plan: state.selectedPlan
        };

        if (company) state.settings.salonName = company;

        saveAllData();
        showToast('管理者アカウントと初期登録が完了しました！1ヶ月無料体験が適用されます。', 'success');
        goToStep(2);
      });
    }

    // ログインフォーム送信
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const pw = document.getElementById('login-pw').value;
        if (!email || !pw) {
          showToast('メールアドレスとパスワードを入力してください', 'error');
          return;
        }
        state.currentUser = { role: 'admin', email };
        saveAllData();
        showToast('ログインしました', 'success');
        goToStep(2);
      });
    }

    // パスワードリセットリンク
    const forgotLinks = document.querySelectorAll('.btn-forgot-password');
    forgotLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const modal = document.getElementById('password-reset-modal');
        if (modal) modal.classList.add('active');
      });
    });

    // パスワードリセットフォーム
    const resetForm = document.getElementById('password-reset-form');
    if (resetForm) {
      resetForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('reset-email').value.trim();
        if (!email) {
          showToast('メールアドレスを入力してください', 'error');
          return;
        }
        const modal = document.getElementById('password-reset-modal');
        if (modal) modal.classList.remove('active');
        showToast(`再設定案内メールを ${email} 宛に送信しました。メール内のリンクからパスワードを再設定してください。`, 'success');
      });
    }

    // モーダル閉じるボタン全般
    document.querySelectorAll('.btn-close-modal').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
      });
    });

    // 雇用者リスト「+追加」ボタン
    const addStaffBtn = document.getElementById('btn-add-staff-row');
    if (addStaffBtn) {
      addStaffBtn.addEventListener('click', addNewStaffRow);
    }

    // サンプルスタッフ投入ボタン
    const demoStaffBtn = document.getElementById('btn-load-demo-staff');
    if (demoStaffBtn) {
      demoStaffBtn.addEventListener('click', loadDemoStaff);
    }

    // ステップ2からステップ3へ進むボタン
    const toStep3Btn = document.getElementById('btn-go-to-step3');
    if (toStep3Btn) {
      toStep3Btn.addEventListener('click', () => {
        saveSettingsFromUI();
        const validStaff = state.staffList.filter(s => s.name.trim() !== '');
        if (validStaff.length === 0) {
          showToast('最低1名のスタッフ氏名を入力してください', 'error');
          return;
        }
        goToStep(3);
      });
    }

    // ステップ3からステップ4へ進むボタン（シフト自動作成）
    const generateBtn = document.getElementById('btn-generate-shift');
    if (generateBtn) {
      generateBtn.addEventListener('click', () => {
        goToStep(4);
      });
    }

    // CSVエクスポートボタン
    const exportBtn = document.getElementById('btn-export-csv');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportShiftCSV);
    }

    // 再計算ボタン
    const reCalcBtn = document.getElementById('btn-recalculate-shift');
    if (reCalcBtn) {
      reCalcBtn.addEventListener('click', () => {
        runShiftSolverAndRender();
        showToast('シフトを再計算・再割り当てしました', 'success');
      });
    }

    // 定休日チェックボックスのデザイン連動
    document.querySelectorAll('.day-pill-checkbox input').forEach(input => {
      input.addEventListener('change', () => {
        const pill = input.closest('.day-pill-checkbox');
        if (input.checked) {
          pill.classList.add('checked');
        } else {
          pill.classList.remove('checked');
        }
      });
    });
  }

  // HTMLエスケープヘルパー
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // トースト表示関数
  function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 250);
    }, 4000);
  }

  // DOMContentLoadedで初期化
  document.addEventListener('DOMContentLoaded', init);

})();
