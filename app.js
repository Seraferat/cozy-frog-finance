// ==========================================
// 1. ИНИЦИАЛИЗАЦИЯ ДАННЫХ
// ==========================================
let savedAccounts = JSON.parse(localStorage.getItem('frog_accounts'));
let accounts = Array.isArray(savedAccounts) ? savedAccounts : [{ id: 'acc-1', name: 'Основной кошелек', balance: 0, icon: '💳' }];
accounts.forEach(acc => { acc.balance = Number(acc.balance) || 0; });
let goals = JSON.parse(localStorage.getItem('frog_goals')) || [];
let subscriptions = JSON.parse(localStorage.getItem('frog_subs')) || [];
let salarySettings = JSON.parse(localStorage.getItem('frog_salary_settings')) || null;
let calendarData = JSON.parse(localStorage.getItem('frog_calendar_data')) || {};
let currentCalendarDate = new Date();
let chartInstance = null;
let currentChartType = 'expense';
let currentTxFilter = 'all';
let transactions = JSON.parse(localStorage.getItem('frog_transactions')) || [];
let credits = JSON.parse(localStorage.getItem('frog_credits')) || [];

// Убираем ведущий эмодзи из категорий в старых данных (обратная совместимость)
function stripEmojiPrefix(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/^[^\p{L}\p{N}]+/u, '').trim();
}
transactions.forEach(t => {
    if (t && typeof t.category === 'string') t.category = stripEmojiPrefix(t.category);
});
localStorage.setItem('frog_transactions', JSON.stringify(transactions));

const categoriesExpense = ['Еда', 'Транспорт', 'Развлечения', 'Здоровье', 'Жилье', 'Другое'];
const categoriesIncome = ['Зарплата', 'Подарок', 'Кэшбэк', 'Инвестиции', 'Другое'];

// ==========================================
// 2. СМЕНА ТЕМЫ И АССИСТЕНТА
// ==========================================
function setTheme(themeName) {
    document.documentElement.classList.remove('theme-frog', 'theme-pink', 'theme-blue');
    document.documentElement.classList.add(themeName);
    localStorage.setItem('frog-finance-theme', themeName);
    updateAssistantView(themeName);
    renderChart();
}

function updateAssistantView(themeName) {
    document.querySelectorAll('.assistant-svg').forEach(svg => svg.classList.remove('active'));
    if (themeName === 'theme-pink') {
        document.getElementById('svg-cat').classList.add('active');
    } else if (themeName === 'theme-blue') {
        document.getElementById('svg-shell').classList.add('active');
    } else {
        document.getElementById('svg-frog').classList.add('active');
    }
    // Сразу применяем эмоцию к новому активному ассистенту
    if (typeof analyzeFinances === 'function') analyzeFinances();
}

// ==========================================
// 3. НАВИГАЦИЯ
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
const currentTheme = localStorage.getItem('frog-finance-theme') || 'theme-frog';    updateAssistantView(currentTheme);

    const navItems = document.querySelectorAll('.nav-item[data-target]');
    const pages = document.querySelectorAll('.page');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            // Сброс активных классов
            navItems.forEach(nav => { nav.classList.remove('theme-text'); nav.classList.add('theme-text-muted'); });
            pages.forEach(page => page.classList.remove('active'));

            // Установка нового активного
            item.classList.remove('theme-text-muted');
            item.classList.add('theme-text');

            const targetPage = document.getElementById(`page-${item.dataset.target}`);
            if(targetPage) targetPage.classList.add('active');

            // Вызов рендера при переходе
            if (item.dataset.target === 'salary') {
                renderSalaryPage();
            } else if (item.dataset.target === 'transactions') {
                renderChart();
            } else if (item.dataset.target === 'credits') {
                renderCredits();
            }
        });
    });

    // Обработчики загрузки картинок
    ['acc', 'goal', 'sub'].forEach(prefix => {
        const fileInput = document.getElementById(prefix + '-image-file');
        if (!fileInput) return;
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const dataUrl = await resizeImageToDataURL(file, 96);
                document.getElementById(prefix + '-image').value = dataUrl;
                updateImagePreview(prefix, dataUrl);
            } catch (err) {
                alert('Не удалось загрузить картинку: ' + err.message);
                e.target.value = '';
            }
        });
    });

    renderAll();
});

// ==========================================
// 3.1. ХЕЛПЕРЫ ИКОНОК
// ==========================================
function icon(name, size = 20) {
    return `<svg width="${size}" height="${size}" aria-hidden="true"><use href="#${name}"/></svg>`;
}

function renderEntityIcon(custom, fallbackSymbol, size = 20, image = '') {
    if (image) {
        return `<img src="${image}" alt="" style="width:${size}px;height:${size}px;object-fit:cover;border-radius:inherit;">`;
    }
    if (custom && custom.trim()) return `<span style="font-size:${size}px;line-height:1;">${custom}</span>`;
    return icon(fallbackSymbol, size);
}

// Сжимает картинку до size×size и возвращает data-URL (JPEG ~0.82)
function resizeImageToDataURL(file, size = 96) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith('image/')) {
            reject(new Error('Не картинка'));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');

                const minSide = Math.min(img.width, img.height);
                const sx = (img.width - minSide) / 2;
                const sy = (img.height - minSide) / 2;

                ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

                let dataUrl;
                try {
                    dataUrl = canvas.toDataURL('image/jpeg', 0.82);
                } catch (e) {
                    dataUrl = canvas.toDataURL('image/png');
                }
                resolve(dataUrl);
            };
            img.onerror = () => reject(new Error('Не удалось прочитать картинку'));
            img.src = reader.result;
        };
        reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
        reader.readAsDataURL(file);
    });
}

// Очистка картинки у сущности (acc / goal / sub)
function clearEntityImage(prefix) {
    const hidden = document.getElementById(prefix + '-image');
    const fileInput = document.getElementById(prefix + '-image-file');
    if (hidden) hidden.value = '';
    if (fileInput) fileInput.value = '';
    updateImagePreview(prefix, '');
}

// Обновляет превью в модалке
function updateImagePreview(prefix, dataUrl) {
    const preview = document.getElementById(prefix + '-image-preview');
    if (!preview) return;
    if (dataUrl) {
        preview.innerHTML = `<img src="${dataUrl}" alt="" style="width:100%;height:100%;object-fit:cover;">`;
    } else {
        preview.innerHTML = `<span class="text-xl theme-text-muted">—</span>`;
    }
}

