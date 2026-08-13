/**
 * AssetPulse - 資産管理アプリケーション コアロジック
 * 
 * 🌐 全端末リアルタイム同期設定:
 * 以下の FIREBASE_DATABASE_URL に Firebase の Realtime Database URL を貼り付けるだけで、
 * どの端末（スマホ・PC）からアクセスしても手動入力なしで最初から自動同期されます！
 */
const FIREBASE_DATABASE_URL = "https://asset-management-app-99b32-default-rtdb.firebaseio.com/"; // ← 例: "https://your-app-default-rtdb.firebaseio.com"

// 日本の祝日データ（2026年）
const JAPANESE_HOLIDAYS = [
  "2026-01-01", "2026-01-12", "2026-02-11", "2026-02-23", "2026-03-20",
  "2026-04-29", "2026-05-03", "2026-05-04", "2026-05-05", "2026-05-06",
  "2026-07-20", "2026-08-11", "2026-09-21", "2026-09-22", "2026-09-23",
  "2026-10-12", "2026-11-03", "2026-11-23"
];

// 初期サンプルデータ
const DEFAULT_CARD_MASTERS = [
  { id: "card_1", name: "楽天カード", company: "VISA", withdrawal_day: 27 },
  { id: "card_2", name: "三井住友カード", company: "Mastercard", withdrawal_day: 10 },
  { id: "card_3", name: "J-WEST", company: "VISA", withdrawal_day: 10 }
];

const DEFAULT_INCOME_SETTINGS = {
  salary_amount: 50000,
  salary_day: 25,
  weekend_adj: "PREVIOUS_WORKDAY",
  transport_amount: 0,
  transport_months: [4, 10]
};

const DEFAULT_TRANSACTIONS = [
  { id: "tx_initial_balance", date: "2026-08-02", type: "CASH", amount: 294771, card_id: null, description: "移行時 初期総資産 (8/2時点)" }
];

// --- アプリケーション状態 ---
let rawTransactions = JSON.parse(localStorage.getItem("asset_transactions")) || DEFAULT_TRANSACTIONS;

// クレンジング
rawTransactions = rawTransactions.filter(t => {
  if ((t.type === 'SALARY' || (t.description && t.description.includes('給与'))) && t.amount < 0) {
    return false;
  }
  return true;
}).map(t => {
  if (t.type === 'SALARY' || t.type === 'TRANSPORTATION' || (t.description && t.description.includes('給料') || t.description && t.description.includes('給与'))) {
    return { ...t, amount: Math.abs(t.amount) };
  }
  return t;
});

let state = {
  cards: JSON.parse(localStorage.getItem("asset_cards")) || DEFAULT_CARD_MASTERS,
  incomeSettings: JSON.parse(localStorage.getItem("asset_income")) || DEFAULT_INCOME_SETTINGS,
  transactions: rawTransactions
};

// 🔥 Firebase Realtime Database 自動同期エンジン
let rtdb = null;
let firebaseInitialized = false;
let isRemoteUpdating = false;

function initFirebaseRealtimeDatabase() {
  const dbUrl = FIREBASE_DATABASE_URL || localStorage.getItem("asset_fb_rtdb_url") || "";
  const statusDisplay = document.getElementById("firebase-status-display");

  if (!dbUrl || !dbUrl.trim() || !window.firebase) {
    if (statusDisplay) statusDisplay.innerHTML = '同期状態: <span style="color: var(--accent-warning);">⚪ 未接続 (ローカル保存中)</span>';
    return;
  }

  try {
    const cleanUrl = dbUrl.trim();
    if (!firebase.apps.length) {
      firebase.initializeApp({ databaseURL: cleanUrl });
    }
    rtdb = firebase.database();
    firebaseInitialized = true;

    if (statusDisplay) statusDisplay.innerHTML = `同期状態: <span style="color: var(--accent-income);">🟢 全端末リアルタイム自動同期中 (${cleanUrl})</span>`;

    // 📡 他端末での更新を1秒以内にリアルタイム受信するリスナー
    rtdb.ref("asset_pulse_data").on("value", snapshot => {
      const data = snapshot.val();
      if (data) {
        isRemoteUpdating = true;
        if (data.cards) state.cards = data.cards;
        if (data.incomeSettings) state.incomeSettings = data.incomeSettings;
        if (data.transactions) state.transactions = data.transactions;

        localStorage.setItem("asset_cards", JSON.stringify(state.cards));
        localStorage.setItem("asset_income", JSON.stringify(state.incomeSettings));
        localStorage.setItem("asset_transactions", JSON.stringify(state.transactions));

        renderAll();
        isRemoteUpdating = false;
      }
    });

  } catch (err) {
    console.error("Realtime Database 接続エラー:", err);
    if (statusDisplay) statusDisplay.innerHTML = `同期状態: <span style="color: var(--accent-expense);">🔴 接続エラー: ${err.message}</span>`;
  }
}

