/**
 * PLANAR - 通用平面连杆机构仿真平台
 * model.js - 机构数据模型
 *
 * 核心概念：
 *   Node    - 铰链点（自由/固定）
 *   Link    - 刚性连杆（两个节点之间的定长约束）
 *   Driver  - 主动驱动器（旋转驱动）
 *   Mechanism - 完整机构（包含上述所有元素 + 求解器接口）
 */

var Planar = window.Planar || {};
if (!Planar.Vec2) throw new Error('utils.js must be loaded before model.js');

// ============================================================
// Node - 铰链节点
// ============================================================
class Node {
    /**
     * @param {number} id - 唯一标识
     * @param {number} x - 初始 x 坐标
     * @param {number} y - 初始 y 坐标
     * @param {boolean} fixed - 是否固定（地铰）
     */
    constructor(id, x, y, fixed = false) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.fixed = fixed;
        // 求解过程中暂存
        this._x = x;
        this._y = y;
    }

    /** 重置到初始位置 */
    reset() {
        this._x = this.x;
        this._y = this.y;
    }

    /** 获取当前求解位置 */
    getX() { return this._x; }
    getY() { return this._y; }

    /** 设置当前位置 */
    setPos(x, y) {
        this._x = x;
        this._y = y;
    }

    /** 位置向量 */
    pos() { return { x: this._x, y: this._y }; }

    /** isFixed 快捷方式 */
    isFixed() { return this.fixed; }

    /** 深拷贝 */
    clone() {
        const n = new Node(this.id, this.x, this.y, this.fixed);
        n._x = this._x;
        n._y = this._y;
        return n;
    }

    toJSON() {
        return { id: this.id, x: this.x, y: this.y, fixed: this.fixed, _x: this._x, _y: this._y };
    }

    static fromJSON(data) {
        const node = new Node(data.id, data.x, data.y, data.fixed || false);
        if (data._x !== undefined) node._x = data._x;
        if (data._y !== undefined) node._y = data._y;
        return node;
    }
}

// ============================================================
// Link - 刚性连杆（定长约束）
// ============================================================
class Link {
    /**
     * @param {number} id
     * @param {number} nodeA - 端点 A 的 ID
     * @param {number} nodeB - 端点 B 的 ID
     * @param {number} [length] - 杆长（若省略则从 A/B 初始位置计算）
     */
    constructor(id, nodeA, nodeB, length = undefined) {
        this.id = id;
        this.nodeA = nodeA;
        this.nodeB = nodeB;
        this.length = length || 0; // 延迟赋值
        this._initialized = false;
        this.locked = false; // 锁定杆：拖拽时不改变杆长
    }

    /** 从节点位置计算杆长并初始化 */
    initFromNodes(nodes) {
        if (!this._initialized && this.length <= 0) {
            const pA = nodes.get(this.nodeA);
            const pB = nodes.get(this.nodeB);
            if (pA && pB) {
                this.length = Planar.Vec2.dist(pA.pos(), pB.pos());
                this._initialized = true;
            }
        }
        return this;
    }

    /**
     * 约束方程: C = |pA - pB|² - L² = 0
     * 用于 Newton-Raphson 求解
     */
    constraint(pA, pB) {
        const dx = pA.x - pB.x;
        const dy = pA.y - pB.y;
        return dx * dx + dy * dy - this.length * this.length;
    }

    /**
     * 约束方程对 pA 和 pB 的梯度
     * dC/dpA = [2*dx, 2*dy]
     * dC/dpB = [-2*dx, -2*dy]
     */
    gradient(pA, pB) {
        const dx = pA.x - pB.x;
        const dy = pA.y - pB.y;
        return {
            a: { x: 2 * dx, y: 2 * dy },
            b: { x: -2 * dx, y: -2 * dy }
        };
    }

    /** 获取当前长度误差 */
    error(nodes) {
        const pA = nodes.get(this.nodeA).pos();
        const pB = nodes.get(this.nodeB).pos();
        return Math.abs(this.constraint(pA, pB));
    }

