/**
 * 3D Drawing Tools Module
 * 包含 3D 箭头、直线、圆圈的绘制与实时编辑功能
 * 优化了 UI 视觉呈现，支持按钮状态自动切换
 */

class DrawingTools {
    constructor(map, options = {}) {
        this.map = map;
        this.height = options.height || 80000;
        this.objects = [];
        this.currentTool = 'line';
        this.mainMode = 'roam';
        this.drawingStart = null;
        this.selectedId = null;

        this.init();
    }

    init() {
        this._setupStyles();
        this._createUI();
        this._initMapLayers();
        this._bindEvents();
    }

    // 1. 内部几何计算核心
    _generator = {
        getMetrics(p1, p2) {
            const dx = p2.lng - p1.lng;
            const dy = p2.lat - p1.lat;
            return { angle: Math.atan2(dy, dx), dist: Math.sqrt(dx * dx + dy * dy) };
        },
        getPt(p, ang, d) { return [p.lng + Math.cos(ang) * d, p.lat + Math.sin(ang) * d]; },
        generate(obj) {
            const { type, p1, p2, width, headSize, shaftScale, id, color, isOutline, outlineWidth } = obj;
            let features = [];
            let realP2 = { lng: p2.lng, lat: p2.lat };

            if (obj.lengthScale !== undefined && obj.lengthScale !== 1.0) {
                const m = this.getMetrics(p1, p2);
                const newDist = m.dist * obj.lengthScale;
                realP2.lng = p1.lng + Math.cos(m.angle) * newDist;
                realP2.lat = p1.lat + Math.sin(m.angle) * newDist;
            }

            if (type === 'line') {
                const { angle } = this.getMetrics(p1, realP2);
                const coords = [
                    this.getPt(p1, angle + Math.PI / 2, width / 2),
                    this.getPt(realP2, angle + Math.PI / 2, width / 2),
                    this.getPt(realP2, angle - Math.PI / 2, width / 2),
                    this.getPt(p1, angle - Math.PI / 2, width / 2),
                    this.getPt(p1, angle + Math.PI / 2, width / 2)
                ];
                features.push({ type: 'Feature', properties: { id, color }, geometry: { type: 'Polygon', coordinates: [coords] } });
            } else if (type === 'arrow') {
                const { angle, dist } = this.getMetrics(p1, realP2);
                const hLen = Math.min(1.5, dist * 0.3) * headSize;
                const hWidth = 1.2 * headSize;
                const sLen = dist * shaftScale;
                const shaftEnd = { lng: p1.lng + Math.cos(angle) * sLen, lat: p1.lat + Math.sin(angle) * sLen };
                const arrowTip = { lng: shaftEnd.lng + Math.cos(angle) * hLen, lat: shaftEnd.lat + Math.sin(angle) * hLen };

                const shaftCoords = [
                    this.getPt(p1, angle + Math.PI / 2, width / 2),
                    this.getPt(shaftEnd, angle + Math.PI / 2, width / 2),
                    this.getPt(shaftEnd, angle - Math.PI / 2, width / 2),
                    this.getPt(p1, angle - Math.PI / 2, width / 2),
                    this.getPt(p1, angle + Math.PI / 2, width / 2)
                ];
                const headCoords = [[arrowTip.lng, arrowTip.lat], this.getPt(shaftEnd, angle + Math.PI / 2, hWidth / 2), this.getPt(shaftEnd, angle - Math.PI / 2, hWidth / 2), [arrowTip.lng, arrowTip.lat]];
                features.push({ type: 'Feature', properties: { id, color }, geometry: { type: 'Polygon', coordinates: [shaftCoords] } });
                features.push({ type: 'Feature', properties: { id, color }, geometry: { type: 'Polygon', coordinates: [headCoords] } });
            } else if (type === 'circle') {
                // 1. 计算 p1 到 p2 的真实地理距离（半径），单位转换为千米
                const from = turf.point([p1.lng, p1.lat]);
                const to = turf.point([realP2.lng, realP2.lat]);
                const radiusInKm = turf.distance(from, to, { units: 'kilometers' }) * (obj.radiusScale || 1.0);

                // 2. 使用 Turf 生成标准的地理圆形 (64个分段保证平滑)
                const options = { steps: 64, units: 'kilometers', properties: { id, color } };
                const circlePoly = turf.circle([p1.lng, p1.lat], radiusInKm, options);

                if (isOutline) {
                    // 3. 如果是空心模式，生成一个半径稍小的内圈
                    const innerRadius = Math.max(0.001, radiusInKm - (outlineWidth || 0.2));
                    const innerCirclePoly = turf.circle([p1.lng, p1.lat], innerRadius, { steps: 64, units: 'kilometers' });

                    // 4. 将内圈坐标作为 Polygon 的第二个线性环（Hole），实现镂空
                    const outerCoords = circlePoly.geometry.coordinates[0];
                    const innerCoords = innerCirclePoly.geometry.coordinates[0].reverse(); // 逆时针实现镂空规范

                    features.push({
                        type: 'Feature',
                        properties: { id, color },
                        geometry: {
                            type: 'Polygon',
                            coordinates: [outerCoords, innerCoords]
                        }
                    });
                } else {
                    // 实心模式直接添加
                    features.push(circlePoly);
                }
            }
            return features;
        }
    };