// データの永続化とクラウド即時書き込み
function saveData() {
  localStorage.setItem("asset_cards", JSON.stringify(state.cards));
  localStorage.setItem("asset_income", JSON.stringify(state.incomeSettings));
  localStorage.setItem("asset_transactions", JSON.stringify(state.transactions));

  // リモート更新中でない場合のみクラウドへ送信
  if (firebaseInitialized && rtdb && !isRemoteUpdating) {
    rtdb.ref("asset_pulse_data").set({
      cards: state.cards,
      incomeSettings: state.incomeSettings,
      transactions: state.transactions,
      updatedAt: Date.now()
    }).catch(err => console.error("Firebase 保存エラー:", err));
  }

  renderAll();
}     if (data.cards) state.cards = data.cards;
        if (data.incomeSettings) state.incomeSettings = data.incomeSettings;
        if (data.transactions) state.transactions = data.transactions;
        
        localStorage.setItem("asset_cards", JSON.stringify(state.cards));
        localStorage.setItem("asset_income", JSON.stringify(state.incomeSettings));
        localStorage.setItem("asset_transactions", JSON.stringify(state.transactions));
        
        renderAll();
      }
    }, err => {
      console.error("Firebase リスナーエラー:", err);
    });

  } catch (err) {
    console.error("Firebase 初期化エラー:", err);
    if (statusDisplay) statusDisplay.innerHTML = `同期状態: <span style="color: var(--accent-expense);">🔴 設定エラー (${err.message})</span>`;
  }
}