    clone() {
        const l = new Link(this.id, this.nodeA, this.nodeB, this.length);
        l._initialized = this._initialized;
        return l;
    }

    toJSON() {
        return { id: this.id, nodeA: this.nodeA, nodeB: this.nodeB, length: this.length, locked: this.locked };
    }

    static fromJSON(data) {
        const link = new Link(data.id, data.nodeA, data.nodeB, data.length);
        if (data.locked !== undefined) link.locked = data.locked;
        return link;
    }
}

// ============================================================
// Driver - 主动驱动
// ============================================================
class Driver {
    /**
     * @param {number} id
     * @param {number} linkId - 被驱动的连杆 ID
     * @param {'rotary'} type - 驱动类型（目前仅旋转驱动）
     * @param {number} omega - 角速度 (rad/s)
     * @param {number} [theta0] - 初始角度 (rad)
     */
    constructor(id, linkId, type = 'rotary', omega = 1.0, theta0 = 0) {
        this.id = id;
        this.linkId = linkId;
        this.type = type;
        this.omega = omega;   // rad/s
        this.theta0 = theta0; // 初始角度
        this.theta = theta0;  // 当前角度
        this.active = true;
    }

    /** 推进角度一步 */
    step(dt) {
        if (this.active) {
            this.theta += this.omega * dt;
        }
        return this.theta;
    }

    /** 设置角度 */
    setAngle(theta) {
        this.theta = theta;
    }

    /** 重置角度到初始值 */
    reset() {
        this.theta = this.theta0;
    }

    clone() {
        const d = new Driver(this.id, this.linkId, this.type, this.omega, this.theta0);
        d.theta = this.theta;
        d.active = this.active;
        return d;
    }

    toJSON() {
        return {
            id: this.id,
            linkId: this.linkId,
            type: this.type,
            omega: this.omega,
            theta0: this.theta0,
            active: this.active
        };
    }

    static fromJSON(data) {
        const d = new Driver(data.id, data.linkId, data.type, data.omega, data.theta0);
        d.active = data.active !== undefined ? data.active : true;
        return d;
    }
}

// ============================================================
// Mechanism - 机构模型
// ============================================================
class Mechanism {
    constructor() {
        /** @type {Map<number, Node>} */
        this.nodes = new Map();
        /** @type {Map<number, Link>} */
        this.links = new Map();
        /** @type {Map<number, Driver>} */
        this.drivers = new Map();

        this._nextId = { node: 1, link: 1, driver: 1 };
        this.name = 'Untitled Mechanism';
    }

    // ---- 节点操作 ----
    addNode(x, y, fixed = false) {
        const id = this._nextId.node++;
        const node = new Node(id, x, y, fixed);
        this.nodes.set(id, node);
        return node;
    }

    removeNode(id) {
        // 同时删除关联的连杆
        const toRemove = [];
        for (const [lid, link] of this.links) {
            if (link.nodeA === id || link.nodeB === id) {
                toRemove.push(lid);
            }
        }
        for (const lid of toRemove) this.removeLink(lid);

        // 删除关联的驱动（如果有）
        for (const [did, driver] of this.drivers) {
            const link = this.links.get(driver.linkId);
            if (link && (link.nodeA === id || link.nodeB === id)) {
                this.drivers.delete(did);
            }
        }

        this.nodes.delete(id);
    }

    getNode(id) { return this.nodes.get(id); }

    // ---- 连杆操作 ----
    addLink(nodeA, nodeB, length = undefined) {
        const id = this._nextId.link++;
        const link = new Link(id, nodeA, nodeB, length);
        link.initFromNodes(this.nodes);
        this.links.set(id, link);
        return link;
    }

    removeLink(id) {
        // 删除关联驱动
        for (const [did, driver] of this.drivers) {
            if (driver.linkId === id) this.drivers.delete(did);
        }
        this.links.delete(id);
    }

