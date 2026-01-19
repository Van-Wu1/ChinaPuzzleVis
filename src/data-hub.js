/**
 * DataHub - 拼图中国外部数据管理中心 (增强修复版)
 * 解决：漫游模式颜色损坏、容器不自适应、表格内容穿透
 */

const COLOR_SCHEMES = {
    // 经典配色
    'Blue-White': ['#ffffff', '#99cce0', '#4da6d9', '#0066cc'],
    'Red-White': ['#ffffff', '#ffb3a7', '#ff8066', '#cc3300'],
    'Green-White': ['#ffffff', '#b3e6b3', '#80d980', '#33cc33'],
    'Yellow-Red': ['#ffffcc', '#ffcc00', '#f5a623', '#d93f00'], // 更强烈的红色
    'Purple-Blue': ['#f7f7f7', '#a6bddb', '#74a9cf', '#3690c0'],
    'Orange-Red': ['#fff5eb', '#fdd0a2', '#fdae6b', '#f16913'],
    'Green-Blue': ['#f0f9ff', '#99d1ff', '#66b3ff', '#3399ff'],
    'Gray-White': ['#ffffff', '#d9d9d9', '#808080', '#4d4d4d'],
    'Pink-White': ['#ffffff', '#ffb3d9', '#ff80c0', '#ff4da6'],
    'Cyan-Blue': ['#e0f7fa', '#b2ebf2', '#80deea', '#26c6da'],
    
    // 双色系渐变
    'Blue-Red': ['#0066cc', '#99cce0', '#ffcccc', '#ff8080'],
    'Blue-Orange': ['#0066cc', '#99cce0', '#ffe0cc', '#ff6600'],
    'Red-Green': ['#cc3300', '#ff8080', '#ccffcc', '#80ff80'],
    'Blue-Yellow': ['#0066cc', '#99cce0', '#ffffcc', '#ffcc00'],
    'Purple-Green': ['#810f7c', '#d9a3d0', '#66cc66', '#009900'],
    'Orange-Blue': ['#ff6600', '#ffe0cc', '#cce5ff', '#0066cc']
};

// 数据分类方法
const CLASSIFICATION_METHODS = {
    'equal-interval': '等间距',
    'quantile': '分位数',
    'natural-breaks': '自然断点',
    'standard-deviation': '标准差'
};

// 分类算法实现
class ClassificationAlgorithms {
    /**
     * 等间距分类：将数据范围等分为N个区间
     */
    static equalInterval(values, numClasses) {
        const sorted = [...values].sort((a, b) => a - b);
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const interval = (max - min) / numClasses;
        const breaks = [];
        for (let i = 0; i <= numClasses; i++) {
            breaks.push(min + interval * i);
        }
        return breaks;
    }

    /**
     * 分位数分类：每个区间包含相同数量的数据点
     */
    static quantile(values, numClasses) {
        const sorted = [...values].sort((a, b) => a - b);
        const breaks = [sorted[0]];
        const step = sorted.length / numClasses;
        for (let i = 1; i < numClasses; i++) {
            const index = Math.floor(i * step);
            breaks.push(sorted[index]);
        }
        breaks.push(sorted[sorted.length - 1]);
        return breaks;
    }

    /**
     * 自然断点分类（Jenks算法）：根据数据分布的自然聚类点划分
     */
    static naturalBreaks(values, numClasses) {
        const sorted = [...values].sort((a, b) => a - b);
        const n = sorted.length;
        if (n <= numClasses) {
            return ClassificationAlgorithms.equalInterval(values, numClasses);
        }

        // 简化的Jenks算法实现
        const breaks = [sorted[0]];
        const step = n / numClasses;
        for (let i = 1; i < numClasses; i++) {
            const index = Math.floor(i * step);
            breaks.push(sorted[index]);
        }
        breaks.push(sorted[n - 1]);

        // 优化：寻找局部最小值作为断点
        const optimizedBreaks = [sorted[0]];
        for (let i = 1; i < numClasses; i++) {
            const startIdx = Math.floor((i - 1) * step);
            const endIdx = Math.floor(i * step);
            let minIdx = startIdx;
            let minVal = sorted[startIdx];
            
            // 在区间内寻找最小值
            for (let j = startIdx; j <= endIdx && j < n; j++) {
                if (sorted[j] < minVal) {
                    minVal = sorted[j];
                    minIdx = j;
                }
            }
            optimizedBreaks.push(sorted[minIdx]);
        }
        optimizedBreaks.push(sorted[n - 1]);
        
        return optimizedBreaks;
    }

    /**
     * 标准差分类：基于均值和标准差划分
     */
    static standardDeviation(values, numClasses) {
        const sorted = [...values].sort((a, b) => a - b);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);
        
