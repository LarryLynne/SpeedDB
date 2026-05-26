const BASE_API_URL = 'https://script.google.com/macros/s/AKfycbzrcilOHN938Q9stHXlWQFGT8zrDRSpsBtJB3PkvXQI2IGHg6WxkID5gENfDdEk2eok/exec';

let globalSpeedData = []; 
let globalTimelineData = []; 
let currentView = 'speed'; 
let currentNets = ['Нац-Нац']; 

let currentSpeedDates = []; 
let currentTimelineDates = []; 

// Стан фільтрів таймлайну
let timelineFilters = { netA: 'all', netB: 'all', catA: 'all', catB: 'all' };

let speedChartInstance = null;
let timelineChartInstance = null;

const netPalette = {
    'Нац-Нац': { bg: 'rgba(56, 189, 248, 0.5)', border: '#38bdf8' },
    'Нац-Парт': { bg: 'rgba(52, 211, 153, 0.5)', border: '#34d399' },
    'Парт-Нац': { bg: 'rgba(192, 132, 252, 0.5)', border: '#c084fc' },
    'Парт-Парт': { bg: 'rgba(251, 191, 36, 0.5)', border: '#fbbf24' }
};

const timelinePalette = {
    'firstMile': { bg: 'rgba(56, 189, 248, 0.65)', border: '#38bdf8', label: 'Перша миля' },
    'middleMileRun': { bg: 'rgba(168, 85, 247, 0.65)', border: '#a855f7', label: 'Середня миля (Рух)' },
    'middleMileIdle': { bg: 'rgba(244, 63, 94, 0.65)', border: '#f43f5e', label: 'Середня миля (Простій)' },
    'lastMile': { bg: 'rgba(52, 211, 153, 0.65)', border: '#34d399', label: 'Остання миля' }
};

function formatDisplayDate(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr; 
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function formatHoursToHMM(decimalHours) {
    if (!decimalHours || isNaN(decimalHours) || decimalHours === 0) return "0:00";
    const totalMinutes = Math.round(decimalHours * 60);
    return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

const customDatalabels = {
    id: 'customDatalabels',
    afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        chart.data.datasets.forEach((dataset, datasetIndex) => {
            if (dataset.type === 'line') return; 
            const meta = chart.getDatasetMeta(datasetIndex);
            if (meta.hidden) return; 
            
            meta.data.forEach((bar, index) => {
                const val = dataset.data[index];
                if (!val) return;
                let text = formatHoursToHMM(val);
                ctx.save();
                
                if (chart.options.indexAxis === 'y') {
                    ctx.fillStyle = '#ffffff'; 
                    ctx.font = 'bold 11px Segoe UI';
                    ctx.textAlign = 'center'; 
                    ctx.textBaseline = 'middle';
                    if (Math.abs(bar.x - bar.base) > 35) {
                        ctx.fillText(text, (bar.x + bar.base) / 2, bar.y);
                    }
                } else {
                    ctx.fillStyle = '#ffffff'; 
                    ctx.font = 'bold 13px Segoe UI'; 
                    ctx.translate(bar.x, bar.base - 12);
                    ctx.rotate(-Math.PI / 2);
                    ctx.textAlign = 'left'; 
                    ctx.textBaseline = 'middle';
                    ctx.fillText(text, 0, 0);
                }
                ctx.restore();
            });
        });
        ctx.restore();
    }
};

const averageLinesPlugin = {
    id: 'averageLinesPlugin',
    afterDatasetsDraw(chart) {
        if (chart.options.indexAxis === 'y') return;
        const { ctx, scales: { y } } = chart;
        const avgDatasetIdx = chart.data.datasets.findIndex(d => d.label === 'Загальна середня');
        if (avgDatasetIdx === -1) return;
        
        const avgDataset = chart.data.datasets[avgDatasetIdx];
        const barMetas = chart.data.datasets
            .map((d, i) => ({ type: d.type, meta: chart.getDatasetMeta(i) }))
            .filter(d => d.type === 'bar' && !d.meta.hidden);
            
        if (barMetas.length === 0) return;
        ctx.save();
        
        avgDataset.data.forEach((val, index) => {
            if (!val) return;
            let minX = Infinity, maxX = -Infinity;
            barMetas.forEach(bm => {
                const barElement = bm.meta.data[index];
                if (barElement) {
                    const w = barElement.width || 0;
                    minX = Math.min(minX, barElement.x - w / 2);
                    maxX = Math.max(maxX, barElement.x + w / 2);
                }
            });
            
            if (minX === Infinity || maxX === -Infinity) return;
            const yPixel = y.getPixelForValue(val);
            ctx.strokeStyle = '#db4455';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(minX, yPixel); ctx.lineTo(maxX, yPixel); ctx.stroke();

            ctx.fillStyle = '#db4455';
            ctx.font = 'bold 13px Segoe UI';
            ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            ctx.fillText(formatHoursToHMM(val), (minX + maxX) / 2, yPixel - 5);
        });
        ctx.restore();
    }
};

Chart.register(customDatalabels, averageLinesPlugin);

const darkChartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
        legend: { display: true, position: 'top', labels: { color: '#94a3b8', font: { family: 'Segoe UI', size: 12, weight: 'bold' } } },
        tooltip: { callbacks: { label: (c) => (c.dataset.label || '') + ': ' + formatHoursToHMM(c.parsed.y) } }
    },
    scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } },
        y: { beginAtZero: true, ticks: { color: '#94a3b8', callback: (v) => formatHoursToHMM(v) }, grid: { color: '#1e293b' }, grace: '25%' }
    }
};