    getLink(id) { return this.links.get(id); }

    // ---- 驱动操作 ----
    addDriver(linkId, type = 'rotary', omega = 1.0, theta0 = 0) {
        const link = this.links.get(linkId);
        if (!link) throw new Error(`Link #${linkId} not found`);
        const id = this._nextId.driver++;
        const driver = new Driver(id, linkId, type, omega, theta0);
        this.drivers.set(id, driver);
        return driver;
    }

    removeDriver(id) {
        this.drivers.delete(id);
    }

    getDriver(id) { return this.drivers.get(id); }

    // ---- 拓扑分析 ----

    /** 计算自由度数 */
    getDOF() {
        let freeNodes = 0;
        for (const node of this.nodes.values()) {
            if (!node.fixed) freeNodes++;
        }
        // 有效约束：仅统计至少连接了一个自由节点的连杆
        // 连接两个固定节点的连杆是冗余的（如机架杆）
        let effectiveLinks = 0;
        for (const link of this.links.values()) {
            const nA = this.nodes.get(link.nodeA);
            const nB = this.nodes.get(link.nodeB);
            if (!nA || !nB) continue;
            if (!nA.fixed || !nB.fixed) effectiveLinks++;
        }
        // DOF = 2 * 自由节点数 - 有效连杆约束数
        return 2 * freeNodes - effectiveLinks;
    }

    /** 是否为有效的机构（DOF ≥ 0） */
    isValid() {
        return this.getDOF() >= 0 && this.nodes.size >= 2;
    }

    /** 获取当前装配误差总和 */
    totalError() {
        let sum = 0;
        for (const link of this.links.values()) {
            sum += link.error(this.nodes);
        }
        return sum;
    }

    /** 获取最大杆长误差 */
    maxError() {
        let max = 0;
        for (const link of this.links.values()) {
            const err = link.error(this.nodes);
            if (err > max) max = err;
        }
        return max;
    }

    /**
     * 机构智能检测：返回警告/错误列表
     * @returns {Array<{type:'error'|'warn'|'info', message:string}>}
     */
    validate() {
        const messages = [];

        // 1. 检查孤立节点（未参与任何连杆）
        const connectedNodes = new Set();
        for (const link of this.links.values()) {
            connectedNodes.add(link.nodeA);
            connectedNodes.add(link.nodeB);
        }
        for (const [id, node] of this.nodes) {
            if (!connectedNodes.has(id)) {
                messages.push({ type: 'warn', message: `节点 #${id} 未连接到任何连杆` });
            }
        }

        // 2. 固定节点检查
        const fixedNodes = [];
        for (const [id, node] of this.nodes) {
            if (node.fixed) fixedNodes.push(id);
        }
        if (fixedNodes.length === 0) {
            messages.push({ type: 'warn', message: '没有固定节点，机构无约束基准' });
        }

        // 3. 自由度和驱动检查
        const dof = this.getDOF();
        const nDrivers = this.drivers.size;

        if (dof < 0) {
            messages.push({ type: 'error', message: `机构过约束：DOF=${dof} < 0，可能无法运动` });
        } else if (dof > 3) {
            messages.push({ type: 'info', message: `高自由度机构：DOF=${dof}，需要 ${dof} 个驱动` });
        }

        if (dof >= 0 && nDrivers > dof) {
            messages.push({ type: 'warn', message: `驱动过多：${nDrivers} 个驱动 > DOF=${dof}，过驱动` });
        }
        if (dof > 0 && nDrivers === 0) {
            messages.push({ type: 'warn', message: '无驱动器，无法进行动画仿真' });
        }
        if (dof > 0 && nDrivers > 0 && nDrivers < dof) {
            messages.push({ type: 'warn', message: `驱动不足：${nDrivers} 个驱动 < DOF=${dof}，部分自由度不可控` });
        }

        // 4. 检查杆长残差（初始装配误差）
        const maxErr = this.maxError();
        if (maxErr > 1e-4) {
            messages.push({ type: 'warn', message: `杆长误差较大 (${maxErr.toExponential(2)})，机构可能不能完美装配` });
        } else if (maxErr < 1e-12) {
            messages.push({ type: 'info', message: '杆长装配精度极高' });
        }

        // 5. 检查零长连杆
        for (const link of this.links.values()) {
            if (link.length < 1e-10) {
                messages.push({ type: 'error', message: `连杆 #${link.id} 长度为零` });
            }
        }

        return messages;
    }