// ==========================================
// 4. УМНЫЙ АНАЛИЗ ФИНАНСОВ
// ==========================================
function analyzeFinances() {
    let adviceText = "Привет! Давай добавим первую операцию, чтобы начать!";
    let isPositive = true;

    const totalBalance = accounts.reduce((sum, acc) => sum + Number(acc.balance), 0);
    const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount), 0);
    const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount), 0);

    const today = new Date();
    const currentDay = today.getDate();
    const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;

    // --- ПРОВЕРКА КАЛЕНДАРЯ (Отпуск/Больничный) ---
    const currentMonthData = calendarData[currentMonthKey] || {};
    const todayStatus = currentMonthData[currentDay];

    const dueSubs = subscriptions.filter(sub => {
        const isDueDay = currentDay >= Number(sub.day);
        const isPaidThisMonth = sub.lastPaid === currentMonthKey;
        return isDueDay && !isPaidThisMonth;
    });

    // Проверка кредитов
    const dueCredits = credits.filter(c => {
        if (c.paid >= c.total) return false;
        const isDueDay = currentDay >= Number(c.day);
        const isPaidThisMonth = c.lastPaid === currentMonthKey;
        return isDueDay && !isPaidThisMonth;
    });

    // Логика выбора настроения и текста
    if (todayStatus === 'vacation') {
        adviceText = "Ура, отпуск! Отдыхай, а я буду пить коктейль под зонтиком 🍹🏖️";
    } else if (todayStatus === 'sick') {
        adviceText = "Ой-ой, ты болеешь? Я тоже приболел... Давай лечиться и отдыхать 🥺🤒";
    } else if (dueCredits.length > 0) {
        adviceText = `Не забудь про кредит: "${dueCredits[0].name}" (${dueCredits[0].monthly} ₽) 💳`;
        isPositive = false;
    } else if (dueSubs.length > 0) {
        adviceText = `Напоминаю! Пора оплатить: "${dueSubs[0].name}" (${dueSubs[0].amount} ₽) 💳`;
        isPositive = false;
    } else if (totalBalance < 0) {
        adviceText = "Ой-ой, баланс ушел в минус! Давай притормозим с тратами 🥺";
        isPositive = false;
    } else if (totalExpense > totalIncome && totalIncome > 0) {
        adviceText = "Вы тратите больше, чем зарабатываете. Нужно быть аккуратнее 😟";
        isPositive = false;
    } else if (transactions.length > 0) {
        const expensesByCategory = {};
        transactions.filter(t => t.type === 'expense').forEach(t => {
            expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + Number(t.amount);
        });

        let maxCategory = '';
        let maxAmount = 0;
        for (const [cat, amount] of Object.entries(expensesByCategory)) {
            if (amount > maxAmount) { maxAmount = amount; maxCategory = cat; }
        }

        if (totalIncome > 0 && maxAmount > (totalIncome * 0.5)) {
            adviceText = `Ого, на "${maxCategory}" ушло больше половины дохода! Может, сэкономишь? ☕`;
            isPositive = false;
        } else {
            const completedGoal = goals.find(g => g.current >= g.target);
            if (completedGoal) {
                adviceText = `Вау! Вы накопили на цель "${completedGoal.name}"! Я так горжусь вами! 🎉`;
                isPositive = true;
            } else {
                adviceText = `Отличная работа! Ваш общий баланс: ${totalBalance.toFixed(2)} ₽. Так держать! ✨`;
                isPositive = true;
            }
        }
    } else if (totalBalance > 0) {
        adviceText = `Отличный старт! У вас уже есть ${totalBalance.toFixed(2)} ₽ на счетах! ✨`;
        isPositive = true;
    }

    const adviceEl = document.getElementById('assistant-advice');
    if (adviceEl) adviceEl.textContent = adviceText;

    const container = document.getElementById('assistant-container');
    const pearlGroup = document.getElementById('pearl-group');

    if (container) {
        if (isPositive) {
            container.classList.remove('assistant-sad'); container.classList.add('assistant-happy');
            if(pearlGroup) { pearlGroup.classList.remove('pearl-sad'); pearlGroup.classList.add('pearl-happy'); }
        } else {
            container.classList.remove('assistant-happy'); container.classList.add('assistant-sad');
            if(pearlGroup) { pearlGroup.classList.remove('pearl-happy'); pearlGroup.classList.add('pearl-sad'); }
        }
    }

    document.querySelectorAll('.mouth-sad').forEach(m => m.classList.toggle('hidden', isPositive));
    document.querySelectorAll('.mouth-happy').forEach(m => m.classList.toggle('hidden', !isPositive));
}

// ==========================================
// 5. ГРАФИКИ И АНАЛИТИКА
// ==========================================
function setChartType(type) {
    currentChartType = type;

    const btnExp = document.getElementById('btn-chart-exp');
    const btnInc = document.getElementById('btn-chart-inc');

    if (type === 'expense') {
        btnExp.className = 'px-3 py-1 rounded-md text-xs font-bold transition-all bg-white shadow-sm';
        btnExp.style.color = 'var(--expense)';
        btnInc.className = 'px-3 py-1 rounded-md text-xs font-bold transition-all theme-text-muted';
        btnInc.style.color = '';
    } else {
        btnInc.className = 'px-3 py-1 rounded-md text-xs font-bold transition-all bg-white shadow-sm';
        btnInc.style.color = 'var(--income)';
        btnExp.className = 'px-3 py-1 rounded-md text-xs font-bold transition-all theme-text-muted';
        btnExp.style.color = '';
    }

    renderChart();
}

function getChartPalette() {
    if (document.documentElement.classList.contains('theme-frog')) {
        return ['#79735C', '#98A658', '#D9D06F', '#E3FA7F', '#E2F8C3', '#B9C26D', '#C5D39B'];
    } else if (document.documentElement.classList.contains('theme-blue')) {
        return ['#FFD6FF', '#E7C6FF', '#C8B6FF', '#B9C0FF', '#BBCFFF', '#D8C4E8', '#A8DADC'];
    }
    return ['#FAF3EB', '#FEDCDB', '#FEDCD2', '#FB9EBB', '#FFE6EE', '#F4C2D7', '#FFB4CA'];
}

function renderChart() {
    const ctx = document.getElementById('financeChart');
    if (!ctx) return;

    const emptyMsg = document.getElementById('chart-empty');

    const dataMap = {};
    transactions.filter(t => t.type === currentChartType).forEach(t => {
        dataMap[t.category] = (dataMap[t.category] || 0) + Number(t.amount);
    });

    const labels = Object.keys(dataMap);
    const data = Object.values(dataMap);

    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }

    if (labels.length === 0) {
        ctx.style.display = 'none';
        emptyMsg.classList.remove('hidden');
        return;
    } else {
        ctx.style.display = 'block';
        emptyMsg.classList.add('hidden');
    }

    const bgColors = getChartPalette();
    const legendColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--text-muted').trim() || '#8f7480';

    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: bgColors,
                borderColor: document.documentElement.classList.contains('theme-blue') 
                    ? 'rgba(255,255,255,0.8)' 
                    : 'transparent',
                borderWidth: document.documentElement.classList.contains('theme-blue') ? 2 : 0,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        font: { family: 'Nunito', size: 11, weight: 'bold' },
                        color: legendColor,
                        boxWidth: 12,
                        padding: 15
                    }
                }
            }
        }
    });
}