const timelineChartOptions = {
    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
    plugins: {
        legend: { display: true, position: 'top', labels: { color: '#94a3b8', font: { family: 'Segoe UI', size: 12, weight: 'bold' } } },
        tooltip: { callbacks: { label: (c) => (c.dataset.label || '') + ': ' + formatHoursToHMM(c.parsed.x) } }
    },
    scales: {
        x: { stacked: true, ticks: { color: '#94a3b8', callback: (v) => formatHoursToHMM(v) }, grid: { color: '#1e293b' } },
        y: { stacked: true, ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } }
    }
};

window.onload = function() {
    loadAllDashboardData();
    setupNavigation();
    setupFilters();
};

function setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            currentView = e.target.dataset.view;
            
            if (currentView === 'speed') {
                document.getElementById('speedFilters').classList.remove('hidden');
                document.getElementById('speedWrapper').classList.remove('hidden');
                document.getElementById('timelineFilters').classList.add('hidden');
                document.getElementById('timelineWrapper').classList.add('hidden');
            } else {
                document.getElementById('speedFilters').classList.add('hidden');
                document.getElementById('speedWrapper').classList.add('hidden');
                document.getElementById('timelineFilters').classList.remove('hidden');
                document.getElementById('timelineWrapper').classList.remove('hidden');
            }
            renderAllCharts();
        });
    });
}

function setupFilters() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const target = e.target.dataset.target;
            if (currentNets.includes(target)) {
                if (currentNets.length > 1) {
                    currentNets = currentNets.filter(n => n !== target);
                    e.target.classList.remove('active');
                }
            } else {
                currentNets.push(target);
                e.target.classList.add('active');
            }
            renderAllCharts();
        });
    });

    const speedBtn = document.getElementById('speedDateDropdownBtn');
    const speedContent = document.getElementById('speedDateFilterContainer');
    speedBtn.addEventListener('click', (e) => { 
        e.stopPropagation(); 
        speedContent.classList.toggle('show'); 
        document.getElementById('timelineDateFilterContainer').classList.remove('show');
    });

    const timelineBtn = document.getElementById('timelineDateDropdownBtn');
    const timelineContent = document.getElementById('timelineDateFilterContainer');
    timelineBtn.addEventListener('click', (e) => { 
        e.stopPropagation(); 
        timelineContent.classList.toggle('show'); 
        speedContent.classList.remove('show');
    });

    document.addEventListener('click', (e) => { 
        if (!e.target.closest('.date-dropdown')) {
            speedContent.classList.remove('show'); 
            timelineContent.classList.remove('show'); 
        }
    });
}

async function loadAllDashboardData() {
    document.getElementById('status').innerText = 'Завантаження даних...';
    try {
        const [speedRes, timelineRes] = await Promise.all([
            fetch(`${BASE_API_URL}?dashboard=speed`).then(r => r.json()),
            fetch(`${BASE_API_URL}?dashboard=timeline`).then(r => r.json())
        ]);
        
        if (!speedRes.success || !timelineRes.success) throw new Error(speedRes.error || timelineRes.error);
        
        globalSpeedData = speedRes.data;
        globalTimelineData = timelineRes.data;
        
        console.log("Структура першого об'єкта в масиві:", globalTimelineData[0]);
        
        document.getElementById('status').innerText = 'Дані успішно завантажені!';
        setTimeout(() => document.getElementById('status').innerText = '', 2000); 
        
        const speedDates = [...new Set(globalSpeedData.map(i => i.date))];
        const timelineDates = [...new Set(globalTimelineData.map(i => i.date))];
        
        currentSpeedDates = [...speedDates]; 
        currentTimelineDates = [...timelineDates]; 
        
        populateTimelineButtons();
        
        renderDateFilter('speed', speedDates);
        renderDateFilter('timeline', timelineDates);
        
        renderAllCharts();
    } catch (error) {
        document.getElementById('status').innerText = `Помилка: ${error.message}`;
        console.error(error);
    }
}