    /**
     * 获取驱动器的（节点A, 节点B, 当前角度）信息
     * 用于求解器设置旋转驱动约束
     */
    getDriverAngles() {
        const angles = [];
        for (const driver of this.drivers.values()) {
            const link = this.links.get(driver.linkId);
            if (!link) continue;
            const pA = this.nodes.get(link.nodeA);
            const pB = this.nodes.get(link.nodeB);
            if (!pA || !pB) continue;
            // 主动件旋转中心 = 端点中固定的那个（如果有）
            // 若两个都不固定，则计算当前角度
            let center, tip;
            if (pA.fixed) {
                center = pA;
                tip = pB;
            } else if (pB.fixed) {
                center = pB;
                tip = pA;
            } else {
                // 双自由端：用当前方向
                center = pA;
                tip = pB;
            }
            const dir = Planar.Vec2.sub(tip.pos(), center.pos());
            const currentAngle = Planar.Vec2.angle(dir);
            angles.push({
                driverId: driver.id,
                linkId: driver.linkId,
                center,
                tip,
                targetAngle: driver.theta,
                currentAngle
            });
        }
        return angles;
    }

    // ---- 序列化 ----
    toJSON() {
        return {
            name: this.name,
            nodes: Array.from(this.nodes.values()).map(n => n.toJSON()),
            links: Array.from(this.links.values()).map(l => l.toJSON()),
            drivers: Array.from(this.drivers.values()).map(d => d.toJSON()),
            _nextId: this._nextId
        };
    }

    static fromJSON(data) {
        const mech = new Mechanism();
        mech.name = data.name || 'Untitled';
        const nextIdFromData = data._nextId || { node: 1, link: 1, driver: 1 };

        if (data.nodes) {
            for (const nd of data.nodes) {
                const node = Node.fromJSON(nd);
                mech.nodes.set(node.id, node);
            }
        }
        if (data.links) {
            for (const ld of data.links) {
                const link = Link.fromJSON(ld);
                mech.links.set(link.id, link);
            }
        }
        if (data.drivers) {
            for (const dd of data.drivers) {
                const driver = Driver.fromJSON(dd);
                mech.drivers.set(driver.id, driver);
            }
        }

        // 兼容旧数据：若缺少/错误 _nextId，自动从现有元素修正，避免新增元素 ID 冲突
        let maxNodeId = 0, maxLinkId = 0, maxDriverId = 0;
        for (const id of mech.nodes.keys()) maxNodeId = Math.max(maxNodeId, id);
        for (const id of mech.links.keys()) maxLinkId = Math.max(maxLinkId, id);
        for (const id of mech.drivers.keys()) maxDriverId = Math.max(maxDriverId, id);
        mech._nextId = {
            node: Math.max(nextIdFromData.node || 1, maxNodeId + 1),
            link: Math.max(nextIdFromData.link || 1, maxLinkId + 1),
            driver: Math.max(nextIdFromData.driver || 1, maxDriverId + 1)
        };
        return mech;
    }

    /** 深拷贝 */
    clone() {
        return Mechanism.fromJSON(this.toJSON());
    }

    /** 重置所有节点到初始位置 */
    resetPositions() {
        for (const node of this.nodes.values()) {
            node.reset();
        }
    }
}

// ---- 导出 ----
Planar.Node = Node;
Planar.Link = Link;
Planar.Driver = Driver;
Planar.Mechanism = Mechanism;
window.Planar = Planar;