// ==========================================
// 6. ЭКСПОРТ И ИМПОРТ ДАННЫХ
// ==========================================
function exportData() {
    const backupData = {
        frog_accounts: accounts,
        frog_transactions: transactions,
        frog_goals: goals,
        frog_subs: subscriptions,
        frog_salary_settings: salarySettings,
        frog_calendar_data: calendarData,
        frog_finance_theme: localStorage.getItem('frog-finance-theme') || 'theme-frog'
    };

    const dataStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    const date = new Date().toISOString().slice(0,10);
    a.download = `frog_finance_backup_${date}.json`;
    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);

            if (!importedData.frog_accounts && !importedData.frog_transactions) {
                throw new Error("Неверный формат файла");
            }

            if(confirm("Вы уверены? Текущие данные будут заменены загруженными.")) {
                if (importedData.frog_accounts) localStorage.setItem('frog_accounts', JSON.stringify(importedData.frog_accounts));
                if (importedData.frog_transactions) localStorage.setItem('frog_transactions', JSON.stringify(importedData.frog_transactions));
                if (importedData.frog_goals) localStorage.setItem('frog_goals', JSON.stringify(importedData.frog_goals));
                if (importedData.frog_subs) localStorage.setItem('frog_subs', JSON.stringify(importedData.frog_subs));
                if (importedData.frog_salary_settings) localStorage.setItem('frog_salary_settings', JSON.stringify(importedData.frog_salary_settings));
                if (importedData.frog_calendar_data) localStorage.setItem('frog_calendar_data', JSON.stringify(importedData.frog_calendar_data));

                if (importedData.frog_finance_theme) localStorage.setItem('frog-finance-theme', importedData.frog_finance_theme);
                else if (importedData['frog-finance-theme']) localStorage.setItem('frog-finance-theme', importedData['frog-finance-theme']);

                alert("Данные успешно загружены! Приложение перезагрузится.");
                location.reload();
            }
        } catch (error) {
            alert("Ошибка чтения файла. Убедитесь, что вы выбрали правильный файл резервной копии.");
            console.error(error);
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

// ==========================================
// 7. УПРАВЛЕНИЕ СЧЕТАМИ И ТРАНЗАКЦИЯМИ
// ==========================================
function updateCategories() {
    const type = document.querySelector('input[name="tx-type"]:checked').value;
    const select = document.getElementById('tx-category');
    select.innerHTML = '';
    const cats = type === 'income' ? categoriesIncome : categoriesExpense;
    cats.forEach(cat => { select.innerHTML += `<option value="${cat}">${cat}</option>`; });
}

function openAddModal() {
    if (accounts.length === 0) { alert("Сначала создайте хотя бы один счет!"); return; }
    document.getElementById('transaction-form').reset();
    document.getElementById('tx-id').value = '';
    document.getElementById('tx-modal-title').innerText = 'Новая операция';
    document.getElementById('tx-submit-btn').innerText = 'Сохранить';
    updateCategories();

    const accSelect = document.getElementById('tx-account');
    accSelect.innerHTML = '';
    accounts.forEach(acc => { accSelect.innerHTML += `<option value="${acc.id}">${acc.icon || '💳'} ${acc.name} (${Number(acc.balance).toFixed(2)} ₽)</option>`; });

    document.getElementById('add-modal').classList.add('active');
}

function editTransaction(txId) {
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;
    if (accounts.length === 0) { alert("Нет счетов!"); return; }

    document.getElementById('transaction-form').reset();
    document.getElementById('tx-id').value = tx.id;

    document.querySelector(`input[name="tx-type"][value="${tx.type}"]`).checked = true;
    updateCategories();
    document.getElementById('tx-category').value = tx.category;

    document.getElementById('tx-amount').value = tx.amount;

    const accSelect = document.getElementById('tx-account');
    accSelect.innerHTML = '';
    accounts.forEach(acc => { accSelect.innerHTML += `<option value="${acc.id}">${acc.icon || '💳'} ${acc.name} (${Number(acc.balance).toFixed(2)} ₽)</option>`; });
    accSelect.value = tx.accountId || (accounts[0] && accounts[0].id) || '';

    document.getElementById('tx-modal-title').innerText = 'Изменить операцию';
    document.getElementById('tx-submit-btn').innerText = 'Сохранить';
    document.getElementById('add-modal').classList.add('active');
}

function setTxFilter(filter) {
    currentTxFilter = filter;

    const btnIds = { week: 'btn-filter-week', month: 'btn-filter-month', year: 'btn-filter-year', all: 'btn-filter-all' };
    Object.entries(btnIds).forEach(([key, id]) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        if (key === filter) {
            btn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-white shadow-sm theme-text';
        } else {
            btn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all theme-text-muted';
        }
    });

    renderTransactions();
}

function getTxInFilter(tx) {
    if (currentTxFilter === 'all') return true;
    const txDate = new Date(tx.date);
    const now = new Date();

    if (currentTxFilter === 'week') {
        const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
        return txDate >= weekAgo;
    }
    if (currentTxFilter === 'month') {
        return txDate.getFullYear() === now.getFullYear() && txDate.getMonth() === now.getMonth();
    }
    if (currentTxFilter === 'year') {
        return txDate.getFullYear() === now.getFullYear();
    }
    return true;
}
function closeAddModal() { document.getElementById('add-modal').classList.remove('active'); }
function deleteTransaction(txId) {
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;
    if (!confirm(`Удалить операцию на ${tx.amount} ₽? Баланс счета будет скорректирован.`)) return;

    const accIdx = accounts.findIndex(a => a.id === tx.accountId);
    if (accIdx !== -1) {
        accounts[accIdx].balance -= (tx.type === 'income' ? tx.amount : -tx.amount);
    }

    transactions = transactions.filter(t => t.id !== txId);

    localStorage.setItem('frog_accounts', JSON.stringify(accounts));
    localStorage.setItem('frog_transactions', JSON.stringify(transactions));

    renderAll();
}
function openAccountModal() {
    document.getElementById('account-form').reset();
    document.getElementById('account-id').value = '';
    document.getElementById('acc-image').value = '';
    updateImagePreview('acc', '');
    document.getElementById('account-modal-title').innerText = 'Новый счет';
    document.getElementById('account-submit-btn').innerText = 'Создать';
    document.getElementById('account-modal').classList.add('active');
}