        const breaks = [];
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        
        if (numClasses === 5) {
            // 5类：-2σ, -1σ, 均值, +1σ, +2σ
            breaks.push(min);
            breaks.push(Math.max(min, mean - 2 * stdDev));
            breaks.push(Math.max(min, mean - stdDev));
            breaks.push(mean);
            breaks.push(Math.min(max, mean + stdDev));
            breaks.push(Math.min(max, mean + 2 * stdDev));
            breaks.push(max);
        } else {
            // 其他情况使用等间距
            return ClassificationAlgorithms.equalInterval(values, numClasses);
        }
        
        // 去重并排序
        return [...new Set(breaks)].sort((a, b) => a - b);
    }

    /**
     * 计算分类断点
     */
    static calculateBreaks(values, method, numClasses = 5) {
        if (!values || values.length === 0) return [];
        
        const validValues = values.filter(v => !isNaN(v) && isFinite(v));
        if (validValues.length === 0) return [];

        switch (method) {
            case 'equal-interval':
                return this.equalInterval(validValues, numClasses);
            case 'quantile':
                return this.quantile(validValues, numClasses);
            case 'natural-breaks':
                return this.naturalBreaks(validValues, numClasses);
            case 'standard-deviation':
                return this.standardDeviation(validValues, numClasses);
            default:
                return this.equalInterval(validValues, numClasses);
        }
    }

    /**
     * 根据断点获取值的分类索引
     */
    static getClassIndex(value, breaks) {
        if (breaks.length === 0) return 0;
        for (let i = 0; i < breaks.length - 1; i++) {
            if (value <= breaks[i + 1]) {
                return i;
            }
        }
        return breaks.length - 2;
    }
}

class DataHub {
    constructor() {
        this.data = [];
        this.headers = [];
        this.currentField = null;
        this.currentScheme = 'Blue-White';
        this.currentMethod = 'equal-interval'; // 默认等间距
        this.isFuzzy = true;
    }

    init() {
        const template = `
            <div id="data-hub-panel" class="dh-panel-container">
                <div id="panel-resizer" class="dh-drag-handle">
                    <div class="w-12 h-1 bg-gray-300/60 rounded-full"></div>
                </div>
                
                <div class="dh-tabs">
                    <div class="dh-tab-btn active" id="tab-btn-table" onclick="hub.switchTab('table')">
                        <span class="mr-1.5"></span>属性表
                    </div>
                    <div class="dh-tab-btn" id="tab-btn-symbology" onclick="hub.switchTab('symbology')">
                        <span class="mr-1.5"></span>符号系统
                    </div>
                    <div class="dh-tabs-spacer"></div>
                    <button onclick="hub.reset()" class="text-[11px] font-bold text-gray-400 hover:text-red-500 transition-colors mr-5 tracking-wider uppercase">重置数据</button>
                    <div onclick="hub.close()" class="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100/80 hover:bg-gray-200 cursor-pointer transition-all">
                        <span class="text-gray-500 text-xs">✕</span>
                    </div>
                </div>

                <div id="dh-content-area" class="dh-content">
                </div>
            </div>
        `;
        document.getElementById('data-hub-root').innerHTML = template;
        this.initResizable();
    }

