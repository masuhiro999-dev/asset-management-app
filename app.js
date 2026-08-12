/**
 * AssetPulse - 資産管理アプリケーション コアロジック
 */

// 日本の祝日データ（2026年の主な祝日データモデル）
const JAPANESE_HOLIDAYS = [
  "2026-01-01", // 元日
  "2026-01-12", // 成人の日
  "2026-02-11", // 建国記念の日
  "2026-02-23", // 天皇誕生日
  "2026-03-20", // 春分の日
  "2026-04-29", // 昭和の日
  "2026-05-03", // 憲法記念日
  "2026-05-04", // みどもの日
  "2026-05-05", // こどもの日
  "2026-05-06", // 振替休日
  "2026-07-20", // 海の日
  "2026-08-11", // 山の日
  "2026-09-21", // 敬老の日
  "2026-09-22", // 国民の休日
  "2026-09-23", // 秋分の日
  "2026-10-12", // スポーツの日
  "2026-11-03", // 文化の日
  "2026-11-23", // 勤労感謝の日
];

// 初期サンプルデータ (ローカルストレージが空の場合に使用)
const DEFAULT_CARD_MASTERS = [
  { id: "card_1", name: "楽天カード", company: "VISA", withdrawal_day: 27 },
  { id: "card_2", name: "三井住友カード", company: "Mastercard", withdrawal_day: 10 }
];

const DEFAULT_INCOME_SETTINGS = {
  salary_amount: 50000,
  salary_day: 25,
  weekend_adj: "PREVIOUS_WORKDAY", // PREVIOUS_WORKDAY or NEXT_WORKDAY
  transport_amount: 0,
  transport_months: [4, 10]
};

const DEFAULT_TRANSACTIONS = [
  { id: "tx_initial_balance", date: "2026-08-02", type: "CASH", amount: 294771, card_id: null, description: "移行時 初期総資産 (8/2時点)" }
];

// --- アプリケーション状態 ---
let rawTransactions = JSON.parse(localStorage.getItem("asset_transactions")) || DEFAULT_TRANSACTIONS;

// クレンジング: 古いストレージ内の誤った給与・交通費マイナスデータを完全除去・正数化
rawTransactions = rawTransactions.filter(t => {
  // 過去にマイナスで保存された SALARY トランザクションがあれば一旦除外（syncIncomeSchedule で正しく再生成される）
  if ((t.type === 'SALARY' || (t.description && t.description.includes('給与'))) && t.amount < 0) {
    return false;
  }
  return true;
}).map(t => {
  if (t.type === 'SALARY' || t.type === 'TRANSPORTATION' || (t.description && t.description.includes('給与'))) {
    return { ...t, amount: Math.abs(t.amount) };
  }
  return t;
});

let state = {
  cards: JSON.parse(localStorage.getItem("asset_cards")) || DEFAULT_CARD_MASTERS,
  incomeSettings: JSON.parse(localStorage.getItem("asset_income")) || DEFAULT_INCOME_SETTINGS,
  transactions: rawTransactions
};

// データの永続化 (ユーザーが明示的に変更・保存したときのみ更新・永続保持される)
function saveData() {
  localStorage.setItem("asset_cards", JSON.stringify(state.cards));
  localStorage.setItem("asset_income", JSON.stringify(state.incomeSettings));
  localStorage.setItem("asset_transactions", JSON.stringify(state.transactions));
  renderAll();
}

// --- 計算ロジック 1: 土日祝判定 ---
function isHolidayOrWeekend(date) {
  const dayOfWeek = date.getDay(); // 0: 日曜, 6: 土曜
  if (dayOfWeek === 0 || dayOfWeek === 6) return true;
  
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  
  return JAPANESE_HOLIDAYS.includes(dateStr);
}