function editAccount(accountId) {
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return;
    document.getElementById('account-form').reset();
    document.getElementById('account-id').value = acc.id;
    document.getElementById('acc-name').value = acc.name;
    document.getElementById('acc-icon').value = acc.icon || '';
    document.getElementById('acc-image').value = acc.image || '';
    updateImagePreview('acc', acc.image || '');
    document.getElementById('acc-image-file').value = '';
    document.getElementById('acc-balance').value = acc.balance;
    document.getElementById('account-modal-title').innerText = 'Изменить счет';
    document.getElementById('account-submit-btn').innerText = 'Сохранить';
    document.getElementById('account-modal').classList.add('active');
}
function closeAccountModal() { document.getElementById('account-modal').classList.remove('active'); }
function deleteAccount(accountId) {
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return;
    if (accounts.length === 1) {
        alert("Нельзя удалить последний счет — иначе некуда будет привязывать операции.");
        return;
    }

    const usedInTx = transactions.filter(t => t.accountId === accountId).length;
    const usedInSubs = subscriptions.filter(s => s.accountId === accountId).length;
    const usedInGoals = goals.filter(g => g.accountId === accountId).length;

    let warning = `Удалить счет "${acc.name}"?`;
    if (usedInTx || usedInSubs) {
        warning += `\n\nВнимание: к нему привязано операций — ${usedInTx}, платежей — ${usedInSubs}. Они останутся в истории, но будут помечены как «Удаленный счет».`;
    }
    if (usedInGoals) {
        warning += `\nЦелей привязано: ${usedInGoals} (у целей привязки к счёту по факту нет — это просто для напоминания).`;
    }

    if (!confirm(warning)) return;

    accounts = accounts.filter(a => a.id !== accountId);
    localStorage.setItem('frog_accounts', JSON.stringify(accounts));
    renderAll();
}
function saveAccount(event) {
    event.preventDefault();
    const id = document.getElementById('account-id').value;
    const name = document.getElementById('acc-name').value;
    const icon = document.getElementById('acc-icon').value || '💳';
    const balance = Number(document.getElementById('acc-balance').value) || 0;
    const image = document.getElementById('acc-image').value || '';

    if (id) {
        const idx = accounts.findIndex(a => a.id === id);
        if (idx !== -1) {
            accounts[idx] = { ...accounts[idx], name, icon, balance, image };
        }
    } else {
        accounts.push({ id: 'acc-' + Date.now().toString(), name, icon, balance, image });
    }

    localStorage.setItem('frog_accounts', JSON.stringify(accounts));
    renderAll();
    closeAccountModal();
}

function saveTransaction(event) {
    event.preventDefault();
    const id = document.getElementById('tx-id').value;
    const type = document.querySelector('input[name="tx-type"]:checked').value;
    const amount = Number(document.getElementById('tx-amount').value);
    const category = document.getElementById('tx-category').value;
    const accountId = document.getElementById('tx-account').value;

    if (isNaN(amount) || amount <= 0) return;
    if (!accountId) { alert("Выберите счет!"); return; }

    if (id) {
        const txIdx = transactions.findIndex(t => t.id === id);
        if (txIdx === -1) return;
        const oldTx = transactions[txIdx];

        const oldAccIdx = accounts.findIndex(a => a.id === oldTx.accountId);
        if (oldAccIdx !== -1) {
            accounts[oldAccIdx].balance -= (oldTx.type === 'income' ? oldTx.amount : -oldTx.amount);
        }

        const newAccIdx = accounts.findIndex(a => a.id === accountId);
        if (newAccIdx === -1) { alert("Счет не найден!"); return; }
        accounts[newAccIdx].balance += (type === 'income' ? amount : -amount);

        transactions[txIdx] = { ...oldTx, type, amount, category, accountId };
    } else {
        const accountIndex = accounts.findIndex(a => a.id === accountId);
        if (accountIndex === -1) { alert("Счет не найден!"); return; }
        accounts[accountIndex].balance += (type === 'income' ? amount : -amount);

        transactions.unshift({
            id: Date.now().toString(),
            type, amount, category, accountId,
            date: new Date().toISOString()
        });
    }

    localStorage.setItem('frog_accounts', JSON.stringify(accounts));
    localStorage.setItem('frog_transactions', JSON.stringify(transactions));

    renderAll();
    closeAddModal();
}

// ==========================================
// 8. УПРАВЛЕНИЕ РЕГУЛЯРНЫМИ ПЛАТЕЖАМИ
// ==========================================
function openSubModal() {
    if (accounts.length === 0) { alert("Сначала создайте счет!"); return; }
    document.getElementById('sub-form').reset();
    document.getElementById('sub-id').value = '';
    document.getElementById('sub-image').value = '';
    updateImagePreview('sub', '');
    document.getElementById('sub-modal-title').innerText = 'Новый платеж';
    document.getElementById('sub-submit-btn').innerText = 'Добавить';

    const accSelect = document.getElementById('sub-account');
    accSelect.innerHTML = '';
    accounts.forEach(acc => { accSelect.innerHTML += `<option value="${acc.id}">${acc.icon || '💳'} ${acc.name}</option>`; });

    document.getElementById('sub-modal').classList.add('active');
}

function editSub(subId) {
    const sub = subscriptions.find(s => s.id === subId);
    if (!sub) return;
    if (accounts.length === 0) { alert("Нет счетов для привязки!"); return; }

    document.getElementById('sub-form').reset();
    document.getElementById('sub-id').value = sub.id;
    document.getElementById('sub-name').value = sub.name;
    document.getElementById('sub-amount').value = sub.amount;
    document.getElementById('sub-day').value = sub.day;
    document.getElementById('sub-image').value = sub.image || '';
    updateImagePreview('sub', sub.image || '');
    document.getElementById('sub-image-file').value = '';

    const accSelect = document.getElementById('sub-account');
    accSelect.innerHTML = '';
    accounts.forEach(acc => { accSelect.innerHTML += `<option value="${acc.id}">${acc.icon || '💳'} ${acc.name}</option>`; });
    accSelect.value = sub.accountId;

    document.getElementById('sub-modal-title').innerText = 'Изменить платеж';
    document.getElementById('sub-submit-btn').innerText = 'Сохранить';
    document.getElementById('sub-modal').classList.add('active');
}
function closeSubModal() { document.getElementById('sub-modal').classList.remove('active'); }
function deleteSub(subId) {
    const sub = subscriptions.find(s => s.id === subId);
    if (!sub) return;
    if (!confirm(`Удалить платеж "${sub.name}" (${sub.amount} ₽)?`)) return;
    subscriptions = subscriptions.filter(s => s.id !== subId);
    localStorage.setItem('frog_subs', JSON.stringify(subscriptions));
    renderAll();
}
function saveSub(event) {
    event.preventDefault();
    const id = document.getElementById('sub-id').value;
    const name = document.getElementById('sub-name').value;
    const amount = Number(document.getElementById('sub-amount').value);
    const day = Number(document.getElementById('sub-day').value);
    const accountId = document.getElementById('sub-account').value;
    const image = document.getElementById('sub-image').value || '';

    if (id) {
        const idx = subscriptions.findIndex(s => s.id === id);
        if (idx !== -1) {
            subscriptions[idx] = { ...subscriptions[idx], name, amount, day, accountId, image };
        }
    } else {
        subscriptions.push({ id: 'sub-' + Date.now().toString(), name, amount, day, accountId, lastPaid: '', image });
    }

    localStorage.setItem('frog_subs', JSON.stringify(subscriptions));
    renderAll();
    closeSubModal();
}

function paySubscription(subId) {
    const sub = subscriptions.find(s => s.id === subId);
    if (!sub) return;

    const accountIndex = accounts.findIndex(a => a.id === sub.accountId);
    if (accountIndex === -1) { alert("Счет не найден!"); return; }

    if (accounts[accountIndex].balance < sub.amount) {
        alert("Недостаточно средств на счете для оплаты!");
        return;
    }

    if (!confirm(`Оплатить "${sub.name}" на сумму ${sub.amount} ₽?`)) return;

    accounts[accountIndex].balance -= sub.amount;

    transactions.unshift({
        id: Date.now().toString(),
        type: 'expense',
        amount: sub.amount,
        category: '📦 Другое',
        accountId: sub.accountId,
        date: new Date().toISOString()
    });

    const today = new Date();
    sub.lastPaid = `${today.getFullYear()}-${today.getMonth()}`;

    localStorage.setItem('frog_accounts', JSON.stringify(accounts));
    localStorage.setItem('frog_transactions', JSON.stringify(transactions));
    localStorage.setItem('frog_subs', JSON.stringify(subscriptions));

    renderAll();
}

