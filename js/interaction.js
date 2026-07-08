/**
 * PLANAR - 通用平面连杆机构仿真平台
 * interaction.js - 交互系统（状态机）
 *
 * 三种交互模式：
 *   BUILD    - 构建模式：添加/删除节点、连杆、驱动器
 *   DRAG     - 拖动模式：拖拽节点进行逆运动学求解
 *   ANIMATE  - 动画模式：播放/暂停运动仿真
 */

var Planar = window.Planar || {};

// ============================================================
// InteractionManager
// ============================================================
class InteractionManager {
    /**
     * @param {Renderer} renderer
     * @param {NewtonRaphsonSolver} solver
     * @param {Mechanism} mechanism
     */
    constructor(renderer, solver, mechanism) {
        this.renderer = renderer;
        this.solver = solver;
        this.mechanism = mechanism;

        // 三种模式
        this.MODE = { BUILD: 'build', DRAG: 'drag', ANIMATE: 'animate' };
        this.mode = this.MODE.BUILD;

        // 构建模式状态
        this._buildState = {
            firstNodeId: null,       // 连线第一个节点
            pendingLink: false,
            pointerDownNodeId: null,
            pointerDownPos: null,
            nodeDragging: false
        };

        // 拖动模式状态
        this._dragState = {
            dragging: false,
            draggedNodeId: null,
            dragStartX: 0,
            dragStartY: 0,
            dragTargetX: 0,
            dragTargetY: 0,
            previousPositions: null  // 用于撤销
        };

        // 动画模式状态
        this._animState = {
            playing: false,
            time: 0,
            speedMultiplier: 1.0,
            lastTimestamp: 0,
            animationId: null
        };

        // 键盘快捷键
        this._keyMap = {
            'Delete': 'delete',
            'Backspace': 'delete',
            'Escape': 'cancel',
            '1': 'modeBuild',
            '2': 'modeDrag',
            '3': 'modeAnimate',
            ' ': 'togglePlay',
            'R': 'reset',
            'C': 'clearTraces',
            'D': 'toggleDriver'
        };

        // Ctrl+Z / Ctrl+Y 撤销重做
        this._keyMapCC = {
            'z': 'undo',
            'Z': 'undo',
            'y': 'redo',
            'Y': 'redo'
        };

        // 回调
        this.onChange = null;       // 机构改变回调
        this.onStatus = null;       // 状态栏更新回调
        this.onModeChange = null;   // 模式切换回调

        // 撤销/重做栈
        this._undoStack = [];
        this._redoStack = [];
        this._undoMaxSteps = 30;

        // 绑定事件
        this._bindEvents();
    }

    /** 设置机构 */
    setMechanism(mech) {
        this.mechanism = mech;
        this.renderer.setMechanism(mech);
        this._buildState.firstNodeId = null;
        this._buildState.pendingLink = false;
        this.renderer.selectedNode = null;
        this.renderer.selectedLink = null;
        if (this._animState.playing) this.stopAnimation();
        // 设置新机构时清空撤销栈
        this._undoStack = [];
        this._redoStack = [];
    }

    /** 设置渲染器引用 */
    setRenderer(renderer) {
        this.renderer = renderer;
    }

    // ============================================================
    // 模式切换
    // ============================================================
    setMode(mode) {
        if (!Object.values(this.MODE).includes(mode)) return;
        this.mode = mode;

        // 退出动画模式时停止
        if (mode !== this.MODE.ANIMATE && this._animState.playing) {
            this.stopAnimation();
        }

        // 取消构建状态
        if (mode !== this.MODE.BUILD) {
            this._buildState.firstNodeId = null;
            this._buildState.pendingLink = false;
        }

        // 退出拖动模式
        if (mode !== this.MODE.DRAG) {
            this._dragState.dragging = false;
            this._dragState.draggedNodeId = null;
        }

        // 更新光标
        this._updateCursor();

        if (this.onModeChange) this.onModeChange(mode);
    }

    getMode() { return this.mode; }

    // ============================================================
    // 事件绑定
    // ============================================================
    _bindEvents() {
        const canvas = this.renderer.canvas;

        // 鼠标事件
        canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
        canvas.addEventListener('pointermove', (e) => this._onPointerMove(e));
        canvas.addEventListener('pointerup', (e) => this._onPointerUp(e));
        canvas.addEventListener('wheel', (e) => this._onWheel(e));

        // 右键菜单
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // 键盘
        document.addEventListener('keydown', (e) => this._onKeyDown(e));
    }

