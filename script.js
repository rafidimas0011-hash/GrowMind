
/* =========================================================
   GROWMIND — TRADING WORKSPACE
   File: script.js
   Vanilla JavaScript | LocalStorage | Responsive
   ========================================================= */


/* 01 — STORAGE & DEFAULT DATA
   ========================================================= */

const STORE = 'growmind-v1';

const defaults = {
    plan: {
        name: 'Trader mandiri',
        market: 'Forex',
        capital: 10000000,
        risk: 0.5,
        limit: 2,
        setup: 'Pullback pada area struktur',
        entry: 'Konfirmasi candle dan validasi rasio minimal 1:2',
        exit: 'Stop loss sesuai struktur; target sesuai rencana',
        discipline: 'Tidak revenge trade, berhenti setelah batas rugi harian tercapai.'
    },

    compound: {
        capital: 10000000,
        rate: 2,
        periods: 12,
        deposit: 0
    },

    journal: [],

    checklist: [
        'Kondisi pasar sesuai setup',
        'Entry punya alasan tertulis',
        'Stop loss ditentukan sebelum entry',
        'Risiko sesuai trading plan',
        'Kondisi emosi cukup tenang'
    ],

    checkState: {},
    streak: [],
    target: null
};

function cloneDefaults() {
    return JSON.parse(JSON.stringify(defaults));
}

function loadState() {
    try {
        const saved = JSON.parse(
            localStorage.getItem(STORE) || 'null'
        );

        if (saved && typeof saved === 'object') {
            return {
                ...cloneDefaults(),
                ...saved,

                plan: {
                    ...defaults.plan,
                    ...(saved.plan || {})
                },

                compound: {
                    ...defaults.compound,
                    ...(saved.compound || {})
                },

                journal: Array.isArray(saved.journal)
                    ? saved.journal
                    : [],

                checklist: Array.isArray(saved.checklist)
                    ? saved.checklist
                    : [...defaults.checklist],

                checkState: saved.checkState || {},

                streak: Array.isArray(saved.streak)
                    ? saved.streak
                    : []
            };
        }
    } catch (error) {
        console.warn('Data GrowMind tidak dapat dibaca.', error);
    }

    return cloneDefaults();
}

let state = loadState();
let activeTab = 'plan';
let planStep = 0;
let editingId = null;
let compoundRows = [];

function saveState() {
    try {
        localStorage.setItem(STORE, JSON.stringify(state));
        return true;
    } catch (error) {
        console.warn('Penyimpanan gagal.', error);

        toast(
            'Penyimpanan gagal. Periksa ruang penyimpanan browser.'
        );

        return false;
    }
}


/* 02 — HELPERS
   ========================================================= */

const $ = selector => document.querySelector(selector);

const $$ = selector => [
    ...document.querySelectorAll(selector)
];

const fmt = value => {
    if (!Number.isFinite(Number(value))) {
        return '—';
    }

    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0
    }).format(Number(value));
};

const num = (value, fallback = 0) => {
    if (value === '' || value === null || value === undefined) {
        return fallback;
    }

    const result = Number(value);

    return Number.isFinite(result) ? result : fallback;
};

const esc = value => {
    return String(value ?? '').replace(
        /[&<>"']/g,
        character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[character]
    );
};

function uid() {
    return (
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 7)
    );
}

function today() {
    const date = new Date();

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
}

function shiftDate(offset) {
    const date = new Date();

    date.setDate(date.getDate() + offset);

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
}

function toast(message) {
    const element = $('#toast');

    if (!element) {
        console.log(message);
        return;
    }

    element.textContent = message;
    element.classList.add('show');

    clearTimeout(toast.timer);

    toast.timer = setTimeout(() => {
        element.classList.remove('show');
    }, 2600);
}

function field(label, id, value, type = 'text', extra = '') {
    return `
        <div class="field">
            <label for="${id}">${label}</label>
            <input
                id="${id}"
                type="${type}"
                value="${esc(value)}"
                ${extra}
            >
        </div>
    `;
}

function selectField(label, id, value, options) {
    return `
        <div class="field">
            <label for="${id}">${label}</label>

            <select id="${id}">
                ${options.map(option => `
                    <option
                        value="${esc(option)}"
                        ${option === value ? 'selected' : ''}
                    >${esc(option)}</option>
                `).join('')}
            </select>
        </div>
    `;
}

function result(label, value, description = '') {
    return `
        <div class="result-card">
            <div class="result-label">${label}</div>
            <div class="result-value">${value}</div>
            <div class="result-sub">${description}</div>
        </div>
    `;
}

async function copyText(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
        } else {
            const textarea = document.createElement('textarea');

            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';

            document.body.appendChild(textarea);
            textarea.select();

            const success = document.execCommand('copy');

            textarea.remove();

            if (!success) {
                throw new Error('Copy gagal');
            }
        }

        toast('Berhasil disalin.');
    } catch (error) {
        toast('Tidak bisa menyalin otomatis di browser ini.');
    }
}


/* 03 — NAVIGATION & MODULES
   ========================================================= */

function setTab(tab) {
    activeTab = tab;

    $$('[data-tab]').forEach(button => {
        const active = button.dataset.tab === tab;

        button.classList.toggle('active', active);

        button.setAttribute(
            'aria-selected',
            String(active)
        );
    });

    renderModule();

    if (window.innerWidth < 760) {
        $('#navLinks')?.classList.remove('open');
        $('#menuToggle')?.setAttribute('aria-expanded', 'false');
    }
}

function renderModule() {
    const container = $('#moduleContent');

    if (!container) return;

    const renderers = {
        plan: renderPlan,
        compound: renderCompound,
        position: renderPosition,
        journal: renderJournal,
        dashboard: renderDashboard,
        target: renderTarget,
        checklist: renderChecklist,
        data: renderData
    };

    container.innerHTML = (
        renderers[activeTab] || renderPlan
    )();

    wireModule();

    if (activeTab === 'compound') {
        calcCompound();
    }

    if (activeTab === 'position') {
        calcPosition();
    }

    if (activeTab === 'dashboard') {
        drawDashboard();
    }

    if (activeTab === 'journal') {
        refreshJournalList();
    }

    if (activeTab === 'target') {
        calcTarget();
    }
}

function wireModule() {
    const container = $('#moduleContent');

    if (!container) return;

    container.querySelectorAll('[data-action]').forEach(button => {
        button.addEventListener('click', () => {
            const action = actions[button.dataset.action];

            if (action) {
                action(button);
            }
        });
    });

    container.querySelectorAll('[data-live]').forEach(input => {
        input.addEventListener('input', () => {
            if (activeTab === 'compound') {
                calcCompound();
            }

            if (activeTab === 'position') {
                calcPosition();
            }

            if (activeTab === 'target') {
                calcTarget();
            }
        });
    });
}