// ==========================================
// 9. УПРАВЛЕНИЕ ЦЕЛЯМИ
// ==========================================
function openGoalModal() {
    document.getElementById('goal-form').reset();
    document.getElementById('goal-id').value = '';
    document.getElementById('goal-image').value = '';
    updateImagePreview('goal', '');
    document.getElementById('goal-modal-title').innerText = 'Новая цель';
    document.getElementById('goal-submit-btn').innerText = 'Создать';
    document.getElementById('goal-modal').classList.add('active');
}

function editGoal(goalId) {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    document.getElementById('goal-form').reset();
    document.getElementById('goal-id').value = goal.id;
    document.getElementById('goal-name').value = goal.name;
    document.getElementById('goal-target').value = goal.target;
    document.getElementById('goal-icon').value = goal.icon;
    document.getElementById('goal-image').value = goal.image || '';
    updateImagePreview('goal', goal.image || '');
    document.getElementById('goal-image-file').value = '';
    document.getElementById('goal-modal-title').innerText = 'Изменить цель';
    document.getElementById('goal-submit-btn').innerText = 'Сохранить';
    document.getElementById('goal-modal').classList.add('active');
}
function closeGoalModal() { document.getElementById('goal-modal').classList.remove('active'); }
function deleteGoal(goalId) {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    if (!confirm(`Удалить цель "${goal.name}"? Накопленные ${goal.current.toFixed(0)} ₽ не вернутся на счёт.`)) return;
    goals = goals.filter(g => g.id !== goalId);
    localStorage.setItem('frog_goals', JSON.stringify(goals));
    renderAll();
}
function saveGoal(event) {
    event.preventDefault();
    const id = document.getElementById('goal-id').value;
    const name = document.getElementById('goal-name').value;
    const target = Number(document.getElementById('goal-target').value);
    const icon = document.getElementById('goal-icon').value || '🎯';
    const image = document.getElementById('goal-image').value || '';

    if (id) {
        const idx = goals.findIndex(g => g.id === id);
        if (idx !== -1) {
            goals[idx] = { ...goals[idx], name, target, icon, image };
        }
    } else {
        goals.push({ id: 'goal-' + Date.now().toString(), name, target, current: 0, icon, image });
    }

    localStorage.setItem('frog_goals', JSON.stringify(goals));
    renderAll();
    closeGoalModal();
}

function openDepositModal(goalId) {
    if (accounts.length === 0) { alert("У вас нет счетов!"); return; }
    const goal = goals.find(g => g.id === goalId);
    if(!goal) return;

    document.getElementById('deposit-form').reset();
    document.getElementById('deposit-goal-id').value = goalId;
    const iconPart = goal.icon && goal.icon.trim() ? goal.icon + ' ' : '';
    document.getElementById('deposit-goal-name').innerText = `${iconPart}${goal.name} (Осталось: ${Math.max(0, goal.target - goal.current).toFixed(2)} ₽)`;
    const accSelect = document.getElementById('deposit-account');
    accSelect.innerHTML = '';
    accounts.forEach(acc => { accSelect.innerHTML += `<option value="${acc.id}">${acc.icon || '💳'} ${acc.name} (${Number(acc.balance).toFixed(2)} ₽)</option>`; });

    document.getElementById('deposit-modal').classList.add('active');
}
function closeDepositModal() { document.getElementById('deposit-modal').classList.remove('active'); }

function saveDeposit(event) {
    event.preventDefault();
    const goalId = document.getElementById('deposit-goal-id').value;
    const amount = Number(document.getElementById('deposit-amount').value);
    const accountId = document.getElementById('deposit-account').value;

    const goal = goals.find(g => g.id === goalId);
    const accountIndex = accounts.findIndex(a => a.id === accountId);

    if (!goal || accountIndex === -1 || amount <= 0) return;
    if (accounts[accountIndex].balance < amount) { alert("На этом счете недостаточно средств!"); return; }

    accounts[accountIndex].balance -= amount;
    goal.current += amount;

    localStorage.setItem('frog_accounts', JSON.stringify(accounts));
    localStorage.setItem('frog_goals', JSON.stringify(goals));

    renderAll();
    closeDepositModal();
}

// ==========================================
// 10. ЛОГИКА ЗАРПЛАТЫ И КАЛЕНДАРЯ
// ==========================================
function openSalaryModal() {
    if (salarySettings) {
        document.getElementById('sal-gross').value = salarySettings.gross;
        document.getElementById('sal-exp').value = salarySettings.exp;
        document.getElementById('sal-day-1').value = salarySettings.day1;
        document.getElementById('sal-day-2').value = salarySettings.day2;
    }
    document.getElementById('salary-modal').classList.add('active');
}
function closeSalaryModal() { document.getElementById('salary-modal').classList.remove('active'); }

function saveSalarySettings(event) {
    event.preventDefault();
    salarySettings = {
        gross: Number(document.getElementById('sal-gross').value),
        exp: Number(document.getElementById('sal-exp').value),
        day1: Number(document.getElementById('sal-day-1').value),
        day2: Number(document.getElementById('sal-day-2').value)
    };
    localStorage.setItem('frog_salary_settings', JSON.stringify(salarySettings));
    closeSalaryModal();
    renderSalaryPage();
}

function renderSalaryPage() {
    const setupView = document.getElementById('salary-setup-view');
    const calcView = document.getElementById('salary-calc-view');

    if (!salarySettings) {
        setupView.classList.remove('hidden');
        calcView.classList.add('hidden');
        return;
    }

    setupView.classList.add('hidden');
    calcView.classList.remove('hidden');

    renderCalendar();
    calculateSalaryForecast();
}

function changeMonth(offset) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + offset);
    renderCalendar();
    calculateSalaryForecast();
}

function renderCalendar() {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const monthKey = `${year}-${month}`;

    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    document.getElementById('calendar-month-year').innerText = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let startDay = firstDay.getDay();
    if (startDay === 0) startDay = 7;

    const container = document.getElementById('calendar-days');
    container.innerHTML = '';

    for (let i = 1; i < startDay; i++) {
        container.innerHTML += `<div class="day-empty"></div>`;
    }

    if (!calendarData[monthKey]) calendarData[monthKey] = {};

    for (let i = 1; i <= daysInMonth; i++) {
        let status = calendarData[monthKey][i] || 'work';

        const dayOfWeek = new Date(year, month, i).getDay();
        if ((dayOfWeek === 0 || dayOfWeek === 6) && !calendarData[monthKey][i]) {
            status = 'weekend';
        }

        let cls = 'day-work';
        if (status === 'vacation') cls = 'day-vacation';
        if (status === 'sick') cls = 'day-sick';
        if (status === 'weekend') cls = 'day-weekend';

        container.innerHTML += `<div class="calendar-day ${cls}" onclick="openDayModal(${i})">${i}</div>`;
    }
}