    // 2. UI 逻辑
    _createUI() {
        const customizer = document.createElement('div');
        customizer.id = 'dt-customizer';
        // 关键点：添加 right-panel 并在 style 中强制指定右侧定位
        customizer.className = 'ui-panel right-panel hidden';
        customizer.style.left = 'auto';  // 清除默认的 left: 20px
        customizer.style.right = '20px'; // 强制靠右

        customizer.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="font-bold text-sm tracking-tight">编辑物体</h3>
            <button id="dt-close-btn" class="w-6 h-6 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors text-gray-400 hover:text-black">✕</button>
        </div>
        <div class="space-y-4" id="dt-props-content"></div>
        
        <div id="tool-palette-anchor" class="pt-4 mt-4 border-t border-black/[0.06] hidden">
            <div id="tool-palette-container"></div>
        </div>

        <div class="pt-5 mt-4 border-t border-black/[0.06]">
            <button id="dt-delete-btn" class="w-full py-2.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl text-[11px] font-bold transition-all active:scale-95">删除该物体</button>
        </div>
    `;
        document.body.appendChild(customizer);

        document.getElementById('dt-close-btn').onclick = () => {
            this.hideCustomizer();
            if (window.colorMgr) window.colorMgr.hideCustomizer();
        };
        document.getElementById('dt-delete-btn').onclick = () => this.deleteSelected();
    }

    _setupStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #dt-customizer {
                position: absolute; top: 20px; right: 20px; background: rgba(255, 255, 255, 0.8);
                backdrop-filter: saturate(180%) blur(20px); padding: 24px; border-radius: 28px;
                border: 1px solid rgba(255, 255, 255, 0.4); width: 260px; z-index: 1000;
                box-shadow: 0 12px 40px rgba(0, 0, 0, 0.08); display: none; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
            .dt-row { margin-bottom: 14px; }
            .dt-row label { display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #86868b; margin-bottom: 6px; font-weight: 500; }
            .dt-range { -webkit-appearance: none; width: 100%; height: 5px; background: rgba(0,0,0,0.06); border-radius: 10px; outline: none; }
            .dt-range::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; background: #fff; border: 0.5px solid rgba(0,0,0,0.1); border-radius: 50%; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.15); transition: transform 0.1s; }
            .dt-range::-webkit-slider-thumb:active { transform: scale(1.1); }
            
            .dt-toggle { 
                display: flex !important; 
                align-items: center; 
                justify-content: space-between; /* 确保文字和开关分居两侧 */
                width: 100%; 
                cursor: pointer; 
                margin-bottom: 8px;
            }
            .dt-toggle input { display: none; }
            .dt-toggle-box { 
                width: 36px; 
                height: 20px; 
                background: #e5e5e7; 
                border-radius: 20px; 
                position: relative; 
                transition: background 0.3s ease; 
                flex-shrink: 0; /* 防止开关被挤压 */
            }
            .dt-toggle-box:after { 
                content: ''; 
                position: absolute; 
                width: 16px; 
                height: 16px; 
                background: white; 
                border-radius: 50%; 
                top: 2px; 
                left: 2px; 
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
                box-shadow: 0 1px 3px rgba(0,0,0,0.15); 
            }
            /* 使用 transform 代替 left，动画更流畅，定位更准 */
            .dt-toggle input:checked + .dt-toggle-box { 
                background: #34c759; 
            }
            .dt-toggle input:checked + .dt-toggle-box:after { 
                transform: translateX(16px); 
            }
            .dt-toggle span {
                font-size: 11px;
                color: #86868b;
                font-weight: 500;
            }

            /* 工具按钮激活态样式 */
            .dt-btn-active {
                background: #1d1d1f !important;
                color: #ffffff !important;
                box-shadow: 0 8px 20px rgba(0,0,0,0.15) !important;
                transform: translateY(-1px);
            }
            .dt-btn-active svg {
                stroke: #ffffff !important;
            }
        `;
        document.head.appendChild(style);
    }