/* 04 — MODULE ACTIONS
   ========================================================= */

const actions = {
    planNext() {
        if (planStep < 3) {
            if (!validatePlanStep()) return;

            savePlanFields();
            planStep++;

            renderModule();
        } else {
            savePlanFields();

            state.plan.ready = true;

            saveState();
            renderModule();

            toast('Trading plan berhasil disimpan.');
        }
    },

    planBack() {
        savePlanFields();

        planStep = Math.max(0, planStep - 1);

        renderModule();
    },

    planReset() {
        if (confirm('Kembali ke langkah pertama wizard?')) {
            planStep = 0;
            renderModule();
        }
    },

    planSave() {
        savePlanFields();

        state.plan.ready = true;

        saveState();

        toast('Trading plan tersimpan.');
    },

    planCopy() {
        savePlanFields();
        copyText(planText());
    },

    planPrint() {
        savePlanFields();

        state.plan.ready = true;

        saveState();
        renderModule();

        setTimeout(() => window.print(), 100);
    },

    compoundCalc() {
        calcCompound(true);
    },

    journalAdd() {
        saveJournal();
    },

    journalEdit(button) {
        editJournal(button.dataset.id);
    },

    journalDelete(button) {
        deleteJournal(button.dataset.id);
    },

    journalClear() {
        if (confirm('Hapus semua entri jurnal?')) {
            state.journal = [];

            saveState();
            renderModule();

            toast('Semua jurnal dihapus.');
        }
    },

    journalSample() {
        if (state.journal.length) {
            toast('Jurnal contoh hanya ditambahkan jika jurnal kosong.');
            return;
        }

        state.journal = [
            {
                id: uid(),
                date: today(),
                instrument: 'EURUSD',
                side: 'Long',
                entry: 1.082,
                exit: 1.087,
                result: 125000,
                emotion: 'Tenang',
                notes: 'Setup sesuai rencana, risiko terukur.',
                tag: 'A setup'
            },
            {
                id: uid(),
                date: shiftDate(-1),
                instrument: 'XAUUSD',
                side: 'Short',
                entry: 2370,
                exit: 2380,
                result: -80000,
                emotion: 'Ragu',
                notes: 'Entry terlalu cepat.',
                tag: 'Perlu evaluasi'
            },
            {
                id: uid(),
                date: shiftDate(-2),
                instrument: 'BTC/USDT',
                side: 'Long',
                entry: 62000,
                exit: 63300,
                result: 190000,
                emotion: 'Sabar',
                notes: 'Menunggu konfirmasi.',
                tag: 'A setup'
            }
        ];

        saveState();
        renderModule();

        toast('Jurnal contoh ditambahkan.');
    },

    journalCancel() {
        editingId = null;
        renderModule();
    },

    targetSave() {
        state.target = readTarget();

        saveState();
        calcTarget();

        toast('Target berhasil disimpan.');
    },

    checkAdd() {
        const input = $('#newCheck');
        const value = input?.value.trim();

        if (!value) {
            toast('Masukkan aturan checklist terlebih dahulu.');
            return;
        }

        state.checklist.push(value);

        saveState();
        renderModule();

        toast('Aturan checklist ditambahkan.');
    },

    checkReset() {
        state.checkState = {};

        saveState();
        renderModule();

        toast('Checklist direset.');
    },

    markStreak() {
        if (!state.streak.includes(today())) {
            state.streak.push(today());
        }

        saveState();
        renderModule();

        toast('Disiplin hari ini dicatat.');
    },

    exportData() {
        const blob = new Blob(
            [JSON.stringify(state, null, 2)],
            { type: 'application/json' }
        );

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = 'growmind-backup.json';

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        toast('Cadangan JSON dibuat.');
    },

    importData() {
        $('#importFile')?.click();
    },

    deleteData() {
        if (!confirm('Hapus semua data GrowMind dari browser ini? Tindakan ini tidak bisa dibatalkan.')) {
            return;
        }

        try {
            localStorage.removeItem(STORE);
        } catch (error) {
            console.warn(error);
        }

        state = cloneDefaults();
        planStep = 0;
        editingId = null;

        saveState();
        renderModule();

        toast('Data lokal dihapus.');
    }
};


/* 05 — TRADING PLAN
   ========================================================= */

