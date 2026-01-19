/**
 * DataHub - 拼图中国外部数据管理中心 (增强修复版)
 * 解决：漫游模式颜色损坏、容器不自适应、表格内容穿透
 */

const COLOR_SCHEMES = {
    'Blue-Sky': ['#e0f2fe', '#7dd3fc', '#0ea5e9', '#0369a1', '#075985'],
    'Sunset-Orange': ['#fff7ed', '#ffedd5', '#fed7aa', '#fdba74', '#fb923c', '#f97316', '#ea580c'],
    'Viridis-Eco': ['#f0fdf4', '#bbf7d0', '#4ade80', '#22c55e', '#16a34a', '#15803d'],
    'Magma-Red': ['#fff1f2', '#fecdd3', '#fda4af', '#fb7185', '#f43f5e', '#e11d48', '#be123c'],
    'ArcGIS-Hybrid': ['#edf8fb', '#b3cde3', '#8c96c6', '#8856a7', '#810f7c']
};

class DataHub {
    constructor() {
        this.data = [];
        this.headers = [];
        this.currentField = null;
        this.currentScheme = 'Blue-Sky';
        this.isFuzzy = true;
    }

    init() {
        const template = `
            <div id="data-hub-panel" style="display: flex; flex-direction: column;">
                <div id="panel-resizer" class="dh-drag-handle" style="height: 12px; width: 100%; cursor: ns-resize; flex-shrink: 0; display: flex; justify-content: center; align-items: center;">
                    <div class="w-12 h-1 bg-gray-300/60 rounded-full"></div>
                </div>
                
                <div class="dh-tabs" style="flex-shrink: 0;">
                    <div class="dh-tab-btn active" id="tab-btn-table" onclick="hub.switchTab('table')">
                        <span class="mr-1.5"></span>属性表
                    </div>
                    <div class="dh-tab-btn" id="tab-btn-symbology" onclick="hub.switchTab('symbology')">
                        <span class="mr-1.5"></span>符号系统
                    </div>
                    <div style="flex:1"></div>
                    <button onclick="hub.reset()" class="text-[11px] font-bold text-gray-400 hover:text-red-500 transition-colors mr-5 tracking-wider uppercase">重置数据</button>
                    <div onclick="hub.close()" class="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100/80 hover:bg-gray-200 cursor-pointer transition-all">
                        <span class="text-gray-500 text-xs">✕</span>
                    </div>
                </div>

                <div id="dh-content-area" class="dh-content" style="flex: 1; overflow: hidden; padding: 20px;">
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
            if (newHeight > 240 && newHeight < window.innerHeight * 0.85) {
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
            <div style="height: 100%; display: flex; flex-direction: column;">
                <div style="flex: 1; overflow: auto; border-radius: 12px; border: 1px solid rgba(0,0,0,0.05);">
                    <table class="dh-table" style="width: 100%; border-collapse: separate; border-spacing: 0;">
                        <thead style="position: sticky; top: 0; z-index: 20; background: #f9fafb; box-shadow: 0 1px 0 rgba(0,0,0,0.05);">
                            <tr>
                                ${this.headers.map(h => `<th style="padding: 12px 16px; text-align: left; font-size: 12px; color: #9ca3af;">${h}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody style="background: white;">
                            ${this.data.map(row => `
                                <tr style="border-bottom: 1px solid #f3f4f6;">
                                    ${this.headers.map(h => `<td style="padding: 12px 16px; font-size: 13px; color: #4b5563;">${row[h] || '-'}</td>`).join('')}
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
        const numericFields = this.headers.filter(h => !isNaN(parseFloat(this.data[0][h])));
        let html = `
            <div style="display: flex; gap: 30px; height: 100%; align-items: stretch;">
                <div style="width: 280px; flex-shrink: 0;" class="space-y-6">
                    <div>
                        <label class="block text-[11px] font-bold text-gray-400 mb-3 uppercase tracking-wider">1. 核心分析指标</label>
                        <select id="field-select" class="w-full p-3 border-none rounded-2xl text-sm bg-gray-100 outline-none focus:ring-2 focus:ring-blue-500" 
                                onchange="hub.applySymbology(this.value, hub.currentScheme)">
                            <option value="">-- 请选择指标 --</option>
                            ${numericFields.map(f => `<option value="${f}" ${this.currentField === f ? 'selected' : ''}>${f}</option>`).join('')}
                        </select>
                    </div>
                    <div class="flex items-center gap-3 p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
                        <input type="checkbox" id="fuzzy-toggle" ${this.isFuzzy ? 'checked' : ''} onchange="hub.isFuzzy = this.checked" class="w-4 h-4 text-blue-600"> 
                        <label for="fuzzy-toggle" class="text-xs font-bold text-blue-700 cursor-pointer">启用名称模糊匹配</label>
                    </div>
                </div>

                <div style="flex: 1; display: flex; flex-direction: column; min-height: 0;">
                    <label class="block text-[11px] font-bold text-gray-400 mb-2 uppercase tracking-wider">2. 视觉色板选择</label>
                    <div class="custom-scroll" style="flex: 1; overflow-y: auto; padding-right: 8px;">
                        <div style="display: grid; gap: 8px;">
                            ${Object.keys(COLOR_SCHEMES).map(name => {
            const isActive = this.currentScheme === name;
            const gradient = `linear-gradient(to right, ${COLOR_SCHEMES[name].join(', ')})`;
            return `
                                    <div onclick="hub.applySymbology(document.getElementById('field-select').value, '${name}')" 
                                         class="p-3 rounded-2xl cursor-pointer transition-all border ${isActive ? 'bg-white shadow-lg border-blue-500/30' : 'bg-gray-50/50 border-transparent hover:bg-white'}">
                                        <div class="flex items-center justify-between mb-2 text-[10px] font-bold">
                                            <span class="${isActive ? 'text-blue-600' : 'text-gray-500'}">${name}</span>
                                            ${isActive ? '<span>●</span>' : ''}
                                        </div>
                                        <div class="w-full h-2.5 rounded-full" style="background: ${gradient}"></div>
                                    </div>
                                `;
        }).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('dh-content-area').innerHTML = html;
    }

    // 核心渲染逻辑：修正颜色损坏问题
    applySymbology(fieldName, schemeName) {
        if (!fieldName) return;
        this.currentField = fieldName;
        this.currentScheme = schemeName || this.currentScheme;
        const colors = COLOR_SCHEMES[this.currentScheme];

        const values = this.data.map(d => parseFloat(d[fieldName])).filter(v => !isNaN(v));
        if (values.length === 0) return;

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
                const ratio = (max === min) ? 0 : (val - min) / (max - min);

                // 写入【数据专用】属性，不碰漫游属性
                // 提高整体高度：基础高度从70000提高到150000，高度范围从300000提高到450000
                // 最小值：150000（高于默认70000，避免下陷）
                // 最大值：600000（比之前370000更高，视觉效果更明显）
                s.targetH = 150000 + (ratio * 450000);

                const colorIdx = Math.min(Math.floor(ratio * (colors.length - 1)), colors.length - 2);
                const localRatio = (ratio * (colors.length - 1)) - colorIdx;

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

        if (document.getElementById('tab-btn-symbology').classList.contains('active')) {
            this.renderSymbology();
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