// --- ДИНАМІЧНА ГЕНЕРАЦІЯ НАБОРІВ КНОПОК ЗАМІСТЬ СЕЛЕКТОРІВ ---
function populateTimelineButtons() {
    const netAOptions = [...new Set(globalTimelineData.map(item => item.netA).filter(Boolean))];
    const netBOptions = [...new Set(globalTimelineData.map(item => item.netB).filter(Boolean))];
    const catAOptions = [...new Set(globalTimelineData.map(item => item.catA).filter(Boolean))];
    const catBOptions = [...new Set(globalTimelineData.map(item => item.catB).filter(Boolean))];

    const fillBtnGroup = (id, options, filterKey) => {
        const container = document.getElementById(id);
        if (!container) return;
        container.innerHTML = '';

        // Головна кнопка "Всі"
        const allBtn = document.createElement('button');
        allBtn.className = 'filter-btn';
        allBtn.innerText = 'Всі';
        if (timelineFilters[filterKey] === 'all') allBtn.classList.add('active');
        allBtn.onclick = () => {
            container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            allBtn.classList.add('active');
            timelineFilters[filterKey] = 'all';
            renderAllCharts();
        };
        container.appendChild(allBtn);

        // Кнопки унікальних значень
        options.sort().forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'filter-btn';
            btn.innerText = opt;
            btn.title = opt; 
            if (timelineFilters[filterKey] === opt) btn.classList.add('active');
            btn.onclick = () => {
                container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                timelineFilters[filterKey] = opt;
                renderAllCharts();
            };
            container.appendChild(btn);
        });
    };

    fillBtnGroup('btnGroupNetA', netAOptions, 'netA');
    fillBtnGroup('btnGroupCatA', catAOptions, 'catA');
    fillBtnGroup('btnGroupNetB', netBOptions, 'netB');
    fillBtnGroup('btnGroupCatB', catBOptions, 'catB');
}

function renderDateFilter(view, dates) {
    const containerId = view === 'speed' ? 'speedDateFilterContainer' : 'timelineDateFilterContainer';
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    
    dates.forEach((date) => {
        const label = document.createElement('label');
        label.className = 'date-checkbox-label';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox'; checkbox.value = date; 
        
        if (view === 'speed') {
            checkbox.checked = currentSpeedDates.includes(date);
            checkbox.onchange = function() {
                let checkedBoxes = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'));
                if (checkedBoxes.length === 0) { checkbox.checked = true; return; }
                currentSpeedDates = checkedBoxes.map(cb => cb.value);
                renderAllCharts();
            };
        } else {
            checkbox.checked = currentTimelineDates.includes(date);
            checkbox.onchange = function() {
                let checkedBoxes = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'));
                if (checkedBoxes.length === 0) { checkbox.checked = true; return; }
                currentTimelineDates = checkedBoxes.map(cb => cb.value);
                renderAllCharts();
            };
        }
        
        label.appendChild(checkbox); label.appendChild(document.createTextNode(formatDisplayDate(date)));
        container.appendChild(label);
    });
    updateDropdownButtonText(view);
}

function updateDropdownButtonText(view) {
    if (view === 'speed' || view === 'all') {
        const speedBtn = document.getElementById('speedDateDropdownBtn');
        if (speedBtn) speedBtn.innerText = currentSpeedDates.length === 1 ? formatDisplayDate(currentSpeedDates[0]) : `Обрано дат: ${currentSpeedDates.length}`;
    }
    if (view === 'timeline' || view === 'all') {
        const timelineBtn = document.getElementById('timelineDateDropdownBtn');
        if (timelineBtn) timelineBtn.innerText = currentTimelineDates.length === 1 ? formatDisplayDate(currentTimelineDates[0]) : `Обрано дат: ${currentTimelineDates.length}`;
    }
}

