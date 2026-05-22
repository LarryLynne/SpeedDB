// Вставьте сюда вашу ссылку URL развернутого веб-приложения Google Apps Script
const API_URL = 'https://script.google.com/macros/s/AKfycbwhvq8vLL6s2O2uRC1oGMIho1tkko9IgkaINgsd7D9xe55YpC0uBigKQxZbJtpdHST8/exec?dashboard=speed';

let globalData = []; 
let currentNets = ['Нац-Нац']; // Список активных фильтров сетей
let currentDates = []; 
let chartSpeed = null;

// --- ФИКСИРОВАННАЯ ПАЛИТРА ДЛЯ КАЖДОГО НАПРАВЛЕНИЯ ---
const netPalette = {
    'Нац-Нац': { bg: 'rgba(56, 189, 248, 0.5)', border: '#38bdf8' },     // Мягкий небесно-голубой
    'Нац-Парт': { bg: 'rgba(52, 211, 153, 0.5)', border: '#34d399' },    // Пастельно-мятный
    'Парт-Нац': { bg: 'rgba(192, 132, 252, 0.5)', border: '#c084fc' },    // Припыленная лаванда
    'Парт-Парт': { bg: 'rgba(251, 191, 36, 0.5)', border: '#fbbf24' }     // Теплый песочно-янтарный
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

// --- 1. ОБНОВЛЕННЫЙ ПЛАГИН: ВСЕ ПОДПИСИ НА ОДНОМ УРОВНЕ ВНИЗУ ---
const customDatalabels = {
    id: 'customDatalabels',
    afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        
        chart.data.datasets.forEach((dataset, datasetIndex) => {
            if (dataset.type === 'line') return; // Пропускаем линию
            
            const meta = chart.getDatasetMeta(datasetIndex);
            if (meta.hidden) return; 
            
            meta.data.forEach((bar, index) => {
                const val = dataset.data[index];
                if (val === null || val === undefined || val === 0) return;
                
                let text = formatHoursToHMM(val);
                ctx.save();
                
                // Делаем шрифт крупнее и контрастнее
                ctx.fillStyle = '#ffffff'; 
                ctx.font = 'bold 13px Segoe UI'; // Увеличили шрифт до 13px
                
                // Фиксируем координату Y у основания (bar.base). 
                // Смещаем на 12px вверх от линии оси, чтобы текст стоял ровно на "полу" внутри столбика
                ctx.translate(bar.x, bar.base - 12);
                ctx.rotate(-Math.PI / 2);
                
                // Теперь все надписи растут снизу вверх строго с одной стартовой позиции
                ctx.textAlign = 'left'; 
                ctx.textBaseline = 'middle';
                
                ctx.fillText(text, 0, 0);
                ctx.restore();
            });
        });
        ctx.restore();
    }
};

// --- 2. ПЛАГИН ДЛЯ ГОРИЗОНТАЛЬНЫХ ОТРЕЗКОВ СРЕДНЕГО ЗНАЧЕНИЯ ---
const averageLinesPlugin = {
    id: 'averageLinesPlugin',
    afterDatasetsDraw(chart) {
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

            // Рисуем отрезок
            ctx.strokeStyle = '#db4455';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(minX, yPixel);
            ctx.lineTo(maxX, yPixel);
            ctx.stroke();

            // Также немного увеличим шрифт над горизонтальной линией среднего значения
            ctx.fillStyle = '#db4455';
            ctx.font = 'bold 13px Segoe UI'; // Увеличили с 11px до 13px
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(formatHoursToHMM(val), (minX + maxX) / 2, yPixel - 5);
        });
        
        ctx.restore();
    }
};

Chart.register(customDatalabels, averageLinesPlugin);

const darkChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { 
            display: true,
            position: 'top',
            labels: {
                color: '#94a3b8',
                font: { family: 'Segoe UI', size: 12, weight: 'bold' },
                padding: 15
            }
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
            ticks: { 
                color: '#94a3b8',
                callback: function(value) { return formatHoursToHMM(value); }
            }, 
            grid: { color: '#1e293b' },
            grace: '25%' 
        }
    }
};

window.onload = function() {
    loadAllData(); 
    
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const clickedNet = e.target.dataset.target;
            if (currentNets.includes(clickedNet)) {
                if (currentNets.length > 1) {
                    currentNets = currentNets.filter(net => net !== clickedNet);
                    e.target.classList.remove('active');
                }
            } else {
                currentNets.push(clickedNet);
                e.target.classList.add('active');
            }
            updateViewForCurrentTab();
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

async function loadAllData() {
    document.getElementById('status').innerText = 'Завантаження даних...';
    try {
        const response = await fetch(API_URL);
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        
        globalData = result.data;
        document.getElementById('status').innerText = 'Дані успішно завантажені!';
        setTimeout(() => document.getElementById('status').innerText = '', 2000); 
        
        const uniqueDates = [...new Set(globalData.map(item => item.date))];
        currentDates = [...uniqueDates]; 
        
        renderDateFilter(uniqueDates);
        updateViewForCurrentTab();
    } catch (error) {
        document.getElementById('status').innerText = `Помилка: ${error.message}`;
        console.error(error);
    }
}

function updateViewForCurrentTab() {
    if (globalData.length === 0) {
        if (chartSpeed) chartSpeed.destroy();
        return;
    }
    renderChartsForDates(currentDates);
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
            renderChartsForDates(currentDates);
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

function renderChartsForDates(targetDates) {
    updateDropdownButtonText();
    
    const sortedDates = [...targetDates].sort((a, b) => {
        const parseDate = (str) => {
            const p = str.split('.');
            return new Date(p[2], p[1] - 1, p[0]);
        };
        return parseDate(a) - parseDate(b);
    });

    const datasets = [];

    // 1. СТОЛБИКИ ДЛЯ ВЫБРАННЫХ НАПРАВЛЕНИЙ
    currentNets.forEach(netKey => {
        const [targetNetA, targetNetB] = netKey.split('-');
        const colors = netPalette[netKey];

        const dataForNet = sortedDates.map(date => {
            const row = globalData.find(i => i.netA === targetNetA && i.netB === targetNetB && i.date === date);
            if (!row || row.eh === 0) return 0;
            return row.fondHours / row.eh;
        });

        datasets.push({
            type: 'bar',
            label: netKey,
            data: dataForNet,
            backgroundColor: colors.bg,
            borderColor: colors.border,
            borderWidth: 1
        });
    });

    // 2. ДАТАСЕТ ДЛЯ ОБЩЕГО СРЕДНЕГО (ЕСЛИ ВЫБРАНО > 1 КРИТЕРИЯ)
    if (currentNets.length > 1) {
        const globalAverageData = sortedDates.map(date => {
            const itemsForDate = globalData.filter(item => {
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

        datasets.push({
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

    const chartLabels = sortedDates.map(formatDisplayDate);

    const ctxSpeed = document.getElementById('speedChart').getContext('2d');
    if (chartSpeed) chartSpeed.destroy();
    
    chartSpeed = new Chart(ctxSpeed, {
        data: {
            labels: chartLabels,
            datasets: datasets
        },
        options: darkChartOptions
    });
}