function renderPlan() {
    const plan = state.plan;

    const titles = [
        'Profil & modal',
        'Aturan risiko',
        'Setup entry / exit',
        'Aturan disiplin'
    ];

    let content = '';

    if (planStep === 0) {
        content = `
            <div class="field-grid">
                ${field('Nama profil', 'pName', plan.name)}

                ${selectField(
                    'Pasar utama',
                    'pMarket',
                    plan.market,
                    ['Forex', 'Saham', 'Kripto', 'Komoditas', 'Lainnya']
                )}

                ${field(
                    'Modal awal (Rp)',
                    'pCapital',
                    plan.capital,
                    'number',
                    'min="0" step="1000"'
                )}
            </div>
        `;
    }

    if (planStep === 1) {
        content = `
            <div class="field-grid">
                ${field(
                    'Risiko per trade (%)',
                    'pRisk',
                    plan.risk,
                    'number',
                    'min="0.01" max="100" step=".05"'
                )}

                ${field(
                    'Batas rugi harian (%)',
                    'pLimit',
                    plan.limit,
                    'number',
                    'min=".1" max="100" step=".1"'
                )}

                <div class="field full">
                    <div class="notice">
                        Tentukan batas risiko berdasarkan strategi dan
                        toleransi risiko pribadi. Simulasi bukan
                        rekomendasi investasi.
                    </div>
                </div>
            </div>
        `;
    }

    if (planStep === 2) {
        content = `
            <div class="field-grid">
                <div class="field full">
                    <label for="pSetup">Kriteria setup</label>
                    <textarea id="pSetup">${esc(plan.setup)}</textarea>
                </div>

                <div class="field">
                    <label for="pEntry">Aturan entry</label>
                    <textarea id="pEntry">${esc(plan.entry)}</textarea>
                </div>

                <div class="field">
                    <label for="pExit">Aturan exit</label>
                    <textarea id="pExit">${esc(plan.exit)}</textarea>
                </div>
            </div>
        `;
    }

    if (planStep === 3) {
        content = `
            <div class="field-grid">
                <div class="field full">
                    <label for="pDiscipline">
                        Aturan disiplin pribadi
                    </label>

                    <textarea id="pDiscipline">${esc(plan.discipline)}</textarea>

                    <span class="hint">
                        Contoh: berhenti setelah batas rugi harian,
                        tidak mengejar harga, dan tidak memperbesar
                        risiko untuk membalas kerugian.
                    </span>
                </div>
            </div>
        `;
    }

    return `
        <div class="module-title">
            <div>
                <div class="mono">MODUL 01 / TRADING PLAN</div>
                <h3>Aturan sebelum peluang.</h3>
                <p>Rencana yang jelas membantu menjaga keputusan tetap konsisten.</p>
            </div>

            <span class="pill">Langkah ${planStep + 1} dari 4</span>
        </div>

        <div class="stepper">
            ${titles.map((title, index) => `
                <span
                    class="step-dot ${index <= planStep ? 'active' : ''}"
                    title="${title}"
                ></span>
            `).join('')}
        </div>

        <div class="two-col">
            <div>
                ${content}

                <div class="actions-row">
                    ${planStep
                        ? '<button class="btn" data-action="planBack">Kembali</button>'
                        : ''
                    }

                    <button class="btn primary" data-action="planNext">
                        ${planStep === 3 ? 'Simpan rencana' : 'Lanjut'}
                        <span>→</span>
                    </button>

                    <button class="btn" data-action="planReset">
                        Mulai ulang wizard
                    </button>
                </div>
            </div>

            <div class="plan-preview" id="planPreview">
                <div class="mono">PRATINJAU / PERSONAL PLAYBOOK</div>

                <h4>${esc(plan.name || 'Trading Plan')}</h4>

                <div class="result-grid">
                    ${result('Modal awal', fmt(plan.capital))}
                    ${result('Risiko per trade', `${plan.risk}%`)}
                    ${result('Batas rugi harian', `${plan.limit}%`)}
                    ${result('Pasar', esc(plan.market))}
                </div>

                <ul>
                    <li><b>Setup:</b> ${esc(plan.setup)}</li>
                    <li><b>Entry:</b> ${esc(plan.entry)}</li>
                    <li><b>Exit:</b> ${esc(plan.exit)}</li>
                    <li><b>Disiplin:</b> ${esc(plan.discipline)}</li>
                </ul>

                <div class="actions-row no-print">
                    <button class="btn small" data-action="planCopy">Salin teks</button>
                    <button class="btn small" data-action="planPrint">Cetak / Simpan PDF</button>
                    <button class="btn small" data-action="planSave">Simpan</button>
                </div>
            </div>
        </div>
    `;
}

function validatePlanStep() {
    if (planStep === 0 && num($('#pCapital')?.value) < 0) {
        toast('Modal tidak boleh negatif.');
        return false;
    }

    if (
        planStep === 1 &&
        (
            !(num($('#pRisk')?.value) > 0) ||
            !(num($('#pLimit')?.value) > 0)
        )
    ) {
        toast('Masukkan persentase risiko yang valid.');
        return false;
    }

    return true;
}

function savePlanFields() {
    const fields = [
        ['pName', 'name'],
        ['pMarket', 'market'],
        ['pCapital', 'capital'],
        ['pRisk', 'risk'],
        ['pLimit', 'limit'],
        ['pSetup', 'setup'],
        ['pEntry', 'entry'],
        ['pExit', 'exit'],
        ['pDiscipline', 'discipline']
    ];

    fields.forEach(([id, key]) => {
        const element = $('#' + id);

        if (!element) return;

        if (['capital', 'risk', 'limit'].includes(key)) {
            state.plan[key] = Math.max(0, num(element.value));
        } else {
            state.plan[key] = element.value.trim();
        }
    });

    saveState();
}

function planText() {
    const plan = state.plan;

    return `GROWMIND — TRADING PLAN
Profil: ${plan.name}
Pasar: ${plan.market}
Modal awal: ${fmt(plan.capital)}
Risiko per trade: ${plan.risk}%
Batas rugi harian: ${plan.limit}%

SETUP
${plan.setup}

ATURAN ENTRY
${plan.entry}

ATURAN EXIT
${plan.exit}

DISIPLIN
${plan.discipline}`;
}


/* 06 — COMPOUNDING CALCULATOR
   ========================================================= */

function renderCompound() {
    const compound = state.compound || defaults.compound;

    return `
        <div class="module-title">
            <div>
                <div class="mono">MODUL 02 / COMPOUNDING</div>
                <h3>Simulasikan pertumbuhan modal.</h3>
                <p>
                    Perhitungan matematis, bukan janji hasil
                    atau proyeksi keuntungan yang pasti.
                </p>
            </div>

            <span class="pill">Simulasi</span>
        </div>

        <div class="two-col">
            <div class="field-grid">
                ${field(
                    'Modal awal (Rp)',
                    'cCapital',
                    compound.capital,
                    'number',
                    'min="0" data-live'
                )}

                ${field(
                    'Return per periode (%)',
                    'cRate',
                    compound.rate,
                    'number',
                    'step=".1" data-live'
                )}

                ${field(
                    'Jumlah periode',
                    'cPeriods',
                    compound.periods,
                    'number',
                    'min="1" max="600" data-live'
                )}

                ${field(
                    'Setoran tiap periode (Rp)',
                    'cDeposit',
                    compound.deposit,
                    'number',
                    'min="0" data-live'
                )}

                <div class="field full">
                    <label for="cSlider">Periode simulasi</label>

                    <div class="range-row">
                        <input
                            id="cSlider"
                            type="range"
                            min="1"
                            max="120"
                            value="${Math.min(120, compound.periods)}"
                        >

                        <span class="range-value" id="cSliderValue">
                            ${Math.min(120, compound.periods)}
                        </span>
                    </div>
                </div>
            </div>

            <div>
                <div id="compoundResults" class="result-grid"></div>

                <div class="notice">
                    Hasil aktual dapat berbeda akibat kerugian,
                    biaya transaksi, pajak, slippage, dan perubahan
                    kondisi pasar.
                </div>
            </div>
        </div>

        <div class="chart-wrap" style="margin-top:18px">
            <div class="mono">PERTUMBUHAN SIMULASI</div>
            <div id="compoundChart"></div>
        </div>

        <div class="table-wrap">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Periode</th>
                        <th>Modal awal</th>
                        <th>Perubahan</th>
                        <th>Setoran</th>
                        <th>Saldo akhir</th>
                    </tr>
                </thead>

                <tbody id="compoundTable"></tbody>
            </table>
        </div>
    `;
}