    _renderPropsPanel(obj) {
        const container = document.getElementById('dt-props-content');
        let html = `
            <div class="dt-row">
                <label>物体颜色</label>
                    <button id="dt-color-preview-btn" onclick="colorMgr.setContext('tool')" 
                            class="w-full h-9 rounded-xl border border-black/5 shadow-sm transition-transform hover:scale-[1.02]" 
                            style="background:${obj.color}"></button>
            </div>
        `;

        if (obj.type === 'line') {
            html += `
                <div class="dt-row"><label><span>长度</span><span>${(obj.lengthScale * 100).toFixed(0)}%</span></label>
                <input type="range" class="dt-range" min="0.1" max="3" step="0.1" value="${obj.lengthScale}" id="dt-len-input"></div>
                <div class="dt-row"><label><span>粗细</span><span>${obj.width.toFixed(1)}</span></label>
                <input type="range" class="dt-range" min="0.1" max="2" step="0.1" value="${obj.width}" id="dt-width-input"></div>
            `;
        } else if (obj.type === 'arrow') {
            html += `
                <div class="dt-row"><label><span>箭头柄长</span><span>${(obj.shaftScale * 100).toFixed(0)}%</span></label>
                <input type="range" class="dt-range" min="0.1" max="3" step="0.1" value="${obj.shaftScale}" id="dt-shaft-len-input"></div>
                <div class="dt-row"><label><span>箭头柄粗</span><span>${obj.width.toFixed(1)}</span></label>
                <input type="range" class="dt-range" min="0.1" max="2" step="0.1" value="${obj.width}" id="dt-width-input"></div>
                <div class="dt-row"><label><span>箭头尺寸</span><span>${obj.headSize.toFixed(1)}</span></label>
                <input type="range" class="dt-range" min="0.1" max="3" step="0.1" value="${obj.headSize}" id="dt-head-input"></div>
            `;
        } else if (obj.type === 'circle') {
            html += `
                <div class="dt-row"><label class="dt-toggle"><input type="checkbox" id="dt-outline-toggle" ${obj.isOutline ? 'checked' : ''}><div class="dt-toggle-box"></div><span>空心模式</span></label></div>
                <div class="dt-row"><label><span>整体缩放</span><span>${obj.radiusScale.toFixed(1)}</span></label>
                <input type="range" class="dt-range" min="0.1" max="3" step="0.1" value="${obj.radiusScale}" id="dt-radius-input"></div>
                ${obj.isOutline ? `<div class="dt-row"><label><span>圆环粗细</span><span>${obj.outlineWidth.toFixed(2)}</span></label>
                <input type="range" class="dt-range" min="0.05" max="1" step="0.05" value="${obj.outlineWidth}" id="dt-outline-width-input"></div>` : ''}
            `;
        }
        container.innerHTML = html;

        // 在 drawing-tools.js 的 _renderPropsPanel 方法内
        const bind = (id, key, isFloat = true, isCheck = false) => {
            const el = document.getElementById(id);
            if (!el) return;

            // 找到紧邻的数值显示标签（通常是 label 下的第二个 span）
            const valueDisplay = el.parentElement.querySelector('label span:last-child');

            el.oninput = (e) => {
                const val = isCheck ? e.target.checked : (isFloat ? parseFloat(e.target.value) : e.target.value);

                // 1. 直接更新对象属性
                const obj = this.objects.find(o => o.id === this.selectedId);
                if (obj) {
                    obj[key] = val;

                    // 2. 仅更新地图显示，不重绘整个面板
                    this.refresh();

                    // 3. 手动更新 UI 上的数字显示，不重构 DOM
                    if (valueDisplay && !isCheck) {
                        valueDisplay.innerText = isFloat && key.includes('Scale')
                            ? (val * 100).toFixed(0) + '%'
                            : val.toFixed(obj.type === 'circle' && key === 'outlineWidth' ? 2 : 1);
                    }
                }
            };

            // 特殊处理：如果是开关（Checkbox），切换时可能需要重绘面板以显示/隐藏额外选项
            if (isCheck) {
                el.onchange = () => {
                    const obj = this.objects.find(o => o.id === this.selectedId);
                    if (obj) {
                        this._renderPropsPanel(obj);
                    }
                };
            }
        };

        // bind('dt-color-input', 'color', false);
        bind('dt-len-input', 'lengthScale');
        bind('dt-width-input', 'width');
        bind('dt-shaft-len-input', 'shaftScale');
        bind('dt-head-input', 'headSize');
        bind('dt-radius-input', 'radiusScale');
        bind('dt-outline-toggle', 'isOutline', false, true);
        bind('dt-outline-width-input', 'outlineWidth');

        if (window.colorMgr) {
            window.colorMgr.setContext('tool');
        }

        document.getElementById('dt-customizer').classList.remove('hidden');
    }

