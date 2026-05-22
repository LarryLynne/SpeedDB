// Base URL развернутого веб-приложения Google Apps Script
const BASE_API_URL = 'https://script.google.com/macros/s/AKfycbwhvq8vLL6s2O2uRC1oGMIho1tkko9IgkaINgsd7D9xe55YpC0uBigKQxZbJtpdHST8/exec';

let globalSpeedData = []; 
let globalTimelineData = []; 
let currentNets = ['Нац-Нац']; // Активные фильтры направлений сетей
let currentDates = []; 
let speedChartInstance = null;
let timelineChartInstance = null;

// --- ПАЛИТРА ДЛЯ НАПРАВЛЕНИЙ СКОРОСТИ ---
const netPalette = {
    'Нац-Нац': { bg: 'rgba(56, 189, 248, 0.5)', border: '#38bdf8' },     // Небесно-голубой
    'Нац-Парт': { bg: 'rgba(52, 211, 153, 0.5)', border: '#34d399' },    // Пастельно-мятный
    'Парт-Нац': { bg: 'rgba(192, 132, 252, 0.5)', border: '#c084fc' },    // Лаванда
    'Парт-Парт': { bg: 'rgba(251, 191, 36, 0.5)', border: '#fbbf24' }     // Песочно-янтарный
};

// --- ОБНОВЛЕННАЯ ПАЛИТРА ДЛЯ ТАЙМЛАЙНА МИЛЬ (ТЕПЕРЬ 4 СЕГМЕНТА) ---
const timelinePalette = {
    'firstMile': { bg: 'rgba(56, 189, 248, 0.65)', border: '#38bdf8', label: 'Перша миля' },
    'middleMileRun': { bg: 'rgba(168, 85, 247, 0.65)', border: '#a855f7', label: 'Середня миля (Рух)' },       // Фиолетовый
    'middleMileIdle': { bg: 'rgba(244, 63, 94, 0.65)', border: '#f43f5e', label: 'Середня миля (Простій)' },  // Кораллово-красный для простоев
    'lastMile': { bg: 'rgba(52, 211, 153, 0.65)', border: '#34d399', label: 'Остання миля' }
};

// --- ФУНКЦІЯ КРАСИВОГО ФОРМАТУВАННЯ ДАТИ ---
function formatDisplayDate(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr; 
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
}