// トースト通知機能 (二重登録防止 & 明確な視覚的フィードバック)
function showToast(message) {
  let toast = document.getElementById("global-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "global-toast";
    toast.className = "toast-notification";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

// 土日祝判定
function isHolidayOrWeekend(date) {
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return true;
  
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  
  return JAPANESE_HOLIDAYS.includes(dateStr);
}

// 給与・交通費の土日祝前倒し/後倒し補正
function calculateAdjustedPaymentDate(year, month, targetDay, adjType) {
  const maxDay = new Date(year, month, 0).getDate();
  const actualDay = Math.min(targetDay, maxDay);
  
  let currDate = new Date(year, month - 1, actualDay);
  
  if (adjType === 'PREVIOUS_WORKDAY') {
    while (isHolidayOrWeekend(currDate)) {
      currDate.setDate(currDate.getDate() - 1);
    }
  } else if (adjType === 'NEXT_WORKDAY') {
    while (isHolidayOrWeekend(currDate)) {
      currDate.setDate(currDate.getDate() + 1);
    }
  }
  
  const yyyy = currDate.getFullYear();
  const mm = String(currDate.getMonth() + 1).padStart(2, '0');
  const dd = String(currDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// クレジットカード引き落とし日結合
function generateCreditCardWithdrawalDate(yearMonthStr, withdrawalDay) {
  const [yearStr, monthStr] = yearMonthStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  
  const maxDay = new Date(year, month, 0).getDate();
  const targetDay = Math.min(withdrawalDay, maxDay);
  
  const dd = String(targetDay).padStart(2, '0');
  return `${yearStr}-${monthStr}-${dd}`;
}

// 自動給与・交通費・毎週3000円自動マイナス バッチ生成
function syncIncomeSchedule() {
  const { salary_amount, salary_day, weekend_adj, transport_amount, transport_months } = state.incomeSettings;
  
  const currentYear = new Date().getFullYear();
  const START_DATE = `${currentYear}-08-03`;
  const START_MONTH = 8;
  
  state.transactions = state.transactions.filter(t => 
    t.type !== 'SALARY' && 
    t.type !== 'TRANSPORTATION' && 
    !t.id.startsWith('weekly_auto_minus_')
  );
  
  for (let m = START_MONTH; m <= 12; m++) {
    const salaryDateStr = calculateAdjustedPaymentDate(currentYear, m, salary_day, weekend_adj);
    const validSalaryAmount = Math.abs(parseFloat(salary_amount || 50000));
    
    if (salaryDateStr >= START_DATE) {
      state.transactions.push({
        id: `sal_${currentYear}_${m}`,
        date: salaryDateStr,
        type: 'SALARY',
        amount: validSalaryAmount,
        card_id: null,
        description: `${m}月 給与振込`
      });
    }
    
    const validTransportAmount = Math.abs(parseFloat(transport_amount || 0));
    if (transport_months && transport_months.includes(m) && validTransportAmount > 0) {
      if (salaryDateStr >= START_DATE) {
        state.transactions.push({
          id: `trans_${currentYear}_${m}`,
          date: salaryDateStr,
          type: 'TRANSPORTATION',
          amount: validTransportAmount,
          card_id: null,
          description: `${m}月 交通費支給`
        });
      }
    }
  }

  // 毎週3,000円の自動マイナス
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

// 週次ダッシュボード集計エンジン
function calculateWeeklyDashboard() {
  const sortedTxs = [...state.transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
  
  const sundays = [];
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  const currentSunday = new Date(today);
  const diffToSunday = (7 - today.getDay()) % 7;
  currentSunday.setDate(today.getDate() + diffToSunday);
  
  // 直近の日曜日 (i = 0) から未来13週 (約3ヶ月先) の日曜日を昇順で生成
  for (let i = 0; i <= 13; i++) {
    const sun = new Date(currentSunday);
    sun.setDate(currentSunday.getDate() + (i * 7));
    
    const yyyy = sun.getFullYear();
    const mm = String(sun.getMonth() + 1).padStart(2, '0');
    const dd = String(sun.getDate()).padStart(2, '0');
    sundays.push(`${yyyy}-${mm}-${dd}`);
  }
  
  const weeklyData = sundays.map(sundayStr => {
    const sundayDate = new Date(sundayStr);
    const mondayDate = new Date(sundayDate);
    mondayDate.setDate(sundayDate.getDate() - 6);
    const mondayStr = mondayDate.toISOString().split('T')[0];
    
    const weeklyIncrease = sortedTxs
      .filter(t => t.date >= mondayStr && t.date <= sundayStr && t.amount > 0 && t.type !== 'CREDIT_CARD')
      .reduce((sum, t) => sum + t.amount, 0);
      
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
      
    const netChange = weeklyIncrease - weeklyDecrease;

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

// 決済パネル状態
let selectedPaymentMethod = { type: 'CASH' };

function renderPaymentPanels() {
  const container = document.getElementById("payment-panel-grid");
  if (!container) return;
  
  container.innerHTML = "";
  
  const cashItem = document.createElement("div");
  cashItem.className = `payment-panel-item ${selectedPaymentMethod.type === 'CASH' ? 'active' : ''}`;
  cashItem.onclick = () => selectPaymentPanel({ type: 'CASH' });
  cashItem.innerHTML = `
    <div class="payment-panel-icon">💵</div>
    <div class="payment-panel-title">現金・直接入出金</div>
    <div class="payment-panel-sub">当日/指定日 即時反映</div>
  `;
  container.appendChild(cashItem);
  
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

// 全レンダリング実行
function renderAll() {
  renderDashboard();
  renderPaymentPanels();
  renderMasterSettings();
  renderRecentTransactions();
}

// 1. ダッシュボード レンダリング (スマホ縦画面高一覧性版)
function renderDashboard() {
  const weeklyData = calculateWeeklyDashboard();
  const tbody = document.getElementById("weekly-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

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

  const currentTotal = state.transactions
    .filter(t => t.date <= todayStr)
    .reduce((sum, t) => sum + t.amount, 0);

  document.getElementById("kpi-total-assets").textContent = `¥${currentTotal.toLocaleString()}`;
  
  const thisSundayStr = currentSunday.toISOString().split('T')[0];
  const thisWeekData = weeklyData.find(w => w.sundayStr === thisSundayStr) || { weeklyIncrease: 0, weeklyDecrease: 0 };

  document.getElementById("kpi-weekly-inc").textContent = `+¥${thisWeekData.weeklyIncrease.toLocaleString()}`;
  document.getElementById("kpi-weekly-dec").textContent = `-¥${thisWeekData.weeklyDecrease.toLocaleString()}`;
  
  const incSubEl = document.querySelector(".kpi-card.weekly-inc .kpi-sub");
  const decSubEl = document.querySelector(".kpi-card.weekly-dec .kpi-sub");
  if (incSubEl) incSubEl.textContent = `今週 【${thisWeekDateRangeStr}】 の収入計`;
  if (decSubEl) decSubEl.textContent = `今週 【${thisWeekDateRangeStr}】 の支出計`;

  // 週次 資産増減リストのレンダリング (スマホ縦画面最適化)
  // 要件: 1行で表示、年の表示不要(08/16)、基準日の開始日不要、並び順: 基準日 -> 現在の資産額 -> 純増減 -> 増額 -> 減額、¥マークは現在の資産額のみ
  weeklyData.forEach(row => {
    const tr = document.createElement("tr");
    const shortSunday = row.sundayStr.substring(5).replace('-', '/'); // "08/16" 形式
    
    // 数値の整形 (¥マークは資産額のみ)
    const netSign = row.netChange >= 0 ? '+' : '';
    const netFormatted = `${netSign}${row.netChange.toLocaleString()}`;
    const incFormatted = row.weeklyIncrease > 0 ? `${row.weeklyIncrease.toLocaleString()}` : '0';
    const decFormatted = row.weeklyDecrease > 0 ? `${row.weeklyDecrease.toLocaleString()}` : '0';

    tr.innerHTML = `
      <td><strong>${shortSunday}</strong></td>
      <td>
        <strong class="editable-asset-cell" onclick="editWeeklyAssetAmount('${row.sundayStr}', ${row.totalAssets})" title="クリックして資産額を直接手動変更">
          ¥${row.totalAssets.toLocaleString()}
        </strong>
      </td>
      <td style="color: ${row.netChange >= 0 ? 'var(--accent-income)' : 'var(--accent-expense)'}; font-weight: 600;">${netFormatted}</td>
      <td style="color: var(--accent-income)">${incFormatted}</td>
      <td style="color: var(--accent-expense)">${decFormatted}</td>
    `;
    tbody.appendChild(tr);
  });
}

// 2. 直近の明細履歴 レンダリング (スマホ縦画面高一覧性版)
// 要件: 1件1行で表示、年表示不要(08/12)、種別はアイコンのみ(💵,💳,💼,🚌)、並び順: 日付 -> 金額 -> 種別 -> 内容/カード名 -> 操作、昇順(古い->新しい)
function renderRecentTransactions() {
  const tbody = document.getElementById("recent-transactions-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  
  const today = new Date();
  const threeMonthsAgo = new Date(today);
  threeMonthsAgo.setMonth(today.getMonth() - 3);
  const threeMonthsAgoStr = threeMonthsAgo.toISOString().split('T')[0];
  
  const recentTxs = state.transactions
    .filter(tx => tx.date >= threeMonthsAgoStr)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  
  recentTxs.forEach(tx => {
    const tr = document.createElement("tr");
    const shortDate = tx.date.substring(5).replace('-', '/'); // "08/12" 形式
    
    // 種別はアイコンのみ表示
    let typeIcon = "💵";
    if (tx.type === "CREDIT_CARD") typeIcon = "💳";
    if (tx.type === "SALARY") typeIcon = "💼";
    if (tx.type === "TRANSPORTATION") typeIcon = "🚌";

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
    
    // 並び順: 日付 -> 金額 -> 種別 -> 内容/カード名 -> 操作
    tr.innerHTML = `
      <td><strong>${shortDate}</strong></td>
      <td style="font-weight: 600; color: ${tx.amount >= 0 ? 'var(--accent-income)' : 'var(--accent-expense)'}">
        ${tx.amount >= 0 ? '+' : ''}¥${tx.amount.toLocaleString()}
      </td>
      <td style="text-align: center; font-size: 1.1rem;">${typeIcon}</td>
      <td style="max-width: 130px; overflow: hidden; text-overflow: ellipsis;">${displayDesc || '-'}</td>
      <td>
        <button class="btn-action-sm" style="margin-right: 0.2rem;" onclick="openEditTxModal('${tx.id}')">✏️</button>
        <button class="btn-danger-sm" onclick="deleteTransaction('${tx.id}')">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 資産額の手動書き換え
function editWeeklyAssetAmount(sundayDateStr, currentAssetsVal) {
  const inputVal = prompt(`【${sundayDateStr} (日)】時点の「現在の資産額」を入力してください:`, currentAssetsVal);
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
        showToast(`✅ ${sundayDateStr.substring(5)}時点の資産額を ¥${newAmount.toLocaleString()} に更新しました！`);
      }
    } else {
      alert("有効な数字を入力してください。");
    }
  }
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

function deleteTransaction(id) {
  state.transactions = state.transactions.filter(t => t.id !== id);
  saveData();
  showToast("🗑️ 明細を削除しました");
}

function renderMasterSettings() {
  const cardList = document.getElementById("card-list");
  if (!cardList) return;
  cardList.innerHTML = "";
  
  state.cards.forEach(card => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div>
        <strong>${card.name}</strong> <small>(${card.company || 'カード'})</small>
        <div><small class="help-text">毎月 ${card.withdrawal_day} 日引き落とし</small></div>
      </div>
      <button class="btn-danger-sm" onclick="deleteCard('${card.id}')">🗑️ 削除</button>
    `;
    cardList.appendChild(li);
  });
  
  const monthsGrid = document.getElementById("transport-months-grid");
  if (monthsGrid) {
    monthsGrid.innerHTML = "";
    const selectedMonths = state.incomeSettings.transport_months || [];
    
    for (let m = 1; m <= 12; m++) {
      const isChecked = selectedMonths.includes(m) ? "checked" : "";
      const label = document.createElement("label");
      label.className = "checkbox-label";
      label.innerHTML = `<input type="checkbox" name="transport_month" value="${m}" ${isChecked}> ${m}月`;
      monthsGrid.appendChild(label);
    }
  }

  const initTx = state.transactions.find(t => t.id === "tx_initial_balance");
  if (initTx) {
    const elAmount = document.getElementById("initial-balance-amount");
    const elDate = document.getElementById("initial-balance-date");
    if (elAmount) elAmount.value = initTx.amount;
    if (elDate) elDate.value = initTx.date;
  }

  // Firebase 設定のフォーム初期化表示
  const savedFbKey = localStorage.getItem("asset_fb_sync_key") || "default-sync-room";
  const savedFbConfig = localStorage.getItem("asset_fb_config") || "";
  const elFbKey = document.getElementById("fb-sync-key");
  const elFbConfig = document.getElementById("fb-config-json");
  if (elFbKey) elFbKey.value = savedFbKey;
  if (elFbConfig) elFbConfig.value = savedFbConfig;
}

function deleteCard(id) {
  state.cards = state.cards.filter(c => c.id !== id);
  saveData();
  showToast("🗑️ クレジットカードを削除しました");
}

// --- イベントハンドラ登録 ---
document.addEventListener("DOMContentLoaded", () => {
  const todayStr = new Date().toISOString().split('T')[0];
  const yearMonth = todayStr.substring(0, 7);
  
  if (document.getElementById("cash-date")) document.getElementById("cash-date").value = todayStr;
  if (document.getElementById("card-month")) document.getElementById("card-month").value = yearMonth;

  // タブ切り替え
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
      
      btn.classList.add("active");
      const tabId = `tab-${btn.dataset.tab}`;
      const tabEl = document.getElementById(tabId);
      if (tabEl) tabEl.classList.add("active");
    });
  });

  // 収支フォーム送信 (二重投稿防止 & 登録完了フィードバック & 入力クリア)
  const txForm = document.getElementById("transaction-form");
  if (txForm) {
    txForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const submitBtn = txForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true; // 連打防止
      
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
        amount = -Math.abs(rawAmount);
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
      
      // ✅ 登録完了フィードバック & フォーム内容クリア
      showToast(`✅ 収支データを保存しました！ (${txDate} / ¥${amount.toLocaleString()})`);
      document.getElementById("amount").value = "";
      document.getElementById("description").value = "";
      
      setTimeout(() => {
        if (submitBtn) submitBtn.disabled = false;
      }, 500);
    });
  }

  // クレジットカードマスタ追加 (二重投稿防止 & 登録完了フィードバック & 入力クリア)
  const cardForm = document.getElementById("card-master-form");
  if (cardForm) {
    cardForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const submitBtn = cardForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      
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
      showToast(`✅ クレジットカード「${name}」を登録しました！`);
      cardForm.reset();
      
      setTimeout(() => {
        if (submitBtn) submitBtn.disabled = false;
      }, 500);
    });
  }

  // 給与・交通費設定保存 (二重投稿防止 & 登録完了フィードバック)
  const salaryForm = document.getElementById("salary-setting-form");
  if (salaryForm) {
    salaryForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const submitBtn = salaryForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      
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
      
      syncIncomeSchedule();
      saveData();
      showToast(`✅ 収入・交通費設定を保存しました！`);
      
      setTimeout(() => {
        if (submitBtn) submitBtn.disabled = false;
      }, 500);
    });
  }

  // 移行用 初期総資産更新フォーム (二重投稿防止 & 登録完了フィードバック)
  const initForm = document.getElementById("initial-balance-form");
  if (initForm) {
    initForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const submitBtn = initForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      
      const amount = parseFloat(document.getElementById("initial-balance-amount").value);
      const date = document.getElementById("initial-balance-date").value;
      
      const existingIndex = state.transactions.findIndex(t => t.id === "tx_initial_balance");
      const initRecord = {
        id: "tx_initial_balance",
        date: date,
        type: "CASH",
        amount: amount,
        card_id: null,
        description: "移行時 初期総資産 (8/2時点)"
      };

      if (existingIndex >= 0) {
        state.transactions[existingIndex] = initRecord;
      } else {
        state.transactions.unshift(initRecord);
      }

      saveData();
      showToast(`✅ 初期総資産 (¥${amount.toLocaleString()}) を更新しました！`);
      
      setTimeout(() => {
        if (submitBtn) submitBtn.disabled = false;
      }, 500);
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
        showToast("✅ 明細データを更新しました！");
      }
    });
  }

  // 🔥 4. Firebase Realtime Database 同期設定フォーム
  const fbForm = document.getElementById("firebase-setting-form");
  if (fbForm) {
    fbForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const rtdbUrl = (document.getElementById("fb-config-json")?.value || "").trim();
      
      if (!rtdbUrl) {
        alert("Realtime Database の URL (https://xxxx.firebaseio.com) を貼り付けてください。");
        return;
      }

      localStorage.setItem("asset_fb_rtdb_url", rtdbUrl);
      initFirebaseRealtimeDatabase();
      saveData();
      showToast("🔥 Firebase 全端末リアルタイム同期を設定しました！");
    });
  }

  // 初回起動処理
  syncIncomeSchedule();
  initFirebaseRealtimeDatabase();
  saveData();
});