    _initMapLayers() {
        this.map.addSource('dt-draw-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        this.map.addSource('dt-preview-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

        this.map.addLayer({
            id: 'dt-draw-layer',
            type: 'fill-extrusion',
            source: 'dt-draw-source',
            paint: {
                'fill-extrusion-color': ['get', 'color'],
                'fill-extrusion-height': this.height,
                'fill-extrusion-base': this.height - 20000,
                'fill-extrusion-opacity': 0.9
            }
        });

        this.map.addLayer({
            id: 'dt-preview-layer',
            type: 'fill-extrusion',
            source: 'dt-preview-source',
            paint: {
                'fill-extrusion-color': '#0071e3',
                'fill-extrusion-height': this.height,
                'fill-extrusion-base': this.height - 20000,
                'fill-extrusion-opacity': 0.4
            }
        });
    }

    _bindEvents() {
        this.map.on('click', (e) => {
            if (this.mainMode !== 'tool') return;
            if (!this.drawingStart) {
                this.drawingStart = e.lngLat;
            } else {
                const newObj = {
                    id: 'obj_' + Date.now(),
                    type: this.currentTool,
                    p1: { lng: this.drawingStart.lng, lat: this.drawingStart.lat },
                    p2: { lng: e.lngLat.lng, lat: e.lngLat.lat },
                    color: '#1d1d1f', width: 0.4, headSize: 1.0, shaftScale: 1.0, lengthScale: 1.0, radiusScale: 1.0, isOutline: false, outlineWidth: 0.2
                };
                this.objects.push(newObj);
                this.refresh();
                this.drawingStart = null;
                this.map.getSource('dt-preview-source').setData({ type: 'FeatureCollection', features: [] });
            }
        });

        this.map.on('contextmenu', (e) => {
            if (this.mainMode !== 'tool') return;
            const features = this.map.queryRenderedFeatures(e.point, { layers: ['dt-draw-layer'] });
            if (features.length > 0) {
                this.selectedId = features[0].properties.id;
                const obj = this.objects.find(o => o.id === this.selectedId);
                this._renderPropsPanel(obj);
                document.getElementById('dt-customizer').style.display = 'block';
            }
        });

        this.map.on('mousemove', (e) => {
            if (this.mainMode === 'tool' && this.drawingStart) {
                const tempObj = { type: this.currentTool, p1: this.drawingStart, p2: e.lngLat, color: '#0071e3', width: 0.4, headSize: 1.0, shaftScale: 1.0, lengthScale: 1.0, radiusScale: 1.0 };
                this.map.getSource('dt-preview-source').setData({ type: 'FeatureCollection', features: this._generator.generate(tempObj) });
            }
            if (this.mainMode === 'tool') {
                const features = this.map.queryRenderedFeatures(e.point, { layers: ['dt-draw-layer'] });
                this.map.getCanvas().style.cursor = features.length > 0 ? 'help' : 'crosshair';
            }
        });
    }

    // 4. 对外 API
    setMainMode(mode) {
        this.mainMode = mode;
        if (mode === 'roam') this.hideCustomizer();
        this.map.getCanvas().style.cursor = mode === 'roam' ? '' : 'crosshair';
    }

    setTool(tool) {
        this.currentTool = tool;
        this.drawingStart = null;

        // 自动管理按钮状态
        const btns = {
            'line': 'tool-line',
            'arrow': 'tool-arrow',
            'circle': 'tool-circle'
        };

        Object.values(btns).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('dt-btn-active');
        });

