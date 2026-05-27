const BASE_API_URL = 'https://script.google.com/macros/s/AKfycbzrcilOHN938Q9stHXlWQFGT8zrDRSpsBtJB3PkvXQI2IGHg6WxkID5gENfDdEk2eok/exec';

let globalSpeedData = []; 
let globalTimelineData = []; 
let globalTransportData = {}; // Изолированное хранилище для транспорта
let currentView = 'speed'; 
let currentNets = ['Нац-Нац']; 

let currentSpeedDates = []; 
let currentTimelineDates = []; 
let currentTransportDates = []; // Изолированные даты для транспорта
let currentTransportTab = 'Регіональна'; // Активный под-таб транспорта

// Стан фільтрів таймлайну
let timelineFilters = { netA: 'all', netB: 'all', catA: 'all', catB: 'all' };

let speedChartInstance = null;
let timelineChartInstance = null;
let chartCost = null;
let chartUtil = null;
let chartLoad = null;

let transportFilters = { frdA: 'all', frdB: 'all' };

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

function getTransportChartColors(metric, idx) {
    const palettes = {
        cost: {
            bg: ['rgba(0, 188, 255, 0.6)', 'rgba(0, 102, 204, 0.6)', 'rgba(140, 0, 255, 0.6)', 'rgba(0, 255, 204, 0.6)'],
            border: ['#00bcff', '#0066cc', '#8c00ff', '#00ffcc']
        },
        util: {
            bg: ['rgba(242, 100, 25, 0.6)', 'rgba(219, 68, 85, 0.6)', 'rgba(242, 175, 25, 0.6)', 'rgba(200, 50, 0, 0.6)'],
            border: ['#f26419', '#db4455', '#f2af19', '#c83200']
        },
        load: {
            bg: ['rgba(0, 204, 153, 0.6)', 'rgba(0, 153, 204, 0.6)', 'rgba(102, 204, 0, 0.6)', 'rgba(0, 204, 102, 0.6)'],
            border: ['#00cc99', '#0099cc', '#66cc00', '#00cc66']
        }
    };
    const p = palettes[metric];
    const i = idx % p.bg.length;
    return { bg: p.bg[i], border: p.border[i] };
}

const customDatalabels = {
    id: 'customDatalabels',
    afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();

        // Проверка: если это транспортный график, применяем старый компактный стиль подписей
        if (['costChart', 'utilizationChart', 'loadChart'].includes(chart.canvas.id)) {
            chart.data.datasets.forEach((dataset, datasetIndex) => {
                const meta = chart.getDatasetMeta(datasetIndex);
                if (meta.hidden) return; 
                
                meta.data.forEach((bar, index) => {
                    const val = dataset.data[index];
                    if (val === null || val === undefined) return;
                    
                    let text = val % 1 === 0 ? val : Number(val).toFixed(2);
                    if (chart.canvas.id === 'utilizationChart' || chart.canvas.id === 'loadChart') {
                        text += '%';
                    }
                    
                    ctx.fillStyle = '#94a3b8'; 
                    ctx.font = 'bold 10px Segoe UI'; 
                    ctx.textAlign = 'center';        
                    ctx.textBaseline = 'bottom';     
                    ctx.fillText(text, bar.x, bar.y - 4);
                });
            });
            ctx.restore();
            return;
        }

        // Базовая логика для вкладок Скорости и Таймлайна
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
        tooltip: { callbacks: { label: (c) => (c.dataset.label || '') + ': ' + (['costChart', 'utilizationChart', 'loadChart'].includes(c.chart.canvas.id) ? c.parsed.y : formatHoursToHMM(c.parsed.y)) } }
    },
    scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } },
        y: { beginAtZero: true, ticks: { color: '#94a3b8', callback: function(v) { return ['costChart', 'utilizationChart', 'loadChart'].includes(this.chart.canvas.id) ? v : formatHoursToHMM(v); } }, grid: { color: '#1e293b' }, grace: '25%' }
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
            
            // Скрытие/отображение фильтров и контейнеров
            document.getElementById('speedFilters').classList.toggle('hidden', currentView !== 'speed');
            document.getElementById('speedWrapper').classList.toggle('hidden', currentView !== 'speed');
            
            document.getElementById('timelineFilters').classList.toggle('hidden', currentView !== 'timeline');
            document.getElementById('timelineWrapper').classList.toggle('hidden', currentView !== 'timeline');
            
            document.getElementById('transportFilters').classList.toggle('hidden', currentView !== 'transport');
            document.getElementById('transportWrapper').classList.toggle('hidden', currentView !== 'transport');
            
            if (currentView === 'transport') {
                const tabData = globalTransportData[currentTransportTab] || [];
                const uniqueDates = [...new Set(tabData.map(item => item.date))];
                renderDateFilter('transport', uniqueDates);
                populateTransportFrdFilters(); // Перестраиваем списки ФРД при переходе на вкладку
            }

            renderAllCharts();
        });
    });
}