    // ============================================================
    // 视口控制
    // ============================================================
    pan(dx, dy) {
        this.renderer.offsetX += dx;
        this.renderer.offsetY += dy;
        this.renderer.render(this.mechanism);
    }

    zoom(factor, centerX, centerY) {
        const world = this.renderer.screenToWorld(centerX, centerY);
        const oldScale = this.renderer.scale;
        this.renderer.scale = Math.max(0.05, Math.min(20, this.renderer.scale * factor));
        const actualFactor = this.renderer.scale / oldScale;
        // 保持鼠标位置在世界坐标中不变
        // screenToWorld: world = screen/scale - offset
        // 保持 world 不变 → offset = screen/scale - world
        this.renderer.offsetX = centerX / this.renderer.scale - world.x;
        this.renderer.offsetY = centerY / this.renderer.scale - world.y;
        this.renderer.render(this.mechanism);
        this._updateStatus();
    }

    resetView() {
        this.renderer.offsetX = 0;
        this.renderer.offsetY = 0;
        this.renderer.scale = 1.0;
        this.renderer.render(this.mechanism);
    }

    fitView() {
        if (!this.mechanism || this.mechanism.nodes.size === 0) return;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const node of this.mechanism.nodes.values()) {
            if (node.getX() < minX) minX = node.getX();
            if (node.getX() > maxX) maxX = node.getX();
            if (node.getY() < minY) minY = node.getY();
            if (node.getY() > maxY) maxY = node.getY();
        }
        const W = this.renderer.canvas.width / (window.devicePixelRatio || 1);
        const H = this.renderer.canvas.height / (window.devicePixelRatio || 1);
        const margin = 40;
        const rangeX = (maxX - minX) || 1;
        const rangeY = (maxY - minY) || 1;
        const scaleX = (W - 2 * margin) / rangeX;
        const scaleY = (H - 2 * margin) / rangeY;
        this.renderer.scale = Math.min(scaleX, scaleY);
        this.renderer.offsetX = (W / this.renderer.scale - (minX + maxX)) / 2;
        this.renderer.offsetY = (H / this.renderer.scale - (minY + maxY)) / 2;
        this.renderer.render(this.mechanism);
    }

    // ============================================================
    // 指针事件处理
    // ============================================================
    _getPointerPos(e) {
        const rect = this.renderer.canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    _onPointerDown(e) {
        const pos = this._getPointerPos(e);
        const isLeft = e.button === 0;
        const isRight = e.button === 2;

        // 中键拖动平移
        if (e.button === 1 || e.shiftKey) {
            this._dragState.dragging = true;
            this._dragState.dragStartX = pos.x;
            this._dragState.dragStartY = pos.y;
            this._dragState.draggedNodeId = 'pan';
            return;
        }

        switch (this.mode) {
            case this.MODE.BUILD:
                this._onBuildPointerDown(e, pos, isLeft, isRight);
                break;
            case this.MODE.DRAG:
                this._onDragPointerDown(e, pos, isLeft);
                break;
            case this.MODE.ANIMATE:
                // 动画模式下只允许平移/缩放
                break;
        }
    }

    _onPointerMove(e) {
        const pos = this._getPointerPos(e);

        // 更新 hover（所有模式）
        if (this.mechanism) {
            const hitNode = this.renderer.hitTestNode(pos.x, pos.y);
            const hitLink = this.renderer.hitTestLink(pos.x, pos.y);
            this.renderer.hoveredNode = hitNode ? hitNode.node.id : null;
            this.renderer.hoveredLink = hitLink ? hitLink.link.id : null;
            this.renderer.render(this.mechanism);
        }

        // 平移
        if (this._dragState.dragging && this._dragState.draggedNodeId === 'pan') {
            const dx = (pos.x - this._dragState.dragStartX) / this.renderer.scale;
            const dy = (pos.y - this._dragState.dragStartY) / this.renderer.scale;
            this.renderer.offsetX += dx;
            this.renderer.offsetY += dy;
            this._dragState.dragStartX = pos.x;
            this._dragState.dragStartY = pos.y;
            this.renderer.render(this.mechanism);
            this._updateStatus();
            return;
        }

        switch (this.mode) {
            case this.MODE.BUILD:
                this._onBuildPointerMove(pos, e);
                break;
            case this.MODE.DRAG:
                this._onDragPointerMove(pos, e);
                break;
        }
    }

    _onPointerUp(e) {
        if (this._dragState.dragging) {
            // 如果是拖拽节点，检查最终状态
            if (this._dragState.draggedNodeId !== 'pan' && this._dragState.draggedNodeId !== null) {
                this._onDragEnd();
            }
            this._dragState.dragging = false;
            this._dragState.draggedNodeId = null;
        }

        const pos = this._getPointerPos(e);

        switch (this.mode) {
            case this.MODE.BUILD:
                this._onBuildPointerUp(pos);
                break;
        }
    }

    _onWheel(e) {
        e.preventDefault();
        // 限流：最多每 16ms 处理一次缩放
        const now = performance.now();
        if (this._lastWheelTime && now - this._lastWheelTime < 16) return;
        this._lastWheelTime = now;
        const pos = this._getPointerPos(e);
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        this.zoom(factor, pos.x, pos.y);
    }

    // ============================================================
    // 构建模式
    // ============================================================
    _onBuildPointerDown(e, pos, isLeft, isRight) {
        const hitNode = this.renderer.hitTestNode(pos.x, pos.y);
        const hitLink = hitNode ? null : this.renderer.hitTestLink(pos.x, pos.y);

        if (isRight) {
            // 右键：固定节点
            const world = this.renderer.screenToWorld(pos.x, pos.y);
            this.addNode(world.x, world.y, true);
            return;
        }

        if (!isLeft) return;

        if (hitNode) {
            this._buildState.pointerDownNodeId = hitNode.node.id;
            this._buildState.pointerDownPos = { x: pos.x, y: pos.y };
            this._buildState.nodeDragging = false;
            this.renderer.canvas.setPointerCapture(e.pointerId);
        } else if (hitLink) {
            this._buildState.firstNodeId = null;
            this._buildState.pendingLink = false;
            this.renderer.selectedNode = null;
            this.renderer.selectedLink = hitLink.link.id;
            this.renderer.render(this.mechanism);
        } else {
            // 左键空白：添加自由节点
            const world = this.renderer.screenToWorld(pos.x, pos.y);
            this.addNode(world.x, world.y, false);
        }
    }

    _onBuildPointerMove(pos, e) {
        if (this._buildState.pointerDownNodeId !== null && e.buttons !== 0) {
            const start = this._buildState.pointerDownPos;
            const moved = start ? Math.hypot(pos.x - start.x, pos.y - start.y) : 0;
            if (!this._buildState.nodeDragging && moved > 4) {
                this._saveSnapshot();
                this._buildState.nodeDragging = true;
                this._buildState.firstNodeId = null;
                this._buildState.pendingLink = false;
                this.renderer.selectedNode = this._buildState.pointerDownNodeId;
                this.renderer.selectedLink = null;
            }
            if (this._buildState.nodeDragging) {
                const node = this.mechanism.getNode(this._buildState.pointerDownNodeId);
                if (node) {
                    const world = this.renderer.screenToWorld(pos.x, pos.y);
                    node.setPos(world.x, world.y);
                    this._updateConnectedLinkLengths(node.id);
                    this.renderer.render(this.mechanism);
                    this._updateStatus();
                }
                return;
            }
        }

        // 在连线过程中，显示预览虚线
        if (this._buildState.firstNodeId !== null) {
            this._buildState.pendingLink = true;
        }
    }

    _onBuildPointerUp(pos) {
        const nodeId = this._buildState.pointerDownNodeId;
        const wasDragging = this._buildState.nodeDragging;
        this._buildState.pointerDownNodeId = null;
        this._buildState.pointerDownPos = null;
        this._buildState.nodeDragging = false;

        if (nodeId === null) return;

        if (wasDragging) {
            if (this.onChange) this.onChange(this.mechanism);
            this._updateStatus();
            return;
        }

        const hitNode = this.renderer.hitTestNode(pos.x, pos.y);
        if (!hitNode || hitNode.node.id !== nodeId) return;

        // 点击节点
        if (this._buildState.firstNodeId === null) {
            // 第一个节点
            this._buildState.firstNodeId = nodeId;
            this.renderer.selectedNode = nodeId;
            this.renderer.selectedLink = null;
            this.renderer.render(this.mechanism);
        } else if (this._buildState.firstNodeId !== nodeId) {
            // 第二个节点：创建连杆
            this.addLink(this._buildState.firstNodeId, nodeId);
            this._buildState.firstNodeId = null;
            this._buildState.pendingLink = false;
            this.renderer.selectedNode = null;
            this.renderer.selectedLink = null;
            this.renderer.render(this.mechanism);
        } else {
            // 点击同一个节点：取消
            this._buildState.firstNodeId = null;
            this._buildState.pendingLink = false;
            this.renderer.selectedNode = null;
            this.renderer.selectedLink = null;
            this.renderer.render(this.mechanism);
        }
    }

    // ============================================================
    // 手动模式（IK 求解，连杆保持刚性约束）
    // ============================================================
    _onDragPointerDown(e, pos, isLeft) {
        if (!this.mechanism) return;

        const hitNode = this.renderer.hitTestNode(pos.x, pos.y);
        if (hitNode) {
            this.renderer.selectedNode = hitNode.node.id;
            this.renderer.selectedLink = null;
            this.renderer.render(this.mechanism);
        } else {
            const hitLink = this.renderer.hitTestLink(pos.x, pos.y);
            if (hitLink) {
                this.renderer.selectedNode = null;
                this.renderer.selectedLink = hitLink.link.id;
                this.renderer.render(this.mechanism);
            }
        }

        if (isLeft && hitNode && !hitNode.node.fixed) {
            // 开始 IK 拖拽（连杆保持刚性）
            this._dragState.dragging = true;
            this._dragState.draggedNodeId = hitNode.node.id;
            this._dragState.dragTargetX = pos.x;
            this._dragState.dragTargetY = pos.y;
            // 隐式指针捕获，确保 pointerup 不丢失
            this.renderer.canvas.setPointerCapture(e.pointerId);
        }
    }

    _onDragPointerMove(pos, e) {
        if (!this._dragState.dragging || this._dragState.draggedNodeId === 'pan') return;
        if (this._dragState.draggedNodeId === null) return;

        const nodeId = this._dragState.draggedNodeId;
        const world = this.renderer.screenToWorld(pos.x, pos.y);

        // 保存机构快照以便求解失败时恢复
        if (!this._dragState.previousPositions) {
            this._dragState.previousPositions = this._savePositions();
        }

        // 尝试 IK 求解：连杆保持刚性，不改变杆长
        const success = this.solver.solveDrag(this.mechanism, nodeId, world.x, world.y);

        if (success) {
            this.renderer.render(this.mechanism);
            this._updateStatus();
        }
        // 求解失败时，节点停留在上一个可行位置
    }

    _onDragEnd() {
        this._dragState.previousPositions = null;
        if (this.onChange) this.onChange(this.mechanism);
        this._updateStatus();
    }

    // ============================================================
    // 动画模式
    // ============================================================
    startAnimation() {
        if (this._animState.playing) return;
        this._animState.playing = true;
        this._animState.lastTimestamp = performance.now();
        this._animState.time = 0;
        this._animLoop();
        if (this.onModeChange) this.onModeChange(this.mode);
    }

    stopAnimation() {
        this._animState.playing = false;
        if (this._animState.animationId) {
            cancelAnimationFrame(this._animState.animationId);
            this._animState.animationId = null;
        }
        if (this.onModeChange) this.onModeChange(this.mode);
    }

    toggleAnimation() {
        if (this._animState.playing) {
            this.stopAnimation();
        } else {
            this.startAnimation();
        }
    }

    isPlaying() { return this._animState.playing; }

    setSpeed(speed) {
        this._animState.speedMultiplier = Math.max(0.1, Math.min(5, speed));
    }

    getSpeed() { return this._animState.speedMultiplier; }

    _animLoop() {
        if (!this._animState.playing) return;

        const now = performance.now();
        const dtRaw = (now - this._animState.lastTimestamp) / 1000;
        // 限制最大步长避免跳跃
        const dt = Math.min(dtRaw, 0.05) * this._animState.speedMultiplier;
        this._animState.lastTimestamp = now;
        this._animState.time += dt;

        // 求解一步
        this.solver.solveStep(this.mechanism, dt);

        // 记录轨迹
        this.renderer.recordTraces(this.mechanism);
        this.renderer.render(this.mechanism);
        this._updateStatus();

        this._animState.animationId = requestAnimationFrame(() => this._animLoop());
    }

    resetAnimation() {
        this.mechanism.resetPositions();
        for (const driver of this.mechanism.drivers.values()) {
            driver.reset();
        }
        this.renderer.clearTraces();
        this.solver.reset();
        this.renderer.render(this.mechanism);
        this._updateStatus();
    }

    // ============================================================
    // 机构修改操作
    // ============================================================
    addNode(x, y, fixed = false) {
        this._saveSnapshot();
        if (!this.mechanism) {
            this.mechanism = new Planar.Mechanism();
            this.renderer.setMechanism(this.mechanism);
        }
        const node = this.mechanism.addNode(x, y, fixed);
        this.renderer.render(this.mechanism);
        if (this.onChange) this.onChange(this.mechanism);
        this._updateStatus();
        return node;
    }

    removeNode(nodeId) {
        this._saveSnapshot();
        if (!this.mechanism) return;
        this.mechanism.removeNode(nodeId);
        this.renderer.selectedNode = null;
        this.renderer.render(this.mechanism);
        if (this.onChange) this.onChange(this.mechanism);
        this._updateStatus();
    }

    addLink(nodeA, nodeB) {
        this._saveSnapshot();
        if (!this.mechanism) return null;
        // 检查是否已存在重复连杆
        for (const link of this.mechanism.links.values()) {
            if ((link.nodeA === nodeA && link.nodeB === nodeB) ||
                (link.nodeA === nodeB && link.nodeB === nodeA)) {
                return null; // 重复
            }
        }
        const link = this.mechanism.addLink(nodeA, nodeB);
        this.renderer.render(this.mechanism);
        if (this.onChange) this.onChange(this.mechanism);
        this._updateStatus();
        return link;
    }

    removeLink(linkId) {
        this._saveSnapshot();
        if (!this.mechanism) return;
        this.mechanism.removeLink(linkId);
        this.renderer.selectedLink = null;
        this.renderer.render(this.mechanism);
        if (this.onChange) this.onChange(this.mechanism);
        this._updateStatus();
    }

    toggleDriver(linkId) {
        this._saveSnapshot();
        if (!this.mechanism) return;
        // 检查是否已有驱动
        for (const [id, driver] of this.mechanism.drivers) {
            if (driver.linkId === linkId) {
                this.mechanism.removeDriver(id);
                this.renderer.render(this.mechanism);
                if (this.onChange) this.onChange(this.mechanism);
                this._updateStatus();
                return;
            }
        }
        // 添加驱动（默认 1 rad/s）
        this.mechanism.addDriver(linkId, 'rotary', 1.0, 0);
        this.renderer.render(this.mechanism);
        if (this.onChange) this.onChange(this.mechanism);
        this._updateStatus();
    }

    clearSelection() {
        this._buildState.firstNodeId = null;
        this._buildState.pendingLink = false;
        this.renderer.selectedNode = null;
        this.renderer.selectedLink = null;
        this.renderer.render(this.mechanism);
    }

    deleteSelection() {
        if (this.renderer.selectedNode) {
            this.removeNode(this.renderer.selectedNode);
            return true;
        }
        if (this.renderer.selectedLink) {
            this.removeLink(this.renderer.selectedLink);
            return true;
        }
        return false;
    }

    toggleDriverOnSelection() {
        if (!this.renderer.selectedLink) return false;
        this.toggleDriver(this.renderer.selectedLink);
        return true;
    }

    // ============================================================
    // 键盘快捷键
    // ============================================================
    _onKeyDown(e) {
        // Ctrl+Z / Ctrl+Y（任何模式下）
        if (e.ctrlKey || e.metaKey) {
            const ccAction = this._keyMapCC[e.key];
            if (ccAction) {
                e.preventDefault();
                if (ccAction === 'undo') this.undo();
                else if (ccAction === 'redo') this.redo();
                return;
            }
        }

        // 先精确匹配，再尝试大写（针对字母键）
        let action = this._keyMap[e.key];
        if (!action && e.key.length === 1) {
            action = this._keyMap[e.key.toUpperCase()];
        }
        if (!action) return;
        e.preventDefault();

        switch (action) {
            case 'delete':
                this.deleteSelection();
                break;
            case 'cancel':
                this.clearSelection();
                break;
            case 'modeBuild':
                this.setMode(this.MODE.BUILD);
                break;
            case 'modeDrag':
                this.setMode(this.MODE.DRAG);
                break;
            case 'modeAnimate':
                this.setMode(this.MODE.ANIMATE);
                break;
            case 'togglePlay':
                if (this.mode === this.MODE.ANIMATE) {
                    this.toggleAnimation();
                }
                break;
            case 'reset':
                this.resetAnimation();
                break;
            case 'clearTraces':
                this.renderer.clearTraces();
                this.renderer.render(this.mechanism);
                break;
            case 'toggleDriver':
                this.toggleDriverOnSelection();
                break;
        }
    }

    // ============================================================
    // 撤销/重做
    // ============================================================

    /** 保存当前机构快照到撤销栈 */
    _saveSnapshot() {
        if (!this.mechanism) return;
        const json = this.mechanism.toJSON();
        this._undoStack.push(json);
        if (this._undoStack.length > this._undoMaxSteps) {
            this._undoStack.shift();
        }
        // 任何新改动会清空重做栈
        this._redoStack = [];
    }

    /** 从撤销栈恢复 */
    undo() {
        if (this._undoStack.length === 0) return;
        // 保存当前状态到重做栈
        if (this.mechanism) {
            this._redoStack.push(this.mechanism.toJSON());
        }
        const json = this._undoStack.pop();
        this._applySnapshot(json);
        if (this.onModeChange) this.onModeChange(this.mode);
    }

    /** 从重做栈恢复 */
    redo() {
        if (this._redoStack.length === 0) return;
        // 保存当前状态到撤销栈
        if (this.mechanism) {
            this._undoStack.push(this.mechanism.toJSON());
        }
        const json = this._redoStack.pop();
        this._applySnapshot(json);
        if (this.onModeChange) this.onModeChange(this.mode);
    }

    /** 应用快照到当前机构 */
    _applySnapshot(json) {
        const mech = Planar.Mechanism.fromJSON(json);
        this.mechanism = mech;
        this.renderer.setMechanism(mech);
        this.renderer.clearTraces();
        this.renderer.render(mech);
        if (this.onChange) this.onChange(mech);
        this._updateStatus();
    }

    // ============================================================
    // 辅助方法
    // ============================================================
    _updateCursor() {
        const canvas = this.renderer.canvas;
        switch (this.mode) {
            case this.MODE.BUILD:
                canvas.style.cursor = 'crosshair';
                break;
            case this.MODE.DRAG:
                canvas.style.cursor = 'grab';
                break;
            case this.MODE.ANIMATE:
                canvas.style.cursor = this._animState.playing ? 'not-allowed' : 'default';
                break;
        }
    }

    _updateStatus() {
        if (!this.onStatus) return;
        if (!this.mechanism) {
            this.onStatus({ mode: this.mode, dof: 0, nodes: 0, links: 0, drivers: 0, playing: this._animState.playing });
            return;
        }
        this.onStatus({
            mode: this.mode,
            dof: this.mechanism.getDOF(),
            nodes: this.mechanism.nodes.size,
            links: this.mechanism.links.size,
            drivers: this.mechanism.drivers.size,
            playing: this._animState.playing,
            time: this._animState.time,
            speed: this._animState.speedMultiplier,
            scale: this.renderer.scale
        });
    }

    _savePositions() {
        const pos = {};
        for (const node of this.mechanism.nodes.values()) {
            pos[node.id] = { x: node.getX(), y: node.getY() };
        }
        return pos;
    }

    _updateConnectedLinkLengths(nodeId) {
        if (!this.mechanism) return;
        for (const link of this.mechanism.links.values()) {
            if (link.nodeA !== nodeId && link.nodeB !== nodeId) continue;
            const a = this.mechanism.getNode(link.nodeA);
            const b = this.mechanism.getNode(link.nodeB);
            if (!a || !b) continue;
            link.length = Planar.Vec2.dist(a.pos(), b.pos());
        }
    }

    /** 清理资源 */
    dispose() {
        this.stopAnimation();
    }
}

Planar.InteractionManager = InteractionManager;
window.Planar = Planar;