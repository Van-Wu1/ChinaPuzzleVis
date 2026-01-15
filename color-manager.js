class ColorManager {
    constructor(map, drawingTools) {
        this.map = map;
        this.drawingTools = drawingTools;
        this.currentTargetId = null;
        this.activeContext = 'feature';
        this.activePaletteMode = 1;

        this.presets = {
            '中国红': ['#fff1f0', '#ffccc7', '#ffa39e', '#f5222d', '#cf1322', '#a8071a', '#820014'],
            '商务蓝': ['#e6f7ff', '#bae7ff', '#91d5ff', '#1890ff', '#096dd9', '#0050b3', '#003a8c'],
            '明艳黄': ['#feffe6', '#ffffb8', '#fffb8f', '#fadb14', '#d4b106', '#ad8b00', '#876800'],
            '活力橙': ['#fff7e6', '#ffe7ba', '#ffd591', '#fa8c16', '#d46b08', '#ad4e00', '#873800'],
            '丁香紫': ['#f9f0ff', '#efdbff', '#d3adf7', '#722ed1', '#531dab', '#391085', '#22075e'],
            '自然绿': ['#f6ffed', '#d9f7be', '#b7eb8f', '#52c41a', '#389e0d', '#237804', '#135200'],
            '莫兰迪': ['#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#1e293b'],
            '深邃咖': ['#efebe9', '#d7ccc8', '#bcaaa4', '#8d6e63', '#6d4c41', '#4e342e', '#3e2723'],
            '高级灰': ['#f5f5f7', '#e5e5e5', '#d2d2d7', '#86868b', '#424245', '#1d1d1f', '#000000']
        };

        // 关键：确保全局可访问，防止 HTML 中的 onclick 失效
        window.colorMgr = this;
    }

    /**
     * 获取当前选中目标的真实颜色
     */
    _getCurrentColor() {
        if (this.activeContext === 'feature' && this.currentTargetId) {
            const state = this.map.getFeatureState({ source: 'china-source', id: this.currentTargetId });
            return state.customColor || '#0071e3';
        } else if (this.activeContext === 'background') {
            return document.getElementById('bg-custom-picker')?.value || '#f0f0f2';
        } else if (this.activeContext === 'tool' && window.dt) {
            const obj = window.dt.objects.find(o => o.id === window.dt.selectedId);
            return obj ? obj.color : '#0071e3';
        }
        return '#0071e3';
    }

    setContext(context, id = null) {
        this.activeContext = context;
        if (id !== null) this.currentTargetId = id;

        // 切换 context 时，更新标题
        if (context !== 'tool') {
            const nameEl = document.getElementById('target-feature-name');
            const titleMap = { 'feature': '区域颜色定制', 'background': '背景底色定制' };
            if (nameEl) nameEl.innerText = titleMap[context] || '调色盘';
        }

        this._renderPaletteUI();
    }

    updateColor(color) {
        if (!color) return;

        if (this.activeContext === 'feature' && this.currentTargetId !== null) {
            this.map.setFeatureState({ source: 'china-source', id: this.currentTargetId }, { customColor: color });
        } else if (this.activeContext === 'background') {
            document.body.style.background = color;
            if (this.map.getLayer('background-layer')) {
                this.map.setPaintProperty('background-layer', 'background-color', color);
            }
            const bgPicker = document.getElementById('bg-custom-picker');
            if (bgPicker) bgPicker.value = color;
        } else if (this.activeContext === 'tool') {
            if (window.dt) window.dt.updateObjProperty('color', color);
        }

        // 实时更新自定义模式下的文字显示
        const hexLab = document.getElementById('palette-hex-label');
        if (hexLab) hexLab.innerText = color.toUpperCase();
    }

    switchPaletteMode(mode) {
        this.activePaletteMode = mode;
        this._renderPaletteUI();
    }

    _renderPaletteUI() {
        const isTool = (this.activeContext === 'tool');
        const containerId = isTool ? 'tool-palette-container' : 'palette-container';
        const container = document.getElementById(containerId);
        if (!container) return;

        // 渲染前实时抓取目标当前颜色
        const activeColor = this._getCurrentColor().toLowerCase();

        let html = `
            <div class="palette-component space-y-3">
                <div class="flex gap-4 border-b border-black/[0.05] pb-1.5 mb-3">
                    <button onclick="window.colorMgr.switchPaletteMode(1)" 
                        class="text-[10px] font-bold transition-colors ${this.activePaletteMode === 1 ? 'text-indigo-600' : 'text-gray-400'}">
                        预设色系
                    </button>
                    <button onclick="window.colorMgr.switchPaletteMode(2)" 
                        class="text-[10px] font-bold transition-colors ${this.activePaletteMode === 2 ? 'text-indigo-600' : 'text-gray-400'}">
                        自定义
                    </button>
                </div>
                <div class="palette-content animate-in fade-in duration-300">
        `;

        if (this.activePaletteMode === 1) {
            html += `<div class="grid grid-cols-1 gap-3">`;
            for (const [group, colors] of Object.entries(this.presets)) {
                html += `
                    <div class="space-y-1.5">
                        <div class="text-[9px] text-gray-400 font-bold uppercase tracking-wider">${group}</div>
                        <div class="flex gap-2">
                            ${colors.map(c => {
                    const isCurrent = c.toLowerCase() === activeColor;
                    return `<div onclick="window.colorMgr.updateColor('${c}')" 
                                     class="w-6 h-6 rounded-full border cursor-pointer hover:scale-110 transition-all shadow-sm ${isCurrent ? 'ring-2 ring-indigo-500 ring-offset-1 border-transparent' : 'border-black/5'}" 
                                     style="background: ${c}"></div>`;
                }).join('')}
                        </div>
                    </div>`;
            }
            html += `</div>`;
        } else {
            html += `
                <div class="flex flex-col gap-3 py-1">
                    <div class="flex justify-between items-center">
                        <label class="text-[9px] text-gray-400 font-bold uppercase">自由取色</label>
                        <span id="palette-hex-label" class="text-[10px] font-mono text-indigo-500 font-bold">${activeColor.toUpperCase()}</span>
                    </div>
                    <input type="color" value="${activeColor}" 
                           oninput="window.colorMgr.updateColor(this.value)" 
                           class="w-full h-10 rounded-xl cursor-pointer border-none bg-white shadow-sm">
                </div>`;
        }

        html += `</div></div>`;
        container.innerHTML = html;

        // 显隐逻辑
        if (isTool) {
            document.getElementById('tool-palette-anchor')?.classList.remove('hidden');
        } else {
            document.getElementById('feature-customization')?.classList.remove('hidden');
        }
    }

    setBackgroundMode(mode) {
        this.bgMode = mode;
        document.getElementById('tab-osm').classList.toggle('active', mode === 'osm');
        document.getElementById('tab-solid').classList.toggle('active', mode === 'solid');
        this.map.setPaintProperty('base-layer', 'raster-opacity', mode === 'osm' ? 0.4 : 0);

        if (mode === 'solid') {
            this.setContext('background');
            const currentColor = document.getElementById('bg-custom-picker')?.value || '#f0f0f2';
            this.updateColor(currentColor);
        } else {
            document.body.style.background = '#f0f0f2';
            if (this.map.getLayer('background-layer')) {
                this.map.setPaintProperty('background-layer', 'background-color', '#f0f0f2');
            }
            if (this.activeContext === 'background') this.hideCustomizer();
        }
    }

    hideCustomizer() {
        const panel = document.getElementById('feature-customization');
        if (panel) panel.classList.add('hidden');
        this.currentTargetId = null;
    }
}