function openDayModal(day) {
    document.getElementById('day-modal-date').innerText = day;
    document.getElementById('day-modal-id').value = day;
    document.getElementById('day-modal').classList.add('active');
}
function closeDayModal() { document.getElementById('day-modal').classList.remove('active'); }

function setDayStatus(status) {
    const day = Number(document.getElementById('day-modal-id').value);
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const monthKey = `${year}-${month}`;

    if (!calendarData[monthKey]) calendarData[monthKey] = {};
    calendarData[monthKey][day] = status;

    localStorage.setItem('frog_calendar_data', JSON.stringify(calendarData));
    closeDayModal();
    renderCalendar();
    calculateSalaryForecast();
}

function getMonthSalaryDetails(year, month, daysData) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let workDays = 0, vacationDays = 0, sickDays = 0;

    for (let i = 1; i <= daysInMonth; i++) {
        const status = daysData[i] || (new Date(year, month, i).getDay() % 6 === 0 ? 'weekend' : 'work');
        if (status === 'work') workDays++;
        if (status === 'vacation') vacationDays++;
        if (status === 'sick') sickDays++;
    }

    let normWorkDays = 0;
    for (let i = 1; i <= daysInMonth; i++) {
        if (new Date(year, month, i).getDay() % 6 !== 0) normWorkDays++;
    }
    if (normWorkDays === 0) normWorkDays = 21;

    const gross = salarySettings.gross;
    const dailyRate = gross / normWorkDays;
    const payForWork = dailyRate * workDays;

    const avgDailyEarnings = gross / 29.3;
    const vacationPay = avgDailyEarnings * vacationDays;

    let sickPercent = 0.6;
    if (salarySettings.exp >= 8) sickPercent = 1.0;
    else if (salarySettings.exp >= 5) sickPercent = 0.8;
    const sickPay = avgDailyEarnings * sickDays * sickPercent;

    const totalGross = payForWork + vacationPay + sickPay;
    const tax = totalGross * 0.13;
    const net = totalGross - tax;

    return { net, tax };
}

function calculateSalaryForecast() {
    if (!salarySettings) return;

    const viewYear = currentCalendarDate.getFullYear();
    const viewMonth = currentCalendarDate.getMonth();
    const viewMonthKey = `${viewYear}-${viewMonth}`;
    const viewDaysData = calendarData[viewMonthKey] || {};

    const viewDetails = getMonthSalaryDetails(viewYear, viewMonth, viewDaysData);

    document.getElementById('calc-gross').innerText = `${salarySettings.gross.toFixed(0)} ₽`;
    document.getElementById('calc-tax').innerText = `-${viewDetails.tax.toFixed(0)} ₽`;
    document.getElementById('calc-net').innerText = `${viewDetails.net.toFixed(0)} ₽`;

    const today = new Date();
    const realYear = today.getFullYear();
    const realMonth = today.getMonth();
    const realMonthKey = `${realYear}-${realMonth}`;
    const realDaysData = calendarData[realMonthKey] || {};

    const realDetails = getMonthSalaryDetails(realYear, realMonth, realDaysData);

    const currentDay = today.getDate();
    const d1 = salarySettings.day1;
    const d2 = salarySettings.day2;

    let nextPayoutAmount = 0;
    let nextPayoutDateText = "";

    if (currentDay < d1) {
        nextPayoutAmount = realDetails.net * 0.5;
        nextPayoutDateText = `Аванс ${d1} числа`;
    } else if (currentDay < d2) {
        nextPayoutAmount = realDetails.net * 0.5;
        nextPayoutDateText = `Зарплата ${d2} числа`;
    } else {
        let nextMonth = realMonth + 1;
        let nextYear = realYear;
        if (nextMonth > 11) { nextMonth = 0; nextYear++; }

        const nextMonthKey = `${nextYear}-${nextMonth}`;
        const nextDaysData = calendarData[nextMonthKey] || {};
        const nextDetails = getMonthSalaryDetails(nextYear, nextMonth, nextDaysData);

        nextPayoutAmount = nextDetails.net * 0.5;
        nextPayoutDateText = `Аванс ${d1} числа (след. месяц)`;
    }

    document.getElementById('next-payout-amount').innerText = `${nextPayoutAmount.toFixed(0)} ₽`;
    document.getElementById('next-payout-date').innerText = nextPayoutDateText;
}

// ==========================================
// 11. РЕНДЕРИНГ ОСТАЛЬНОГО ИНТЕРФЕЙСА
// ==========================================
function renderAll() {
    renderAccounts();
    renderSubs();
    renderGoals();
    renderTransactions();
    renderCredits();
    renderChart();
    analyzeFinances();
}

function renderAccounts() {
    const container = document.getElementById('accounts-container');
    if(!container) return;
    container.innerHTML = '';

    accounts.forEach(acc => {
        const card = document.createElement('div');
        card.className = 'main-window rounded-2xl p-5 border-2 shadow-sm';
        const isNegative = Number(acc.balance) < 0;
        const balanceColor = isNegative ? 'color: var(--expense)' : 'color: var(--income)';

        card.innerHTML = `
            <div class="flex justify-between items-center" onclick="editAccount('${acc.id}')" style="cursor:pointer;">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-full flex items-center justify-center" style="background-color: var(--card-bg); border: 1px solid var(--border);">
${renderEntityIcon(acc.icon, 'ico-wallet', 24, acc.image)}</div>
                    <div><h3 class="font-bold theme-text text-sm">${acc.name}</h3></div>
                </div>
                <div class="text-right">
                    <p class="text-xl font-extrabold" style="${balanceColor}">${Number(acc.balance).toFixed(2)} ₽</p>
                </div>
            </div>

            <div class="flex justify-end mt-3">
                <button onclick="deleteAccount('${acc.id}')" class="px-3 py-1.5 rounded-lg text-xs font-black border-2" style="border-color: var(--expense); color: var(--expense);">🗑 Удалить</button>
            </div>
        `;
        container.appendChild(card);
    });
}