// --- ФУНКЦІЯ ПЕРЕВОДУ ДЕСЯТИЧНИХ ГОДИН В ФОРМАТ [h]:mm ---
function formatHoursToHMM(decimalHours) {
    if (!decimalHours || isNaN(decimalHours) || decimalHours === 0) return "0:00";
    const totalMinutes = Math.round(decimalHours * 60);
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hrs}:${String(mins).padStart(2, '0')}`;
}

// --- УНИВЕРСАЛЬНЫЙ ПЛАГИН ДЛЯ ЦИФР НА СТОЛБИКАХ ---
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
                if (val === null || val === undefined || val === 0) return;
                
                let text = formatHoursToHMM(val);
                ctx.save();
                
                if (chart.options.indexAxis === 'y') {
                    // Горизонтальный график (таймлайн): пишем текст по центру накопленного сегмента
                    ctx.fillStyle = '#ffffff'; 
                    ctx.font = 'bold 11px Segoe UI';
                    ctx.textAlign = 'center'; 
                    ctx.textBaseline = 'middle';
                    
                    const segmentWidth = Math.abs(bar.x - bar.base);
                    if (segmentWidth > 35) { // Отрисовка если текст физически помещается в блок
                        ctx.fillText(text, (bar.x + bar.base) / 2, bar.y);
                    }
                } else {
                    // Вертикальный график (скорость): пишем у основания вверх
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

// --- ПЛАГИН ДЛЯ ГОРИЗОНТАЛЬНЫХ ОТРЕЗКОВ СРЕДНЕГО ЗНАЧЕНИЯ ---
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
            if (!val || val === 0) return;
            
            let minX = Infinity;
            let maxX = -Infinity;
            
            barMetas.forEach(bm => {
                const barElement = bm.meta.data[index];
                if (barElement) {
                    const w = barElement.width || 0;
                    const left = barElement.x - w / 2;
                    const right = barElement.x + w / 2;
                    if (left < minX) minX = left;
                    if (right > maxX) maxX = right;
                }
            });
            
            if (minX === Infinity || maxX === -Infinity) return;

            const yPixel = y.getPixelForValue(val);

            ctx.strokeStyle = '#db4455';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(minX, yPixel);
            ctx.lineTo(maxX, yPixel);
            ctx.stroke();

            ctx.fillStyle = '#db4455';
            ctx.font = 'bold 13px Segoe UI';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(formatHoursToHMM(val), (minX + maxX) / 2, yPixel - 5);
        });
        
        ctx.restore();
    }
};

Chart.register(customDatalabels, averageLinesPlugin);

// --- КОНФИГУРАЦИЯ СЕТКИ ГРАФИКА СКОРОСТИ ---
const darkChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { 
            display: true,
            position: 'top',
            labels: { color: '#94a3b8', font: { family: 'Segoe UI', size: 12, weight: 'bold' }, padding: 15 }
        },
        tooltip: {
            callbacks: {
                label: function(context) {
                    let label = context.dataset.label || '';
                    if (label) label += ': ';
                    return label + formatHoursToHMM(context.parsed.y);
                }
            }
        }
    },
    scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } },
        y: { 
            beginAtZero: true, 
            ticks: { color: '#94a3b8', callback: function(value) { return formatHoursToHMM(value); } }, 
            grid: { color: '#1e293b' },
            grace: '25%' 
        }
    }
};

// --- КОНФИГУРАЦИЯ СЕТКИ ТАЙМЛАЙНА ---
const timelineChartOptions = {
    indexAxis: 'y', 
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { 
            display: true,
            position: 'top',
            labels: { color: '#94a3b8', font: { family: 'Segoe UI', size: 12, weight: 'bold' }, padding: 15 }
        },
        tooltip: {
            callbacks: {
                label: function(context) {
                    let label = context.dataset.label || '';
                    if (label) label += ': ';
                    return label + formatHoursToHMM(context.parsed.x);
                }
            }
        }
    },
    scales: {
        x: { 
            stacked: true,
            ticks: { color: '#94a3b8', callback: function(value) { return formatHoursToHMM(value); } }, 
            grid: { color: '#1e293b' } 
        },
        y: { 
            stacked: true,
            ticks: { color: '#94a3b8' }, 
            grid: { color: '#1e293b' }
        }
    }
};

window.onload = function() {
    loadAllDashboardData();
    
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const clickedTarget = e.target.dataset.target;
            
            if (currentNets.includes(clickedTarget)) {
                if (currentNets.length > 1) {
                    currentNets = currentNets.filter(net => net !== clickedTarget);
                    e.target.classList.remove('active');
                }
            } else {
                currentNets.push(clickedTarget);
                e.target.classList.add('active');
            }
            renderAllCharts();
        });
    });

    const dropBtn = document.getElementById('dateDropdownBtn');
    const dropContent = document.getElementById('dateFilterContainer');
    dropBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropContent.classList.toggle('show');
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.date-dropdown')) dropContent.classList.remove('show');
    });
};

// --- СИНХРОННАЯ ПАРАЛЛЕЛЬНАЯ ЗАГРУЗКА ДАННЫХ ---
async function loadAllDashboardData() {
    document.getElementById('status').innerText = 'Завантаження даних...';
    try {
        const [speedRes, timelineRes] = await Promise.all([
            fetch(`${BASE_API_URL}?dashboard=speed`).then(r => r.json()),
            fetch(`${BASE_API_URL}?dashboard=timeline`).then(r => r.json())
        ]);
        
        if (!speedRes.success) throw new Error(speedRes.error);
        if (!timelineRes.success) throw new Error(timelineRes.error);
        
        globalSpeedData = speedRes.data;
        globalTimelineData = timelineRes.data;
        
        document.getElementById('status').innerText = 'Дані успішно завантажені!';
        setTimeout(() => document.getElementById('status').innerText = '', 2000); 
        
        const datesFromSpeed = globalSpeedData.map(item => item.date);
        const datesFromTimeline = globalTimelineData.map(item => item.date);
        const uniqueDates = [...new Set([...datesFromSpeed, ...datesFromTimeline])];
        
        currentDates = [...uniqueDates]; 
        
        renderDateFilter(uniqueDates);
        renderAllCharts();
    } catch (error) {
        document.getElementById('status').innerText = `Помилка: ${error.message}`;
        console.error(error);
    }
}

function renderDateFilter(dates) {
    const container = document.getElementById('dateFilterContainer');
    container.innerHTML = '';
    dates.forEach((date) => {
        const label = document.createElement('label');
        label.className = 'date-checkbox-label';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = date;
        checkbox.checked = currentDates.includes(date);
        
        checkbox.onchange = function() {
            let checkedBoxes = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'));
            if (checkedBoxes.length === 0) {
                checkbox.checked = true;
                return;
            }
            currentDates = checkedBoxes.map(cb => cb.value);
            renderAllCharts();
        };
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(formatDisplayDate(date)));
        container.appendChild(label);
    });
    updateDropdownButtonText();
}

function updateDropdownButtonText() {
    const dropBtn = document.getElementById('dateDropdownBtn');
    if (currentDates.length === 1) {
        dropBtn.innerText = formatDisplayDate(currentDates[0]); 
    } else {
        dropBtn.innerText = `Обрано дат: ${currentDates.length}`;
    }
}

// --- ЕДИНАЯ ФУНКЦИЯ ОТРИСОВКИ ОБОИХ ГРАФИКОВ ---
function renderAllCharts() {
    updateDropdownButtonText();
    
    const sortedDates = [...currentDates].sort((a, b) => {
        const parseDate = (str) => {
            const p = str.split('.');
            return new Date(p[2], p[1] - 1, p[0]);
        };
        return parseDate(a) - parseDate(b);
    });

    const chartLabels = sortedDates.map(formatDisplayDate);

    // ==========================================
    // 1. РЕНДЕРИНГ ВЕРТИКАЛЬНОГО ГРАФИКА СКОРОСТИ
    // ==========================================
    const speedDatasets = [];
    currentNets.forEach(netKey => {
        const [targetNetA, targetNetB] = netKey.split('-');
        const colors = netPalette[netKey];

        const dataForNet = sortedDates.map(date => {
            const row = globalSpeedData.find(i => i.netA === targetNetA && i.netB === targetNetB && i.date === date);
            if (!row || row.eh === 0) return 0;
            return row.fondHours / row.eh;
        });

        speedDatasets.push({
            type: 'bar',
            label: netKey,
            data: dataForNet,
            backgroundColor: colors.bg,
            borderColor: colors.border,
            borderWidth: 1
        });
    });

    if (currentNets.length > 1) {
        const globalAverageData = sortedDates.map(date => {
            const itemsForDate = globalSpeedData.filter(item => {
                const itemNetKey = `${item.netA}-${item.netB}`;
                return currentNets.includes(itemNetKey) && item.date === date;
            });

            let totalEh = 0;
            let totalFondHours = 0;
            itemsForDate.forEach(item => {
                totalEh += item.eh;
                totalFondHours += item.fondHours;
            });

            return totalEh > 0 ? (totalFondHours / totalEh) : 0;
        });

        speedDatasets.push({
            type: 'line',
            label: 'Загальна середня',
            data: globalAverageData,
            showLine: false, 
            pointRadius: 0,  
            pointHoverRadius: 6, 
            borderColor: '#db4455',
            backgroundColor: '#db4455'
        });
    }

    const ctxSpeed = document.getElementById('speedChart').getContext('2d');
    if (speedChartInstance) speedChartInstance.destroy();
    speedChartInstance = new Chart(ctxSpeed, {
        data: { labels: chartLabels, datasets: speedDatasets },
        options: darkChartOptions
    });

    // ==========================================
    // 2. РЕНДЕРИНГ ГОРИЗОНТАЛЬНОГО ТАЙМЛАЙНА (ТЕПЕРЬ 4 СЕГМЕНТА)
    // ==========================================
    const timelineDatasets = [];
    const milesKeys = ['firstMile', 'middleMileRun', 'middleMileIdle', 'lastMile']; // Добавлены новые ключи
    
    milesKeys.forEach(mileKey => {
        const config = timelinePalette[mileKey];
        const dataForMile = sortedDates.map(date => {
            const row = globalTimelineData.find(i => i.date === date);
            return row ? row[mileKey] : 0;
        });

        timelineDatasets.push({
            type: 'bar',
            label: config.label,
            data: dataForMile,
            backgroundColor: config.bg,
            borderColor: config.border,
            borderWidth: 1
        });
    });

    const ctxTimeline = document.getElementById('timelineChart').getContext('2d');
    if (timelineChartInstance) timelineChartInstance.destroy();
    timelineChartInstance = new Chart(ctxTimeline, {
        data: { labels: chartLabels, datasets: timelineDatasets },
        options: timelineChartOptions
    });
}