function calcCompound() {
    const capital = Math.max(0, num($('#cCapital')?.value));
    const ratePercent = num($('#cRate')?.value, 2);
    const rate = ratePercent / 100;

    const periods = Math.max(
        1,
        Math.min(
            600,
            Math.floor(num($('#cPeriods')?.value, 12))
        )
    );

    const deposit = Math.max(0, num($('#cDeposit')?.value));

    /*
     * SIMPAN OTOMATIS
     * Nilai disimpan setiap kali kalkulator menghitung.
     */
    state.compound = {
        capital,
        rate: ratePercent,
        periods,
        deposit
    };

    saveState();

    const slider = $('#cSlider');

    if (slider) {
        slider.value = String(Math.min(120, periods));

        const label = $('#cSliderValue');

        if (label) {
            label.textContent = slider.value;
        }
    }

    let balance = capital;
    let totalDeposits = capital;

    compoundRows = [];

    for (let period = 1; period <= periods; period++) {
        const start = balance;
        const change = start * rate;

        balance = start + change + deposit;
        totalDeposits += deposit;

        compoundRows.push({
            period,
            start,
            change,
            deposit,
            balance
        });
    }

    const profit = balance - totalDeposits;

    const results = $('#compoundResults');

    if (results) {
        results.innerHTML = [
            result('Saldo akhir', fmt(balance)),
            result('Total setoran', fmt(totalDeposits)),
            result('Hasil simulasi', fmt(profit)),
            result('Periode', `${periods} periode`)
        ].join('');
    }

    const table = $('#compoundTable');

    if (table) {
        table.innerHTML = compoundRows.map(row => `
            <tr>
                <td>${row.period}</td>
                <td>${fmt(row.start)}</td>
                <td>${fmt(row.change)}</td>
                <td>${fmt(row.deposit)}</td>
                <td>${fmt(row.balance)}</td>
            </tr>
        `).join('');
    }

    drawCompoundChart(compoundRows);
}

function drawCompoundChart(rows) {
    const container = $('#compoundChart');

    if (!container) return;

    if (!rows.length) {
        container.innerHTML = '<p class="hint">Belum ada data.</p>';
        return;
    }

    const values = rows.map(row => row.balance);
    const width = 600;
    const height = 190;
    const padding = 24;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const points = values.map((value, index) => {
        const x = padding +
            index / Math.max(1, values.length - 1) *
            (width - padding * 2);

        const y = height - padding -
            (value - min) / range *
            (height - padding * 2);

        return `${x},${y}`;
    }).join(' ');

    container.innerHTML = `
        <svg
            viewBox="0 0 ${width} ${height}"
            role="img"
            aria-label="Grafik simulasi compounding"
        >
            <polyline
                points="${points}"
                fill="none"
                stroke="var(--accent)"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </svg>
    `;
}


/* 07 — POSITION SIZE
   ========================================================= */

function renderPosition() {
    return `
        <div class="module-title">
            <div>
                <div class="mono">MODUL 03 / POSITION SIZE</div>
                <h3>Hitung risiko sebelum entry.</h3>
                <p>Perkiraan ukuran posisi berdasarkan modal, risiko, dan jarak stop loss.</p>
            </div>

            <span class="pill">Risk calculator</span>
        </div>

        <div class="two-col">
            <div class="field-grid">
                ${field('Modal akun (Rp)', 'posCapital', state.plan.capital, 'number', 'min="0" data-live')}
                ${field('Risiko (%)', 'posRisk', state.plan.risk, 'number', 'min="0.01" max="100" step=".05" data-live')}
                ${field('Jarak stop loss (poin)', 'posStop', 100, 'number', 'min="0.000001" data-live')}
                ${field('Nilai per poin per unit (Rp)', 'posPoint', 1, 'number', 'min="0.000001" data-live')}
                ${field('Jarak target (poin)', 'posTarget', 200, 'number', 'min="0" data-live')}
            </div>

            <div>
                <div id="positionResults" class="result-grid"></div>

                <div class="notice">
                    Nilai poin berbeda untuk tiap instrumen, kontrak,
                    dan broker. Periksa spesifikasi instrumen.
                </div>
            </div>
        </div>
    `;
}

function calcPosition() {
    const capital = Math.max(0, num($('#posCapital')?.value));
    const risk = Math.max(0, num($('#posRisk')?.value));
    const stop = Math.max(0, num($('#posStop')?.value));
    const point = Math.max(0, num($('#posPoint')?.value));
    const target = Math.max(0, num($('#posTarget')?.value));

    const riskAmount = capital * risk / 100;
    const unitRisk = stop * point;

    const size = unitRisk > 0
        ? riskAmount / unitRisk
        : 0;

    const reward = target * point * size;

    const ratio = stop > 0
        ? target / stop
        : 0;

    const container = $('#positionResults');

    if (!container) return;

    container.innerHTML = [
        result('Batas risiko', fmt(riskAmount)),
        result(
            'Ukuran posisi indikatif',
            size.toLocaleString('id-ID', {
                maximumFractionDigits: 4
            })
        ),
        result('Potensi hasil kotor', fmt(reward)),
        result('Risk / reward', `1 : ${ratio.toFixed(2)}`)
    ].join('');
}


/* 08 — TRADING JOURNAL
   ========================================================= */

function renderJournal() {
    return `
        <div class="module-title">
            <div>
                <div class="mono">MODUL 04 / TRADING JOURNAL</div>
                <h3>Catat, evaluasi, perbaiki.</h3>
                <p>Catatan transaksi membantu meninjau proses, bukan sekadar hasil akhir.</p>
            </div>

            <span class="pill">${state.journal.length} entri</span>
        </div>

        <div class="two-col">
            <div class="result-card">
                <div class="mono" id="journalFormTitle">TAMBAH TRANSAKSI</div>

                <div class="field-grid" style="margin-top:15px">
                    ${field('Tanggal', 'jDate', today(), 'date')}
                    ${field('Instrumen', 'jInstrument', 'EURUSD')}

                    ${selectField('Arah', 'jSide', 'Long', ['Long', 'Short'])}

                    ${field('Harga entry', 'jEntry', '', 'number', 'step="any"')}
                    ${field('Harga exit', 'jExit', '', 'number', 'step="any"')}
                    ${field('Hasil bersih (Rp)', 'jResult', '', 'number', 'step="any"')}

                    ${selectField(
                        'Kondisi emosi',
                        'jEmotion',
                        'Tenang',
                        ['Tenang', 'Sabar', 'Ragu', 'Takut', 'Serakah', 'Marah']
                    )}

                    ${field('Tag evaluasi', 'jTag', 'A setup')}

                    <div class="field full">
                        <label for="jNotes">Catatan transaksi</label>
                        <textarea id="jNotes" placeholder="Alasan entry, kondisi pasar, dan evaluasi..."></textarea>
                    </div>
                </div>

                <div class="actions-row">
                    <button class="btn primary" data-action="journalAdd">Simpan transaksi</button>
                    <button class="btn" data-action="journalCancel">Batal edit</button>
                </div>
            </div>

            <div class="result-card">
                <div class="mono">FILTER JURNAL</div>

                <div class="field-grid" style="margin-top:15px">
                    ${field('Cari instrumen', 'jSearch', '')}

                    ${selectField(
                        'Filter hasil',
                        'jFilter',
                        'Semua',
                        ['Semua', 'Profit', 'Loss', 'Break even']
                    )}

                    ${selectField(
                        'Urutkan',
                        'jSort',
                        'Terbaru',
                        ['Terbaru', 'Terlama', 'Profit terbesar', 'Loss terbesar']
                    )}
                </div>

                <div class="actions-row">
                    <button class="btn small" data-action="journalSample">Isi contoh</button>
                    <button class="btn small" data-action="journalClear">Hapus seluruh jurnal</button>
                </div>

                <div id="journalSummary" class="result-grid" style="margin-top:15px"></div>
            </div>
        </div>

        <div id="journalList" class="trade-list"></div>
    `;
}