function renderSubs() {
    const container = document.getElementById('subs-container');
    if(!container) return;
    container.innerHTML = '';

    if (subscriptions.length === 0) {
        container.innerHTML = `<div class="main-window rounded-2xl p-4 border-2 border-dashed text-center opacity-70"><p class="text-xs font-bold theme-text-muted">Нет регулярных платежей</p></div>`;
        return;
    }

    const today = new Date();
    const currentDay = today.getDate();
    const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;

    subscriptions.forEach(sub => {
        const isPaid = sub.lastPaid === currentMonthKey;
        const isDue = currentDay >= Number(sub.day) && !isPaid;

        const card = document.createElement('div');
        card.className = `main-window rounded-2xl p-4 border-2 shadow-sm ${isDue ? 'border-red-400 bg-red-50/30' : ''}`;

        card.innerHTML = `
            <div class="flex justify-between items-center" onclick="editSub('${sub.id}')" style="cursor:pointer;">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center" style="background-color: var(--card-bg); border: 1px solid var(--border);">
${sub.image
    ? `<img src="${sub.image}" alt="" style="width:28px;height:28px;object-fit:cover;border-radius:8px;">`
    : icon(isPaid ? 'ico-check' : 'ico-clock', 22)}                    </div>
                    <div>
                        <h3 class="font-bold theme-text text-sm">${sub.name}</h3>
                        <p class="text-[10px] theme-text-muted">Каждое ${sub.day} число • ${sub.amount} ₽</p>
                    </div>
                </div>
            </div>

            <div class="flex justify-end gap-2 mt-3 items-center">
                ${isPaid
                    ? `<span class="text-xs font-bold theme-text-muted mr-auto">Оплачено</span>`
                    : `<button onclick="paySubscription('${sub.id}')" class="px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm transition-transform hover:scale-105 mr-auto" style="background-color: ${isDue ? 'var(--expense)' : 'var(--primary)'};">Оплатить</button>`
                }
                <button onclick="deleteSub('${sub.id}')" class="px-3 py-1.5 rounded-lg text-xs font-black border-2" style="border-color: var(--expense); color: var(--expense);">🗑</button>
            </div>
        `;
        container.appendChild(card);
    });
}

function renderGoals() {
    const container = document.getElementById('goals-container');
    if(!container) return;
    container.innerHTML = '';

    if (goals.length === 0) {
        container.innerHTML = `<div class="main-window rounded-2xl p-4 border-2 border-dashed text-center opacity-70"><p class="text-xs font-bold theme-text-muted">У вас пока нет целей. Создайте первую копилку!</p></div>`;
        return;
    }

    goals.forEach(goal => {
        const percent = Math.min(100, (goal.current / goal.target) * 100);
        const isCompleted = goal.current >= goal.target;

        const card = document.createElement('div');
        card.className = 'main-window rounded-2xl p-5 border-2 shadow-sm relative overflow-hidden';

        card.innerHTML = `
            <div class="flex justify-between items-start mb-3" onclick="editGoal('${goal.id}')" style="cursor:pointer;">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center" style="background-color: var(--card-bg); border: 1px solid var(--border);">
${renderEntityIcon(goal.icon, 'ico-target', 22, goal.image)}</div>
                    <div>
                        <h3 class="font-bold theme-text text-sm">${goal.name}</h3>
                        <p class="text-[10px] theme-text-muted">${goal.current.toFixed(0)} из ${goal.target.toFixed(0)} ₽</p>
                    </div>
                </div>
                ${isCompleted ? '<span class="text-xl">🏆</span>' : `<span class="text-xs font-bold theme-text">${percent.toFixed(0)}%</span>`}
            </div>

            <div class="w-full h-2.5 rounded-full overflow-hidden mb-3" style="background-color: var(--border);">
                <div class="h-full rounded-full transition-all duration-500" style="width: ${percent}%; background-color: ${isCompleted ? 'var(--income)' : 'var(--primary)'};"></div>
            </div>

            <div class="flex gap-2">
                ${isCompleted
                    ? `<div class="flex-1 text-center text-xs font-bold theme-text-muted py-2">Цель достигнута 🎉</div>`
                    : `<button onclick="openDepositModal('${goal.id}')" class="flex-1 py-2 rounded-xl text-xs font-black theme-btn">💰 Пополнить</button>`
                }
                <button onclick="deleteGoal('${goal.id}')" class="px-3 py-2 rounded-xl text-xs font-black border-2" style="border-color: var(--expense); color: var(--expense);">🗑</button>
            </div>
        `;
        container.appendChild(card);
    });
}

function renderTransactions() {
    const container = document.getElementById('transactions-list');
    if(!container) return;
    container.innerHTML = '';

    const visible = transactions.filter(getTxInFilter);

    if (visible.length === 0) {
        const msg = transactions.length === 0
            ? 'Пока нет операций. Нажмите "+" чтобы добавить!'
            : 'За этот период операций нет.';
        container.innerHTML = `<div class="main-window rounded-2xl p-6 border-2 border-dashed text-center opacity-70"><p class="text-sm font-bold theme-text-muted">${msg}</p></div>`;
        return;
    }

    visible.forEach(tx => {
        const isIncome = tx.type === 'income';
        const sign = isIncome ? '+' : '-';
        const color = isIncome ? 'var(--income)' : 'var(--expense)';
        const acc = accounts.find(a => a.id === tx.accountId);

        const card = document.createElement('div');
        card.className = 'main-window rounded-xl p-3 border';

        card.innerHTML = `
            <div class="flex justify-between items-center" onclick="editTransaction('${tx.id}')" style="cursor:pointer;">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background-color: var(--card-bg); border: 1px solid var(--border);">
                        ${icon(isIncome ? 'ico-in' : 'ico-out', 22)}
                    </div>
                    <div>
                        <h4 class="font-bold text-sm theme-text">${tx.category}</h4>
                        <p class="text-[10px] theme-text-muted">${acc ? acc.name : 'Удаленный счет'}</p>
                    </div>
                </div>
                <div class="font-extrabold" style="color: ${color}">${sign}${tx.amount} ₽</div>
            </div>

            <div class="flex justify-end mt-2">
                <button onclick="deleteTransaction('${tx.id}')" class="px-3 py-1 rounded-lg text-[11px] font-black border-2" style="border-color: var(--expense); color: var(--expense);">🗑</button>
            </div>
        `;
        container.appendChild(card);
    });
}

// ==========================================
// 12. УПРАВЛЕНИЕ КРЕДИТАМИ
// ==========================================
function openCreditModal() {
    if (accounts.length === 0) { alert("Сначала создайте счет!"); return; }
    document.getElementById('credit-form').reset();
    document.getElementById('credit-id').value = '';
    document.getElementById('credit-modal-title').innerText = 'Новый кредит';
    
    const accSelect = document.getElementById('credit-account');
    accSelect.innerHTML = '';
    accounts.forEach(acc => { accSelect.innerHTML += `<option value="${acc.id}">${acc.name}</option>`; });
    
    document.getElementById('credit-modal').classList.add('active');
}

function closeCreditModal() {
    document.getElementById('credit-modal').classList.remove('active');
}

function saveCredit(event) {
    event.preventDefault();
    const id = document.getElementById('credit-id').value;
    const name = document.getElementById('credit-name').value;
    const total = Number(document.getElementById('credit-total').value);
    const monthly = Number(document.getElementById('credit-monthly').value);
    const day = Number(document.getElementById('credit-day').value);
    const accountId = document.getElementById('credit-account').value;

    if (id) {
        const idx = credits.findIndex(c => c.id === id);
        if (idx !== -1) {
            credits[idx] = { ...credits[idx], name, total, monthly, day, accountId };
        }
    } else {
        credits.push({
            id: 'credit-' + Date.now().toString(),
            name, total, paid: 0, monthly, day, accountId, lastPaid: ''
        });
    }

    localStorage.setItem('frog_credits', JSON.stringify(credits));
    renderAll();
    closeCreditModal();
}

