/**
 * 新手指引组件 - 游戏化引导系统
 * 使用高亮框和步骤指示器引导用户了解基础功能
 */

class Tutorial {
    constructor() {
        this.currentStep = 0;
        this.steps = [
            {
                title: '欢迎使用拼图中国！',
                description: '这是一个交互式 3D 中国地图可视化工具<br>让我们快速了解一下基础功能',
                target: null,
                position: 'center',
                action: null
            },
            {
                title: 'Step 1: 鼠标操作基础',
                description: '<strong>🖱️ 左键点击</strong>：点击地图板块可以升起/降下<br><strong>🖱️ 右键点击</strong>：在板块升起后，右键可以打开颜色定制面板<br><strong>🖱️ 滚轮</strong>：向上滚动放大，向下滚动缩小<br><strong>🖱️ 拖拽</strong>：按住左键拖拽可以平移地图',
                target: '#map',
                position: 'bottom',
                action: null
            },
            {
                title: 'Step 2: 板块升起与自定义',
                description: '1. <strong>左键点击</strong>任意省份，板块会升起<br>2. 升起后，<strong>右键点击</strong>该板块<br>3. 在弹出的定制面板中可以：<br>   • 修改颜色（预设色系或自定义）<br>   • 调整升起高度（100000-500000）<br>   • 调整板块厚度（20000-200000）',
                target: '#map',
                position: 'bottom',
                action: null
            },
            {
                title: 'Step 3: 模式切换',
                description: '切换到工具模式可以绘制线条、箭头和椭圆<br>绘制完成后可以编辑和删除',
                target: '#btn-tool',
                position: 'bottom',
                action: null
            },
            {
                title: 'Step 4: 背景样式切换',
                description: '可以切换两种背景模式：<br><strong>底图模式</strong>：显示 CartoDB Voyager 地图底图<br><strong>单色模式</strong>：纯色背景，点击颜色选择器可自定义背景颜色',
                target: '#tab-osm',
                position: 'bottom',
                action: null
            },
            {
                title: 'Step 5: 导入数据分析',
                description: '点击这里可以导入 Excel 数据<br>系统会自动根据数据生成颜色和高度映射',
                target: null,
                position: 'top', // 改为上方，避免超出屏幕
                action: null
            },
            {
                title: 'Step 6: 区域搜索',
                description: '在这里输入区域名称可以快速定位<br>支持中文和拼音搜索',
                target: '#region-search-input',
                position: 'top', // 改为上方，避免超出屏幕
                action: null
            },
            {
                title: 'Step 7: 导出地图截图',
                description: '点击这里可以导出当前地图为高清 PNG 图片<br>支持 4 倍分辨率，适合用于演示和报告<br>导出时会自动下载到本地',
                target: null,
                position: 'top', // 改为上方，避免超出屏幕
                action: null
            },
            {
                title: 'Step 8: 保存项目',
                description: '完成设置后可以保存项目<br>保存内容包括：地图状态、绘图对象、板块设置等<br>方便下次继续使用',
                target: null,
                position: 'top', // 改为上方，避免超出屏幕
                action: null
            }
        ];
        this.isActive = false;
        this.highlightBox = null;
        this.tooltip = null;
        this.currentTargetElement = null;
        this.positionUpdateHandler = null;
    }

    init() {
        // 检查是否已经完成过教程
        const tutorialCompleted = localStorage.getItem('tutorial_completed');
        if (tutorialCompleted === 'true') {
            console.log('[教程] 检测到已完成状态，跳过显示。如需重新显示，请在控制台执行：localStorage.removeItem("tutorial_completed"); location.reload();');
            return; // 已完成，不显示
        }

        console.log('[教程] 开始初始化新手指引...');

        // 创建引导层
        this.createOverlay();
        this.createTooltip();
        
        // 延迟启动，等待页面加载完成
        setTimeout(() => {
            console.log('[教程] 启动教程');
            this.start();
        }, 1000);
    }

    createOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'tutorial-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 9998;
            pointer-events: none;
            transition: opacity 0.3s ease;
        `;
        document.body.appendChild(overlay);
        this.overlay = overlay;
    }

    createTooltip() {
        const tooltip = document.createElement('div');
        tooltip.id = 'tutorial-tooltip';
        tooltip.style.cssText = `
            position: fixed;
            z-index: 9999;
            background: white;
            border-radius: 16px;
            padding: 24px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 360px;
            pointer-events: auto;
            transform: scale(0.9);
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            max-height: calc(100vh - 40px);
            overflow-y: auto;
        `;
        // 阻止工具提示的事件冒泡到地图，但允许工具提示内部的按钮正常工作
        tooltip.addEventListener('mousedown', (e) => {
            // 只阻止地图区域的事件，不阻止按钮点击
            if (e.target === tooltip || e.target.closest('button')) {
                e.stopPropagation();
            }
        });
        tooltip.addEventListener('mouseup', (e) => {
            if (e.target === tooltip || e.target.closest('button')) {
                e.stopPropagation();
            }
        });
        tooltip.addEventListener('click', (e) => {
            // 允许按钮点击，但阻止事件冒泡到地图
            if (e.target === tooltip || e.target.closest('button')) {
                e.stopPropagation();
            }
        });
        document.body.appendChild(tooltip);
        this.tooltip = tooltip;
    }

    createHighlightBox(element) {
        if (!element) return null;

        const rect = element.getBoundingClientRect();
        const highlight = document.createElement('div');
        highlight.className = 'tutorial-highlight';
        
        // 高亮框始终不拦截事件
        highlight.style.cssText = `
            position: fixed;
            left: ${rect.left - 8}px;
            top: ${rect.top - 8}px;
            width: ${rect.width + 16}px;
            height: ${rect.height + 16}px;
            border: 3px solid #0071e3;
            border-radius: 12px;
            box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5),
                        0 0 0 4px rgba(0, 113, 227, 0.3),
                        inset 0 0 20px rgba(0, 113, 227, 0.2);
            z-index: 9997;
            pointer-events: none;
            animation: tutorial-pulse 2s ease-in-out infinite;
            transition: left 0.2s ease, top 0.2s ease, width 0.2s ease, height 0.2s ease;
        `;
        
        // 地图元素不需要特殊处理，因为overlay已经是pointer-events: none
        // 高亮框也是pointer-events: none，所以地图可以直接点击

        // 添加脉冲动画
        if (!document.getElementById('tutorial-styles')) {
            const style = document.createElement('style');
            style.id = 'tutorial-styles';
            style.textContent = `
                @keyframes tutorial-pulse {
                    0%, 100% { 
                        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5),
                                    0 0 0 4px rgba(0, 113, 227, 0.3),
                                    inset 0 0 20px rgba(0, 113, 227, 0.2);
                    }
                    50% { 
                        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5),
                                    0 0 0 8px rgba(0, 113, 227, 0.5),
                                    inset 0 0 30px rgba(0, 113, 227, 0.3);
                    }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(highlight);
        return highlight;
    }

    // 更新高亮框位置
    updateHighlightBoxPosition() {
        if (!this.highlightBox || !this.currentTargetElement) return;
        
        const rect = this.currentTargetElement.getBoundingClientRect();
        this.highlightBox.style.left = `${rect.left - 8}px`;
        this.highlightBox.style.top = `${rect.top - 8}px`;
        this.highlightBox.style.width = `${rect.width + 16}px`;
        this.highlightBox.style.height = `${rect.height + 16}px`;
        
        // 地图可点击区域已移除，因为overlay和高亮框都是pointer-events: none
    }

    // 设置位置更新监听器
    setupPositionUpdateListeners() {
        // 移除旧的监听器（如果存在）
        if (this.positionUpdateHandler) {
            window.removeEventListener('scroll', this.positionUpdateHandler, true);
            window.removeEventListener('resize', this.positionUpdateHandler);
        }
        
        // 创建新的监听器
        this.positionUpdateHandler = () => {
            this.updateHighlightBoxPosition();
        };
        
        // 添加监听器（使用捕获模式，确保能捕获到所有滚动事件）
        window.addEventListener('scroll', this.positionUpdateHandler, true);
        window.addEventListener('resize', this.positionUpdateHandler);
    }

    // 移除位置更新监听器
    removePositionUpdateListeners() {
        if (this.positionUpdateHandler) {
            window.removeEventListener('scroll', this.positionUpdateHandler, true);
            window.removeEventListener('resize', this.positionUpdateHandler);
            this.positionUpdateHandler = null;
        }
    }

    updateTooltip(step) {
        if (!this.tooltip) return;

        const stepInfo = this.steps[step];
        const stepNumber = step + 1;
        const totalSteps = this.steps.length;

        let targetElement = null;
        if (stepInfo.target) {
            targetElement = document.querySelector(stepInfo.target);
        }

        // 计算工具提示位置（带边界检测）
        let left = '50%';
        let top = '50%';
        let transform = 'translate(-50%, -50%)';

        if (targetElement && stepInfo.position !== 'center') {
            const rect = targetElement.getBoundingClientRect();
            // 动态计算工具提示的实际高度（更准确）
            const tempTooltip = document.createElement('div');
            tempTooltip.style.cssText = 'position: fixed; visibility: hidden; max-width: 360px; padding: 24px;';
            tempTooltip.innerHTML = stepInfo.description;
            document.body.appendChild(tempTooltip);
            const actualHeight = Math.min(tempTooltip.offsetHeight + 100, window.innerHeight - 40); // 加上标题和按钮的高度
            document.body.removeChild(tempTooltip);
            
            const tooltipRect = { width: 360, height: actualHeight };
            const padding = 20; // 边距
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            if (stepInfo.position === 'bottom') {
                let calculatedLeft = rect.left + rect.width / 2;
                let calculatedTop = rect.bottom + 30;
                
                // 如果目标元素是地图，调整位置到地图内部下方
                if (targetElement.id === 'map') {
                    calculatedLeft = rect.left + rect.width / 2;
                    calculatedTop = rect.bottom - 120; // 地图内部，不遮挡
                } else {
                    // 检查高亮框的位置（高亮框在元素周围8px）
                    const highlightBoxBottom = rect.bottom + 8; // 高亮框底部位置
                    const highlightBoxTop = rect.top - 8; // 高亮框顶部位置
                    const minSpacing = 50; // 工具提示和高亮框之间的最小间距
                    
                    // 计算工具提示显示在高亮框下方时的位置
                    const tooltipTopWhenBelow = highlightBoxBottom + minSpacing;
                    const tooltipBottomWhenBelow = tooltipTopWhenBelow + tooltipRect.height;
                    
                    // 计算工具提示显示在高亮框上方时的位置
                    const tooltipTopWhenAbove = highlightBoxTop - tooltipRect.height - minSpacing;
                    
                    // 检查目标元素是否在屏幕下半部分（更可能超出底部）
                    const elementCenterY = rect.top + rect.height / 2;
                    const isInLowerHalf = elementCenterY > viewportHeight * 0.6; // 60%以下算下半部分
                    
                    // 严格检查是否会超出屏幕底部
                    const wouldExceedBottom = tooltipBottomWhenBelow > viewportHeight - padding;
                    const hasSpaceAbove = tooltipTopWhenAbove >= padding;
                    
                    // 如果元素在屏幕下半部分，或者会超出底部，优先显示在上方
                    if ((isInLowerHalf || wouldExceedBottom) && hasSpaceAbove) {
                        calculatedTop = tooltipTopWhenAbove;
                        transform = 'translate(-50%, -100%)';
                    } else if (wouldExceedBottom) {
                        // 如果会超出底部且上方也没有空间，强制显示在屏幕内（底部对齐）
                        calculatedTop = viewportHeight - tooltipRect.height - padding;
                        transform = 'translate(-50%, 0)';
                    } else {
                        // 显示在下方，但需要再次检查确保不会超出屏幕
                        calculatedTop = tooltipTopWhenBelow;
                        const finalBottom = calculatedTop + tooltipRect.height;
                        // 如果底部仍然超出，强制调整到屏幕内
                        if (finalBottom > viewportHeight - padding) {
                            calculatedTop = viewportHeight - tooltipRect.height - padding;
                        }
                        transform = 'translate(-50%, 0)';
                    }
                }
                
                // 水平边界检测
                if (calculatedLeft - tooltipRect.width / 2 < padding) {
                    calculatedLeft = tooltipRect.width / 2 + padding;
                } else if (calculatedLeft + tooltipRect.width / 2 > viewportWidth - padding) {
                    calculatedLeft = viewportWidth - tooltipRect.width / 2 - padding;
                }
                
                // 最终安全检查：确保工具提示完全在屏幕内
                let finalTop = typeof calculatedTop === 'number' ? calculatedTop : parseFloat(calculatedTop) || 0;
                const finalBottom = finalTop + tooltipRect.height;
                if (finalBottom > viewportHeight - padding) {
                    finalTop = viewportHeight - tooltipRect.height - padding;
                } else if (finalTop < padding) {
                    finalTop = padding;
                }
                
                left = `${calculatedLeft}px`;
                top = `${finalTop}px`;
                
            } else if (stepInfo.position === 'top') {
                let calculatedLeft = rect.left + rect.width / 2;
                let calculatedTop = rect.top - tooltipRect.height - 30;
                
                // 检查高亮框的位置（高亮框在元素周围8px）
                const highlightBoxTop = rect.top - 8; // 高亮框顶部位置
                const minSpacing = 50; // 工具提示和高亮框之间的最小间距
                
                // 计算工具提示显示在高亮框上方时的位置
                const tooltipBottomWhenAbove = highlightBoxTop - minSpacing;
                const tooltipTopWhenAbove = tooltipBottomWhenAbove - tooltipRect.height;
                
                // 边界检测：如果工具提示会超出屏幕顶部，改为显示在下方
                if (tooltipTopWhenAbove < padding) {
                    // 改为显示在下方
                    const highlightBoxBottom = rect.bottom + 8;
                    calculatedTop = highlightBoxBottom + minSpacing;
                    transform = 'translate(-50%, 0)';
                    
                    // 检查下方是否也会超出
                    const tooltipBottomWhenBelow = calculatedTop + tooltipRect.height;
                    if (tooltipBottomWhenBelow > viewportHeight - padding) {
                        // 如果下方也超出，强制显示在屏幕内（底部对齐）
                        calculatedTop = viewportHeight - tooltipRect.height - padding;
                        transform = 'translate(-50%, 0)';
                    }
                } else {
                    // 显示在上方
                    calculatedTop = tooltipTopWhenAbove;
                    transform = 'translate(-50%, -100%)';
                }
                
                // 水平边界检测
                if (calculatedLeft - tooltipRect.width / 2 < padding) {
                    calculatedLeft = tooltipRect.width / 2 + padding;
                } else if (calculatedLeft + tooltipRect.width / 2 > viewportWidth - padding) {
                    calculatedLeft = viewportWidth - tooltipRect.width / 2 - padding;
                }
                
                // 最终安全检查：确保工具提示完全在屏幕内
                let finalTop = typeof calculatedTop === 'number' ? calculatedTop : parseFloat(calculatedTop) || 0;
                const finalBottom = finalTop + tooltipRect.height;
                if (finalBottom > viewportHeight - padding) {
                    finalTop = viewportHeight - tooltipRect.height - padding;
                } else if (finalTop < padding) {
                    finalTop = padding;
                }
                
                left = `${calculatedLeft}px`;
                top = `${finalTop}px`;
                
            } else if (stepInfo.position === 'right') {
                let calculatedLeft = rect.right + 30;
                let calculatedTop = rect.top + rect.height / 2;
                
                // 边界检测：如果工具提示会超出屏幕右侧，改为显示在左侧
                if (calculatedLeft + tooltipRect.width + padding > viewportWidth) {
                    calculatedLeft = rect.left - tooltipRect.width - 30;
                    transform = 'translate(-100%, -50%)';
                } else {
                    transform = 'translate(0, -50%)';
                }
                
                // 垂直边界检测
                if (calculatedTop - tooltipRect.height / 2 < padding) {
                    calculatedTop = tooltipRect.height / 2 + padding;
                } else if (calculatedTop + tooltipRect.height / 2 > viewportHeight - padding) {
                    calculatedTop = viewportHeight - tooltipRect.height / 2 - padding;
                }
                
                left = `${calculatedLeft}px`;
                top = `${calculatedTop}px`;
                
            } else if (stepInfo.position === 'left') {
                let calculatedLeft = rect.left - tooltipRect.width - 30;
                let calculatedTop = rect.top + rect.height / 2;
                
                // 边界检测：如果工具提示会超出屏幕左侧，改为显示在右侧
                if (calculatedLeft < padding) {
                    calculatedLeft = rect.right + 30;
                    transform = 'translate(0, -50%)';
                } else {
                    transform = 'translate(-100%, -50%)';
                }
                
                // 垂直边界检测
                if (calculatedTop - tooltipRect.height / 2 < padding) {
                    calculatedTop = tooltipRect.height / 2 + padding;
                } else if (calculatedTop + tooltipRect.height / 2 > viewportHeight - padding) {
                    calculatedTop = viewportHeight - tooltipRect.height / 2 - padding;
                }
                
                left = `${calculatedLeft}px`;
                top = `${calculatedTop}px`;
            }
        }

        this.tooltip.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <div style="font-size: 11px; color: #86868b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">
                            Step ${stepNumber} / ${totalSteps}
                        </div>
                        <div style="font-size: 18px; font-weight: 700; color: #1d1d1f; margin-bottom: 8px;">
                            ${stepInfo.title}
                        </div>
                    </div>
                    <button onclick="window.tutorial.skip()" style="
                        background: none;
                        border: none;
                        font-size: 20px;
                        color: #86868b;
                        cursor: pointer;
                        padding: 0;
                        width: 24px;
                        height: 24px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 50%;
                        transition: all 0.2s;
                    " onmouseover="this.style.background='rgba(0,0,0,0.05)'" onmouseout="this.style.background='none'" title="关闭">
                        ✕
                    </button>
                </div>
                <div style="font-size: 14px; color: #4b5563; line-height: 1.8;">
                    ${stepInfo.description}
                </div>
                <div style="display: flex; gap: 8px; justify-content: space-between; align-items: center; margin-top: 8px;">
                    <button onclick="window.tutorial.skip()" style="
                        padding: 8px 16px;
                        background: transparent;
                        border: 1px solid rgba(0, 0, 0, 0.1);
                        border-radius: 8px;
                        font-size: 13px;
                        font-weight: 600;
                        color: #86868b;
                        cursor: pointer;
                        transition: all 0.2s;
                    " onmouseover="this.style.background='rgba(0,0,0,0.05)'" onmouseout="this.style.background='transparent'">
                        跳过教程
                    </button>
                    <div style="display: flex; gap: 8px;">
                        ${step > 0 ? `
                            <button onclick="window.tutorial.prev()" style="
                                padding: 8px 16px;
                                background: rgba(0, 0, 0, 0.05);
                                border: none;
                                border-radius: 8px;
                                font-size: 13px;
                                font-weight: 600;
                                color: #1d1d1f;
                                cursor: pointer;
                                transition: all 0.2s;
                            " onmouseover="this.style.background='rgba(0,0,0,0.1)'" onmouseout="this.style.background='rgba(0,0,0,0.05)'">
                                上一步
                            </button>
                        ` : ''}
                        <button onclick="window.tutorial.next()" style="
                            padding: 8px 20px;
                            background: #0071e3;
                            border: none;
                            border-radius: 8px;
                            font-size: 13px;
                            font-weight: 600;
                            color: white;
                            cursor: pointer;
                            transition: all 0.2s;
                        " onmouseover="this.style.background='#0077ed'" onmouseout="this.style.background='#0071e3'">
                            ${step === this.steps.length - 1 ? '完成' : '下一步'}
                        </button>
                    </div>
                </div>
            </div>
        `;

        this.tooltip.style.left = left;
        this.tooltip.style.top = top;
        this.tooltip.style.transform = transform;

        // 显示动画前，再次验证位置（防止超出屏幕）
        setTimeout(() => {
            const tooltipRect = this.tooltip.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const padding = 20;
            
            // 如果工具提示底部超出屏幕，向上调整
            if (tooltipRect.bottom > viewportHeight - padding) {
                const newTop = viewportHeight - tooltipRect.height - padding;
                this.tooltip.style.top = `${newTop}px`;
            }
            
            // 如果工具提示顶部超出屏幕，向下调整
            if (tooltipRect.top < padding) {
                this.tooltip.style.top = `${padding}px`;
            }
            
            this.tooltip.style.transform = transform + ' scale(1)';
            this.tooltip.style.opacity = '1';
        }, 10);
    }

    showStep(stepIndex) {
        if (stepIndex < 0 || stepIndex >= this.steps.length) {
            this.complete();
            return;
        }

        this.currentStep = stepIndex;
        const step = this.steps[stepIndex];

        // 清除之前的高亮框
        if (this.highlightBox) {
            this.highlightBox.remove();
            this.highlightBox = null;
        }
        
        // 地图可点击区域已移除
        
        // 移除位置更新监听器
        this.removePositionUpdateListeners();
        this.currentTargetElement = null;

        // 隐藏工具提示
        if (this.tooltip) {
            this.tooltip.style.opacity = '0';
            this.tooltip.style.transform = 'scale(0.9)';
        }

        // 等待动画完成
        setTimeout(() => {
            // 创建新的高亮框
            let targetElement = null;
            if (step.target) {
                targetElement = document.querySelector(step.target);
            } else {
                // 如果没有指定target，根据步骤索引查找元素
                if (stepIndex === 3) {
                    // Step 3: 导入按钮 - 查找包含"导入 Excel"文字的按钮
                    const buttons = document.querySelectorAll('button');
                    for (let btn of buttons) {
                        if (btn.textContent && btn.textContent.includes('导入 Excel')) {
                            targetElement = btn;
                            break;
                        }
                    }
                    // 如果还是找不到，尝试通过 onclick 属性查找
                    if (!targetElement) {
                        const importBtn = document.querySelector('button[onclick*="dh-input"]');
                        if (importBtn) targetElement = importBtn;
                    }
                } else if (stepIndex === 5) {
                    // Step 5: 导入按钮 - 查找包含"导入 Excel"文字的按钮
                    const buttons = document.querySelectorAll('button');
                    for (let btn of buttons) {
                        if (btn.textContent && btn.textContent.includes('导入 Excel')) {
                            targetElement = btn;
                            break;
                        }
                    }
                    // 如果还是找不到，尝试通过 onclick 属性查找
                    if (!targetElement) {
                        const importBtn = document.querySelector('button[onclick*="dh-input"]');
                        if (importBtn) targetElement = importBtn;
                    }
                } else if (stepIndex === 6) {
                    // Step 7: 导出按钮 - 查找包含"导出当前地图"文字的按钮
                    const buttons = document.querySelectorAll('button');
                    for (let btn of buttons) {
                        if (btn.textContent && (btn.textContent.includes('导出当前地图') || btn.textContent.includes('导出'))) {
                            targetElement = btn;
                            break;
                        }
                    }
                    // 如果还是找不到，尝试通过 onclick 属性查找
                    if (!targetElement) {
                        const exportBtn = document.querySelector('button[onclick="exportMap()"]');
                        if (exportBtn) targetElement = exportBtn;
                    }
                } else if (stepIndex === 7) {
                    // Step 8: 保存按钮 - 查找包含"保存项目"文字的按钮
                    const buttons = document.querySelectorAll('button');
                    for (let btn of buttons) {
                        if (btn.textContent && btn.textContent.includes('保存项目')) {
                            targetElement = btn;
                            break;
                        }
                    }
                    // 如果还是找不到，尝试通过 onclick 属性查找
                    if (!targetElement) {
                        const saveBtn = document.querySelector('button[onclick="saveProject()"]');
                        if (saveBtn) targetElement = saveBtn;
                    }
                }
            }

            if (targetElement) {
                console.log(`[教程] Step ${stepIndex + 1} 找到目标元素:`, targetElement);
                this.highlightBox = this.createHighlightBox(targetElement);
                
                // 保存目标元素引用，用于后续更新位置
                this.currentTargetElement = targetElement;
                
                // 滚动到目标元素（如果需要，但不滚动地图）
                if (targetElement.id !== 'map') {
                    // 等待一下再滚动，确保元素已渲染
                    setTimeout(() => {
                        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        // 滚动后更新高亮框位置，然后更新工具提示位置
                        setTimeout(() => {
                            this.updateHighlightBoxPosition();
                            // 重新计算工具提示位置，避免遮挡高亮框
                            this.updateTooltip(stepIndex);
                        }, 500);
                    }, 100);
                }
                
                // 添加窗口滚动和调整大小监听器，实时更新高亮框位置
                this.setupPositionUpdateListeners();
            } else {
                console.warn(`[教程] Step ${stepIndex + 1} 未找到目标元素`);
            }

            // 更新工具提示（如果高亮框已创建，会在位置计算时考虑高亮框）
            this.updateTooltip(stepIndex);

            // 如果有自定义动作，执行它
            if (step.action && typeof step.action === 'function') {
                step.action().then(() => {
                    // 动作完成后自动进入下一步
                    setTimeout(() => this.next(), 500);
                });
            }
        }, 300);
    }

    start() {
        this.isActive = true;
        this.showStep(0);
    }

    next() {
        if (this.currentStep < this.steps.length - 1) {
            this.showStep(this.currentStep + 1);
        } else {
            this.complete();
        }
    }

    prev() {
        if (this.currentStep > 0) {
            this.showStep(this.currentStep - 1);
        }
    }

    skip() {
        this.complete();
    }

    complete() {
        this.isActive = false;
        
        // 保存完成状态
        localStorage.setItem('tutorial_completed', 'true');

        // 淡出动画
        if (this.overlay) {
            this.overlay.style.opacity = '0';
        }
        if (this.tooltip) {
            this.tooltip.style.opacity = '0';
            this.tooltip.style.transform = 'scale(0.9)';
        }
        if (this.highlightBox) {
            this.highlightBox.style.opacity = '0';
        }

        // 移除位置更新监听器
        this.removePositionUpdateListeners();
        
        // 移除元素
        setTimeout(() => {
            if (this.overlay) this.overlay.remove();
            if (this.tooltip) this.tooltip.remove();
            if (this.highlightBox) this.highlightBox.remove();
            this.currentTargetElement = null;
        }, 300);
    }

    // 重置教程（用于测试或重新显示）
    reset() {
        localStorage.removeItem('tutorial_completed');
        // 移除位置更新监听器
        this.removePositionUpdateListeners();
        // 如果已经有实例在运行，先清理
        if (this.overlay) this.overlay.remove();
        if (this.tooltip) this.tooltip.remove();
        if (this.highlightBox) this.highlightBox.remove();
        this.currentTargetElement = null;
        // 重新初始化
        this.init();
    }
}

// 全局暴露
window.Tutorial = Tutorial;

// 添加全局便捷函数，方便在控制台调用
window.restartTutorial = function() {
    localStorage.removeItem('tutorial_completed');
    if (window.tutorial) {
        window.tutorial.reset();
    } else {
        window.tutorial = new Tutorial();
        window.tutorial.init();
    }
    console.log('✅ 教程已重置，正在重新显示...');
};