function saveJournal() {
    const instrument = $('#jInstrument')?.value.trim();

    if (!instrument) {
        toast('Nama instrumen wajib diisi.');
        return;
    }

    const trade = {
        id: editingId || uid(),
        date: $('#jDate')?.value || today(),
        instrument,
        side: $('#jSide')?.value || 'Long',
        entry: num($('#jEntry')?.value),
        exit: num($('#jExit')?.value),
        result: num($('#jResult')?.value),
        emotion: $('#jEmotion')?.value || 'Tenang',
        notes: $('#jNotes')?.value.trim() || '',
        tag: $('#jTag')?.value.trim() || ''
    };

    if (editingId) {
        state.journal = state.journal.map(item =>
            item.id === editingId ? trade : item
        );

        editingId = null;
    } else {
        state.journal.unshift(trade);
    }

    saveState();
    renderModule();

    toast('Transaksi berhasil disimpan.');
}

function editJournal(id) {
    const trade = state.journal.find(item => item.id === id);

    if (!trade) return;

    editingId = id;

    renderModule();

    const fields = {
        jDate: trade.date,
        jInstrument: trade.instrument,
        jSide: trade.side,
        jEntry: trade.entry,
        jExit: trade.exit,
        jResult: trade.result,
        jEmotion: trade.emotion,
        jNotes: trade.notes,
        jTag: trade.tag
    };

    Object.entries(fields).forEach(([id, value]) => {
        const element = $('#' + id);

        if (element) {
            element.value = value ?? '';
        }
    });

    $('#journalFormTitle').textContent = 'EDIT TRANSAKSI';

    $('#journalFormTitle')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
    });
}

function deleteJournal(id) {
    if (!confirm('Hapus transaksi ini?')) return;

    state.journal = state.journal.filter(item => item.id !== id);

    saveState();
    renderModule();

    toast('Transaksi dihapus.');
}