function openCreditPayModal(creditId) {
    const credit = credits.find(c => c.id === creditId);
    if (!credit) return;
    
    const accIdx = accounts.findIndex(a => a.id === credit.accountId);
    if (accIdx === -1) { alert("Счет не найден!"); return; }
    
    document.getElementById('credit-pay-id').value = creditId;
    document.getElementById('credit-pay-name').innerText = `${credit.name} (Осталось: ${(credit.total - credit.paid).toFixed(0)} ₽)`;
    document.getElementById('credit-pay-amount').value = credit.monthly;

    const accSelect = document.getElementById('credit-pay-account');
    accSelect.innerHTML = '';
    accounts.forEach(acc => {
        accSelect.innerHTML += `<option value="${acc.id}" ${acc.id === credit.accountId ? 'selected' : ''}>${acc.name} (${acc.balance.toFixed(2)} ₽)</option>`;
    });

    document.getElementById('credit-pay-modal').classList.add('active');
}

function closeCreditPayModal() {
    document.getElementById('credit-pay-modal').classList.remove('active');
}

function openCreditEditModal(creditId) {
    const credit = credits.find(c => c.id === creditId);
    if (!credit) return;
    
    if (accounts.length === 0) { alert("Нет счетов!"); return; }

    document.getElementById('credit-form').reset();
    document.getElementById('credit-id').value = credit.id;
    document.getElementById('credit-name').value = credit.name;
    document.getElementById('credit-total').value = credit.total;
    document.getElementById('credit-monthly').value = credit.monthly;
    document.getElementById('credit-day').value = credit.day;
    
    const accSelect = document.getElementById('credit-account');
    accSelect.innerHTML = '';
    accounts.forEach(acc => {
        accSelect.innerHTML += `<option value="${acc.id}" ${acc.id === credit.accountId ? 'selected' : ''}>${acc.name}</option>`;
    });

    document.getElementById('credit-modal-title').innerText = 'Изменить кредит';
    document.getElementById('credit-submit-btn').innerText = 'Сохранить';

    document.getElementById('credit-modal').classList.add('active');
}

function saveCreditPayment(event) {
    event.preventDefault();
    const creditId = document.getElementById('credit-pay-id').value;
    const amount = Number(document.getElementById('credit-pay-amount').value);
    const accountId = document.getElementById('credit-pay-account').value;

    const credit = credits.find(c => c.id === creditId);
    if (!credit || amount <= 0) return;

    const accIdx = accounts.findIndex(a => a.id === accountId);
    if (accIdx === -1) { alert("Счет не найден!"); return; }
    if (accounts[accIdx].balance < amount) { alert("Недостаточно средств на счете!"); return; }

    accounts[accIdx].balance -= amount;

    transactions.unshift({
        id: Date.now().toString(),
        type: 'expense',
        amount: amount,
        category: '📦 Кредит',
        accountId: accountId,
        date: new Date().toISOString()
    });

    credit.paid += amount;
    if (credit.paid > credit.total) {
        accounts[accIdx].balance += (credit.paid - credit.total);
        credit.paid = credit.total;
    }
    
    const today = new Date();
    credit.lastPaid = `${today.getFullYear()}-${today.getMonth()}`;

    localStorage.setItem('frog_accounts', JSON.stringify(accounts));
    localStorage.setItem('frog_transactions', JSON.stringify(transactions));
    localStorage.setItem('frog_credits', JSON.stringify(credits));

    renderAll();
    closeCreditPayModal();
}

function deleteCredit(creditId) {
    if (!confirm("Удалить кредит? История платежей останется.")) return;
    credits = credits.filter(c => c.id !== creditId);
    localStorage.setItem('frog_credits', JSON.stringify(credits));
    renderAll();
}

function renderCredits() {
    const container = document.getElementById('credits-container');
    const totalEl = document.getElementById('total-credit-amount');
    if (!container) return;

    container.innerHTML = '';
    let totalRemaining = 0;

    if (credits.length === 0) {
        container.innerHTML = `<div class="main-window rounded-2xl p-4 border-2 border-dashed text-center opacity-70"><p class="text-xs font-bold theme-text-muted">У вас нет активных кредитов</p></div>`;
        if(totalEl) totalEl.innerText = '0 ₽';
        return;
    }

    const today = new Date();
    const currentDay = today.getDate();
    const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;

    credits.forEach(credit => {
        const remaining = Math.max(0, credit.total - credit.paid);
        totalRemaining += remaining;
        
        const percent = Math.min(100, (credit.paid / credit.total) * 100);
        const isPaidOff = credit.paid >= credit.total;
        const isDueThisMonth = currentDay >= Number(credit.day) && credit.lastPaid !== currentMonthKey;

        const card = document.createElement('div');
        card.className = 'main-window rounded-2xl p-4 border-2 shadow-sm';
        card.style.cursor = 'pointer';
        card.onclick = () => openCreditEditModal(credit.id);

        card.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <div>
                    <h3 class="font-bold theme-text text-base">${credit.name}</h3>
                    <p class="text-xs theme-text-muted font-bold">Платеж: ${credit.monthly} ₽ • ${credit.day} число</p>
                </div>
                <span class="font-black text-lg" style="color: ${isPaidOff ? 'var(--income)' : 'var(--expense)'};">${remaining} ₽</span>
            </div>
            
            <div class="w-full h-2 rounded-full overflow-hidden mb-3" style="background-color: var(--border);">
                <div class="h-full rounded-full transition-all duration-500" style="width: ${percent}%; background-color: ${isPaidOff ? 'var(--income)' : 'var(--primary)'};"></div>
            </div>
            
            <div class="flex justify-between items-center">
                <span class="text-[10px] font-bold theme-text-muted">Выплачено: ${credit.paid} из ${credit.total} ₽</span>
                
                ${isPaidOff 
                    ? `<span class="text-xs font-black" style="color: var(--income);">✅ Закрыт</span>`
                    : `<button onclick="event.stopPropagation(); openCreditPayModal('${credit.id}')" class="px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm" style="background-color: ${isDueThisMonth ? 'var(--expense)' : 'var(--primary)'};">Оплатить</button>`
                }
            </div>
            <div class="flex justify-end mt-2">
                <button onclick="event.stopPropagation(); deleteCredit('${credit.id}')" class="text-[10px] font-bold theme-text-muted hover:opacity-70">🗑 Удалить</button>
            </div>
        `;
        container.appendChild(card);
    });

    if(totalEl) totalEl.innerText = `${totalRemaining.toFixed(0)} ₽`;
}

function goToProfile() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => { n.classList.remove('theme-text'); n.classList.add('theme-text-muted'); });
    
    document.getElementById('page-profile').classList.add('active');
}

// СБРОС ДАННЫХ
function resetData() {
    if (confirm("Вы уверены, что хотите удалить ВСЕ счета, операции, цели и подписки? Это действие нельзя отменить.")) {
        localStorage.removeItem('frog_accounts');
        localStorage.removeItem('frog_transactions');
        localStorage.removeItem('frog_goals');
        localStorage.removeItem('frog_subs');
        localStorage.removeItem('frog_salary_settings');
        localStorage.removeItem('frog_calendar_data');
        location.reload();
    }
}