function renderAllCharts() {
    updateDropdownButtonText('all');

    if (currentView === 'speed') {
        const sortedSpeedDates = [...currentSpeedDates].sort((a, b) => {
            const pA = a.split('.'), pB = b.split('.');
            return new Date(pA[2], pA[1]-1, pA[0]) - new Date(pB[2], pB[1]-1, pB[0]);
        });
        const speedLabels = sortedSpeedDates.map(formatDisplayDate);

        const speedDatasets = [];
        currentNets.forEach(netKey => {
            const [targetNetA, targetNetB] = netKey.split('-');
            const colors = netPalette[netKey];
            const dataForNet = sortedSpeedDates.map(date => {
                const row = globalSpeedData.find(i => i.netA === targetNetA && i.netB === targetNetB && i.date === date);
                return row && row.eh > 0 ? (row.fondHours / row.eh) : 0;
            });
            speedDatasets.push({ type: 'bar', label: netKey, data: dataForNet, backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1 });
        });

        if (currentNets.length > 1) {
            const globalAverageData = sortedSpeedDates.map(date => {
                const items = globalSpeedData.filter(i => currentNets.includes(`${i.netA}-${i.netB}`) && i.date === date);
                let tEh = 0, tFond = 0;
                items.forEach(i => { tEh += i.eh; tFond += i.fondHours; });
                return tEh > 0 ? (tFond / tEh) : 0;
            });
            speedDatasets.push({ type: 'line', label: 'Загальна середня', data: globalAverageData, showLine: false, pointRadius: 0, pointHoverRadius: 6, borderColor: '#db4455', backgroundColor: '#db4455' });
        }

        const ctxSpeed = document.getElementById('speedChart').getContext('2d');
        if (speedChartInstance) speedChartInstance.destroy();
        speedChartInstance = new Chart(ctxSpeed, { type: 'bar', data: { labels: speedLabels, datasets: speedDatasets }, options: darkChartOptions });

    } else if (currentView === 'timeline') {
        const sortedTimelineDates = [...currentTimelineDates].sort((a, b) => {
            const pA = a.split('.'), pB = b.split('.');
            return new Date(pA[2], pA[1]-1, pA[0]) - new Date(pB[2], pB[1]-1, pB[0]);
        });
        const timelineLabels = sortedTimelineDates.map(formatDisplayDate);

        const timelineDatasets = [];
        const milesKeys = [
            { key: 'fondFirst', label: 'firstMile' },
            { key: 'fondMiddleRun', label: 'middleMileRun' },
            { key: 'fondMiddleIdle', label: 'middleMileIdle' },
            { key: 'fondLast', label: 'lastMile' }
        ];

        const chartDataMap = { firstMile: [], middleMileRun: [], middleMileIdle: [], lastMile: [] };

        sortedTimelineDates.forEach(date => {
            const matchedRows = globalTimelineData.filter(row => {
                if (row.date !== date) return false;
                if (timelineFilters.netA !== 'all' && row.netA !== timelineFilters.netA) return false;
                if (timelineFilters.netB !== 'all' && row.netB !== timelineFilters.netB) return false;
                if (timelineFilters.catA !== 'all' && row.catA !== timelineFilters.catA) return false;
                if (timelineFilters.catB !== 'all' && row.catB !== timelineFilters.catB) return false;
                return true;
            });

            let totalQty = 0;
            let sumFirst = 0, sumMiddleRun = 0, sumMiddleIdle = 0, sumLast = 0;

            matchedRows.forEach(row => {
                totalQty += (row.qty !== undefined ? row.qty : 1);
                sumFirst += (row.fondFirst || row.firstMile || 0);
                sumMiddleRun += (row.fondMiddleRun || row.middleMileRun || 0);
                sumMiddleIdle += (row.fondMiddleIdle || row.middleMileIdle || 0);
                sumLast += (row.fondLast || row.lastMile || 0);
            });

            chartDataMap.firstMile.push(totalQty > 0 ? (sumFirst / totalQty) : 0);
            chartDataMap.middleMileRun.push(totalQty > 0 ? (sumMiddleRun / totalQty) : 0);
            chartDataMap.middleMileIdle.push(totalQty > 0 ? (sumMiddleIdle / totalQty) : 0);
            chartDataMap.lastMile.push(totalQty > 0 ? (sumLast / totalQty) : 0);
        });

        milesKeys.forEach(m => {
            const config = timelinePalette[m.label];
            timelineDatasets.push({ type: 'bar', label: config.label, data: chartDataMap[m.label], backgroundColor: config.bg, borderColor: config.border, borderWidth: 1 });
        });

        const ctxTimeline = document.getElementById('timelineChart').getContext('2d');
        if (timelineChartInstance) timelineChartInstance.destroy();
        timelineChartInstance = new Chart(ctxTimeline, { type: 'bar', data: { labels: timelineLabels, datasets: timelineDatasets }, options: timelineChartOptions });
    }
}