function refreshJournalList() {
    const container = $('#journalList');

    if (!container) return;

    const search = ($('#jSearch')?.value || '').toLowerCase();
    const filter = $('#jFilter')?.value || 'Semua';
    const sort = $('#jSort')?.value || 'Terbaru';

    let trades = state.journal.filter(trade => {
        const matchesSearch = String(trade.instrument || '')
            .toLowerCase()
            .includes(search);

        const value = num(trade.result);

        const matchesFilter =
            filter === 'Semua' ||
            (filter === 'Profit' && value > 0) ||
            (filter === 'Loss' && value < 0) ||
            (filter === 'Break even' && value === 0);

        return matchesSearch && matchesFilter;
    });

    if (sort === 'Terbaru') {
        trades.sort((a, b) => b.date.localeCompare(a.date));
    }

    if (sort === 'Terlama') {
        trades.sort((a, b) => a.date.localeCompare(b.date));
    }

    if (sort === 'Profit terbesar') {
        trades.sort((a, b) => num(b.result) - num(a.result));
    }

    if (sort === 'Loss terbesar') {
        trades.sort((a, b) => num(a.result) - num(b.result));
    }

    const total = trades.reduce(
        (sum, trade) => sum + num(trade.result),
        0
    );

    const wins = trades.filter(trade => num(trade.result) > 0).length;

    const summary = $('#journalSummary');

    if (summary) {
        summary.innerHTML = [
            result('Jumlah transaksi', trades.length),
            result('Total hasil', fmt(total)),
            result('Transaksi profit', wins)
        ].join('');
    }

    if (!trades.length) {
        container.innerHTML = `
            <div class="result-card">
                <p class="result-sub">Belum ada transaksi yang cocok dengan filter.</p>
            </div>
        `;

        return;
    }

    container.innerHTML = trades.map(trade => `
        <div class="trade-row">
            <div>
                <strong>${esc(trade.instrument)} · ${esc(trade.side)}</strong>
                <small>${esc(trade.date)} · ${esc(trade.emotion)}</small>
                <small>${esc(trade.tag || 'Tanpa tag')}</small>
            </div>

            <div>
                <strong style="color:${
                    trade.result > 0
                        ? 'var(--profit)'
                        : trade.result < 0
                            ? 'var(--loss)'
                            : 'var(--muted)'
                }">
                    ${fmt(trade.result)}
                </strong>

                <div class="trade-actions">
                    <button class="icon-btn" data-action="journalEdit" data-id="${esc(trade.id)}">Edit</button>
                    <button class="icon-btn" data-action="journalDelete" data-id="${esc(trade.id)}">Hapus</button>
                </div>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('[data-action]').forEach(button => {
        button.addEventListener('click', () => {
            const action = actions[button.dataset.action];

            if (action) {
                action(button);
            }
        });
    });
}


/* 09 — DASHBOARD
   ========================================================= */

function renderDashboard() {
    const trades = state.journal;

    const total = trades.reduce(
        (sum, trade) => sum + num(trade.result),
        0
    );

    const wins = trades.filter(trade => num(trade.result) > 0).length;
    const losses = trades.filter(trade => num(trade.result) < 0).length;

    const winRate = trades.length
        ? wins / trades.length * 100
        : 0;

    return `
        <div class="module-title">
            <div>
                <div class="mono">MODUL 05 / DASHBOARD</div>
                <h3>Ringkasan perjalanan trading.</h3>
                <p>Statistik berdasarkan transaksi yang kamu masukkan ke jurnal.</p>
            </div>

            <span class="pill">Data pribadi</span>
        </div>

        <div class="result-grid">
            ${result('Total hasil bersih', fmt(total))}
            ${result('Jumlah transaksi', trades.length)}
            ${result('Win rate', `${winRate.toFixed(1)}%`)}
            ${result('Profit / loss', `${wins} / ${losses}`)}
        </div>

        <div class="chart-wrap" style="margin-top:18px">
            <div class="mono">HASIL KUMULATIF JURNAL</div>
            <div id="dashboardChart"></div>
        </div>

        <div class="notice">
            Statistik dihitung dari jurnal pada browser ini.
            Data tidak tersinkron otomatis ke perangkat lain.
        </div>
    `;
}

function drawDashboard() {
    const container = $('#dashboardChart');

    if (!container) return;

    const trades = [...state.journal].sort(
        (a, b) => a.date.localeCompare(b.date)
    );

    if (!trades.length) {
        container.innerHTML = `
            <p class="hint">Tambahkan transaksi ke jurnal untuk melihat grafik.</p>
        `;

        return;
    }

    let cumulative = 0;

    const values = trades.map(trade => {
        cumulative += num(trade.result);
        return cumulative;
    });

    const width = 600;
    const height = 190;
    const padding = 24;

    const min = Math.min(0, ...values);
    const max = Math.max(0, ...values);
    const range = max - min || 1;

    const points = values.map((value, index) => {
        const x = padding +
            index / Math.max(1, values.length - 1) *
            (width - padding * 2);

        const y = height - padding -
            (value - min) / range *
            (height - padding * 2);

        return `${x},${y}`;
    }).join(' ');

    container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafik hasil kumulatif jurnal trading">
            <polyline
                points="${points}"
                fill="none"
                stroke="var(--accent)"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </svg>
    `;
}


/* 10 — TARGET PLANNER
   ========================================================= */

function renderTarget() {
    const target = state.target || {
        capital: state.plan.capital,
        goal: 15000000,
        monthly: 5
    };

    return `
        <div class="module-title">
            <div>
                <div class="mono">MODUL 06 / TARGET PLANNER</div>
                <h3>Tetapkan target yang terukur.</h3>
                <p>Buat simulasi berdasarkan modal dan target yang kamu tentukan sendiri.</p>
            </div>

            <span class="pill">Perencanaan</span>
        </div>

        <div class="two-col">
            <div class="field-grid">
                ${field('Modal awal (Rp)', 'tCapital', target.capital, 'number', 'min="0" data-live')}
                ${field('Target saldo (Rp)', 'tGoal', target.goal, 'number', 'min="0" data-live')}
                ${field('Asumsi perubahan per bulan (%)', 'tMonthly', target.monthly, 'number', 'step=".1" data-live')}
            </div>

            <div>
                <div id="targetResults" class="result-grid"></div>

                <button class="btn primary" style="margin-top:14px" data-action="targetSave">
                    Simpan target
                </button>

                <div class="notice">
                    Asumsi return bukan jaminan. Simulasi tidak
                    memperhitungkan semua biaya dan kemungkinan kerugian.
                </div>
            </div>
        </div>
    `;
}

function readTarget() {
    return {
        capital: Math.max(0, num($('#tCapital')?.value)),
        goal: Math.max(0, num($('#tGoal')?.value)),
        monthly: num($('#tMonthly')?.value)
    };
}

function calcTarget() {
    const container = $('#targetResults');

    if (!container) return;

    const target = readTarget();

    let balance = target.capital;
    let months = 0;

    if (balance >= target.goal && target.goal > 0) {
        months = 0;
    } else if (target.monthly > 0 && balance > 0) {
        while (balance < target.goal && months < 1200) {
            balance *= 1 + target.monthly / 100;
            months++;
        }
    }

    const reachable =
        target.goal <= target.capital ||
        (target.monthly > 0 && target.capital > 0);

    container.innerHTML = [
        result('Modal awal', fmt(target.capital)),
        result('Target saldo', fmt(target.goal)),
        result('Selisih target', fmt(Math.max(0, target.goal - target.capital))),
        result(
            'Perkiraan waktu',
            reachable && months < 1200
                ? `${months} bulan`
                : 'Tidak tersedia'
        )
    ].join('');
}


/* 11 — DISCIPLINE CHECKLIST
   ========================================================= */

function renderChecklist() {
    const total = state.checklist.length;

    const completed = state.checklist.filter(
        (_, index) => state.checkState[index]
    ).length;

    return `
        <div class="module-title">
            <div>
                <div class="mono">MODUL 07 / DISCIPLINE</div>
                <h3>Proses dulu, hasil kemudian.</h3>
                <p>Gunakan checklist sebelum mengambil keputusan trading.</p>
            </div>

            <span class="pill">${completed}/${total} selesai</span>
        </div>

        <div class="two-col">
            <div class="result-card">
                <div class="mono">CHECKLIST SEBELUM ENTRY</div>

                <div class="checklist" style="margin-top:15px">
                    ${state.checklist.map((item, index) => `
                        <label class="check-item">
                            <input
                                type="checkbox"
                                data-check="${index}"
                                ${state.checkState[index] ? 'checked' : ''}
                            >

                            <span>${esc(item)}</span>

                            <button
                                class="icon-btn"
                                type="button"
                                data-remove-check="${index}"
                                style="margin-left:auto"
                            >×</button>
                        </label>
                    `).join('')}
                </div>

                <div class="field" style="margin-top:15px">
                    <label for="newCheck">Tambah aturan checklist</label>
                    <input id="newCheck" placeholder="Contoh: tidak entry saat berita berdampak tinggi">
                </div>

                <div class="actions-row">
                    <button class="btn primary" data-action="checkAdd">Tambah aturan</button>
                    <button class="btn" data-action="checkReset">Reset centang</button>
                </div>
            </div>

            <div class="result-card">
                <div class="mono">STREAK DISIPLIN</div>

                <div class="result-value">
                    ${completed === total && total
                        ? 'Checklist lengkap'
                        : 'Satu langkah pada satu waktu'
                    }
                </div>

                <p class="result-sub">
                    Tandai hari ketika kamu benar-benar mengikuti
                    aturan trading pribadi.
                </p>

                <div class="streak">
                    ${Array.from({ length: 7 }, (_, index) => `
                        <span class="${
                            state.streak.includes(shiftDate(index - 6))
                                ? 'done'
                                : ''
                        }">
                            ${['S', 'S', 'R', 'K', 'J', 'S', 'M'][index]}
                        </span>
                    `).join('')}
                </div>

                <button class="btn small" data-action="markStreak">
                    Tandai disiplin hari ini
                </button>
            </div>
        </div>
    `;
}