function setupFilters() {
    // Фильтры вкладки Скорость
    document.querySelectorAll('.tab:not(.transport-tab)').forEach(tab => {
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

    // Фильтры вкладки Транспорт (под-табы)
    document.querySelectorAll('.transport-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.transport-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            currentTransportTab = e.target.dataset.target;

            // Сброс фильтров ФРД при переключении направлений
            transportFilters.frdA = 'all';
            transportFilters.frdB = 'all';

            const tabData = globalTransportData[currentTransportTab] || [];
            const uniqueDates = [...new Set(tabData.map(item => item.date))];
            currentTransportDates = currentTransportDates.filter(d => uniqueDates.includes(d));
            
            if (currentTransportDates.length === 0 && uniqueDates.length > 0) {
                currentTransportDates = [uniqueDates[0]];
            }

            renderDateFilter('transport', uniqueDates);
            populateTransportFrdFilters(); // Динамическое заполнение селекторов ФРД
            renderAllCharts();
        });
    });

    // Обработчики выпадающих списков дат
    const speedBtn = document.getElementById('speedDateDropdownBtn');
    const speedContent = document.getElementById('speedDateFilterContainer');
    speedBtn.addEventListener('click', (e) => { 
        e.stopPropagation(); 
        speedContent.classList.toggle('show'); 
        document.getElementById('timelineDateFilterContainer').classList.remove('show');
        document.getElementById('transportDateFilterContainer').classList.remove('show');
    });

    const timelineBtn = document.getElementById('timelineDateDropdownBtn');
    const timelineContent = document.getElementById('timelineDateFilterContainer');
    timelineBtn.addEventListener('click', (e) => { 
        e.stopPropagation(); 
        timelineContent.classList.toggle('show'); 
        speedContent.classList.remove('show');
        document.getElementById('transportDateFilterContainer').classList.remove('show');
    });

    const transportBtn = document.getElementById('transportDateDropdownBtn');
    const transportContent = document.getElementById('transportDateFilterContainer');
    transportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        transportContent.classList.toggle('show');
        document.getElementById('speedDateFilterContainer').classList.remove('show');
        document.getElementById('timelineDateFilterContainer').classList.remove('show');
    });

    document.addEventListener('click', (e) => { 
        if (!e.target.closest('.date-dropdown')) {
            speedContent.classList.remove('show'); 
            timelineContent.classList.remove('show'); 
            transportContent.classList.remove('show'); 
        }
    });

    // Слушатели изменения выпадающих списков ФРД
    const selectFrdA = document.getElementById('transportSelectFrdA');
    selectFrdA.addEventListener('change', (e) => {
        transportFilters.frdA = e.target.value;
        renderAllCharts();
    });

    const selectFrdB = document.getElementById('transportSelectFrdB');
    selectFrdB.addEventListener('change', (e) => {
        transportFilters.frdB = e.target.value;
        renderAllCharts();
    });
}

async function loadAllDashboardData() {
    document.getElementById('status').innerText = 'Завантаження даних...';
    try {
        const [speedRes, timelineRes, transportRes] = await Promise.all([
            fetch(`${BASE_API_URL}?dashboard=speed`).then(r => r.json()),
            fetch(`${BASE_API_URL}?dashboard=timeline`).then(r => r.json()),
            fetch(`${BASE_API_URL}`).then(r => r.json()) // Запрос транспорта (ветка else на бэке)
        ]);
        
        if (!speedRes.success || !timelineRes.success || !transportRes.success) {
            throw new Error(speedRes.error || timelineRes.error || transportRes.error);
        }
        
        globalSpeedData = speedRes.data;
        globalTimelineData = timelineRes.data;
        globalTransportData = transportRes.data;
        
        document.getElementById('status').innerText = 'Дані успішно завантажені!';
        setTimeout(() => document.getElementById('status').innerText = '', 2000); 
        
        const speedDates = [...new Set(globalSpeedData.map(i => i.date))];
        const timelineDates = [...new Set(globalTimelineData.map(i => i.date))];
        
        const transportDataForTab = globalTransportData[currentTransportTab] || [];
        const transportDates = [...new Set(transportDataForTab.map(i => i.date))];
        
        currentSpeedDates = [...speedDates]; 
        currentTimelineDates = [...timelineDates]; 
        currentTransportDates = transportDates.length > 0 ? [transportDates[0]] : [];
        
        populateTimelineButtons();

        populateTransportFrdFilters(); // Построить фильтры ФРД при первой загрузке
        
        renderDateFilter('speed', speedDates);
        renderDateFilter('timeline', timelineDates);
        renderDateFilter('transport', transportDates);
        
        renderAllCharts();
    } catch (error) {
        document.getElementById('status').innerText = `Помилка: ${error.message}`;
        console.error(error);
    }
}