        const activeEl = document.getElementById(btns[tool]);
        if (activeEl) activeEl.classList.add('dt-btn-active');
    }

    refresh() {
        let allFeatures = [];
        this.objects.forEach(obj => { allFeatures.push(...this._generator.generate(obj)); });
        this.map.getSource('dt-draw-source').setData({ type: 'FeatureCollection', features: allFeatures });
    }

    updateObjProperty(key, value) {
        const obj = this.objects.find(o => o.id === this.selectedId);
        if (!obj) return;

        // 1. 更新内存数据
        obj[key] = value;

        // 2. 更新地图显示
        this.refresh();

        // 3. 局部同步 UI
        if (key === 'color') {
            // 同步颜色预览按钮的背景色
            const colorBtn = document.getElementById('dt-color-preview-btn');
            if (colorBtn) {
                colorBtn.style.background = value;
            }
        } else {
            // 同步滑块的数值文本（防止外部调用修改了数值但滑块没动）
            const inputs = {
                'lengthScale': 'dt-len-input',
                'width': 'dt-width-input',
                'shaftScale': 'dt-shaft-len-input',
                'headSize': 'dt-head-input',
                'radiusScale': 'dt-radius-input',
                'outlineWidth': 'dt-outline-width-input'
            };

            const inputId = inputs[key];
            if (inputId) {
                const el = document.getElementById(inputId);
                if (el) {
                    el.value = value;
                    // 更新旁边的 span 文字
                    const valueDisplay = el.parentElement.querySelector('label span:last-child');
                    if (valueDisplay) {
                        valueDisplay.innerText = key.includes('Scale')
                            ? (value * 100).toFixed(0) + '%'
                            : value.toFixed(obj.type === 'circle' && key === 'outlineWidth' ? 2 : 1);
                    }
                }
            }
        }
    }

    deleteSelected() {
        this.objects = this.objects.filter(o => o.id !== this.selectedId);
        this.refresh();
        this.hideCustomizer();
    }

    clear() { this.objects = []; this.refresh(); this.hideCustomizer(); }
    hideCustomizer() { this.selectedId = null; document.getElementById('dt-customizer').style.display = 'none'; }
}