function handleChecklistRemove(event) {
    const button = event.target.closest('[data-remove-check]');

    if (!button) return;

    const index = Number(button.dataset.removeCheck);

    if (!Number.isInteger(index) || index < 0) return;

    state.checklist.splice(index, 1);
    state.checkState = {};

    saveState();
    renderModule();

    toast('Aturan checklist dihapus.');
}


/* 12 — DATA MANAGEMENT
   ========================================================= */

function renderData() {
    return `
        <div class="module-title">
            <div>
                <div class="mono">MODUL 08 / KENDALI DATA</div>
                <h3>Data tetap di tanganmu.</h3>
                <p>Ekspor cadangan sebelum membersihkan data browser atau berpindah perangkat.</p>
            </div>

            <span class="pill">Penyimpanan lokal</span>
        </div>

        <div class="two-col">
            <div class="result-card">
                <div class="mono">CADANGKAN / PULIHKAN</div>

                <p class="result-sub">
                    Ekspor semua data GrowMind menjadi berkas JSON.
                    Impor akan mengganti data yang ada.
                </p>

                <div class="actions-row">
                    <button class="btn primary" data-action="exportData">Ekspor JSON</button>
                    <button class="btn" data-action="importData">Impor JSON</button>

                    <input type="file" id="importFile" accept="application/json,.json" hidden>
                </div>

                <div class="hint" style="margin-top:12px">
                    Simpan berkas cadangan di lokasi aman.
                </div>
            </div>

            <div class="result-card">
                <div class="mono">ZONA RESET</div>

                <p class="result-sub">
                    Tindakan ini menghapus rencana, jurnal, checklist,
                    compounding, dan target yang tersimpan pada browser ini.
                </p>

                <button
                    class="btn"
                    data-action="deleteData"
                    style="border-color:var(--loss);color:var(--loss)"
                >
                    Hapus semua data lokal
                </button>
            </div>
        </div>

        <div class="result-grid" style="margin-top:14px">
            ${result('Entri jurnal', state.journal.length, 'Data pada browser ini')}
            ${result('Aturan checklist', state.checklist.length, 'Dapat diedit kapan saja')}
        </div>
    `;
}


/* 13 — CHECKLIST & LIVE EVENTS
   ========================================================= */

$('#moduleContent')?.addEventListener('input', event => {
    const target = event.target;

    if (['jSearch', 'jFilter', 'jSort'].includes(target.id)) {
        refreshJournalList();
    }

    if (target.matches('[data-check]')) {
        const index = target.dataset.check;

        state.checkState[index] = target.checked;

        saveState();

        const label = $('#moduleContent .module-title .pill');

        if (label) {
            const completed = state.checklist.filter(
                (_, i) => state.checkState[i]
            ).length;

            label.textContent =
                `${completed}/${state.checklist.length} selesai`;
        }
    }

    if (target.id === 'cSlider') {
        const periods = $('#cPeriods');

        if (periods) {
            periods.value = target.value;
        }

        calcCompound();
    }
});

$('#moduleContent')?.addEventListener('change', event => {
    const target = event.target;

    if (target.matches('[data-check]')) {
        state.checkState[target.dataset.check] = target.checked;
        saveState();
    }

    if (target.id === 'cSlider') {
        const periods = $('#cPeriods');

        if (periods) {
            periods.value = target.value;
        }

        calcCompound();
    }
});

$('#moduleContent')?.addEventListener('click', event => {
    handleChecklistRemove(event);
});


/* 14 — NAVIGATION LISTENERS
   ========================================================= */

$$('[data-tab]').forEach(button => {
    button.addEventListener('click', () => {
        setTab(button.dataset.tab);
    });
});

$$('[data-tab-link]').forEach(link => {
    link.addEventListener('click', () => {
        const tab = link.dataset.tabLink;

        if (tab) {
            setTab(tab);
        }
    });
});

$$('[data-go]').forEach(card => {
    card.addEventListener('click', () => {
        setTab(card.dataset.go);

        $('#modules')?.scrollIntoView({
            behavior: 'smooth'
        });
    });
});


/* 15 — THEME TOGGLE
   ========================================================= */

$('#themeToggle')?.addEventListener('click', () => {
    const next =
        document.documentElement.dataset.theme === 'light'
            ? 'dark'
            : 'light';

    document.documentElement.dataset.theme = next;

    try {
        localStorage.setItem('growmind-theme', next);
    } catch (error) {
        console.warn('Tema tidak dapat disimpan.', error);
    }
});

try {
    const savedTheme = localStorage.getItem('growmind-theme');

    if (savedTheme === 'light' || savedTheme === 'dark') {
        document.documentElement.dataset.theme = savedTheme;
    } else if (
        window.matchMedia('(prefers-color-scheme: light)').matches
    ) {
        document.documentElement.dataset.theme = 'light';
    }
} catch (error) {
    console.warn('Preferensi tema tidak dapat dibaca.', error);
}


/* 16 — MOBILE MENU
   ========================================================= */

$('#menuToggle')?.addEventListener('click', () => {
    const menu = $('#navLinks');

    if (!menu) return;

    const open = menu.classList.toggle('open');

    $('#menuToggle').setAttribute(
        'aria-expanded',
        String(open)
    );
});


/* 17 — FAQ ACCORDION
   ========================================================= */

$$('.faq-q').forEach(button => {
    button.addEventListener('click', () => {
        const item = button.closest('.faq-item');

        if (!item) return;

        const open = item.classList.toggle('open');

        button.setAttribute(
            'aria-expanded',
            String(open)
        );
    });
});


/* 18 — SCROLL EFFECTS
   ========================================================= */

function scrollEffects() {
    const position = window.scrollY;

    const maxScroll =
        document.documentElement.scrollHeight -
        window.innerHeight;

    const progress = $('#scrollProgress');

    if (progress) {
        progress.style.width =
            (maxScroll ? position / maxScroll * 100 : 0) + '%';
    }

    $('#navbar')?.classList.toggle(
        'scrolled',
        position > 40
    );

    const stage = $('#visualStage');

    if (
        stage &&
        window.innerWidth > 760 &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
        const rect = stage.getBoundingClientRect();

        const centerX =
            (window.innerWidth / 2 - rect.left - rect.width / 2) /
            window.innerWidth;

        const centerY =
            (window.innerHeight / 2 - rect.top - rect.height / 2) /
            window.innerHeight;

        stage.style.transform =
            `translate3d(${centerX * 4}px, ${centerY * 3}px, 0)`;
    }
}