function populateTimelineButtons() {
    const netAOptions = [...new Set(globalTimelineData.map(item => item.netA).filter(Boolean))];
    const netBOptions = [...new Set(globalTimelineData.map(item => item.netB).filter(Boolean))];
    const catAOptions = [...new Set(globalTimelineData.map(item => item.catA).filter(Boolean))];
    const catBOptions = [...new Set(globalTimelineData.map(item => item.catB).filter(Boolean))];

    const fillBtnGroup = (id, options, filterKey) => {
        const container = document.getElementById(id);
        if (!container) return;
        container.innerHTML = '';

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
    let containerId = 'speedDateFilterContainer';
    if (view === 'timeline') containerId = 'timelineDateFilterContainer';
    if (view === 'transport') containerId = 'transportDateFilterContainer';

    const container = document.getElementById(containerId);
    if (!container) return;
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
        } else if (view === 'timeline') {
            checkbox.checked = currentTimelineDates.includes(date);
            checkbox.onchange = function() {
                let checkedBoxes = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'));
                if (checkedBoxes.length === 0) { checkbox.checked = true; return; }
                currentTimelineDates = checkedBoxes.map(cb => cb.value);
                renderAllCharts();
            };
        } else if (view === 'transport') {
            checkbox.checked = currentTransportDates.includes(date);
            checkbox.onchange = function() {
                let checkedBoxes = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'));
                if (checkedBoxes.length === 0) { checkbox.checked = true; return; }
                currentTransportDates = checkedBoxes.map(cb => cb.value);
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
    if (view === 'transport' || view === 'all') {
        const transportBtn = document.getElementById('transportDateDropdownBtn');
        if (transportBtn) transportBtn.innerText = currentTransportDates.length === 1 ? formatDisplayDate(currentTransportDates[0]) : `Обрано дат: ${currentTransportDates.length}`;
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
    
    } else if (currentView === 'transport') {
        const tabData = globalTransportData[currentTransportTab] || [];
        
        // 1. Фильтрация по выбранным датам
        let filteredRaw = tabData.filter(item => currentTransportDates.includes(item.date));
        
        // 2. Новое: Фильтрация по выбранному ФРД виїзду
        if (transportFilters.frdA !== 'all') {
            filteredRaw = filteredRaw.filter(item => item.frdA === transportFilters.frdA);
        }
        
        // 3. Новое: Фильтрация по выбранному ФРД приїзду (актуально только для Межрегиональной)
        if (currentTransportTab === 'Міжрегіональна' && transportFilters.frdB !== 'all') {
            filteredRaw = filteredRaw.filter(item => item.frdB === transportFilters.frdB);
        }
        
        const vehicleTypes = [...new Set(filteredRaw.map(i => i.type))];
        const showLegend = currentTransportDates.length > 1;

        // 1. ГРАФИК СТОИМОСТИ
        const sortedTypesCost = [...vehicleTypes].sort((a, b) => {
            const avgA = filteredRaw.filter(i => i.type === a).reduce((sum, i) => sum + (Number(i.cost) || 0), 0) / (filteredRaw.filter(i => i.type === a).length || 1);
            const avgB = filteredRaw.filter(i => i.type === b).reduce((sum, i) => sum + (Number(i.cost) || 0), 0) / (filteredRaw.filter(i => i.type === b).length || 1);
            return avgB - avgA;
        });

        const datasetsCost = currentTransportDates.map((date, idx) => {
            const colors = getTransportChartColors('cost', idx);
            return {
                label: formatDisplayDate(date),
                data: sortedTypesCost.map(type => {
                    const found = filteredRaw.find(i => i.type === type && i.date === date);
                    return found ? found.cost : 0;
                }),
                backgroundColor: colors.bg,
                borderColor: colors.border,
                borderWidth: 1
            };
        });

        const ctxCost = document.getElementById('costChart').getContext('2d');
        if (chartCost) chartCost.destroy();
        const costOptions = JSON.parse(JSON.stringify(darkChartOptions));
        costOptions.plugins.legend.display = showLegend;
        chartCost = new Chart(ctxCost, { type: 'bar', data: { labels: sortedTypesCost, datasets: datasetsCost }, options: costOptions });

        // 2. ГРАФИК УТИЛИЗАЦИИ (с авто-скрытием)
        const hasUtilization = filteredRaw.some(i => i.utilization !== undefined && i.utilization !== null && i.utilization !== '');
        const utilWrapper = document.getElementById('utilizationWrapper');

        if (hasUtilization) {
            utilWrapper.style.display = 'flex'; 
            const sortedTypesUtil = [...vehicleTypes].sort((a, b) => {
                const dataA = filteredRaw.filter(i => i.type === a && i.utilization !== null);
                const dataB = filteredRaw.filter(i => i.type === b && i.utilization !== null);
                const avgA = dataA.reduce((sum, i) => sum + (Number(i.utilization) || 0), 0) / (dataA.length || 1);
                const avgB = dataB.reduce((sum, i) => sum + (Number(i.utilization) || 0), 0) / (dataB.length || 1);
                return avgB - avgA;
            });

            const datasetsUtil = currentTransportDates.map((date, idx) => {
                const colors = getTransportChartColors('util', idx);
                return {
                    label: formatDisplayDate(date),
                    data: sortedTypesUtil.map(type => {
                        const found = filteredRaw.find(i => i.type === type && i.date === date);
                        return found ? found.utilization : 0;
                    }),
                    backgroundColor: colors.bg,
                    borderColor: colors.border,
                    borderWidth: 1
                };
            });

            const ctxUtil = document.getElementById('utilizationChart').getContext('2d');
            if (chartUtil) chartUtil.destroy();
            const utilOptions = JSON.parse(JSON.stringify(darkChartOptions));
            utilOptions.plugins.legend.display = showLegend;
            chartUtil = new Chart(ctxUtil, { type: 'bar', data: { labels: sortedTypesUtil, datasets: datasetsUtil }, options: utilOptions });
        } else {
            utilWrapper.style.display = 'none'; 
            if (chartUtil) chartUtil.destroy();
        }

        // 3. ГРАФИК ЗАГРУЗКИ
        const sortedTypesLoad = [...vehicleTypes].sort((a, b) => {
            const avgA = filteredRaw.filter(i => i.type === a).reduce((sum, i) => sum + (Number(i.load) || 0), 0) / (filteredRaw.filter(i => i.type === a).length || 1);
            const avgB = filteredRaw.filter(i => i.type === b).reduce((sum, i) => sum + (Number(i.load) || 0), 0) / (filteredRaw.filter(i => i.type === b).length || 1);
            return avgB - avgA;
        });

        const datasetsLoad = currentTransportDates.map((date, idx) => {
            const colors = getTransportChartColors('load', idx);
            return {
                label: formatDisplayDate(date),
                data: sortedTypesLoad.map(type => {
                    const found = filteredRaw.find(i => i.type === type && i.date === date);
                    return found ? found.load : 0;
                }),
                backgroundColor: colors.bg,
                borderColor: colors.border,
                borderWidth: 1
            };
        });

        const ctxLoad = document.getElementById('loadChart').getContext('2d');
        if (chartLoad) chartLoad.destroy();
        const loadOptions = JSON.parse(JSON.stringify(darkChartOptions));
        loadOptions.plugins.legend.display = showLegend;
        chartLoad = new Chart(ctxLoad, { type: 'bar', data: { labels: sortedTypesLoad, datasets: datasetsLoad }, options: loadOptions });
    }
}

function populateTransportFrdFilters() {
    const tabData = globalTransportData[currentTransportTab] || [];
    
    // Получаем уникальные значения ФРД для текущей вкладки
    const frdAOptions = [...new Set(tabData.map(item => item.frdA).filter(Boolean))].sort();
    const frdBOptions = [...new Set(tabData.map(item => item.frdB).filter(Boolean))].sort();
    
    const selectA = document.getElementById('transportSelectFrdA');
    const selectB = document.getElementById('transportSelectFrdB');
    
    // Наполняем ФРД выезда
    selectA.innerHTML = '<option value="all">Всі ФРД виїзду</option>';
    frdAOptions.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        option.innerText = opt;
        if (transportFilters.frdA === opt) option.selected = true;
        selectA.appendChild(option);
    });
    
    // Наполняем ФРД приезда (только если это Межрегиональное направление)
    if (currentTransportTab === 'Міжрегіональна') {
        selectB.classList.remove('hidden');
        selectB.innerHTML = '<option value="all">Всі ФРД приїзду</option>';
        frdBOptions.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.innerText = opt;
            if (transportFilters.frdB === opt) option.selected = true;
            selectB.appendChild(option);
        });
    } else {
        selectB.classList.add('hidden');
        transportFilters.frdB = 'all'; // Безопасный сброс
    }
}