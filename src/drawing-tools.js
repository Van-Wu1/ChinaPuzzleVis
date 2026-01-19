/**
 * 3D Drawing Tools Module - 增强版
 * 包含 3D 箭头、直线、椭圆的绘制与实时编辑功能
 * 支持：椭圆旋转、弯曲箭头、箭头粗细渐变
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
        this.controlHandles = []; // 控制点数组
        this.isDragging = false;
        this.dragHandleIndex = null;
        this.controlBox = null; // 控制框

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
        // 将 hex 颜色转换为 rgba，支持调整透明度
        hexToRgba(hex, alpha = 1.0) {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        },
        getMetrics(p1, p2) {
            const dx = p2.lng - p1.lng;
            const dy = p2.lat - p1.lat;
            return { angle: Math.atan2(dy, dx), dist: Math.sqrt(dx * dx + dy * dy) };
        },
        getPt(p, ang, d) { return [p.lng + Math.cos(ang) * d, p.lat + Math.sin(ang) * d]; },
        
        // 三次贝塞尔曲线点计算（更平滑，类似 PowerPoint）
        cubicBezierPoint(p0, cp1, cp2, p1, t) {
            const u = 1 - t;
            const tt = t * t;
            const uu = u * u;
            const uuu = uu * u;
            const ttt = tt * t;
            
            const x = uuu * p0[0] + 3 * uu * t * cp1[0] + 3 * u * tt * cp2[0] + ttt * p1[0];
            const y = uuu * p0[1] + 3 * uu * t * cp1[1] + 3 * u * tt * cp2[1] + ttt * p1[1];
            return [x, y];
        },
        
        // 计算三次贝塞尔曲线的切线角度
        cubicBezierTangent(p0, cp1, cp2, p1, t) {
            const u = 1 - t;
            const uu = u * u;
            const tt = t * t;
            
            const dx = 3 * uu * (cp1[0] - p0[0]) + 6 * u * t * (cp2[0] - cp1[0]) + 3 * tt * (p1[0] - cp2[0]);
            const dy = 3 * uu * (cp1[1] - p0[1]) + 6 * u * t * (cp2[1] - cp1[1]) + 3 * tt * (p1[1] - cp2[1]);
            return Math.atan2(dy, dx);
        },
        
        // 生成椭圆坐标（支持旋转，使用地理坐标系统）
        generateEllipse(center, majorAxisKm, minorAxisKm, rotation, steps = 64) {
            const coords = [];
            const centerPoint = turf.point([center.lng, center.lat]);
            
            for (let i = 0; i <= steps; i++) {
                const angle = (i / steps) * 2 * Math.PI;
                // 椭圆参数方程（在局部坐标系中）
                const x = majorAxisKm * Math.cos(angle);
                const y = minorAxisKm * Math.sin(angle);
                // 应用旋转
                const rotatedX = x * Math.cos(rotation) - y * Math.sin(rotation);
                const rotatedY = x * Math.sin(rotation) + y * Math.cos(rotation);
                
                // 使用 Turf 计算地理坐标（考虑地球曲率）
                // 先计算到中心的距离和方位角
                const dist = Math.sqrt(rotatedX * rotatedX + rotatedY * rotatedY);
                // bearing 需要转换为度数（0-360度，从正北方向顺时针）
                // Math.atan2 返回的是从正东方向逆时针的角度（弧度）
                // 需要转换为从正北方向顺时针的角度（度数）
                const bearingRad = Math.atan2(rotatedX, rotatedY); // 注意：x和y交换，因为地理坐标系中x是经度（东西），y是纬度（南北）
                const bearingDeg = (bearingRad * 180 / Math.PI + 360) % 360; // 转换为度数并确保在0-360范围内
                
                // 使用 Turf 的 destination 函数计算目标点
                const destination = turf.destination(centerPoint, dist, bearingDeg, { units: 'kilometers' });
                coords.push(destination.geometry.coordinates);
            }
            return coords;
        },
        
        generate(obj) {
            const { type, p1, p2, width, id, color } = obj;
            let features = [];
            let realP2 = { lng: p2.lng, lat: p2.lat };

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
            } 
            else if (type === 'arrow') {
                // 如果开启了弯曲模式，统一使用弯曲箭头逻辑（curveAmount=0时也是直线，但逻辑一致避免突变）
                if (obj.isCurved) {
                    // 弯曲箭头：沿曲线生成“可填充”的多边形箭杆 + 三角箭头
                    // 说明：之前用 turf.buffer（单位是 km）会和直线箭头的“度坐标偏移”单位混用，
                    // 导致一弯曲就变成极细的线，且头部容易消失/跑飞。这里统一用经纬度偏移生成多边形。
                    const start = [p1.lng, p1.lat];
                    const end = [realP2.lng, realP2.lat];
                    
                    // 计算控制点
                    const fromPt = turf.point(start);
                    const toPt = turf.point(end);
                    const geoDist = turf.distance(fromPt, toPt, { units: 'kilometers' });
                    const curveAmount = obj.curveAmount || 0;
                    const curveDist = geoDist * Math.abs(curveAmount);
                    
                    // 计算中点并垂直偏移
                    // curveAmount > 0: 向左弯曲（bearing - 90）
                    // curveAmount < 0: 向右弯曲（bearing + 90）
                    // curveAmount = 0: 不弯曲（直线，控制点在中点）
                    const midPoint = turf.midpoint(fromPt, toPt);
                    const bearing = turf.bearing(fromPt, toPt);
                    const curveDirection = curveAmount >= 0 ? -90 : 90; // 调换方向
                    const controlPoint = turf.destination(midPoint, curveDist, bearing + curveDirection, { units: 'kilometers' });
                    
                    // 生成二次贝塞尔曲线点（使用简单方法）
                    const curveSteps = 30;
                    const curvePoints = [];
                    for (let i = 0; i <= curveSteps; i++) {
                        const t = i / curveSteps;
                        const u = 1 - t;
                        const x = u * u * start[0] + 2 * u * t * controlPoint.geometry.coordinates[0] + t * t * end[0];
                        const y = u * u * start[1] + 2 * u * t * controlPoint.geometry.coordinates[1] + t * t * end[1];
                        curvePoints.push([x, y]);
                    }
                    
                    // 取 85% 作为箭头起点，其前为箭杆
                    const shaftEndIndex = Math.max(2, Math.floor(curveSteps * 0.85));
                    const shaftPts = curvePoints.slice(0, shaftEndIndex + 1);
                    const headStart = curvePoints[shaftEndIndex];
                    const headEnd = curvePoints[curveSteps];

                    // 箭杆：沿曲线逐点求切线方向并左右偏移，分成多个小段实现透明度渐变
                    const tailWidth = obj.tailWidth || width;
                    const midWidth = obj.midWidth || (width * 0.3);
                    
                    // 提前计算头部参数，供尾部逻辑使用
                    const headAng = Math.atan2(headEnd[1] - headStart[1], headEnd[0] - headStart[0]);
                    const m = this.getMetrics(p1, realP2);
                    const headHeightScale = obj.headHeightScale ?? 1.0;
                    const headBaseScale = obj.headBaseScale ?? 1.0;
                    const hWidth = 1.2 * headBaseScale;
                    
                    // 准备所有点的信息（位置、宽度、切线角度）
                    const shaftPointData = [];
                    for (let i = 0; i < shaftPts.length; i++) {
                        const pt = shaftPts[i];
                        const prev = shaftPts[Math.max(0, i - 1)];
                        const next = shaftPts[Math.min(shaftPts.length - 1, i + 1)];
                        const ang = Math.atan2(next[1] - prev[1], next[0] - prev[0]);
                        
                        const t = i / (shaftPts.length - 1);
                        const currentWidth = tailWidth * (1 - t) + midWidth * t;
                        const p = { lng: pt[0], lat: pt[1] };
                        
                        shaftPointData.push({
                            point: p,
                            width: currentWidth,
                            angle: ang,
                            t: t
                        });
                    }
                    
                    // 计算最后一个梯形的左上角和右上角（用于延长方向计算）
                    // 最后一个梯形是靠近尾部那侧的间隔一个宽度的梯形，也就是第二个段（i === 1）的 p1 点
                    // 尾部第一段是 i === 0，所以第二个段是 shaftPointData[1]
                    const secondSegmentP1 = shaftPointData[1]; // 第二个段的 p1（靠近尾部那侧间隔一个宽度）
                    const lastTrapezoidTopLeft = this.getPt(secondSegmentP1.point, secondSegmentP1.angle + Math.PI / 2, secondSegmentP1.width / 2);
                    const lastTrapezoidTopRight = this.getPt(secondSegmentP1.point, secondSegmentP1.angle - Math.PI / 2, secondSegmentP1.width / 2);
                    
                    // 将箭杆分成多个小段，每段有不同的透明度
                    for (let i = 0; i < shaftPointData.length - 1; i++) {
                        const p1_seg = shaftPointData[i];
                        const p2_seg = shaftPointData[i + 1];
                        
                        // 透明度渐变：从头部（t=1，alpha=1.0）到尾部（t=0，alpha=0.25）
                        // 使用段的中间位置计算透明度
                        const t_mid = (p1_seg.t + p2_seg.t) / 2;
                        const alpha = 0.25 + (1.0 - 0.25) * t_mid; // t=1时alpha=1.0（头部实心），t=0时alpha=0.25（尾部半透明）
                        // 如果alpha接近1.0，直接使用原始颜色避免颜色转换误差
                        const segmentColor = alpha >= 0.99 ? color : this.hexToRgba(color, alpha);
                        
                        // 如果是尾部第一段（i === 0），添加尾部延长效果
                        if (i === 0) {
                            // 获取尾部第一段的左右点（对应 topLeft 和 topRight）
                            const tailLeft = this.getPt(p1_seg.point, p1_seg.angle + Math.PI / 2, p1_seg.width / 2);  // 尾部左侧（topLeft）
                            const tailRight = this.getPt(p1_seg.point, p1_seg.angle - Math.PI / 2, p1_seg.width / 2); // 尾部右侧（topRight）
                            
                            // 计算尾部中点
                            const tailMidPoint = {
                                lng: (tailLeft[0] + tailRight[0]) / 2,
                                lat: (tailLeft[1] + tailRight[1]) / 2
                            };
                            
                            // 获取尾巴长度参数（默认值为 tailWidth 的 0.5 倍）
                            const tailLength = (obj.tailLength || 0.5) * tailWidth;
                            
                            // 计算从最后一个梯形左上角到尾部左侧的方向，向外延长
                            const leftDir = Math.atan2(tailLeft[1] - lastTrapezoidTopLeft[1], tailLeft[0] - lastTrapezoidTopLeft[0]);
                            const extendedLeft = [
                                tailLeft[0] + Math.cos(leftDir) * tailLength,
                                tailLeft[1] + Math.sin(leftDir) * tailLength
                            ];
                            
                            // 计算从最后一个梯形右上角到尾部右侧的方向，向外延长
                            const rightDir = Math.atan2(tailRight[1] - lastTrapezoidTopRight[1], tailRight[0] - lastTrapezoidTopRight[0]);
                            const extendedRight = [
                                tailRight[0] + Math.cos(rightDir) * tailLength,
                                tailRight[1] + Math.sin(rightDir) * tailLength
                            ];
                            
                            // 构建两个三角形：左三角形和右三角形
                            // 左三角形：尾部左侧 -> 延长左侧点 -> 尾部中点 -> 尾部左侧
                            features.push({
                                type: 'Feature',
                                properties: { id, color: segmentColor },
                                geometry: {
                                    type: 'Polygon',
                                    coordinates: [[tailLeft, extendedLeft, [tailMidPoint.lng, tailMidPoint.lat], tailLeft]]
                                }
                            });
                            
                            // 右三角形：尾部右侧 -> 延长右侧点 -> 尾部中点 -> 尾部右侧
                            features.push({
                                type: 'Feature',
                                properties: { id, color: segmentColor },
                                geometry: {
                                    type: 'Polygon',
                                    coordinates: [[tailRight, extendedRight, [tailMidPoint.lng, tailMidPoint.lat], tailRight]]
                                }
                            });
                        }
                        
                        // 构建该段的四边形
                        const segCoords = [
                            this.getPt(p1_seg.point, p1_seg.angle + Math.PI / 2, p1_seg.width / 2),
                            this.getPt(p2_seg.point, p2_seg.angle + Math.PI / 2, p2_seg.width / 2),
                            this.getPt(p2_seg.point, p2_seg.angle - Math.PI / 2, p2_seg.width / 2),
                            this.getPt(p1_seg.point, p1_seg.angle - Math.PI / 2, p1_seg.width / 2),
                            this.getPt(p1_seg.point, p1_seg.angle + Math.PI / 2, p1_seg.width / 2)
                        ];
                        
                        features.push({
                            type: 'Feature',
                            properties: { id, color: segmentColor },
                            geometry: { type: 'Polygon', coordinates: [segCoords] }
                        });
                    }

                    // 头部：用最后一段方向生成三角形（底边/高度分别可控）
                    // headAng 和 hWidth 已在上面计算
                    const hLen = Math.min(1.5, m.dist * 0.3) * headHeightScale;

                    const tip = [headEnd[0] + Math.cos(headAng) * hLen, headEnd[1] + Math.sin(headAng) * hLen];
                    const baseLeft = this.getPt({ lng: headStart[0], lat: headStart[1] }, headAng + Math.PI / 2, hWidth / 2);
                    const baseRight = this.getPt({ lng: headStart[0], lat: headStart[1] }, headAng - Math.PI / 2, hWidth / 2);

                    const headCoords = [tip, baseLeft, baseRight, tip];
                    features.push({
                        type: 'Feature',
                        properties: { id, color },
                        geometry: { type: 'Polygon', coordinates: [headCoords] }
                    });
                } else {
                    // 直线箭头：箭杆用“尾巴宽度/中间宽度”，头部用“底边/高度”
                const { angle, dist } = this.getMetrics(p1, realP2);
                    const headHeightScale = obj.headHeightScale ?? 1.0;
                    const headBaseScale = obj.headBaseScale ?? 1.0;
                    const hLen = Math.min(1.5, dist * 0.3) * headHeightScale;
                    const hWidth = 1.2 * headBaseScale;

                    // tip 在 realP2，baseCenter 往回退 hLen
                    const arrowTip = { lng: realP2.lng, lat: realP2.lat };
                    const baseCenter = { lng: realP2.lng - Math.cos(angle) * hLen, lat: realP2.lat - Math.sin(angle) * hLen };

                    // 统一使用尾巴宽度 + 中间宽度控制渐变
                    const tailWidth = obj.tailWidth || width;
                    const midWidth = obj.midWidth || (width * 0.3);
                    
                    // 生成渐变宽度 + 渐变透明度的箭头柄（分段处理，实现连续渐变）
                    const shaftSegments = 30; // 增加分段数使渐变更平滑
                    const shaftPoints = [];
                    for (let i = 0; i <= shaftSegments; i++) {
                        const t = i / shaftSegments;
                        // 宽度渐变：从尾巴粗到中间细
                        const currentWidth = tailWidth * (1 - t) + midWidth * t;
                        const currentPoint = {
                            lng: p1.lng + (baseCenter.lng - p1.lng) * t,
                            lat: p1.lat + (baseCenter.lat - p1.lat) * t
                        };
                        shaftPoints.push({
                            point: currentPoint,
                            width: currentWidth,
                            t: t
                        });
                    }
                    
                    // 计算最后一个梯形的左上角和右上角（用于延长方向计算）
                    // 最后一个梯形是靠近尾部那侧的间隔一个宽度的梯形，也就是第二个段（i === 1）的 p1 点
                    // 尾部第一段是 i === 0，所以第二个段是 shaftPoints[1]
                    const secondSegmentP1 = shaftPoints[1]; // 第二个段的 p1（靠近尾部那侧间隔一个宽度）
                    const lastTrapezoidTopLeft = this.getPt(secondSegmentP1.point, angle + Math.PI / 2, secondSegmentP1.width / 2);
                    const lastTrapezoidTopRight = this.getPt(secondSegmentP1.point, angle - Math.PI / 2, secondSegmentP1.width / 2);
                    
                    // 将箭杆分成多个小段，每段有不同的透明度（从头部实心到尾部半透明）
                    for (let i = 0; i < shaftSegments; i++) {
                        const p1_seg = shaftPoints[i];
                        const p2_seg = shaftPoints[i + 1];
                        
                        // 透明度渐变：从头部（t=1，alpha=1.0）到尾部（t=0，alpha=0.25）
                        // 使用段的中间位置计算透明度
                        const t_mid = (p1_seg.t + p2_seg.t) / 2;
                        const alpha = 0.25 + (1.0 - 0.25) * t_mid; // t=1时alpha=1.0（头部实心），t=0时alpha=0.25（尾部半透明）
                        // 如果alpha接近1.0，直接使用原始颜色避免颜色转换误差
                        const segmentColor = alpha >= 0.99 ? color : this.hexToRgba(color, alpha);
                        
                        // 如果是尾部第一段（i === 0），添加尾部延长效果
                        if (i === 0) {
                            // 获取尾部第一段的左右点（对应 topLeft 和 topRight）
                            const tailLeft = this.getPt(p1_seg.point, angle + Math.PI / 2, p1_seg.width / 2);  // 尾部左侧（topLeft）
                            const tailRight = this.getPt(p1_seg.point, angle - Math.PI / 2, p1_seg.width / 2); // 尾部右侧（topRight）
                            
                            // 计算尾部中点
                            const tailMidPoint = {
                                lng: (tailLeft[0] + tailRight[0]) / 2,
                                lat: (tailLeft[1] + tailRight[1]) / 2
                            };
                            
                            // 获取尾巴长度参数（默认值为 tailWidth 的 0.5 倍）
                            const tailLength = (obj.tailLength || 0.5) * tailWidth;
                            
                            // 计算从最后一个梯形左上角到尾部左侧的方向，向外延长
                            const leftDir = Math.atan2(tailLeft[1] - lastTrapezoidTopLeft[1], tailLeft[0] - lastTrapezoidTopLeft[0]);
                            const extendedLeft = [
                                tailLeft[0] + Math.cos(leftDir) * tailLength,
                                tailLeft[1] + Math.sin(leftDir) * tailLength
                            ];
                            
                            // 计算从最后一个梯形右上角到尾部右侧的方向，向外延长
                            const rightDir = Math.atan2(tailRight[1] - lastTrapezoidTopRight[1], tailRight[0] - lastTrapezoidTopRight[0]);
                            const extendedRight = [
                                tailRight[0] + Math.cos(rightDir) * tailLength,
                                tailRight[1] + Math.sin(rightDir) * tailLength
                            ];
                            
                            // 构建两个三角形：左三角形和右三角形
                            // 左三角形：尾部左侧 -> 延长左侧点 -> 尾部中点 -> 尾部左侧
                            features.push({
                                type: 'Feature',
                                properties: { id, color: segmentColor },
                                geometry: {
                                    type: 'Polygon',
                                    coordinates: [[tailLeft, extendedLeft, [tailMidPoint.lng, tailMidPoint.lat], tailLeft]]
                                }
                            });
                            
                            // 右三角形：尾部右侧 -> 延长右侧点 -> 尾部中点 -> 尾部右侧
                            features.push({
                                type: 'Feature',
                                properties: { id, color: segmentColor },
                                geometry: {
                                    type: 'Polygon',
                                    coordinates: [[tailRight, extendedRight, [tailMidPoint.lng, tailMidPoint.lat], tailRight]]
                                }
                            });
                        }
                        
                        // 构建该段的四边形
                        const segCoords = [
                            this.getPt(p1_seg.point, angle + Math.PI / 2, p1_seg.width / 2),
                            this.getPt(p2_seg.point, angle + Math.PI / 2, p2_seg.width / 2),
                            this.getPt(p2_seg.point, angle - Math.PI / 2, p2_seg.width / 2),
                            this.getPt(p1_seg.point, angle - Math.PI / 2, p1_seg.width / 2),
                            this.getPt(p1_seg.point, angle + Math.PI / 2, p1_seg.width / 2)
                        ];
                        
                        features.push({
                            type: 'Feature',
                            properties: { id, color: segmentColor },
                            geometry: { type: 'Polygon', coordinates: [segCoords] }
                        });
                    }
                    
                    // 箭头头部（实心，不透明）
                    const headCoords = [
                        [arrowTip.lng, arrowTip.lat],
                        this.getPt(baseCenter, angle + Math.PI / 2, hWidth / 2),
                        this.getPt(baseCenter, angle - Math.PI / 2, hWidth / 2),
                        [arrowTip.lng, arrowTip.lat]
                    ];
                features.push({ type: 'Feature', properties: { id, color }, geometry: { type: 'Polygon', coordinates: [headCoords] } });
                }
            } 
            else if (type === 'circle' || type === 'ellipse') {
                // 椭圆支持
                const from = turf.point([p1.lng, p1.lat]);
                const to = turf.point([realP2.lng, realP2.lat]);
                const distInKm = turf.distance(from, to, { units: 'kilometers' });
                
                // 计算椭圆参数
                const majorAxis = distInKm * (obj.majorAxisScale || 1.0);
                const minorAxis = distInKm * (obj.minorAxisScale || 1.0);
                const rotation = obj.rotation || 0; // 旋转角度（弧度）
                // hollow 表示“孔洞大小比例”（0=实心无孔，0.9=孔洞接近外圈大小）
                const hollow = Math.max(0, Math.min(0.98, obj.hollow || 0));
                
                // 使用 Turf 生成椭圆（通过多个圆组合或直接生成椭圆多边形）
                // 简化方案：使用椭圆参数方程生成坐标
                const ellipseCoords = this.generateEllipse(p1, majorAxis, minorAxis, rotation, 64);
                
                if (hollow > 0) {
                    // 内部空心：hollow越大，孔洞越大
                    // hollow=0 → 实心（无孔）
                    // hollow=0.9 → 孔洞最大（内圈≈外圈*0.9）
                    const innerMajor = Math.max(0.001, majorAxis * hollow);
                    const innerMinor = Math.max(0.001, minorAxis * hollow);
                    const innerCoords = this.generateEllipse(p1, innerMajor, innerMinor, rotation, 64);

                    features.push({
                        type: 'Feature',
                        properties: { id, color },
                        geometry: {
                            type: 'Polygon',
                            coordinates: [ellipseCoords, innerCoords.reverse()]
                        }
                    });
                } else {
                    // 实心椭圆
                    features.push({
                        type: 'Feature',
                        properties: { id, color },
                        geometry: {
                            type: 'Polygon',
                            coordinates: [ellipseCoords]
                        }
                    });
                }
            }
            return features;
        }
    };

    // 2. UI 逻辑
    _createUI() {
        const customizer = document.createElement('div');
        customizer.id = 'dt-customizer';
        customizer.className = 'ui-panel right-panel hidden';
        customizer.style.left = 'auto';
        customizer.style.right = '20px';

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
                position: absolute;
                top: 20px;
                right: 20px;
                width: 320px;
                z-index: 1000;
                display: none;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                max-height: calc(100vh - 40px);
                overflow-y: auto;
                border-radius: 18px;
                background: linear-gradient(180deg, rgba(255,255,255,0.88), rgba(255,255,255,0.78));
                backdrop-filter: saturate(180%) blur(18px);
                border: 1px solid rgba(60, 120, 255, 0.18);
                box-shadow:
                    0 14px 40px rgba(0, 0, 0, 0.12),
                    0 0 0 1px rgba(255,255,255,0.35) inset;
            }
            #dt-customizer::-webkit-scrollbar { width: 10px; }
            #dt-customizer::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.08); border-radius: 10px; border: 3px solid transparent; background-clip: content-box; }
            #dt-customizer::-webkit-scrollbar-track { background: transparent; }

            .dt-row { margin-bottom: 12px; }
            .dt-row label { display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: rgba(28,28,30,0.72); margin-bottom: 8px; font-weight: 600; letter-spacing: 0.2px; }

            .dt-card {
                background: rgba(255,255,255,0.70);
                border: 1px solid rgba(0,0,0,0.06);
                border-radius: 14px;
                padding: 14px;
                box-shadow: 0 8px 22px rgba(0,0,0,0.06);
            }
            .dt-card + .dt-card { margin-top: 12px; }
            .dt-card-title {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 10px;
                font-size: 12px;
                font-weight: 700;
                color: rgba(28,28,30,0.9);
            }
            .dt-chip {
                font-size: 10px;
                font-weight: 700;
                padding: 3px 8px;
                border-radius: 999px;
                background: rgba(60,120,255,0.10);
                border: 1px solid rgba(60,120,255,0.18);
                color: rgba(25,90,255,0.9);
            }

            .dt-range {
                -webkit-appearance: none;
                width: 100%;
                height: 6px;
                border-radius: 999px;
                outline: none;
                background:
                    linear-gradient(90deg, rgba(25,90,255,0.85) var(--dt-p, 0%), rgba(0,0,0,0.08) var(--dt-p, 0%));
            }
            .dt-range::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background: #ffffff;
                border: 1px solid rgba(60,120,255,0.35);
                box-shadow: 0 6px 16px rgba(25,90,255,0.20);
                cursor: pointer;
            }
            .dt-range::-webkit-slider-thumb:active { transform: scale(1.06); }
            
            .dt-toggle { 
                display: flex !important; 
                align-items: center; 
                justify-content: space-between;
                width: 100%; 
                cursor: pointer; 
                margin-bottom: 8px;
            }
            .dt-toggle input { display: none; }
            .dt-toggle-box { 
                width: 36px; 
                height: 20px; 
                background: rgba(0,0,0,0.10); 
                border-radius: 20px; 
                position: relative; 
                transition: background 0.3s ease; 
                flex-shrink: 0;
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
            .dt-toggle input:checked + .dt-toggle-box { background: rgba(25,90,255,0.85); }
            .dt-toggle input:checked + .dt-toggle-box:after { 
                transform: translateX(16px); 
            }
            .dt-toggle span { font-size: 11px; color: rgba(28,28,30,0.72); font-weight: 700; }

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
        const typeNames = { 'line': '直线', 'arrow': '箭头', 'circle': '椭圆', 'ellipse': '椭圆' };
        let html = `
            <div class="dt-card">
                <div class="dt-card-title">
                    <span>编辑 · ${typeNames[obj.type] || obj.type}</span>
                    <span class="dt-chip">ID ${obj.id.slice(-6)}</span>
                    </div>
                <div class="dt-row" style="margin-bottom:0;">
                    <label><span>颜色</span><span class="dt-chip" style="background:rgba(0,0,0,0.04);border-color:rgba(0,0,0,0.06);color:rgba(28,28,30,0.7);">调色盘</span></label>
                    <button id="dt-color-preview-btn" onclick="colorMgr.setContext('tool')" 
                            style="height:40px;width:100%;border-radius:14px;border:1px solid rgba(0,0,0,0.06);background:${obj.color};box-shadow:0 10px 22px rgba(0,0,0,0.06);"></button>
                </div>
            </div>
        `;

        if (obj.type === 'line') {
            html += `
                <div class="dt-row"><label><span>粗细</span><span>${obj.width.toFixed(1)}</span></label>
                <input type="range" class="dt-range" min="0.1" max="2" step="0.1" value="${obj.width}" id="dt-width-input"></div>
                <div class="dt-row"><label><span>厚度</span><span>${Math.round(obj.thickness || 20000)}</span></label>
                <input type="range" class="dt-range" min="1000" max="80000" step="1000" value="${Math.round(obj.thickness || 20000)}" id="dt-thickness-input"></div>
            `;
        } 
        else if (obj.type === 'arrow') {
            html += `
                <div class="dt-card">
                    <div class="dt-card-title"><span>形状</span><span class="dt-chip">Arrow</span></div>
                    <div class="dt-row">
                        <label class="dt-toggle">
                            <input type="checkbox" id="dt-curved-toggle" ${obj.isCurved ? 'checked' : ''}>
                            <div class="dt-toggle-box"></div>
                            <span>弯曲</span>
                        </label>
                    </div>
                    ${obj.isCurved ? `
                        <div class="dt-row">
                            <label><span>弯曲程度</span><span class="dt-chip">${obj.curveAmount >= 0 ? '+' : ''}${(obj.curveAmount * 100).toFixed(0)}%</span></label>
                            <input type="range" class="dt-range" min="-1.2" max="1.2" step="0.01" value="${obj.curveAmount || 0}" id="dt-curve-input">
                        </div>
                    ` : ''}
                    <div class="dt-row" style="margin-bottom:0;">
                        <label><span>厚度</span><span class="dt-chip">${Math.round(obj.thickness || 20000)}</span></label>
                        <input type="range" class="dt-range" min="1000" max="80000" step="1000" value="${Math.round(obj.thickness || 20000)}" id="dt-thickness-input-arrow">
                    </div>
                </div>

                <div class="dt-card">
                    <div class="dt-card-title"><span>箭头（三角）</span><span class="dt-chip">Head</span></div>
                    <div class="dt-row">
                        <label><span>底边</span><span class="dt-chip">${(obj.headBaseScale ?? 1.0).toFixed(2)}</span></label>
                        <input type="range" class="dt-range" min="0.2" max="3" step="0.05" value="${obj.headBaseScale ?? 1.0}" id="dt-head-base-input">
                    </div>
                    <div class="dt-row" style="margin-bottom:0;">
                        <label><span>高度</span><span class="dt-chip">${(obj.headHeightScale ?? 1.0).toFixed(2)}</span></label>
                        <input type="range" class="dt-range" min="0.1" max="3" step="0.05" value="${obj.headHeightScale ?? 1.0}" id="dt-head-height-input">
                    </div>
                </div>

                <div class="dt-card">
                    <div class="dt-card-title"><span>箭杆（宽度）</span><span class="dt-chip">Shaft</span></div>
                    <div class="dt-row">
                        <label><span>尾巴</span><span class="dt-chip">${(obj.tailWidth || obj.width).toFixed(1)}</span></label>
                        <input type="range" class="dt-range" min="0.1" max="2" step="0.1" value="${obj.tailWidth || obj.width}" id="dt-tail-width-input">
                    </div>
                    <div class="dt-row">
                        <label><span>中间</span><span class="dt-chip">${(obj.midWidth || obj.width * 0.3).toFixed(1)}</span></label>
                        <input type="range" class="dt-range" min="0.05" max="1" step="0.05" value="${obj.midWidth || obj.width * 0.3}" id="dt-mid-width-input">
                    </div>
                    <div class="dt-row" style="margin-bottom:0;">
                        <label><span>尾巴长度</span><span class="dt-chip">${((obj.tailLength || 0.5) * 100).toFixed(0)}%</span></label>
                        <input type="range" class="dt-range" min="0" max="5" step="0.1" value="${obj.tailLength || 0.5}" id="dt-tail-length-input">
                    </div>
                </div>
            `;
        }
        else if (obj.type === 'circle' || obj.type === 'ellipse') {
            const hollowPct = ((obj.hollow || 0) * 100).toFixed(0);
            html += `
                <div class="dt-row"><label><span>长轴</span><span>${(obj.majorAxisScale || 1.0).toFixed(2)}</span></label>
                <input type="range" class="dt-range" min="0.1" max="3" step="0.05" value="${obj.majorAxisScale || 1.0}" id="dt-major-axis-input"></div>
                <div class="dt-row"><label><span>短轴</span><span>${(obj.minorAxisScale || 1.0).toFixed(2)}</span></label>
                <input type="range" class="dt-range" min="0.1" max="3" step="0.05" value="${obj.minorAxisScale || 1.0}" id="dt-minor-axis-input"></div>
                <div class="dt-row"><label><span>旋转角度</span><span>${((obj.rotation || 0) * 180 / Math.PI).toFixed(0)}°</span></label>
                <input type="range" class="dt-range" min="0" max="180" step="1" value="${((obj.rotation || 0) * 180 / Math.PI)}" id="dt-rotation-input"></div>
                <div class="dt-row"><label><span>厚度</span><span>${Math.round(obj.thickness || 20000)}</span></label>
                <input type="range" class="dt-range" min="1000" max="80000" step="1000" value="${Math.round(obj.thickness || 20000)}" id="dt-thickness-input-circle"></div>
                <div class="dt-row"><label><span>内部空心</span><span>${hollowPct}%</span></label>
                <input type="range" class="dt-range" min="0" max="0.98" step="0.01" value="${obj.hollow || 0}" id="dt-hollow-input"></div>
            `;
        }
        container.innerHTML = html;

        // 让滑条显示蓝色进度（用 CSS 变量 --dt-p）
        const syncRangeProgress = (rangeEl) => {
            const min = parseFloat(rangeEl.min || '0');
            const max = parseFloat(rangeEl.max || '100');
            const v = parseFloat(rangeEl.value || '0');
            const p = max === min ? 0 : ((v - min) / (max - min)) * 100;
            rangeEl.style.setProperty('--dt-p', `${p}%`);
        };
        container.querySelectorAll('input[type="range"].dt-range').forEach(el => {
            syncRangeProgress(el);
            el.addEventListener('input', () => syncRangeProgress(el));
        });

        const bind = (id, key, isFloat = true, isCheck = false, transform = null) => {
            const el = document.getElementById(id);
            if (!el) return;

            const valueDisplay = el.parentElement.querySelector('label span:last-child');

            el.oninput = (e) => {
                let val = isCheck ? e.target.checked : (isFloat ? parseFloat(e.target.value) : e.target.value);
                if (transform) val = transform(val);

                const obj = this.objects.find(o => o.id === this.selectedId);
                if (obj) {
                    obj[key] = val;
                    this.refresh();

                    // 属性变化后同步更新控制框/控制点（例如：椭圆空心、长短轴、厚度等）
                    if (!this.isDragging) {
                        const bounds = this._getObjectBounds(obj);
                        if (bounds) {
                            this._showControlBox(obj);
                        }
                    }

                    if (valueDisplay && !isCheck) {
                        if (key === 'rotation') {
                            valueDisplay.innerText = (val * 180 / Math.PI).toFixed(0) + '°';
                        } else if (key === 'curveAmount') {
                            // 弯曲程度显示正负号
                            valueDisplay.innerText = (val >= 0 ? '+' : '') + (val * 100).toFixed(0) + '%';
                        } else if (key.includes('Scale') || key.includes('Ratio')) {
                            valueDisplay.innerText = val.toFixed(key.includes('Ratio') ? 2 : 1);
                        } else {
                            valueDisplay.innerText = val.toFixed(obj.type === 'circle' && key === 'outlineWidth' ? 2 : 1);
                        }
                    }
                }
            };

            if (isCheck) {
                el.onchange = () => {
                    const obj = this.objects.find(o => o.id === this.selectedId);
                    if (obj) {
                        this._renderPropsPanel(obj);
                    }
                };
            }
        };

        bind('dt-width-input', 'width');
        bind('dt-thickness-input', 'thickness', true, false, (val) => Math.round(val));
        bind('dt-thickness-input-circle', 'thickness', true, false, (val) => Math.round(val));
        bind('dt-thickness-input-arrow', 'thickness', true, false, (val) => Math.round(val));
        bind('dt-head-base-input', 'headBaseScale');
        bind('dt-head-height-input', 'headHeightScale');
        bind('dt-radius-input', 'radiusScale');
        // 圆/椭圆
        bind('dt-hollow-input', 'hollow');

        // 新增绑定
        bind('dt-curved-toggle', 'isCurved', false, true);
        bind('dt-curve-input', 'curveAmount');
        bind('dt-tail-width-input', 'tailWidth');
        bind('dt-mid-width-input', 'midWidth');
        bind('dt-tail-length-input', 'tailLength');
        bind('dt-major-axis-input', 'majorAxisScale');
        bind('dt-minor-axis-input', 'minorAxisScale');
        bind('dt-rotation-input', 'rotation', true, false, (val) => val * Math.PI / 180); // 度转弧度

        if (window.colorMgr) {
            window.colorMgr.setContext('tool');
        }

        document.getElementById('dt-customizer').style.display = 'block';
    }

    _initMapLayers() {
        this.map.addSource('dt-draw-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        this.map.addSource('dt-preview-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        this.map.addSource('dt-control-box-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        this.map.addSource('dt-control-handles-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

        this.map.addLayer({
            id: 'dt-draw-layer',
            type: 'fill-extrusion',
            source: 'dt-draw-source',
            paint: {
                'fill-extrusion-color': ['get', 'color'],
                'fill-extrusion-height': ['coalesce', ['get', 'height'], this.height],
                'fill-extrusion-base': ['coalesce', ['get', 'base'], this.height - 20000],
                'fill-extrusion-opacity': 0.8
            }
        });

        this.map.addLayer({
            id: 'dt-preview-layer',
            type: 'fill-extrusion',
            source: 'dt-preview-source',
            paint: {
                'fill-extrusion-color': '#0071e3',
                'fill-extrusion-height': ['coalesce', ['get', 'height'], this.height],
                'fill-extrusion-base': ['coalesce', ['get', 'base'], this.height - 20000],
                'fill-extrusion-opacity': 0.35
            }
        });

        // 控制框图层（3D边框，与箭头同一高度）
        // 注意：这个图层在箭头图层之后添加，所以会显示在箭头上方
        this.map.addLayer({
            id: 'dt-control-box-layer',
            type: 'fill-extrusion',
            source: 'dt-control-box-source',
            paint: {
                'fill-extrusion-color': '#0071e3',
                'fill-extrusion-height': this.height + 1000, // 稍微高一点，确保在箭头上方
                'fill-extrusion-base': this.height - 1000, // 形成细边框效果
                'fill-extrusion-opacity': 0.4,
                'fill-extrusion-opacity-transition': { duration: 0 }
            }
        });
        
        // 控制框边框线（在3D框上方，更明显）
        this.map.addLayer({
            id: 'dt-control-box-outline',
            type: 'line',
            source: 'dt-control-box-source',
            paint: {
                'line-color': '#0071e3',
                'line-width': 2.5,
                'line-dasharray': [4, 3],
                'line-opacity': 1.0
            }
        });
        
        // 控制点图层（3D圆柱体，与箭头同一高度）
        this.map.addLayer({
            id: 'dt-control-handles-layer',
            type: 'fill-extrusion',
            source: 'dt-control-handles-source',
            paint: {
                'fill-extrusion-color': '#0071e3',
                'fill-extrusion-height': this.height + 5000, // 稍微高一点，确保在箭头上方
                'fill-extrusion-base': this.height - 5000,
                'fill-extrusion-opacity': 1.0
            }
        });
    }

    _bindEvents() {
        this.map.on('click', (e) => {
            if (this.mainMode !== 'tool') return;
            
            // 检查是否点击了控制点
            if (this.controlHandles.some(h => h.element.contains(e.originalEvent.target))) {
                return; // 如果点击了控制点，不处理
            }
            
            if (!this.drawingStart) {
                this.drawingStart = e.lngLat;
                this._hideControlBox(); // 开始绘制时隐藏控制框
            } else {
                const newObj = {
                    id: 'obj_' + Date.now(),
                    type: this.currentTool,
                    p1: { lng: this.drawingStart.lng, lat: this.drawingStart.lat },
                    p2: { lng: e.lngLat.lng, lat: e.lngLat.lat },
                color: '#1d1d1f',
                width: 0.4,
                headBaseScale: 1.0,
                headHeightScale: 1.0,
                radiusScale: 1.0,
                thickness: 18000,
                isOutline: false,
                outlineWidth: 0.2,
                // 新增默认值
                isCurved: false,
                curveAmount: 0,
                tailWidth: 0.4,
                midWidth: 0.12,
                majorAxisScale: 1.0,
                minorAxisScale: 1.0,
                hollow: 0,
                rotation: 0
            };

            // 针对箭头的默认美化：更细、更薄、默认科技蓝
            if (newObj.type === 'arrow') {
                newObj.color = '#1D6FFF';
                newObj.thickness = 14000;
                newObj.tailWidth = 0.45;
                newObj.midWidth = 0.16;
                newObj.headBaseScale = 1.2;
                newObj.headHeightScale = 1.1;
            }
                this.objects.push(newObj);
                this.refresh();
                this.drawingStart = null;
                this.map.getSource('dt-preview-source').setData({ type: 'FeatureCollection', features: [] });
                
                // 自动选中新创建的对象
                this.selectedId = newObj.id;
                this._showControlBox(newObj);
            }
        });

        // 左键点击选中对象
        this.map.on('click', (e) => {
            if (this.mainMode !== 'tool') return;
            
            // 检查是否点击了控制点（阻止事件冒泡）
            const clickedHandle = this.controlHandles.find(h => {
                const rect = h.element.getBoundingClientRect();
                const x = e.originalEvent.clientX;
                const y = e.originalEvent.clientY;
                return x >= rect.left - 5 && x <= rect.right + 5 && y >= rect.top - 5 && y <= rect.bottom + 5;
            });
            
            if (clickedHandle) {
                e.preventDefault();
                e.stopPropagation();
                return; // 点击了控制点，不处理地图点击
            }
            
            if (this.drawingStart) return; // 正在绘制中
            
            const features = this.map.queryRenderedFeatures(e.point, { layers: ['dt-draw-layer'] });
            if (features.length > 0) {
                this.selectedId = features[0].properties.id;
                const obj = this.objects.find(o => o.id === this.selectedId);
                if (obj) {
                    this._showControlBox(obj);
                    this._renderPropsPanel(obj);
                }
            } else {
                // 点击空白处取消选中（但不在绘制模式下）
                if (!this.drawingStart) {
                    this._hideControlBox();
                    this.hideCustomizer();
                }
            }
        });

        // 右键显示属性面板
        this.map.on('contextmenu', (e) => {
            if (this.mainMode !== 'tool') return;
            const features = this.map.queryRenderedFeatures(e.point, { layers: ['dt-draw-layer'] });
            if (features.length > 0) {
                this.selectedId = features[0].properties.id;
                const obj = this.objects.find(o => o.id === this.selectedId);
                if (obj) {
                    // 如果是箭头，打印梯形的四个点坐标
                    if (obj.type === 'arrow') {
                        this._printArrowTrapezoidPoints(obj);
                    }
                    this._showControlBox(obj);
                this._renderPropsPanel(obj);
                document.getElementById('dt-customizer').style.display = 'block';
                }
            }
        });

        this.map.on('mousemove', (e) => {
            if (this.mainMode === 'tool' && this.drawingStart) {
                const tempObj = { 
                    type: this.currentTool, 
                    p1: this.drawingStart, 
                    p2: e.lngLat, 
                    color: this.currentTool === 'arrow' ? '#1D6FFF' : '#0071e3', 
                    width: 0.4, 
                    headBaseScale: this.currentTool === 'arrow' ? 1.2 : 1.0,
                    headHeightScale: this.currentTool === 'arrow' ? 1.3 : 1.0,
                    radiusScale: 1.0,
                    isCurved: false,
                    curveAmount: 0,
                    tailWidth: this.currentTool === 'arrow' ? 0.45 : 0.4,
                    midWidth: this.currentTool === 'arrow' ? 0.16 : 0.12,
                    majorAxisScale: 1.0,
                    minorAxisScale: 1.0,
                    hollow: 0,
                    thickness: this.currentTool === 'arrow' ? 14000 : 18000,
                    rotation: 0
                };
                const feats = this._generator.generate(tempObj);
                const thickness = Math.max(0, tempObj.thickness ?? 20000);
                const height = this.height;
                const base = height - thickness;
                feats.forEach(f => {
                    if (!f.properties) f.properties = {};
                    f.properties.height = height;
                    f.properties.base = base;
                });
                this.map.getSource('dt-preview-source').setData({ type: 'FeatureCollection', features: feats });
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
        this.objects.forEach(obj => {
            const feats = this._generator.generate(obj);
            const thickness = Math.max(0, obj.thickness ?? 20000);
            const height = this.height;
            const base = height - thickness;
            feats.forEach(f => {
                if (!f.properties) f.properties = {};
                f.properties.height = height;
                f.properties.base = base;
            });
            allFeatures.push(...feats);
        });
        this.map.getSource('dt-draw-source').setData({ type: 'FeatureCollection', features: allFeatures });
    }

    updateObjProperty(key, value) {
        const obj = this.objects.find(o => o.id === this.selectedId);
        if (!obj) return;

        obj[key] = value;
        this.refresh();

        if (key === 'color') {
            const colorBtn = document.getElementById('dt-color-preview-btn');
            if (colorBtn) {
                colorBtn.style.background = value;
            }
        } else {
            const inputs = {
                'width': 'dt-width-input',
                'thickness': ['dt-thickness-input', 'dt-thickness-input-circle', 'dt-thickness-input-arrow'], // 线/圆/箭头都可能有厚度
                'headBaseScale': 'dt-head-base-input',
                'headHeightScale': 'dt-head-height-input',
                'radiusScale': 'dt-radius-input',
                'hollow': 'dt-hollow-input',
                'curveAmount': 'dt-curve-input',
                'tailWidth': 'dt-tail-width-input',
                'midWidth': 'dt-mid-width-input',
                'majorAxisScale': 'dt-major-axis-input',
                'minorAxisScale': 'dt-minor-axis-input',
                'rotation': 'dt-rotation-input'
            };

            const inputId = inputs[key];
            if (inputId) {
                // 处理可能是数组的情况（thickness有两个输入框）
                const inputIds = Array.isArray(inputId) ? inputId : [inputId];
                inputIds.forEach(id => {
                    const el = document.getElementById(id);
                if (el) {
                        el.value = key === 'rotation' ? (value * 180 / Math.PI) : value;
                    const valueDisplay = el.parentElement.querySelector('label span:last-child');
                    if (valueDisplay) {
                            if (key === 'rotation') {
                                valueDisplay.innerText = (value * 180 / Math.PI).toFixed(0) + '°';
                            } else if (key === 'hollow') {
                                valueDisplay.innerText = (value * 100).toFixed(0) + '%';
                            } else if (key === 'curveAmount') {
                                valueDisplay.innerText = (value >= 0 ? '+' : '') + (value * 100).toFixed(0) + '%';
                            } else if (key.includes('Scale')) {
                                valueDisplay.innerText = value.toFixed(2);
                            } else {
                                valueDisplay.innerText = key === 'thickness' ? Math.round(value) : value.toFixed(1);
                            }
                        }
                    }
                });
            }
        }
    }

    deleteSelected() {
        this.objects = this.objects.filter(o => o.id !== this.selectedId);
        this.refresh();
        this.hideCustomizer();
    }

    clear() { 
        this.objects = []; 
        this.refresh(); 
        this.hideCustomizer();
        this._hideControlBox();
    }
    
    hideCustomizer() { 
        this.selectedId = null; 
        document.getElementById('dt-customizer').style.display = 'none';
        this._hideControlBox();
    }

    // 打印箭头梯形的四个点坐标
    _printArrowTrapezoidPoints(obj) {
        if (obj.type !== 'arrow') return;
        
        const p1 = obj.p1;
        const realP2 = obj.p2 || obj.p1;
        const { angle, dist } = this._generator.getMetrics(p1, realP2);
        
        // 计算头部参数
        const headHeightScale = obj.headHeightScale ?? 1.0;
        const hLen = Math.min(1.5, dist * 0.3) * headHeightScale;
        const baseCenter = {
            lng: realP2.lng - Math.cos(angle) * hLen,
            lat: realP2.lat - Math.sin(angle) * hLen
        };
        
        // 获取宽度参数
        const tailWidth = obj.tailWidth || obj.width || 0.4;
        const midWidth = obj.midWidth || (obj.width * 0.3) || 0.12;
        
        // 计算梯形的四个点（整个箭杆的四个角点）
        // 左上角：尾部左侧
        const topLeft = this._generator.getPt(p1, angle + Math.PI / 2, tailWidth / 2);
        // 右上角：尾部右侧
        const topRight = this._generator.getPt(p1, angle - Math.PI / 2, tailWidth / 2);
        // 右下角：头部右侧
        const bottomRight = this._generator.getPt(baseCenter, angle - Math.PI / 2, midWidth / 2);
        // 左下角：头部左侧
        const bottomLeft = this._generator.getPt(baseCenter, angle + Math.PI / 2, midWidth / 2);
        
        // 计算最后一个梯形的左上角和右上角
        // 最后一个梯形是靠近尾部那侧的间隔一个宽度的梯形，也就是第二个段（i === 1）的 p1 点
        // 尾部第一段是 i === 0，所以第二个段是 t = 1 / shaftSegments
        const shaftSegments = 30; // 与 generate() 中的值保持一致
        const t_second = 1 / shaftSegments; // 第二个段的 t 值
        const secondSegmentWidth = tailWidth * (1 - t_second) + midWidth * t_second;
        const secondSegmentPoint = {
            lng: p1.lng + (baseCenter.lng - p1.lng) * t_second,
            lat: p1.lat + (baseCenter.lat - p1.lat) * t_second
        };
        // 最后一个梯形的左上角（第二个段的p1左侧）
        const lastTrapezoidTopLeft = this._generator.getPt(secondSegmentPoint, angle + Math.PI / 2, secondSegmentWidth / 2);
        // 最后一个梯形的右上角（第二个段的p1右侧）
        const lastTrapezoidTopRight = this._generator.getPt(secondSegmentPoint, angle - Math.PI / 2, secondSegmentWidth / 2);
        
        console.log('=== 箭头梯形六个点坐标 ===');
        console.log('尾部左侧:', topLeft);
        console.log('尾部右侧:', topRight);
        console.log('头部右侧:', bottomRight);
        console.log('头部左侧:', bottomLeft);
        console.log('最后一个梯形左上角:', lastTrapezoidTopLeft);
        console.log('最后一个梯形右上角:', lastTrapezoidTopRight);
        console.log('箭头参数:', {
            p1: p1,
            p2: realP2,
            angle: angle * 180 / Math.PI + '度',
            tailWidth: tailWidth,
            midWidth: midWidth,
            dist: dist
        });
    }
    
    // 显示控制框和控制点（类似 PowerPoint）
    _showControlBox(obj) {
        this._hideControlBox(); // 先清除旧的
        
        if (!obj) return;
        
        // 计算对象的边界框
        const bounds = this._getObjectBounds(obj);
        if (!bounds) return;
        
        // 创建控制框（矩形边框）- 使用细边框效果
        const padding = 0.01; // 稍微扩大一点，让控制框更明显
        const boxCoords = [
            [bounds.minLng - padding, bounds.maxLat + padding], // 左上
            [bounds.maxLng + padding, bounds.maxLat + padding], // 右上
            [bounds.maxLng + padding, bounds.minLat - padding], // 右下
            [bounds.minLng - padding, bounds.minLat - padding], // 左下
            [bounds.minLng - padding, bounds.maxLat + padding]  // 闭合
        ];
        
        // 创建外框和内框，形成细边框效果
        const outerPadding = padding * 1.5;
        const innerPadding = padding * 0.5;
        const outerCoords = [
            [bounds.minLng - outerPadding, bounds.maxLat + outerPadding],
            [bounds.maxLng + outerPadding, bounds.maxLat + outerPadding],
            [bounds.maxLng + outerPadding, bounds.minLat - outerPadding],
            [bounds.minLng - outerPadding, bounds.minLat - outerPadding],
            [bounds.minLng - outerPadding, bounds.maxLat + outerPadding]
        ];
        const innerCoords = [
            [bounds.minLng - innerPadding, bounds.maxLat + innerPadding],
            [bounds.maxLng + innerPadding, bounds.maxLat + innerPadding],
            [bounds.maxLng + innerPadding, bounds.minLat - innerPadding],
            [bounds.minLng - innerPadding, bounds.minLat - innerPadding],
            [bounds.minLng - innerPadding, bounds.maxLat + innerPadding]
        ];
        
        this.map.getSource('dt-control-box-source').setData({
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [outerCoords, innerCoords.reverse()] // 外框和内框形成边框效果
                }
            }]
        });
        
        // 创建控制点（4个角 + 中间点）
        this._createControlHandles(bounds, obj);
    }
    
    // 隐藏控制框
    _hideControlBox() {
        this.map.getSource('dt-control-box-source').setData({ type: 'FeatureCollection', features: [] });
        this.map.getSource('dt-control-handles-source').setData({ type: 'FeatureCollection', features: [] });
        this.controlHandles.forEach(handle => handle.remove());
        this.controlHandles = [];
        
        // 清理控制点容器（如果为空）
        const container = document.getElementById('dt-control-handles-container');
        if (container && container.children.length === 0) {
            container.remove();
        }
    }
    
    // 更新控制框位置（拖拽时调用）
    _updateControlBoxBounds(bounds) {
        if (!bounds) return;
        
        const padding = 0.01;
        const outerPadding = padding * 1.5;
        const innerPadding = padding * 0.5;
        const outerCoords = [
            [bounds.minLng - outerPadding, bounds.maxLat + outerPadding],
            [bounds.maxLng + outerPadding, bounds.maxLat + outerPadding],
            [bounds.maxLng + outerPadding, bounds.minLat - outerPadding],
            [bounds.minLng - outerPadding, bounds.minLat - outerPadding],
            [bounds.minLng - outerPadding, bounds.maxLat + outerPadding]
        ];
        const innerCoords = [
            [bounds.minLng - innerPadding, bounds.maxLat + innerPadding],
            [bounds.maxLng + innerPadding, bounds.maxLat + innerPadding],
            [bounds.maxLng + innerPadding, bounds.minLat - innerPadding],
            [bounds.minLng - innerPadding, bounds.minLat - innerPadding],
            [bounds.minLng - innerPadding, bounds.maxLat + innerPadding]
        ];
        
        this.map.getSource('dt-control-box-source').setData({
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [outerCoords, innerCoords.reverse()]
                }
            }]
        });
    }
    
    // 计算对象的边界框
    _getObjectBounds(obj) {
        if (!obj || !obj.p1 || !obj.p2) return null;
        
        // 获取对象的所有特征点
        const features = this._generator.generate(obj);
        if (features.length === 0) return null;
        
        // 收集所有坐标点
        const allCoords = [];
        features.forEach(f => {
            if (f.geometry.type === 'Polygon') {
                f.geometry.coordinates[0].forEach(coord => {
                    allCoords.push(coord);
                });
            }
        });
        
        if (allCoords.length === 0) return null;
        
        // 计算边界
        const lngs = allCoords.map(c => c[0]);
        const lats = allCoords.map(c => c[1]);
        
        return {
            minLng: Math.min(...lngs),
            maxLng: Math.max(...lngs),
            minLat: Math.min(...lats),
            maxLat: Math.max(...lats)
        };
    }
    
    // 创建控制点（可拖拽）- 类似 PowerPoint 的8个控制点 + 旋转手柄
    _createControlHandles(bounds, obj) {
        // 创建8个边界框控制点（4个角 + 4个边中点）+ 1个中心点 + 1个旋转手柄
        const handlePositions = [
            // 4个角点
            { lng: bounds.minLng, lat: bounds.maxLat, type: 'corner', index: 0, position: 'top-left' },     // 左上
            { lng: bounds.maxLng, lat: bounds.maxLat, type: 'corner', index: 1, position: 'top-right' },    // 右上
            { lng: bounds.maxLng, lat: bounds.minLat, type: 'corner', index: 2, position: 'bottom-right' },  // 右下
            { lng: bounds.minLng, lat: bounds.minLat, type: 'corner', index: 3, position: 'bottom-left' },  // 左下
            // 4个边中点
            { lng: (bounds.minLng + bounds.maxLng) / 2, lat: bounds.maxLat, type: 'edge', index: 4, position: 'top' },      // 上
            { lng: bounds.maxLng, lat: (bounds.minLat + bounds.maxLat) / 2, type: 'edge', index: 5, position: 'right' },   // 右
            { lng: (bounds.minLng + bounds.maxLng) / 2, lat: bounds.minLat, type: 'edge', index: 6, position: 'bottom' },  // 下
            { lng: bounds.minLng, lat: (bounds.minLat + bounds.maxLat) / 2, type: 'edge', index: 7, position: 'left' },     // 左
            // 中心点（移动）
            { lng: (bounds.minLng + bounds.maxLng) / 2, lat: (bounds.minLat + bounds.maxLat) / 2, type: 'center', index: 8, position: 'center' }
        ];
        
        // 使用3D圆柱体显示控制点（与箭头同一高度）
        const handleFeatures = handlePositions.map(pos => {
            // 为每个控制点创建一个小的圆形（使用buffer）
            const point = turf.point([pos.lng, pos.lat]);
            const circle = turf.buffer(point, 0.005, { units: 'kilometers', steps: 16 }); // 约500米半径
            return {
                type: 'Feature',
                properties: {
                    index: pos.index,
                    type: pos.type,
                    position: pos.position
                },
                geometry: circle.geometry
            };
        });
        
        this.map.getSource('dt-control-handles-source').setData({
            type: 'FeatureCollection',
            features: handleFeatures
        });
        
        // 创建HTML控制点用于交互（使用3D投影位置，考虑高度）
        handlePositions.forEach(pos => {
            const handle = this._createHandle3D(pos, obj, bounds);
            this.controlHandles.push(handle);
        });
        
        // 旋转手柄（在顶部中间上方）
        const rotationHandle = this._createRotationHandle(bounds, obj);
        if (rotationHandle) {
            this.controlHandles.push(rotationHandle);
        }
    }
    
    // 创建3D控制点（考虑高度偏移）
    _createHandle3D(position, obj, bounds) {
        const el = document.createElement('div');
        el.className = 'dt-control-handle';
        
        // 根据控制点类型设置样式
        let cursor = 'default';
        let size = '12px';
        if (position.type === 'center') {
            cursor = 'move';
            size = '10px';
        } else if (position.type === 'corner') {
            cursor = 'nwse-resize';
            size = '12px';
        } else if (position.type === 'edge') {
            if (position.position === 'top' || position.position === 'bottom') {
                cursor = 'ns-resize';
            } else {
                cursor = 'ew-resize';
            }
            size = '10px';
        }
        
        el.style.cssText = `
            width: ${size};
            height: ${size};
            background: white;
            border: 2px solid #0071e3;
            border-radius: 50%;
            cursor: ${cursor};
            position: fixed;
            pointer-events: all;
            z-index: 999999;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            user-select: none;
            transform: translateZ(0);
            will-change: transform;
        `;
        
        // 计算3D投影位置（考虑地图的pitch和高度）
        const updateHandlePosition = () => {
            if (this.isDragging && this.dragHandleIndex === position.index) return;
            
            // 获取地图的3D参数
            const pitch = this.map.getPitch();
            const bearing = this.map.getBearing();
            const zoom = this.map.getZoom();
            
            // 计算控制点在3D空间中的位置（与箭头同一高度）
            // 使用project方法，但需要考虑高度偏移
            const point = this.map.project([position.lng, position.lat]);
            
            const container = this.map.getCanvasContainer();
            const rect = container.getBoundingClientRect();
            
            // 计算3D投影偏移（考虑pitch和高度）
            // 当地图倾斜时，高度会导致点在屏幕上的垂直偏移
            const pitchRad = pitch * Math.PI / 180;
            // 高度在屏幕上的投影偏移（像素）
            // 使用地图的像素比例来转换高度到像素
            const metersPerPixel = 40075017 / (256 * Math.pow(2, zoom)); // 每像素的米数
            const heightInMeters = this.height;
            const heightInPixels = heightInMeters / metersPerPixel;
            // pitch导致的垂直偏移
            const verticalOffset = heightInPixels * Math.sin(pitchRad);
            
            el.style.left = (rect.left + point.x - parseInt(size) / 2) + 'px';
            el.style.top = (rect.top + point.y - parseInt(size) / 2 - verticalOffset) + 'px';
        };
        
        updateHandlePosition();
        
        // 添加到控制点容器
        let controlHandlesContainer = document.getElementById('dt-control-handles-container');
        if (!controlHandlesContainer) {
            controlHandlesContainer = document.createElement('div');
            controlHandlesContainer.id = 'dt-control-handles-container';
            controlHandlesContainer.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 999999;
            `;
            document.body.appendChild(controlHandlesContainer);
        }
        
        el.style.pointerEvents = 'all';
        controlHandlesContainer.appendChild(el);
        
        // 拖拽逻辑（与原方法相同）
        let isDragging = false;
        let startPoint = null;
        let startObj = null;
        let startBounds = null;
        
        el.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            e.stopImmediatePropagation();
            
            isDragging = true;
            this.isDragging = true;
            this.dragHandleIndex = position.index;
            
            startPoint = { 
                lng: position.lng, 
                lat: position.lat,
                screenX: e.clientX,
                screenY: e.clientY
            };
            startObj = JSON.parse(JSON.stringify(obj));
            startBounds = bounds ? JSON.parse(JSON.stringify(bounds)) : null;
            
            this.map.getCanvasContainer().style.pointerEvents = 'none';
            el.style.pointerEvents = 'all';
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
        
        const onMouseMove = (e) => {
            if (!isDragging || !startPoint || !startObj) return;
            
            const container = this.map.getCanvasContainer();
            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const currentLngLat = this.map.unproject([mouseX, mouseY]);
            const dLng = currentLngLat.lng - startPoint.lng;
            const dLat = currentLngLat.lat - startPoint.lat;
            
            if (position.type === 'center') {
                obj.p1.lng = startObj.p1.lng + dLng;
                obj.p1.lat = startObj.p1.lat + dLat;
                obj.p2.lng = startObj.p2.lng + dLng;
                obj.p2.lat = startObj.p2.lat + dLat;
            } else if (position.type === 'corner') {
                this._resizeByCorner(obj, startObj, startBounds, position.index, currentLngLat);
            } else if (position.type === 'edge') {
                this._resizeByEdge(obj, startObj, startBounds, position.position, currentLngLat);
            }
            
            this.refresh();
            
            // 更新3D控制点位置
            const newBounds = this._getObjectBounds(obj);
            if (newBounds) {
                // 更新所有控制点的位置
                this.controlHandles.forEach((handle, idx) => {
                    if (handle.updatePosition && idx !== position.index) {
                        const newBounds = this._getObjectBounds(obj);
                        if (newBounds) {
                            if (handle.position.type === 'corner') {
                                if (handle.position.index === 0) {
                                    handle.position.lng = newBounds.minLng;
                                    handle.position.lat = newBounds.maxLat;
                                } else if (handle.position.index === 1) {
                                    handle.position.lng = newBounds.maxLng;
                                    handle.position.lat = newBounds.maxLat;
                                } else if (handle.position.index === 2) {
                                    handle.position.lng = newBounds.maxLng;
                                    handle.position.lat = newBounds.minLat;
                                } else if (handle.position.index === 3) {
                                    handle.position.lng = newBounds.minLng;
                                    handle.position.lat = newBounds.minLat;
                                }
                            } else if (handle.position.type === 'edge') {
                                if (handle.position.position === 'top') {
                                    handle.position.lng = (newBounds.minLng + newBounds.maxLng) / 2;
                                    handle.position.lat = newBounds.maxLat;
                                } else if (handle.position.position === 'right') {
                                    handle.position.lng = newBounds.maxLng;
                                    handle.position.lat = (newBounds.minLat + newBounds.maxLat) / 2;
                                } else if (handle.position.position === 'bottom') {
                                    handle.position.lng = (newBounds.minLng + newBounds.maxLng) / 2;
                                    handle.position.lat = newBounds.minLat;
                                } else if (handle.position.position === 'left') {
                                    handle.position.lng = newBounds.minLng;
                                    handle.position.lat = (newBounds.minLat + newBounds.maxLat) / 2;
                                }
                            } else if (handle.position.type === 'center') {
                                handle.position.lng = (newBounds.minLng + newBounds.maxLng) / 2;
                                handle.position.lat = (newBounds.minLat + newBounds.maxLat) / 2;
                            }
                            handle.updatePosition();
                        }
                    }
                });
                
                // 更新3D点图层（使用圆形）
                const handleFeatures = this.controlHandles
                    .filter(h => h.position && h.position.type !== 'rotation')
                    .map(h => {
                        const point = turf.point([h.position.lng, h.position.lat]);
                        const circle = turf.buffer(point, 0.005, { units: 'kilometers', steps: 16 });
                        return {
                            type: 'Feature',
                            properties: {
                                index: h.position.index,
                                type: h.position.type,
                                position: h.position.position
                            },
                            geometry: circle.geometry
                        };
                    });
                
                this.map.getSource('dt-control-handles-source').setData({
                    type: 'FeatureCollection',
                    features: handleFeatures
                });
                
                this._updateControlBoxBounds(newBounds);
            }
            
            position.lng = currentLngLat.lng;
            position.lat = currentLngLat.lat;
            updateHandlePosition();
        };
        
        const onMouseUp = () => {
            isDragging = false;
            this.isDragging = false;
            this.dragHandleIndex = null;
            this.map.getCanvasContainer().style.pointerEvents = 'auto';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            
            setTimeout(() => {
                const bounds = this._getObjectBounds(obj);
                if (bounds) {
                    this._showControlBox(obj);
                }
            }, 10);
        };
        
        // 地图移动/缩放/倾斜时更新位置
        const moveHandler = () => updateHandlePosition();
        const zoomHandler = () => updateHandlePosition();
        const pitchHandler = () => updateHandlePosition();
        
        this.map.on('move', moveHandler);
        this.map.on('zoom', zoomHandler);
        this.map.on('pitch', pitchHandler);
        
        const updateInterval = setInterval(updateHandlePosition, 100);
        
        return {
            element: el,
            position: position,
            updatePosition: updateHandlePosition,
            remove: () => {
                el.remove();
                clearInterval(updateInterval);
                this.map.off('move', moveHandler);
                this.map.off('zoom', zoomHandler);
                this.map.off('pitch', pitchHandler);
            }
        };
    }
    
    // 创建单个控制点（保留用于兼容）
    _createHandle(position, obj, bounds) {
        const el = document.createElement('div');
        el.className = 'dt-control-handle';
        
        // 根据控制点类型设置样式
        let cursor = 'default';
        let size = '12px';
        if (position.type === 'center') {
            cursor = 'move';
            size = '10px';
        } else if (position.type === 'corner') {
            cursor = 'nwse-resize';
            size = '12px';
        } else if (position.type === 'edge') {
            if (position.position === 'top' || position.position === 'bottom') {
                cursor = 'ns-resize';
            } else {
                cursor = 'ew-resize';
            }
            size = '10px';
        }
        
        el.style.cssText = `
            width: ${size};
            height: ${size};
            background: white;
            border: 2px solid #0071e3;
            border-radius: 50%;
            cursor: ${cursor};
            position: fixed;
            pointer-events: all;
            z-index: 999999;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            user-select: none;
            transform: translateZ(0);
            will-change: transform;
        `;
        
        // 转换为屏幕坐标（使用 fixed 定位）
        const updateHandlePosition = () => {
            if (this.isDragging && this.dragHandleIndex === position.index) return; // 拖拽中不更新
            
            const point = this.map.project([position.lng, position.lat]);
            const container = this.map.getCanvasContainer();
            const rect = container.getBoundingClientRect();
            el.style.left = (rect.left + point.x - parseInt(size) / 2) + 'px';
            el.style.top = (rect.top + point.y - parseInt(size) / 2) + 'px';
        };
        
        updateHandlePosition();
        
        // 确保控制点添加到最上层容器
        // 创建一个专门的容器用于控制点，确保在最上层
        let controlHandlesContainer = document.getElementById('dt-control-handles-container');
        if (!controlHandlesContainer) {
            controlHandlesContainer = document.createElement('div');
            controlHandlesContainer.id = 'dt-control-handles-container';
            controlHandlesContainer.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 999999;
            `;
            document.body.appendChild(controlHandlesContainer);
        }
        
        // 控制点需要可以接收事件
        el.style.pointerEvents = 'all';
        controlHandlesContainer.appendChild(el);
        
        // 拖拽逻辑
        let isDragging = false;
        let startPoint = null;
        let startObj = null;
        let startBounds = null;
        
        el.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            e.stopImmediatePropagation(); // 阻止所有后续事件
            
            isDragging = true;
            this.isDragging = true;
            this.dragHandleIndex = position.index;
            
            // 记录起始状态
            startPoint = { 
                lng: position.lng, 
                lat: position.lat,
                screenX: e.clientX,
                screenY: e.clientY
            };
            startObj = JSON.parse(JSON.stringify(obj)); // 深拷贝
            startBounds = bounds ? JSON.parse(JSON.stringify(bounds)) : null;
            
            // 阻止地图的点击事件
            this.map.getCanvasContainer().style.pointerEvents = 'none';
            el.style.pointerEvents = 'all';
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
        
        const onMouseMove = (e) => {
            if (!isDragging || !startPoint || !startObj) return;
            
            // 获取鼠标相对于地图容器的坐标
            const container = this.map.getCanvasContainer();
            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // 转换为地理坐标
            const currentLngLat = this.map.unproject([mouseX, mouseY]);
            
            const dLng = currentLngLat.lng - startPoint.lng;
            const dLat = currentLngLat.lat - startPoint.lat;
            
            // 根据控制点类型更新对象
            if (position.type === 'center') {
                // 中心点：移动整个对象
                obj.p1.lng = startObj.p1.lng + dLng;
                obj.p1.lat = startObj.p1.lat + dLat;
                obj.p2.lng = startObj.p2.lng + dLng;
                obj.p2.lat = startObj.p2.lat + dLat;
            } else if (position.type === 'corner') {
                // 角点：调整大小（保持对角点不变）
                this._resizeByCorner(obj, startObj, startBounds, position.index, currentLngLat);
            } else if (position.type === 'edge') {
                // 边中点：调整单边
                this._resizeByEdge(obj, startObj, startBounds, position.position, currentLngLat);
            }
            
            // 更新显示
            this.refresh();
            
            // 实时更新控制点位置（不重建整个控制框，避免闪烁）
            this.controlHandles.forEach((handle, idx) => {
                if (handle.updatePosition && idx !== position.index) {
                    // 更新其他控制点的位置
                    const newBounds = this._getObjectBounds(obj);
                    if (newBounds) {
                        // 更新控制点位置
                        if (handle.position.type === 'corner') {
                            if (handle.position.index === 0) {
                                handle.position.lng = newBounds.minLng;
                                handle.position.lat = newBounds.maxLat;
                            } else if (handle.position.index === 1) {
                                handle.position.lng = newBounds.maxLng;
                                handle.position.lat = newBounds.maxLat;
                            } else if (handle.position.index === 2) {
                                handle.position.lng = newBounds.maxLng;
                                handle.position.lat = newBounds.minLat;
                            } else if (handle.position.index === 3) {
                                handle.position.lng = newBounds.minLng;
                                handle.position.lat = newBounds.minLat;
                            }
                        } else if (handle.position.type === 'edge') {
                            if (handle.position.position === 'top') {
                                handle.position.lng = (newBounds.minLng + newBounds.maxLng) / 2;
                                handle.position.lat = newBounds.maxLat;
                            } else if (handle.position.position === 'right') {
                                handle.position.lng = newBounds.maxLng;
                                handle.position.lat = (newBounds.minLat + newBounds.maxLat) / 2;
                            } else if (handle.position.position === 'bottom') {
                                handle.position.lng = (newBounds.minLng + newBounds.maxLng) / 2;
                                handle.position.lat = newBounds.minLat;
                            } else if (handle.position.position === 'left') {
                                handle.position.lng = newBounds.minLng;
                                handle.position.lat = (newBounds.minLat + newBounds.maxLat) / 2;
                            }
                        } else if (handle.position.type === 'center') {
                            handle.position.lng = (newBounds.minLng + newBounds.maxLng) / 2;
                            handle.position.lat = (newBounds.minLat + newBounds.maxLat) / 2;
                        }
                        handle.updatePosition();
                    }
                }
            });
            
            // 更新控制框边框（使用新方法）
            const newBounds = this._getObjectBounds(obj);
            if (newBounds) {
                this._updateControlBoxBounds(newBounds);
            }
            
            // 更新当前拖拽的控制点位置
            position.lng = currentLngLat.lng;
            position.lat = currentLngLat.lat;
            updateHandlePosition();
        };
        
        const onMouseUp = () => {
            isDragging = false;
            this.isDragging = false;
            this.dragHandleIndex = null;
            
            // 恢复地图的交互
            this.map.getCanvasContainer().style.pointerEvents = 'auto';
            
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            
            // 更新控制框（延迟一点，确保对象已更新）
            setTimeout(() => {
                const bounds = this._getObjectBounds(obj);
                if (bounds) {
                    this._showControlBox(obj);
                }
            }, 10);
        };
        
        // 地图移动/缩放时更新控制点位置
        const updatePosition = () => {
            if (!isDragging && !this.isDragging) { // 拖拽时不更新，避免冲突
                const point = this.map.project([position.lng, position.lat]);
                const container = this.map.getCanvasContainer();
                const rect = container.getBoundingClientRect();
                el.style.left = (rect.left + point.x - parseInt(size) / 2) + 'px';
                el.style.top = (rect.top + point.y - parseInt(size) / 2) + 'px';
            }
        };
        
        const moveHandler = () => updatePosition();
        const zoomHandler = () => updatePosition();
        
        this.map.on('move', moveHandler);
        this.map.on('zoom', zoomHandler);
        
        // 定期更新位置（防止地图动画时位置不同步）
        const updateInterval = setInterval(updatePosition, 100);
        
        return {
            element: el,
            position: position,
            updatePosition: updatePosition,
            remove: () => {
                el.remove();
                clearInterval(updateInterval);
                this.map.off('move', moveHandler);
                this.map.off('zoom', zoomHandler);
            }
        };
    }
    
    // 通过角点调整大小
    _resizeByCorner(obj, startObj, startBounds, cornerIndex, newHandlePos) {
        if (!startBounds) return;
        
        const centerLng = (startBounds.minLng + startBounds.maxLng) / 2;
        const centerLat = (startBounds.minLat + startBounds.maxLat) / 2;
        
        // 计算缩放比例
        let scaleX = 1, scaleY = 1;
        const oldWidth = startBounds.maxLng - startBounds.minLng;
        const oldHeight = startBounds.maxLat - startBounds.minLat;
        
        if (cornerIndex === 0) { // 左上
            scaleX = (centerLng - newHandlePos.lng) / (oldWidth / 2);
            scaleY = (newHandlePos.lat - centerLat) / (oldHeight / 2);
        } else if (cornerIndex === 1) { // 右上
            scaleX = (newHandlePos.lng - centerLng) / (oldWidth / 2);
            scaleY = (newHandlePos.lat - centerLat) / (oldHeight / 2);
        } else if (cornerIndex === 2) { // 右下
            scaleX = (newHandlePos.lng - centerLng) / (oldWidth / 2);
            scaleY = (centerLat - newHandlePos.lat) / (oldHeight / 2);
        } else if (cornerIndex === 3) { // 左下
            scaleX = (centerLng - newHandlePos.lng) / (oldWidth / 2);
            scaleY = (centerLat - newHandlePos.lat) / (oldHeight / 2);
        }
        
        // 对于圆形/椭圆，调整缩放参数而不是直接修改p1/p2
        if (obj.type === 'circle' || obj.type === 'ellipse') {
            // 计算基础距离（p1到p2的距离）
            const from = turf.point([startObj.p1.lng, startObj.p1.lat]);
            const to = turf.point([startObj.p2.lng, startObj.p2.lat]);
            const baseDist = turf.distance(from, to, { units: 'kilometers' });
            
            // 计算新的缩放比例（保持中心点不变）
            const avgScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2; // 使用平均缩放，保持圆形
            obj.majorAxisScale = (startObj.majorAxisScale || 1.0) * Math.abs(scaleX);
            obj.minorAxisScale = (startObj.minorAxisScale || 1.0) * Math.abs(scaleY);
            
            // 更新aspectRatio以保持形状比例
            if (startObj.aspectRatio !== undefined) {
                obj.aspectRatio = startObj.aspectRatio * (Math.abs(scaleY) / Math.abs(scaleX));
            }
        } else {
            // 对于直线和箭头，直接修改p1和p2
            const centerObjLng = (startObj.p1.lng + startObj.p2.lng) / 2;
            const centerObjLat = (startObj.p1.lat + startObj.p2.lat) / 2;
            
            obj.p1.lng = centerObjLng + (startObj.p1.lng - centerObjLng) * scaleX;
            obj.p1.lat = centerObjLat + (startObj.p1.lat - centerObjLat) * scaleY;
            obj.p2.lng = centerObjLng + (startObj.p2.lng - centerObjLng) * scaleX;
            obj.p2.lat = centerObjLat + (startObj.p2.lat - centerObjLat) * scaleY;
        }
    }
    
    // 通过边中点调整大小
    _resizeByEdge(obj, startObj, startBounds, edgePosition, newHandlePos) {
        if (!startBounds) return;
        
        const centerLng = (startBounds.minLng + startBounds.maxLng) / 2;
        const centerLat = (startBounds.minLat + startBounds.maxLat) / 2;
        const oldWidth = startBounds.maxLng - startBounds.minLng;
        const oldHeight = startBounds.maxLat - startBounds.minLat;
        
        let scaleX = 1, scaleY = 1;
        
        if (edgePosition === 'top' || edgePosition === 'bottom') {
            scaleY = edgePosition === 'top' 
                ? (newHandlePos.lat - centerLat) / (oldHeight / 2)
                : (centerLat - newHandlePos.lat) / (oldHeight / 2);
        } else {
            scaleX = edgePosition === 'right'
                ? (newHandlePos.lng - centerLng) / (oldWidth / 2)
                : (centerLng - newHandlePos.lng) / (oldWidth / 2);
        }
        
        // 对于圆形/椭圆，调整缩放参数
        if (obj.type === 'circle' || obj.type === 'ellipse') {
            if (edgePosition === 'top' || edgePosition === 'bottom') {
                obj.minorAxisScale = (startObj.minorAxisScale || 1.0) * Math.abs(scaleY);
            } else {
                obj.majorAxisScale = (startObj.majorAxisScale || 1.0) * Math.abs(scaleX);
            }
        } else {
            // 对于直线和箭头，直接修改p1和p2
            const centerObjLng = (startObj.p1.lng + startObj.p2.lng) / 2;
            const centerObjLat = (startObj.p1.lat + startObj.p2.lat) / 2;
            
            obj.p1.lng = centerObjLng + (startObj.p1.lng - centerObjLng) * scaleX;
            obj.p1.lat = centerObjLat + (startObj.p1.lat - centerObjLat) * scaleY;
            obj.p2.lng = centerObjLng + (startObj.p2.lng - centerObjLng) * scaleX;
            obj.p2.lat = centerObjLat + (startObj.p2.lat - centerObjLat) * scaleY;
        }
    }
    
    // 创建旋转手柄
    _createRotationHandle(bounds, obj) {
        // 旋转手柄在顶部中间上方
        const handleDistance = (bounds.maxLat - bounds.minLat) * 0.3; // 距离顶部30%的高度
        const rotationHandlePos = {
            lng: (bounds.minLng + bounds.maxLng) / 2,
            lat: bounds.maxLat + handleDistance,
            type: 'rotation',
            index: 9
        };
        
        const el = document.createElement('div');
        el.className = 'dt-rotation-handle';
        el.innerHTML = '↻';
        el.style.cssText = `
            width: 20px;
            height: 20px;
            background: white;
            border: 2px solid #0071e3;
            border-radius: 50%;
            cursor: grab;
            position: fixed;
            pointer-events: all;
            z-index: 999999;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            color: #0071e3;
            user-select: none;
            transform: translateZ(0);
            will-change: transform;
        `;
        
        const updatePosition = () => {
            const point = this.map.project([rotationHandlePos.lng, rotationHandlePos.lat]);
            const container = this.map.getCanvasContainer();
            const rect = container.getBoundingClientRect();
            el.style.left = (rect.left + point.x - 10) + 'px';
            el.style.top = (rect.top + point.y - 10) + 'px';
        };
        
        updatePosition();
        
        // 添加到控制点容器
        let controlHandlesContainer = document.getElementById('dt-control-handles-container');
        if (!controlHandlesContainer) {
            controlHandlesContainer = document.createElement('div');
            controlHandlesContainer.id = 'dt-control-handles-container';
            controlHandlesContainer.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 999999;
            `;
            document.body.appendChild(controlHandlesContainer);
        }
        
        el.style.pointerEvents = 'all';
        controlHandlesContainer.appendChild(el);
        
        // 旋转逻辑
        let isRotating = false;
        let startAngle = 0;
        let startRotation = obj.rotation || 0;
        let startP1 = null;
        let startP2 = null;
        let centerPoint = null;
        
        el.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            e.stopImmediatePropagation();
            
            isRotating = true;
            this.isDragging = true;
            
            // 计算对象中心点
            const bounds = this._getObjectBounds(obj);
            if (!bounds) return;
            
            centerPoint = {
                lng: (bounds.minLng + bounds.maxLng) / 2,
                lat: (bounds.minLat + bounds.maxLat) / 2
            };
            
            // 保存初始点位置（深拷贝）
            startP1 = { lng: obj.p1.lng, lat: obj.p1.lat };
            startP2 = { lng: obj.p2.lng, lat: obj.p2.lat };
            
            // 计算初始角度（旋转手柄相对于中心点的角度）
            const centerScreen = this.map.project([centerPoint.lng, centerPoint.lat]);
            const handleScreen = this.map.project([rotationHandlePos.lng, rotationHandlePos.lat]);
            startAngle = Math.atan2(
                handleScreen.y - centerScreen.y,
                handleScreen.x - centerScreen.x
            );
            
            // 记录初始旋转角度
            startRotation = obj.rotation || 0;
            
            // 阻止地图交互
            this.map.getCanvasContainer().style.pointerEvents = 'none';
            el.style.pointerEvents = 'all';
            el.style.cursor = 'grabbing';
            
            document.addEventListener('mousemove', onRotateMove);
            document.addEventListener('mouseup', onRotateUp);
        });
        
        const onRotateMove = (e) => {
            if (!isRotating || !centerPoint || !startP1 || !startP2) return;
            
            // 获取鼠标在地图上的位置
            const container = this.map.getCanvasContainer();
            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // 计算中心点的屏幕坐标
            const centerScreen = this.map.project([centerPoint.lng, centerPoint.lat]);
            
            // 计算当前角度（鼠标相对于中心点的角度）
            const currentAngle = Math.atan2(
                mouseY - centerScreen.y,
                mouseX - centerScreen.x
            );
            
            // 计算角度差（弧度）
            // 屏幕坐标系 y 轴向下，方向与直觉相反，这里取反以保证“鼠标逆时针=图形逆时针”
            let angleDelta = startAngle - currentAngle;
            
            if (obj.type === 'circle' || obj.type === 'ellipse') {
                // 只允许 0~180° 的有效旋转（椭圆 0° 和 180° 是同一个姿态）
                let newRotation = startRotation + angleDelta;
                // 先归一到 0~2π
                const twoPi = Math.PI * 2;
                newRotation = newRotation % twoPi;
                if (newRotation < 0) newRotation += twoPi;
                // 再折叠到 0~π（0~180°）
                if (newRotation > Math.PI) newRotation -= Math.PI;
                obj.rotation = newRotation;
            } else {
                // 对于直线和箭头，需要旋转p1和p2点
                // 使用初始点位置，避免累积误差
                const centerLng = (startP1.lng + startP2.lng) / 2;
                const centerLat = (startP1.lat + startP2.lat) / 2;
                
                // 计算初始p1和p2相对于中心点的偏移
                const dLng1 = startP1.lng - centerLng;
                const dLat1 = startP1.lat - centerLat;
                const dLng2 = startP2.lng - centerLng;
                const dLat2 = startP2.lat - centerLat;
                
                // 应用旋转矩阵（使用地理坐标系的近似旋转）
                const cos = Math.cos(angleDelta);
                const sin = Math.sin(angleDelta);
                
                // 对于地理坐标，需要考虑纬度的影响
                // 简化处理：在小范围内，经度方向的旋转需要考虑纬度缩放
                const latScale = Math.cos(centerLat * Math.PI / 180);
                
                obj.p1.lng = centerLng + (dLng1 * cos - dLat1 * sin) / latScale;
                obj.p1.lat = centerLat + dLng1 * sin * latScale + dLat1 * cos;
                obj.p2.lng = centerLng + (dLng2 * cos - dLat2 * sin) / latScale;
                obj.p2.lat = centerLat + dLng2 * sin * latScale + dLat2 * cos;
                
                // 也更新rotation属性（用于记录旋转状态）
                obj.rotation = startRotation + angleDelta;
            }
            
            // 更新显示
            this.refresh();
            
            // 更新控制框和旋转手柄位置
            const newBounds = this._getObjectBounds(obj);
            if (newBounds) {
                this._updateControlBoxBounds(newBounds);
                
                // 更新旋转手柄位置
                const handleDistance = (newBounds.maxLat - newBounds.minLat) * 0.3;
                rotationHandlePos.lng = (newBounds.minLng + newBounds.maxLng) / 2;
                rotationHandlePos.lat = newBounds.maxLat + handleDistance;
                updatePosition();
            }
            
            // 更新属性面板中的旋转角度显示（始终 0~180°）
            const rotationInput = document.getElementById('dt-rotation-input');
            if (rotationInput) {
                let rotationDeg = (obj.rotation * 180 / Math.PI);
                // 理论上此时已在 0~180 之间，下面只是安全夹紧
                if (rotationDeg < 0) rotationDeg += 180 * Math.ceil(-rotationDeg / 180);
                rotationDeg = Math.max(0, Math.min(180, rotationDeg));
                rotationInput.value = rotationDeg;
                const valueDisplay = rotationInput.parentElement.querySelector('label span:last-child');
                if (valueDisplay) {
                    valueDisplay.innerText = `${rotationDeg.toFixed(0)}°`;
                }
            }
        };
        
        const onRotateUp = () => {
            isRotating = false;
            this.isDragging = false;
            this.map.getCanvasContainer().style.pointerEvents = 'auto';
            el.style.cursor = 'grab';
            document.removeEventListener('mousemove', onRotateMove);
            document.removeEventListener('mouseup', onRotateUp);
            
            // 更新控制框（延迟一点，确保对象已更新）
            setTimeout(() => {
                const bounds = this._getObjectBounds(obj);
                if (bounds) {
                    this._showControlBox(obj);
                }
            }, 10);
        };
        
        const moveHandler = () => updatePosition();
        const zoomHandler = () => updatePosition();
        this.map.on('move', moveHandler);
        this.map.on('zoom', zoomHandler);
        const updateInterval = setInterval(updatePosition, 100);
        
        return {
            element: el,
            position: rotationHandlePos,
            remove: () => {
                el.remove();
                clearInterval(updateInterval);
                this.map.off('move', moveHandler);
                this.map.off('zoom', zoomHandler);
            }
        };
    }
}