window.addEventListener('scroll', scrollEffects, {
    passive: true
});

window.addEventListener('resize', scrollEffects);


/* 19 — SCROLL REVEAL & COUNT-UP
   ========================================================= */

function countUp(element) {
    if (element.dataset.counted) return;

    element.dataset.counted = '1';

    const end = Number(element.dataset.count) || 0;
    const suffix = element.dataset.suffix || '';

    const start = performance.now();
    const duration = 1100;

    function tick(now) {
        const progress = Math.min(
            1,
            (now - start) / duration
        );

        const value = Math.round(
            end * (1 - Math.pow(1 - progress, 4))
        );

        element.textContent = value + suffix;

        if (progress < 1) {
            requestAnimationFrame(tick);
        }
    }

    requestAnimationFrame(tick);
}

if (
    'IntersectionObserver' in window &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
) {
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;

            entry.target.classList.add('visible');

            if (entry.target.matches('[data-count]')) {
                countUp(entry.target);
            }

            observer.unobserve(entry.target);
        });
    }, {
        threshold: 0.12
    });

    $$('.reveal, [data-count]').forEach(element => {
        observer.observe(element);
    });
} else {
    $$('.reveal').forEach(element => {
        element.classList.add('visible');
    });
}


/* 20 — GLASS POINTER HIGHLIGHT
   ========================================================= */

$$('.glass').forEach(card => {
    card.addEventListener('pointermove', event => {
        if (event.pointerType === 'touch') return;

        const rect = card.getBoundingClientRect();

        card.style.setProperty(
            '--mx',
            `${event.clientX - rect.left}px`
        );

        card.style.setProperty(
            '--my',
            `${event.clientY - rect.top}px`
        );
    });
});


/* 21 — HERO TILT EFFECT
   ========================================================= */

const stage = $('#visualStage');

if (stage) {
    stage.addEventListener('pointermove', event => {
        if (
            event.pointerType === 'touch' ||
            window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ) {
            return;
        }

        const rect = stage.getBoundingClientRect();

        const x =
            (event.clientX - rect.left) / rect.width - 0.5;

        const y =
            (event.clientY - rect.top) / rect.height - 0.5;

        const card = stage.querySelector('.equity-card');

        if (card) {
            card.style.transform =
                `rotateX(${-y * 4}deg) rotateY(${x * 5}deg) rotate(-1deg)`;
        }
    });

    stage.addEventListener('pointerleave', () => {
        const card = stage.querySelector('.equity-card');

        if (card) {
            card.style.transform = 'rotate(-1deg)';
        }
    });
}


/* 22 — IMPORT JSON
   ========================================================= */

$('#importFile')?.addEventListener('change', async event => {
    const file = event.target.files[0];

    if (!file) return;

    try {
        const imported = JSON.parse(await file.text());

        if (
            !imported ||
            typeof imported !== 'object' ||
            !Array.isArray(imported.journal) ||
            !imported.plan
        ) {
            throw new Error('Format tidak sesuai');
        }

        if (!confirm('Impor akan mengganti data GrowMind saat ini. Lanjutkan?')) {
            return;
        }

        state = {
            ...cloneDefaults(),
            ...imported,

            plan: {
                ...defaults.plan,
                ...imported.plan
            },

            compound: {
                ...defaults.compound,
                ...(imported.compound || {})
            },

            journal: Array.isArray(imported.journal)
                ? imported.journal
                : [],

            checklist: Array.isArray(imported.checklist)
                ? imported.checklist
                : [...defaults.checklist],

            checkState: imported.checkState || {},

            streak: Array.isArray(imported.streak)
                ? imported.streak
                : []
        };

        saveState();

        editingId = null;
        planStep = 0;

        renderModule();

        toast('Data berhasil diimpor.');
    } catch (error) {
        console.error(error);
        toast('Berkas tidak valid atau tidak dapat dibaca.');
    } finally {
        event.target.value = '';
    }
});


/* 23 — FOOTER YEAR
   ========================================================= */

const yearElement = $('#year');

if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
}


/* 24 — EXTRA MOTION
   ========================================================= */

(function addMotionLayer() {
    const reduceMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
    ).matches;

    if (!reduceMotion) {
        let frame = 0;
        let pointerX = 0;
        let pointerY = 0;

        window.addEventListener('pointermove', event => {
            if (event.pointerType === 'touch') return;

            pointerX =
                (event.clientX / window.innerWidth - 0.5) * 18;

            pointerY =
                (event.clientY / window.innerHeight - 0.5) * 14;

            if (frame) return;

            frame = requestAnimationFrame(() => {
                document.documentElement.style.setProperty(
                    '--orb-x',
                    `${pointerX}px`
                );

                document.documentElement.style.setProperty(
                    '--orb-y',
                    `${pointerY}px`
                );

                frame = 0;
            });
        }, {
            passive: true
        });

        if ('IntersectionObserver' in window) {
            const staggerObserver = new IntersectionObserver(
                entries => {
                    entries.forEach(entry => {
                        if (!entry.isIntersecting) return;

                        const children = [
                            ...entry.target.querySelectorAll(
                                '.feature-card, .step-card, .trust-item'
                            )
                        ];

                        children.forEach((child, index) => {
                            child.style.transitionDelay =
                                `${Math.min(index, 7) * 65}ms`;
                        });

                        staggerObserver.unobserve(entry.target);
                    });
                },
                {
                    threshold: 0.12
                }
            );

            document.querySelectorAll(
                '.feature-grid, .steps-grid, .trust-strip'
            ).forEach(element => {
                staggerObserver.observe(element);
            });
        }

        document.querySelectorAll('.btn.primary').forEach(button => {
            button.addEventListener('pointermove', event => {
                if (event.pointerType === 'touch') return;

                const rect = button.getBoundingClientRect();

                const dx =
                    (event.clientX - rect.left - rect.width / 2) /
                    rect.width;

                const dy =
                    (event.clientY - rect.top - rect.height / 2) /
                    rect.height;

                button.style.transform =
                    `translate(${dx * 5}px, ${dy * 4}px)`;
            });

            button.addEventListener('pointerleave', () => {
                button.style.transform = '';
            });
        });
    }

    document.querySelectorAll(
        '.feature-card, .step-card, .trust-item'
    ).forEach(element => {
        element.addEventListener('pointerleave', () => {
            element.style.transitionDelay = '0ms';
        });
    });
})();


/* 25 — START APPLICATION
   ========================================================= */

setTab('plan');

scrollEffects();