// --- 計算ロジック 2: 給与・交通費の土日祝前倒し/後倒し補正アルゴリズム ---
function calculateAdjustedPaymentDate(year, month, targetDay, adjType) {
  // 月の最終日判定 (例: 2月31日指定の場合は28/29日に調整)
  const maxDay = new Date(year, month, 0).getDate();
  const actualDay = Math.min(targetDay, maxDay);
  
  let currDate = new Date(year, month - 1, actualDay);
  
  if (adjType === 'PREVIOUS_WORKDAY') {
    // 土日祝の間、前日へ戻る
    while (isHolidayOrWeekend(currDate)) {
      currDate.setDate(currDate.getDate() - 1);
    }
  } else if (adjType === 'NEXT_WORKDAY') {
    // 土日祝の間、翌日へ進む
    while (isHolidayOrWeekend(currDate)) {
      currDate.setDate(currDate.getDate() + 1);
    }
  }
  
  const yyyy = currDate.getFullYear();
  const mm = String(currDate.getMonth() + 1).padStart(2, '0');
  const dd = String(currDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// --- 計算ロジック 3: クレジットカード引き落とし日の結合・日付生成 ---
function generateCreditCardWithdrawalDate(yearMonthStr, withdrawalDay) {
  const [yearStr, monthStr] = yearMonthStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  
  // 選択月の末日を取得
  const maxDay = new Date(year, month, 0).getDate();
  const targetDay = Math.min(withdrawalDay, maxDay);
  
  const dd = String(targetDay).padStart(2, '0');
  return `${yearStr}-${monthStr}-${dd}`;
}

// --- 計算ロジック 4: 自動給与・交通費・毎週3000円自動マイナス バッチ生成 ---
function syncIncomeSchedule() {
  const { salary_amount, salary_day, weekend_adj, transport_amount, transport_months } = state.incomeSettings;
  
  const currentYear = new Date().getFullYear();
  const START_DATE = `${currentYear}-08-03`;
  const START_MONTH = 8;
  
  // 自動生成系の既存トランザクションを除外して最新ルールで再構成
  state.transactions = state.transactions.filter(t => 
    t.type !== 'SALARY' && 
    t.type !== 'TRANSPORTATION' && 
    !t.id.startsWith('weekly_auto_minus_')
  );
  
  // 8月3日スタートのため、8月から12月までの給料・交通費を生成
  for (let m = START_MONTH; m <= 12; m++) {
    // 1. 給与の補正日付計算
    const salaryDateStr = calculateAdjustedPaymentDate(currentYear, m, salary_day, weekend_adj);
    
    const validSalaryAmount = Math.abs(parseFloat(salary_amount || 50000));
    
    if (salaryDateStr >= START_DATE) {
      state.transactions.push({
        id: `sal_${currentYear}_${m}`,
        date: salaryDateStr,
        type: 'SALARY',
        amount: validSalaryAmount, // 確実にプラス（収入）
        card_id: null,
        description: `${m}月 給与振込 (+¥${validSalaryAmount.toLocaleString()})`
      });
    }
    
    // 2. 交通費支給月の判定
    const validTransportAmount = Math.abs(parseFloat(transport_amount || 0));
    if (transport_months && transport_months.includes(m) && validTransportAmount > 0) {
      if (salaryDateStr >= START_DATE) {
        state.transactions.push({
          id: `trans_${currentYear}_${m}`,
          date: salaryDateStr,
          type: 'TRANSPORTATION',
          amount: validTransportAmount, // 確実にプラス（収入）
          card_id: null,
          description: `${m}月 交通費支給 (+¥${validTransportAmount.toLocaleString()})`
        });
      }
    }
  }

  // 3. 毎週3,000円の自動マイナス（毎週の日曜日に3,000円の固定支出を自動計上）
  const startDateObj = new Date("2026-08-03");
  const endDateObj = new Date(currentYear, 11, 31);
  let curr = new Date(startDateObj);
  const diffToSun = (7 - curr.getDay()) % 7;
  curr.setDate(curr.getDate() + diffToSun);
  
  while (curr <= endDateObj) {
    const yyyy = curr.getFullYear();
    const mm = String(curr.getMonth() + 1).padStart(2, '0');
    const dd = String(curr.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    
    if (dateStr >= START_DATE) {
      state.transactions.push({
        id: `weekly_auto_minus_${dateStr}`,
        date: dateStr,
        type: 'CASH',
        amount: -3000,
        card_id: null,
        description: '毎週定額支出 (-¥3,000)'
      });
    }
    
    curr.setDate(curr.getDate() + 7);
  }
}

// --- 計算ロジック 5: 日曜日基準の週次ダッシュボード集計 ---
function calculateWeeklyDashboard() {
  // トランザクションを日付順にソート (古い順)
  const sortedTxs = [...state.transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // 過去〜未来の毎週日曜日のリストを生成（直近8週間分）
  const sundays = [];
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  // 今週の日曜日を取得
  const currentSunday = new Date(today);
  const diffToSunday = (7 - today.getDay()) % 7;
  currentSunday.setDate(today.getDate() + diffToSunday);
  
  // 直最近の日曜日 (i = 0) から未来13週 (約3ヶ月先) の日曜日を昇順で生成
  for (let i = 0; i <= 13; i++) {
    const sun = new Date(currentSunday);
    sun.setDate(currentSunday.getDate() + (i * 7));
    
    const yyyy = sun.getFullYear();
    const mm = String(sun.getMonth() + 1).padStart(2, '0');
    const dd = String(sun.getDate()).padStart(2, '0');
    sundays.push(`${yyyy}-${mm}-${dd}`);
  }
  
  // 古い日曜日から順番に集計し、増減額が資産額へ正しく累積連動するように計算
  const weeklyData = sundays.map(sundayStr => {
    const sundayDate = new Date(sundayStr);
    
    // 直前の月曜日 (日曜日の6日前)
    const mondayDate = new Date(sundayDate);
    mondayDate.setDate(sundayDate.getDate() - 6);
    const mondayStr = mondayDate.toISOString().split('T')[0];
    
    // 1. 該当週 (月曜〜日曜) の増額 (プラス合計: 給与・交通費・プラス取引)
    const weeklyIncrease = sortedTxs
      .filter(t => t.date >= mondayStr && t.date <= sundayStr && t.amount > 0 && t.type !== 'CREDIT_CARD')
      .reduce((sum, t) => sum + t.amount, 0);
      
    // 2. 該当週 (月曜〜日曜) の減額 (マイナス絶対値合計: 給与や交通費は型および摘要で100%遮断・除外)
    const weeklyDecrease = sortedTxs
      .filter(t => 
        t.date >= mondayStr && 
        t.date <= sundayStr && 
        t.amount < 0 && 
        t.type !== 'SALARY' && 
        t.type !== 'TRANSPORTATION' && 
        !(t.description && t.description.includes('給与')) &&
        !(t.description && t.description.includes('交通費'))
      )
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      
    // 3. 該当週の純増減額
    const netChange = weeklyIncrease - weeklyDecrease;

    // 4. 該当週の日曜日時点での累計資産額 (その日曜日 23:59 時点までに確定・予定されている全取引的累積)
    const totalAssets = sortedTxs
      .filter(t => t.date <= sundayStr)
      .reduce((sum, t) => sum + t.amount, 0);
      
    return {
      sundayStr,
      mondayStr,
      totalAssets,
      weeklyIncrease,
      weeklyDecrease,
      netChange
    };
  });
  
  return weeklyData;
}

// --- UIレンダリング ---
function renderAll() {
  renderDashboard();
  renderPaymentPanels();
  renderMasterSettings();
  renderRecentTransactions();
}

// 明細編集モーダルを開く
function openEditTxModal(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;
  
  document.getElementById("edit-tx-id").value = tx.id;
  document.getElementById("edit-tx-date").value = tx.date;
  document.getElementById("edit-tx-amount").value = tx.amount;
  document.getElementById("edit-tx-desc").value = tx.description || "";
  
  const modal = document.getElementById("edit-tx-modal");
  if (modal) modal.showModal();
}

function renderDashboard() {
  const weeklyData = calculateWeeklyDashboard();
  const tbody = document.getElementById("weekly-table-body");
  tbody.innerHTML = "";
  
  // 当日（本日）の日付文字列 (YYYY-MM-DD)
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // 今週の月曜日と日曜日を算出
  const currentSunday = new Date(today);
  const diffToSunday = (7 - today.getDay()) % 7;
  currentSunday.setDate(today.getDate() + diffToSunday);
  
  const currentMonday = new Date(currentSunday);
  currentMonday.setDate(currentSunday.getDate() - 6);
  
  const monMm = currentMonday.getMonth() + 1;
  const monDd = currentMonday.getDate();
  const sunMm = currentSunday.getMonth() + 1;
  const sunDd = currentSunday.getDate();
  
  const thisWeekDateRangeStr = `${monMm}/${monDd}(月)〜${sunMm}/${sunDd}(日)`;

  // 【当日現在の総資産額】
  const currentTotal = state.transactions
    .filter(t => t.date <= todayStr)
    .reduce((sum, t) => sum + t.amount, 0);

  document.getElementById("kpi-total-assets").textContent = `¥${currentTotal.toLocaleString()}`;
  
  // 今週の増減データ（今週の日曜日キーに該当するもの）
  const thisSundayStr = currentSunday.toISOString().split('T')[0];
  const thisWeekData = weeklyData.find(w => w.sundayStr === thisSundayStr) || { weeklyIncrease: 0, weeklyDecrease: 0 };

  document.getElementById("kpi-weekly-inc").textContent = `+¥${thisWeekData.weeklyIncrease.toLocaleString()}`;
  document.getElementById("kpi-weekly-dec").textContent = `-¥${thisWeekData.weeklyDecrease.toLocaleString()}`;
  
  // 対象日テキストの更新
  const incSubEl = document.querySelector(".kpi-card.weekly-inc .kpi-sub");
  const decSubEl = document.querySelector(".kpi-card.weekly-dec .kpi-sub");
  if (incSubEl) incSubEl.textContent = `今週 【${thisWeekDateRangeStr}】 の収入計`;
  if (decSubEl) decSubEl.textContent = `今週 【${thisWeekDateRangeStr}】 の支出計`;

  weeklyData.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${row.sundayStr}</strong> <span class="help-text">(${row.mondayStr}〜)</span></td>
      <td>
        <strong class="editable-asset-cell" onclick="editWeeklyAssetAmount('${row.sundayStr}', ${row.totalAssets})" title="クリックして資産額を直接手動変更">
          ¥${row.totalAssets.toLocaleString()}
        </strong>
      </td>
      <td style="color: var(--accent-income)">+¥${row.weeklyIncrease.toLocaleString()}</td>
      <td style="color: var(--accent-expense)">-¥${row.weeklyDecrease.toLocaleString()}</td>
      <td style="color: ${row.netChange >= 0 ? 'var(--accent-income)' : 'var(--accent-expense)'}">
        ${row.netChange >= 0 ? '+' : ''}¥${row.netChange.toLocaleString()}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 特定の日曜日時点での「現在の資産額 (累計)」を手動で変更・上書きする関数
function editWeeklyAssetAmount(sundayDateStr, currentAssetsVal) {
  const inputVal = prompt(`【${sundayDateStr} (日)】時点の「現在の資産額 (累計)」を入力してください:`, currentAssetsVal);
  if (inputVal !== null && inputVal.trim() !== "") {
    const newAmount = parseFloat(inputVal);
    if (!isNaN(newAmount)) {
      const diff = newAmount - currentAssetsVal;
      if (diff !== 0) {
        state.transactions.push({
          id: `manual_adj_${sundayDateStr}_${Date.now()}`,
          date: sundayDateStr,
          type: 'CASH',
          amount: diff,
          card_id: null,
          description: `資産額手動調整 (${sundayDateStr}時点: ¥${newAmount.toLocaleString()})`
        });
        saveData();
        alert(`${sundayDateStr}時点の資産額を ¥${newAmount.toLocaleString()} に修正・更新しました！`);
      }
    } else {
      alert("有効な数字を入力してください。");
    }
  }
}

function renderRecentTransactions() {
  const tbody = document.getElementById("recent-transactions-body");
  tbody.innerHTML = "";
  
  // 今日の日付および直近3ヶ月前の日付を算出
  const today = new Date();
  const threeMonthsAgo = new Date(today);
  threeMonthsAgo.setMonth(today.getMonth() - 3);
  
  const threeMonthsAgoStr = threeMonthsAgo.toISOString().split('T')[0];
  
  // 直近3ヶ月以内の明細に絞り込み、日付の昇順 (古い順 -> 新しい順) でソート
  const recentTxs = state.transactions
    .filter(tx => tx.date >= threeMonthsAgoStr)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  
  recentTxs.forEach(tx => {
    const tr = document.createElement("tr");
    
    let typeBadge = "💵 現金";
    if (tx.type === "CREDIT_CARD") typeBadge = "💳 クレジット";
    if (tx.type === "SALARY") typeBadge = "💼 給与";
    if (tx.type === "TRANSPORTATION") typeBadge = "🚌 交通費";

    let displayDesc = tx.description;
    if (tx.card_id) {
      const card = state.cards.find(c => c.id === tx.card_id);
      if (card) {
        const companyStr = card.company ? ` (${card.company})` : '';
        displayDesc = `${card.name}${companyStr}`;
        if (tx.description && !tx.description.includes('利用') && !tx.description.includes('引落')) {
          displayDesc += ` - ${tx.description}`;
        }
      }
    }
    
    tr.innerHTML = `
      <td><strong>${tx.date}</strong></td>
      <td>${typeBadge}</td>
      <td>${displayDesc || '-'}</td>
      <td style="font-weight: 600; color: ${tx.amount >= 0 ? 'var(--accent-income)' : 'var(--accent-expense)'}">
        ${tx.amount >= 0 ? '+' : ''}¥${tx.amount.toLocaleString()}
      </td>
      <td>
        <button class="btn-action-sm" style="margin-right: 0.3rem;" onclick="openEditTxModal('${tx.id}')">✏️ 修正</button>
        <button class="btn-danger-sm" onclick="deleteTransaction('${tx.id}')">🗑️ 削除</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function deleteTransaction(id) {
  state.transactions = state.transactions.filter(t => t.id !== id);
  saveData();
}

// 現在選択されている決済パネルの状態 ({ type: 'CASH' } または { type: 'CREDIT_CARD', cardId: '...' })
let selectedPaymentMethod = { type: 'CASH' };

function renderPaymentPanels() {
  const container = document.getElementById("payment-panel-grid");
  if (!container) return;
  
  container.innerHTML = "";
  
  // 1. 現金パネル
  const cashItem = document.createElement("div");
  cashItem.className = `payment-panel-item ${selectedPaymentMethod.type === 'CASH' ? 'active' : ''}`;
  cashItem.onclick = () => selectPaymentPanel({ type: 'CASH' });
  cashItem.innerHTML = `
    <div class="payment-panel-icon">💵</div>
    <div class="payment-panel-title">現金・直接入出金</div>
    <div class="payment-panel-sub">当日/指定日 即時反映</div>
  `;
  container.appendChild(cashItem);
  
  // 2. マスタ登録カードパネル一覧
  state.cards.forEach(card => {
    const isSelected = selectedPaymentMethod.type === 'CREDIT_CARD' && selectedPaymentMethod.cardId === card.id;
    const item = document.createElement("div");
    item.className = `payment-panel-item ${isSelected ? 'active' : ''}`;
    item.onclick = () => selectPaymentPanel({ type: 'CREDIT_CARD', cardId: card.id });
    
    const companyStr = card.company ? ` [${card.company}]` : '';
    item.innerHTML = `
      <div class="payment-panel-icon">💳</div>
      <div class="payment-panel-title">${card.name}${companyStr}</div>
      <div class="payment-panel-sub">毎月 ${card.withdrawal_day} 日引き落とし</div>
    `;
    container.appendChild(item);
  });
}

function selectPaymentPanel(method) {
  selectedPaymentMethod = method;
  renderPaymentPanels();
  
  const cashFields = document.getElementById("cash-fields");
  const cardFields = document.getElementById("card-fields");
  
  if (method.type === 'CASH') {
    if (cashFields) cashFields.classList.remove("hidden");
    if (cardFields) cardFields.classList.add("hidden");
  } else {
    if (cashFields) cashFields.classList.add("hidden");
    if (cardFields) cardFields.classList.remove("hidden");
  }
}

function renderAll() {
  renderDashboard();
  renderPaymentPanels();
  renderMasterSettings();
  renderRecentTransactions();
  renderHistoryTab();
}

function renderMasterSettings() {
  // カードリスト
  const cardList = document.getElementById("card-list");
  cardList.innerHTML = "";
  
  state.cards.forEach(card => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div>
        <strong>${card.name}</strong> <small>(${card.company || '国際ブランド'})</small>
        <div><small class="help-text">毎月 ${card.withdrawal_day} 日引き落とし</small></div>
      </div>
      <button class="btn-danger-sm" onclick="deleteCard('${card.id}')">削除</button>
    `;
    cardList.appendChild(li);
  });
  
  // 交通費月チェックボックス
  const monthsGrid = document.getElementById("transport-months-grid");
  monthsGrid.innerHTML = "";
  const selectedMonths = state.incomeSettings.transport_months || [];
  
  for (let m = 1; m <= 12; m++) {
    const isChecked = selectedMonths.includes(m) ? "checked" : "";
    const label = document.createElement("label");
    label.className = "checkbox-label";
    label.innerHTML = `<input type="checkbox" name="transport_month" value="${m}" ${isChecked}> ${m}月`;
    monthsGrid.appendChild(label);
  }

  // 初期総資産（移行用残高）のフィールド表示
  const initTx = state.transactions.find(t => t.id === "tx_initial_balance");
  if (initTx) {
    document.getElementById("initial-balance-amount").value = initTx.amount;
    document.getElementById("initial-balance-date").value = initTx.date;
  } else {
    document.getElementById("initial-balance-amount").value = 294771;
    document.getElementById("initial-balance-date").value = "2026-08-02";
  }
}

function deleteCard(id) {
  state.cards = state.cards.filter(c => c.id !== id);
  saveData();
}

// --- イベントハンドラ登録 ---
document.addEventListener("DOMContentLoaded", () => {
  // 今日の日付をセット
  const todayStr = new Date().toISOString().split('T')[0];
  document.getElementById("cash-date").value = todayStr;
  
  // 今月をセット
  const yearMonth = todayStr.substring(0, 7);
  document.getElementById("card-month").value = yearMonth;

  // タブ切り替え
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
      
      btn.classList.add("active");
      const tabId = `tab-${btn.dataset.tab}`;
      document.getElementById(tabId).classList.add("active");
    });
  });

  // 収支入力: 種別切り替え (現金 / カード)
  document.querySelectorAll('input[name="payment_type"]').forEach(radio => {
    radio.addEventListener("change", (e) => {
      if (e.target.value === "CASH") {
        document.getElementById("cash-fields").classList.remove("hidden");
        document.getElementById("card-fields").classList.add("hidden");
      } else {
        document.getElementById("cash-fields").classList.add("hidden");
        document.getElementById("card-fields").classList.remove("hidden");
      }
    });
  });

  // 収支フォーム送信
  document.getElementById("transaction-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const sign = document.getElementById("amount-sign").value;
    const rawAmount = parseFloat(document.getElementById("amount").value);
    const description = document.getElementById("description").value;
    
    let txDate = todayStr;
    let cardId = null;
    let amount = 0;
    let type = selectedPaymentMethod.type;
    
    if (type === "CASH") {
      txDate = document.getElementById("cash-date").value;
      amount = sign === '-' ? -Math.abs(rawAmount) : Math.abs(rawAmount);
    } else {
      // クレジットカード選択時 (パネルで選択されたカード)
      amount = -Math.abs(rawAmount); // クレジットカードは常にマイナス (支出)
      cardId = selectedPaymentMethod.cardId;
      const monthStr = document.getElementById("card-month").value;
      const card = state.cards.find(c => c.id === cardId);
      if (card && monthStr) {
        txDate = generateCreditCardWithdrawalDate(monthStr, card.withdrawal_day);
      }
    }
    
    let cardName = "";
    if (cardId) {
      const c = state.cards.find(x => x.id === cardId);
      if (c) cardName = c.name;
    }
    
    state.transactions.push({
      id: `tx_${Date.now()}`,
      date: txDate,
      type: type,
      amount: amount,
      card_id: cardId,
      description: description || (cardName ? `${cardName} 利用` : (type === 'CREDIT_CARD' ? "クレジットカード利用" : "現金取引"))
    });
    
    saveData();
    alert(`記録を保存しました！\n手段: ${cardName || '現金'}\n日付: ${txDate}\n金額: ${amount >= 0 ? '+' : ''}¥${amount.toLocaleString()}`);
    document.getElementById("transaction-form").reset();
    document.getElementById("cash-date").value = todayStr;
    document.getElementById("card-month").value = yearMonth;
  });

  // 給与・交通費設定保存
  document.getElementById("salary-setting-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const salary_amount = parseFloat(document.getElementById("salary-amount").value || 0);
    const salary_day = parseInt(document.getElementById("salary-day").value, 10);
    const weekend_adj = document.querySelector('input[name="weekend_adj"]:checked').value;
    const transport_amount = parseFloat(document.getElementById("transport-amount").value || 0);
    
    const transport_months = [];
    document.querySelectorAll('input[name="transport_month"]:checked').forEach(cb => {
      transport_months.push(parseInt(cb.value, 10));
    });
    
    state.incomeSettings = {
      salary_amount,
      salary_day,
      weekend_adj,
      transport_amount,
      transport_months
    };
    
    // スケジュール自動同期 & 永続保存
    syncIncomeSchedule();
    saveData();
    alert(`収入設定を保存しました！ (給与: +¥${salary_amount.toLocaleString()} / 振込日: 毎月${salary_day}日)`);
  });

  // クレジットカードマスタ追加
  document.getElementById("card-master-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("master-card-name").value;
    const company = document.getElementById("master-card-company").value;
    const day = parseInt(document.getElementById("master-card-day").value, 10);
    
    state.cards.push({
      id: `card_${Date.now()}`,
      name: name,
      company: company,
      withdrawal_day: day
    });
    
    saveData();
    document.getElementById("card-master-form").reset();
  });

  // 給与・交通費設定保存
  document.getElementById("salary-setting-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const salary_amount = parseFloat(document.getElementById("salary-amount").value);
    const salary_day = parseInt(document.getElementById("salary-day").value, 10);
    const weekend_adj = document.querySelector('input[name="weekend_adj"]:checked').value;
    const transport_amount = parseFloat(document.getElementById("transport-amount").value);
    
    const transport_months = [];
    document.querySelectorAll('input[name="transport_month"]:checked').forEach(cb => {
      transport_months.push(parseInt(cb.value, 10));
    });
    
    state.incomeSettings = {
      salary_amount,
      salary_day,
      weekend_adj,
      transport_amount,
      transport_months
    };
    
    // スケジュール自動生成
    syncIncomeSchedule();
    saveData();
    alert("収入の自動計上設定を保存し、スケジュールを更新しました！");
  });

  // 移行用 初期総資産更新フォーム
  document.getElementById("initial-balance-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const amount = parseFloat(document.getElementById("initial-balance-amount").value);
    const date = document.getElementById("initial-balance-date").value;
    
    // 既存の初期残高データを検索・置換または新規挿入
    const existingIndex = state.transactions.findIndex(t => t.id === "tx_initial_balance");
    const initRecord = {
      id: "tx_initial_balance",
      date: date,
      type: "CASH",
      amount: amount,
      card_id: null,
      description: "移行時 初期総資産"
    };

    if (existingIndex >= 0) {
      state.transactions[existingIndex] = initRecord;
    } else {
      state.transactions.unshift(initRecord);
    }

    saveData();
    alert(`初期総資産（¥${amount.toLocaleString()} / 基準日: ${date}）を登録・更新しました！`);
  });

  // 検索フィルターのリアルタイム更新
  const searchInput = document.getElementById("history-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderHistoryTab();
    });
  }

  // 明細データの修正保存フォーム
  const editTxForm = document.getElementById("edit-tx-form");
  if (editTxForm) {
    editTxForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = document.getElementById("edit-tx-id").value;
      const date = document.getElementById("edit-tx-date").value;
      const amount = parseFloat(document.getElementById("edit-tx-amount").value);
      const desc = document.getElementById("edit-tx-desc").value;
      
      const targetIndex = state.transactions.findIndex(t => t.id === id);
      if (targetIndex >= 0) {
        state.transactions[targetIndex].date = date;
        state.transactions[targetIndex].amount = amount;
        state.transactions[targetIndex].description = desc;
        
        saveData();
        const modal = document.getElementById("edit-tx-modal");
        if (modal) modal.close();
        alert("明細データを修正・更新しました！");
      }
    });
  }

  // 初回起動処理: 収入自動設定および毎週3000円マイナスを確実に同期反映
  syncIncomeSchedule();
  saveData();
});