    initResizable() {
        const panel = document.getElementById('data-hub-panel');
        const resizer = document.getElementById('panel-resizer');
        let isResizing = false;
        let startY, startHeight;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = panel.offsetHeight;
            document.body.style.cursor = 'ns-resize';
            panel.style.transition = 'none';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const dy = startY - e.clientY;
            const newHeight = startHeight + dy;
            if (newHeight > 240 && newHeight <= 340) {
                panel.style.height = `${newHeight}px`;
            }
        });

        window.addEventListener('mouseup', () => {
            isResizing = false;
            document.body.style.cursor = 'default';
            panel.style.transition = 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
        });
    }

    // 渲染属性表：解决穿透问题
    renderTable() {
        let html = `
            <div class="dh-table-wrapper">
                <div class="dh-table-scroll">
                    <table class="dh-table">
                        <thead class="dh-table-header">
                            <tr>
                                ${this.headers.map(h => `<th>${h}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody class="dh-table-body">
                            ${this.data.map(row => `
                                <tr>
                                    ${this.headers.map(h => `<td>${row[h] || '-'}</td>`).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        document.getElementById('dh-content-area').innerHTML = html;
    }

    // 渲染符号系统：解决自适应问题
    renderSymbology() {
        // 保存滚动位置
        const scrollContainer = document.querySelector('.dh-color-palette-scroll');
        const scrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
        
        const numericFields = this.headers.filter(h => !isNaN(parseFloat(this.data[0][h])));
        
        // 如果有选中的字段，计算直方图数据
        let histogramData = null;
        let breaks = null;
        if (this.currentField) {
            const values = this.data.map(d => parseFloat(d[this.currentField])).filter(v => !isNaN(v));
            if (values.length > 0) {
                const colors = COLOR_SCHEMES[this.currentScheme];
                breaks = ClassificationAlgorithms.calculateBreaks(values, this.currentClassification, colors.length);
                histogramData = this.calculateHistogram(values, breaks);
            }
        }
        
        let html = `
            <div class="dh-symbology-layout">
                <!-- 左列：控制选项 -->
                <div class="dh-symbology-left">
                    <div class="dh-controls-section space-y-6">
                        <div>
                            <label class="block text-[11px] font-bold text-gray-400 mb-3 uppercase tracking-wider">1. 核心分析指标</label>
                            <select id="field-select" class="w-full p-3 border-none rounded-2xl text-sm bg-gray-100 outline-none focus:ring-2 focus:ring-blue-500" 
                                    onchange="hub.onFieldChange(this.value)">
                                <option value="">-- 请选择指标 --</option>
                                ${numericFields.map(f => `<option value="${f}" ${this.currentField === f ? 'selected' : ''}>${f}</option>`).join('')}
                            </select>
                        </div>
                        
                        ${this.currentField ? `
                        <div>
                            <label class="block text-[11px] font-bold text-gray-400 mb-3 uppercase tracking-wider">2. 数据分层方法</label>
                            <select id="method-select" class="w-full p-3 border-none rounded-2xl text-sm bg-gray-100 outline-none focus:ring-2 focus:ring-blue-500" 
                                    onchange="hub.onMethodChange(this.value)">
                                ${Object.keys(CLASSIFICATION_METHODS).map(m => 
                                    `<option value="${m}" ${this.currentClassification === m ? 'selected' : ''}>${CLASSIFICATION_METHODS[m]}</option>`
                                ).join('')}
                            </select>
                        </div>
                        ` : ''}
                        
                        <div class="flex items-center gap-3 p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
                            <input type="checkbox" id="fuzzy-toggle" ${this.isFuzzy ? 'checked' : ''} onchange="hub.isFuzzy = this.checked" class="w-4 h-4 text-blue-600"> 
                            <label for="fuzzy-toggle" class="text-xs font-bold text-blue-700 cursor-pointer">启用名称模糊匹配</label>
                        </div>
                    </div>
                </div>

                <!-- 中列：直方图 -->
                <div class="dh-symbology-center">
                    <div class="dh-histogram-section">
                        <label class="block text-[11px] font-bold text-gray-400 mb-2 uppercase tracking-wider">数据分布直方图</label>
                        <div id="histogram-container">
                            <canvas id="histogram-canvas"></canvas>
                        </div>
                    </div>
                </div>

                <!-- 右列：色板选择 -->
                <div class="dh-symbology-right">
                    <label class="block text-[11px] font-bold text-gray-400 mb-2 uppercase tracking-wider">${this.currentField ? '3. ' : '2. '}视觉色板选择</label>
                    <div class="dh-color-palette-scroll custom-scroll">
                        <div class="dh-color-palette-grid">
                            ${Object.keys(COLOR_SCHEMES).map(name => {
            const isActive = this.currentScheme === name;
            const gradient = `linear-gradient(to right, ${COLOR_SCHEMES[name].join(', ')})`;
            return `
                                    <div onclick="hub.applySymbology(document.getElementById('field-select')?.value || '', '${name}')" 
                                         class="dh-color-palette-item ${isActive ? 'active' : ''}">
                                        <div class="dh-color-palette-label ${isActive ? 'active' : ''}">
                                            <span>${name}</span>
                                            ${isActive ? '<span class="text-blue-500 text-xs">●</span>' : ''}
                                        </div>
                                        <div class="dh-color-gradient-bar" style="background: ${gradient}"></div>
                                    </div>
                                `;
        }).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('dh-content-area').innerHTML = html;
        
        // 使用 requestAnimationFrame 确保在浏览器渲染后再恢复滚动位置，避免视觉上的"抽搐"
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const newScrollContainer = document.querySelector('.dh-color-palette-scroll');
                if (newScrollContainer && scrollTop > 0) {
                    newScrollContainer.scrollTop = scrollTop;
                }
                
                // 绘制直方图（始终绘制，即使没有数据也显示空图表）
                if (histogramData && breaks) {
                    this.drawHistogram(histogramData, breaks);
                } else {
                    // 绘制空图表
                    this.drawEmptyHistogram();
                }
            });
        });
    }
    
    // 计算直方图数据
    calculateHistogram(values, breaks) {
        if (!breaks || breaks.length < 2) return null;
        
        const bins = breaks.length - 1;
        const histogram = new Array(bins).fill(0);
        
        values.forEach(val => {
            // 找到值所在的区间
            // breaks 数组：breaks[0] 是最小值，breaks[bins] 是最大值
            // 区间 i: [breaks[i], breaks[i+1])，最后一个区间包含最大值
            let placed = false;
            for (let i = 0; i < bins; i++) {
                if (i === bins - 1) {
                    // 最后一个区间：包含最大值 [breaks[i], breaks[i+1]]
                    if (val >= breaks[i] && val <= breaks[i + 1]) {
                        histogram[i]++;
                        placed = true;
                        break;
                    }
                } else {
                    // 其他区间：[breaks[i], breaks[i+1])
                    if (val >= breaks[i] && val < breaks[i + 1]) {
                        histogram[i]++;
                        placed = true;
                        break;
                    }
                }
            }
            // 如果还没放置（边界情况），放在最后一个bin
            if (!placed) {
                histogram[bins - 1]++;
            }
        });
        
        const maxCount = Math.max(...histogram, 1); // 确保至少为1，避免除零
        
        return {
            bins: histogram,
            breaks: breaks,
            maxCount: maxCount,
            min: Math.min(...values),
            max: Math.max(...values)
        };
    }
    
    // 绘制空直方图
    drawEmptyHistogram() {
        const canvas = document.getElementById('histogram-canvas');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        const container = canvas.parentElement;
        const displayWidth = container ? container.clientWidth - 24 : 600;
        const displayHeight = 180;
        
        const dpr = window.devicePixelRatio || 1;
        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
        canvas.style.width = displayWidth + 'px';
        canvas.style.height = displayHeight + 'px';
        ctx.scale(dpr, dpr);
        
        const width = displayWidth;
        const height = displayHeight;
        const padding = { top: 25, right: 15, bottom: 35, left: 45 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
        ctx.clearRect(0, 0, width, height);
        
        // 绘制坐标轴
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        
        // X轴
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top + chartHeight);
        ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
        ctx.stroke();
        
        // Y轴
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top);
        ctx.lineTo(padding.left, padding.top + chartHeight);
        ctx.stroke();
        
        // 提示文字
        ctx.fillStyle = '#999';
        ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('请选择数据列以查看分布', width / 2, height / 2);
    }
    
    // 绘制直方图
    drawHistogram(histogramData, breaks) {
        const canvas = document.getElementById('histogram-canvas');
        if (!canvas) {
            console.error('[直方图] Canvas元素不存在');
            return;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('[直方图] 无法获取Canvas上下文');
            return;
        }
        
        // 获取实际显示尺寸
        const container = canvas.parentElement;
        const displayWidth = container ? container.clientWidth - 24 : 600; // 减去padding (12px * 2)
        const displayHeight = 180; // 增加高度
        
        // 设置Canvas实际尺寸（高DPI支持）
        const dpr = window.devicePixelRatio || 1;
        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
        canvas.style.width = displayWidth + 'px';
        canvas.style.height = displayHeight + 'px';
        ctx.scale(dpr, dpr);
        
        const width = displayWidth;
        const height = displayHeight;
        const padding = { top: 35, right: 15, bottom: 30, left: 40 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
        // 清空画布
        ctx.clearRect(0, 0, width, height);
        
        const bins = histogramData.bins;
        const binWidth = bins.length > 0 ? chartWidth / bins.length : 0;
        const maxCount = histogramData.maxCount;
        const colors = COLOR_SCHEMES[this.currentScheme] || COLOR_SCHEMES['Blue-White'];
        
        // 安全检查
        if (bins.length === 0 || maxCount === 0) {
            console.error('[直方图] 没有数据可绘制', { bins, maxCount });
            return;
        }
        
        // 先绘制所有断点线（在柱状图之后绘制，避免被覆盖）
        
        // 绘制柱状图
        if (bins.length === 0 || maxCount === 0) {
            return;
        }
        
        bins.forEach((count, i) => {
            const barHeight = maxCount > 0 ? (count / maxCount) * chartHeight : 0;
            
            if (barHeight <= 0) return;
            
            const x = padding.left + i * binWidth;
            const y = padding.top + chartHeight - barHeight;
            
            // 使用对应的颜色
            const colorIndex = Math.min(i, colors.length - 1);
            ctx.fillStyle = colors[colorIndex];
            
            // 绘制柱状图（确保最小宽度）
            const rectWidth = Math.max(2, binWidth - 2);
            ctx.fillRect(x + 1, y, rectWidth, barHeight);
        });
        
        // 绘制断点线（在柱状图之后绘制）
        bins.forEach((count, i) => {
            if (i < breaks.length - 1) {
                const x = padding.left + (i + 1) * binWidth;
                ctx.strokeStyle = '#999';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(x, padding.top);
                ctx.lineTo(x, padding.top + chartHeight);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        });
        
        // 设置样式（在绘制之前设置）
        ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        
        // 绘制坐标轴
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        
        // X轴
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top + chartHeight);
        ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
        ctx.stroke();
        
        // Y轴
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top);
        ctx.lineTo(padding.left, padding.top + chartHeight);
        ctx.stroke();
        
        // 绘制Y轴标签
        ctx.fillStyle = '#666';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const yTicks = 4;
        for (let i = 0; i <= yTicks; i++) {
            const value = Math.round((maxCount / yTicks) * i);
            const y = padding.top + chartHeight - (i / yTicks) * chartHeight;
            ctx.fillText(value.toString(), padding.left - 8, y);
        }
        
        // 绘制X轴标签（断点值）
        ctx.fillStyle = '#666';
        ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        // 只显示部分标签，避免拥挤
        const labelStep = Math.max(1, Math.floor(breaks.length / 5));
        breaks.forEach((breakValue, i) => {
            if (i % labelStep === 0 || i === breaks.length - 1) {
                const x = padding.left + (i / (breaks.length - 1)) * chartWidth;
                ctx.fillText(breakValue.toFixed(0), x, padding.top + chartHeight + 6);
            }
        });
        
        // 绘制标题
        ctx.fillStyle = '#333';
        ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`数据分布 (${CLASSIFICATION_METHODS[this.currentClassification]})`, width / 2, 15);
        
        // 调试信息：打印到控制台
        console.log('[直方图调试]', {
            bins: bins.length,
            maxCount: maxCount,
            histogramData: histogramData.bins,
            breaks: breaks
        });
    }
    
    // 字段改变时的处理
    onFieldChange(fieldName) {
        if (!fieldName) {
            this.currentField = null;
            this.renderSymbology();
            return;
        }
        this.currentField = fieldName;
        this.renderSymbology();
        // 自动应用符号系统
        this.applySymbology(fieldName, this.currentScheme);
    }
    
    // 分类方法改变时的处理
    onMethodChange(method) {
        this.currentClassification = method;
        this.renderSymbology();
        // 重新应用符号系统
        if (this.currentField) {
            this.applySymbology(this.currentField, this.currentScheme);
        }
    }

    // 核心渲染逻辑：修正颜色损坏问题
    applySymbology(fieldName, schemeName) {
        if (!fieldName) return;
        this.currentField = fieldName;
        this.currentScheme = schemeName || this.currentScheme;
        const colors = COLOR_SCHEMES[this.currentScheme];

        const values = this.data.map(d => parseFloat(d[fieldName])).filter(v => !isNaN(v));
        if (values.length === 0) return;

        // 使用分类算法计算断点
        const breaks = ClassificationAlgorithms.calculateBreaks(values, this.currentClassification, colors.length);
        const max = Math.max(...values);
        const min = Math.min(...values);

        // === 关键：切换进入【数据模式】 ===
        window.isDataMode = true;

        // 第一步：全地图清洗
        // 按照你的要求：导入数据后，清空所有板块高度和颜色
        Object.keys(states).forEach(id => {
            states[id].elevated = false;  // 先降下浅灰
            states[id].customColor = null;
            states[id].dataColor = null;
            states[id].targetH = null;
            states[id].customHeight = null;  // 清除自定义高度
            states[id].customThickness = null;  // 清除自定义厚度
        });
        elevatedIds.clear();

        // 第二步：计算新数据
        currentGeoData.features.forEach(f => {
            const id = f.id;
            const s = states[id];
            if (!s) return;

            // 模糊匹配
            const row = this.data.find(d => {
                const csvName = String(Object.values(d)[0]);
                return this.isFuzzy ? (f.properties.name.includes(csvName) || csvName.includes(f.properties.name)) : f.properties.name === csvName;
            });

            if (row && !isNaN(parseFloat(row[fieldName]))) {
                const val = parseFloat(row[fieldName]);
                
                // 使用分类算法获取分类索引
                const classIndex = ClassificationAlgorithms.getClassIndex(val, breaks);
                const numClasses = colors.length;
                
                // 计算在该分类内的相对位置（用于颜色插值）
                let localRatio = 0;
                if (classIndex < breaks.length - 1) {
                    const classMin = breaks[classIndex];
                    const classMax = breaks[classIndex + 1];
                    if (classMax > classMin) {
                        localRatio = (val - classMin) / (classMax - classMin);
                    }
                }
                
                // 确保索引在有效范围内
                const colorIdx = Math.min(classIndex, numClasses - 2);
                
                // 写入【数据专用】属性，不碰漫游属性
                // 提高整体高度：基础高度从70000提高到150000，高度范围从300000提高到450000
                // 最小值：150000（高于默认70000，避免下陷）
                // 最大值：600000（比之前370000更高，视觉效果更明显）
                // 使用分类索引计算高度，而不是简单的比例
                const heightRatio = breaks.length > 1 ? (classIndex / (breaks.length - 2)) : 0;
                s.targetH = 150000 + (heightRatio * 450000);

                // 存入 dataColor，而不是 customColor
                s.dataColor = this.interpolateColor(colors[colorIdx], colors[colorIdx + 1], localRatio);

                // 【关键】数据模式下，设置 elevated = true，让板块升起并显示数据
                s.elevated = true;
                
                // 记录 ID 方便 zoomToSelection 等功能使用
                elevatedIds.add(id);
                
                // 立即更新地图状态，确保颜色和高度立即显示
                const map = window.map;
                if (map) {
                    // 获取全局常量
                    const BASE_H = window.BASE_H || 70000;
                    const TARGET_LOW = window.TARGET_LOW || 80000;
                    
                    map.setFeatureState(
                        { source: 'china-source', id: id },
                        {
                            h: s.targetH,
                            b: (s.targetH > BASE_H) ? TARGET_LOW : 0,
                            elevated: true,
                            dataColor: s.dataColor
                        }
                    );
                    
                    // 同步更新当前高度，确保动画循环能正确工作
                    s.currH = s.targetH;
                    s.currB = (s.targetH > BASE_H) ? TARGET_LOW : 0;
                }
            }
        });

        // 只在符号系统标签页激活时才重新渲染，避免不必要的DOM更新
        if (document.getElementById('tab-btn-symbology').classList.contains('active')) {
            // 保存滚动位置
            const scrollContainer = document.querySelector('.dh-color-palette-scroll');
            const scrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
            
            this.renderSymbology();
            
            // 恢复滚动位置（renderSymbology内部也会处理，这里作为双重保险）
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const newScrollContainer = document.querySelector('.dh-color-palette-scroll');
                    if (newScrollContainer && scrollTop > 0) {
                        newScrollContainer.scrollTop = scrollTop;
                    }
                });
            });
        }
        
        // 注意：按钮状态在数据导入成功时已经更新，这里不需要再次更新
    }

    interpolateColor(c1, c2, f) {
        const parse = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
        const [r1, g1, b1] = parse(c1), [r2, g2, b2] = parse(c2);
        const hex = (x) => Math.round(x).toString(16).padStart(2, '0');
        return `#${hex(r1 + (r2 - r1) * f)}${hex(g1 + (g2 - g1) * f)}${hex(b1 + (b2 - b1) * f)}`;
    }

    open() { 
        document.getElementById('data-hub-panel').classList.add('open');
        // 注意：按钮状态在数据导入成功时已经更新，这里不需要再次更新
    }
    close() { 
        // 只关闭面板，不清除地图效果（保留数据可视化）
        // 只有点击"重置数据"才会清除效果
        document.getElementById('data-hub-panel').classList.remove('open');
        // 注意：关闭面板不改变 isDataMode，所以按钮状态不变
    }

    // 新增：专门清除地图效果的方法，回归漫游模式
    clearMapEffects() {
        window.isDataMode = false;
        
        // 更新加载项目按钮状态
        if (window.updateLoadProjectButtonState) {
            window.updateLoadProjectButtonState();
        }
        
        // 获取全局 map 对象（在 v10ing.html 中定义）
        const map = window.map;
        if (!map) {
            console.warn('[DataHub] 无法找到全局 map 对象');
            return;
        }
        
        // 遍历所有板块，清除数据驱动的效果
        if (!window.states) {
            console.warn('[DataHub] 无法找到 window.states');
            return;
        }
        
        Object.keys(window.states).forEach(id => {
            const stateId = parseInt(id, 10);
            const s = window.states[id];
            if (!s) return;
            
            // 清除数据驱动的属性
            s.targetH = null;
            s.dataColor = null;
            s.customColor = null;  // 清空手动设置的颜色
            s.elevated = false;     // 降下所有板块
            
            // 同步清除地图 feature-state 中的颜色，确保重置为默认蓝色
            // 注意：这里需要传入数字类型的 id
            if (map.getSource('china-source')) {
                map.setFeatureState(
                    { source: 'china-source', id: stateId },
                    {
                        customColor: null,
                        dataColor: null,
                        elevated: false
                    }
                );
            }
        });
        
        if (window.elevatedIds) {
            window.elevatedIds.clear();
        }
    }
    
    reset() {
        if (confirm("确定重置所有数据并恢复拼图本色吗？")) {
            this.clearMapEffects();
            this.data = [];
            this.currentField = null;
            this.close();
            document.getElementById('manage-data-box').classList.add('hidden');
            
            // 重置文件输入框，允许重新导入
            const fileInput = document.getElementById('dh-input');
            if (fileInput) {
                fileInput.value = '';
            }
            
            // 【关键】重置数据后，重新启用加载项目按钮
            if (window.updateLoadProjectButtonState) {
                window.updateLoadProjectButtonState();
            }
        }
    }

    switchTab(t) {
        document.getElementById('tab-btn-table').classList.toggle('active', t === 'table');
        document.getElementById('tab-btn-symbology').classList.toggle('active', t === 'symbology');
        t === 'table' ? this.renderTable() : this.renderSymbology();
    }

    // 清除漫游模式的颜色和升降状态（导入数据前调用）
    clearRoamModeEffects() {
        const map = window.map;
        if (!map || !window.states) {
            console.warn('[DataHub] 无法找到 map 或 states 对象');
            return;
        }
        
        // 遍历所有板块，清除漫游模式的效果
        Object.keys(window.states).forEach(id => {
            const stateId = parseInt(id, 10);
            const s = window.states[id];
            if (!s) return;
            
            // 清除漫游模式的属性（但保留数据模式的属性，因为可能之前有数据）
            s.customColor = null;  // 清空手动设置的颜色
            s.elevated = false;    // 降下所有板块
            
            // 同步清除地图 feature-state 中的漫游模式颜色
            if (map.getSource('china-source')) {
                map.setFeatureState(
                    { source: 'china-source', id: stateId },
                    {
                        customColor: null,
                        elevated: false
                        // 注意：不清除 dataColor，因为可能之前有数据驱动的颜色
                    }
                );
            }
        });
        
        if (window.elevatedIds) {
            window.elevatedIds.clear();
        }
    }

    // 验证文件格式：检查是否包含地名列
    validateFileFormat(data, headers) {
        // 1. 检查数据是否为空
        if (!data || data.length === 0) {
            return { valid: false, message: '文件数据为空，请确保文件包含数据行' };
        }

        // 2. 检查表头是否存在
        if (!headers || headers.length === 0) {
            return { valid: false, message: '文件缺少表头，请确保第一行为列名' };
        }

        // 3. 检查是否至少有一列是地名列
        // 地名列的特征：
        // - 列名必须包含地名相关关键词（严格要求）
        // - 数据内容主要是中文字符（地名通常为中文）
        // - 数据长度合理（2-20个字符）
        // - 不能是纯数字或纯英文
        const placeNameKeywords = [
            '名称', '地名', '地区', '城市', '省份', '区县', '区域', 
            '地区名', '行政区', '市', '县', '区', '省', 
            '市名', '县名', '区名', '省名', '城市名', '地区名称',
            'name', 'region', 'city', 'province', 'district', 'area'
        ];
        
        let foundPlaceNameColumn = false;
        let placeNameColumn = null;
        let bestMatch = null;
        let bestScore = 0;

        // 遍历所有列，寻找地名列
        for (const header of headers) {
            const headerStr = String(header).trim();
            const headerLower = headerStr.toLowerCase();
            
            // 检查列名是否包含地名关键词（必须匹配）
            const matchedKeywords = placeNameKeywords.filter(keyword => {
                const keywordLower = keyword.toLowerCase();
                return headerLower.includes(keywordLower) || headerStr.includes(keyword);
            });

            // 如果没有匹配到关键词，跳过该列
            if (matchedKeywords.length === 0) {
                continue;
            }

            // 获取该列的所有非空数据样本（至少检查前20行）
            const sampleSize = Math.min(20, data.length);
            const sampleValues = data.slice(0, sampleSize)
                .map(row => String(row[header] || '').trim())
                .filter(val => val.length > 0);

            if (sampleValues.length === 0) {
                continue; // 该列为空，跳过
            }

            // 检查样本数据是否主要是中文字符（地名特征）
            const chineseCharPattern = /[\u4e00-\u9fa5]/;
            const chineseCharCount = sampleValues.filter(val => chineseCharPattern.test(val)).length;
            const chineseRatio = chineseCharCount / sampleValues.length;

            // 检查数据长度是否合理（2-20个字符）
            const validLengthCount = sampleValues.filter(val => 
                val.length >= 2 && val.length <= 20
            ).length;
            const validLengthRatio = validLengthCount / sampleValues.length;

            // 检查是否包含数字（地名不应该主要是数字）
            const numberPattern = /^\d+$/;
            const numberCount = sampleValues.filter(val => numberPattern.test(val)).length;
            const numberRatio = numberCount / sampleValues.length;

            // 检查是否包含常见的地名后缀（如：省、市、县、区等）
            const placeSuffixPattern = /[省市区县州盟旗镇乡街道村]/;
            const suffixCount = sampleValues.filter(val => placeSuffixPattern.test(val)).length;
            const suffixRatio = suffixCount / sampleValues.length;

            // 计算综合得分
            let score = 0;
            // 关键词匹配得分（基础分）
            score += matchedKeywords.length * 10;
            // 中文比例得分（必须超过80%）
            if (chineseRatio >= 0.8) {
                score += chineseRatio * 30;
            } else if (chineseRatio >= 0.6) {
                score += chineseRatio * 15;
            }
            // 长度合理性得分
            score += validLengthRatio * 20;
            // 地名后缀得分（加分项）
            score += suffixRatio * 20;
            // 数字比例扣分（如果超过30%是纯数字，扣分）
            if (numberRatio > 0.3) {
                score -= numberRatio * 30;
            }

            // 严格条件：必须满足以下所有条件才认为是地名列
            // 1. 匹配到关键词
            // 2. 中文比例 >= 70%
            // 3. 长度合理比例 >= 70%
            // 4. 纯数字比例 < 50%
            const isStrictMatch = matchedKeywords.length > 0 &&
                chineseRatio >= 0.7 &&
                validLengthRatio >= 0.7 &&
                numberRatio < 0.5;

            if (isStrictMatch && score > bestScore) {
                bestMatch = header;
                bestScore = score;
            }
        }

        // 如果找到了严格匹配的地名列
        if (bestMatch) {
            foundPlaceNameColumn = true;
            placeNameColumn = bestMatch;
        }

        // 如果仍然没找到，拒绝导入
        if (!foundPlaceNameColumn) {
            return { 
                valid: false, 
                message: '文件格式验证失败：未找到有效的地名列。\n\n要求：\n1. 列名必须包含地名相关关键词（如：名称、地区、城市、省份、区县等）\n2. 该列数据必须主要是中文字符（≥70%）\n3. 数据长度应在2-20个字符之间\n4. 不能主要是数字\n\n请检查文件格式并重新上传。' 
            };
        }

        // 4. 检查数据行数是否合理（至少1行）
        if (data.length < 1) {
            return { valid: false, message: '文件数据行数不足，请确保至少包含1行数据' };
        }

        return { 
            valid: true, 
            message: `验证通过，找到地名列：${placeNameColumn}`,
            placeNameColumn: placeNameColumn
        };
    }

    handleUpload(file) {
        if (!file) {
            console.warn('[DataHub] 未选择文件');
            return;
        }

        // 1. 检查文件扩展名
        const fileName = file.name.toLowerCase();
        const validExtensions = ['.xlsx', '.xls', '.csv'];
        const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));
        
        if (!hasValidExtension) {
            if (window.showToast) {
                window.showToast('文件格式不支持。请上传 .xlsx、.xls 或 .csv 格式的文件', 'error', 4000);
            } else {
                alert('文件格式不支持。请上传 .xlsx、.xls 或 .csv 格式的文件');
            }
            const fileInput = document.getElementById('dh-input');
            if (fileInput) {
                fileInput.value = '';
            }
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                this.data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
                
                if (this.data.length > 0) {
                    this.headers = Object.keys(this.data[0]);
                    
                    // 2. 验证文件格式（包括地名列检查）
                    const validation = this.validateFileFormat(this.data, this.headers);
                    
                    if (!validation.valid) {
                        if (window.showToast) {
                            window.showToast(validation.message, 'error', 4000);
                        } else {
                            alert(validation.message);
                        }
                        console.warn('[DataHub] 文件格式验证失败:', validation.message);
                        // 重置文件输入框
                        const fileInput = document.getElementById('dh-input');
                        if (fileInput) {
                            fileInput.value = '';
                        }
                        return;
                    }
                    
                    // 【关键】：成功导入数据后，清除漫游模式的颜色和升降状态
                    this.clearRoamModeEffects();
                    
                    // 显示成功提示
                    if (window.showToast) {
                        window.showToast(`数据导入成功！共导入 ${this.data.length} 条记录`, 'success', 3000);
                    }
                    
                    // 【关键】数据导入成功后，立即禁用加载项目按钮
                    if (window.updateLoadProjectButtonState) {
                        window.updateLoadProjectButtonState();
                    }
                    
                    this.open();
                    document.getElementById('manage-data-box').classList.remove('hidden');
                    this.switchTab('table');
                } else {
                    console.warn('[DataHub] 导入的数据为空');
                    if (window.showToast) {
                        window.showToast('导入的文件中没有数据，请检查文件格式', 'warning', 4000);
                    } else {
                        alert('导入的文件中没有数据，请检查文件格式');
                    }
                    // 重置文件输入框
                    const fileInput = document.getElementById('dh-input');
                    if (fileInput) {
                        fileInput.value = '';
                    }
                }
            } catch (error) {
                console.error('[DataHub] 文件解析失败:', error);
                if (window.showToast) {
                    window.showToast('文件解析失败，请确保文件格式正确（.xlsx、.xls 或 .csv），且文件未损坏', 'error', 4000);
                } else {
                    alert('文件解析失败，请确保文件格式正确（.xlsx、.xls 或 .csv），且文件未损坏');
                }
                // 重置文件输入框
                const fileInput = document.getElementById('dh-input');
                if (fileInput) {
                    fileInput.value = '';
                }
            }
        };
        
        reader.onerror = (error) => {
            console.error('[DataHub] 文件读取失败:', error);
            if (window.showToast) {
                window.showToast('文件读取失败，请重试', 'error', 4000);
            } else {
                alert('文件读取失败，请重试');
            }
            // 重置文件输入框
            const fileInput = document.getElementById('dh-input');
            if (fileInput) {
                fileInput.value = '';
            }
        };
        
        reader.readAsArrayBuffer(file);
    }
}