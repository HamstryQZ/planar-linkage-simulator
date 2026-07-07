/**
 * PLANAR - 通用平面连杆机构仿真平台
 * solver.js - Newton-Raphson 运动学求解器
 *
 * 核心算法：
 *   给定一组节点位置 x = [x1, y1, x2, y2, ..., xn, yn]ᵀ
 *   和一组约束方程 C(x) = [C1, C2, ..., Cm]ᵀ = 0
 *   使用 Newton-Raphson 迭代: Δx = -J⁺ · C, x ← x + Δx
 *   其中 J = ∂C/∂x 为雅可比矩阵 (m×2n), J⁺ 为伪逆
 *
 * 约束类型：
 *   1. 杆长约束:  Ck = |p_i - p_j|² - L² = 0
 *   2. 旋转驱动:  angle(p_i - p_j) = θ
 *   3. 固定节点:  从求解变量中排除
 */

var Planar = window.Planar || {};
if (!Planar.Mechanism) throw new Error('model.js must be loaded before solver.js');

// ============================================================
// NewtonRaphsonSolver
// ============================================================
class NewtonRaphsonSolver {
    /**
     * @param {Object} [options]
     * @param {number} [options.maxIter=100]       - 最大迭代次数
     * @param {number} [options.tolerance=1e-12]    - 收敛容忍度（长度平方误差）
     * @param {number} [options.damping=1.0]        - 阻尼因子（0-1，防止发散）
     * @param {boolean} [options.verbose=false]     - 是否输出调试信息
     */
    constructor(options = {}) {
        this.maxIter = options.maxIter || 100;
        this.tolerance = options.tolerance || 1e-12;
        this.damping = options.damping || 1.0;
        this.verbose = options.verbose || false;

        // 求解状态
        this.iterations = 0;
        this.finalError = 0;
        this.converged = false;
        this.singular = false;
    }

    /**
     * 求解机构位置
     * @param {Mechanism} mech - 机构模型
     * @returns {boolean} 是否收敛
     */
    solve(mech) {
        this.iterations = 0;
        this.finalError = 0;
        this.converged = false;
        this.singular = false;

        // 构建变量映射：自由节点 → 变量索引
        const freeNodes = [];
        const varIndex = new Map(); // nodeId → idx (2*index)
        for (const [id, node] of mech.nodes) {
            if (!node.fixed) {
                varIndex.set(id, freeNodes.length * 2);
                freeNodes.push(node);
            }
        }

        const nVars = freeNodes.length * 2;     // 未知变量数
        const nLinks = mech.links.size;
        const nDrivers = mech.drivers.size;
        const nConstraints = nLinks + nDrivers;  // 约束方程数

        if (this.verbose) {
            console.log(`[Solver] nVars=${nVars}, nConstraints=${nConstraints} (links=${nLinks}, drivers=${nDrivers})`);
        }

        if (nVars === 0 || nConstraints === 0) {
            this.converged = true;
            return true; // 全固定或无约束，无需求解
        }

        // ============================
        // Newton-Raphson 主循环
        // ============================
        for (let iter = 0; iter < this.maxIter; iter++) {
            // 1. 组装约束向量 C (nConstraints × 1)
            const C = new Float64Array(nConstraints);
            let row = 0;

            // 1a. 杆长约束
            for (const link of mech.links.values()) {
                const pA = mech.getNode(link.nodeA).pos();
                const pB = mech.getNode(link.nodeB).pos();
                C[row] = link.constraint(pA, pB);
                row++;
            }

            // 1b. 旋转驱动约束: angle(p_tip - p_center) - theta = 0
            const driverAngles = mech.getDriverAngles();
            for (const da of driverAngles) {
                const dir = Planar.Vec2.sub(da.tip.pos(), da.center.pos());
                const angle = Planar.Vec2.angle(dir);
                C[row] = angle - da.targetAngle;

                // 角度归一化到 [-π, π]
                while (C[row] > Math.PI) C[row] -= 2 * Math.PI;
                while (C[row] < -Math.PI) C[row] += 2 * Math.PI;
                row++;
            }

            // 2. 计算最大误差
            let maxErr = 0;
            for (let i = 0; i < nConstraints; i++) {
                const err = Math.abs(C[i]);
                if (err > maxErr) maxErr = err;
            }

            if (this.verbose && iter % 10 === 0) {
                console.log(`  iter ${iter}: maxErr=${maxErr.toExponential(3)}`);
            }

            // 3. 检查收敛
            if (maxErr < this.tolerance) {
                this.converged = true;
                this.finalError = maxErr;
                this.iterations = iter;
                if (this.verbose) console.log(`[Solver] Converged in ${iter} iterations, maxError=${maxErr.toExponential(3)}`);
                return true;
            }

            // 4. 组装雅可比矩阵 J (nConstraints × 2nVars)
            //    J[i][2*j]   = ∂Ci/∂xj
            //    J[i][2*j+1] = ∂Ci/∂yj
            const J = Planar.Matrix.zeros(nConstraints, nVars);
            row = 0;

            // 4a. 杆长约束的雅可比
            for (const link of mech.links.values()) {
                const pA = mech.getNode(link.nodeA).pos();
                const pB = mech.getNode(link.nodeB).pos();
                const grad = link.gradient(pA, pB);

                // 端点 A
                const idxA = varIndex.get(link.nodeA);
                if (idxA !== undefined) {
                    J[row][idxA]     = grad.a.x;
                    J[row][idxA + 1] = grad.a.y;
                }
                // 端点 B
                const idxB = varIndex.get(link.nodeB);
                if (idxB !== undefined) {
                    J[row][idxB]     = grad.b.x;
                    J[row][idxB + 1] = grad.b.y;
                }
                row++;
            }

            // 4b. 旋转驱动约束的雅可比
            for (const da of driverAngles) {
                const dx = da.tip.getX() - da.center.getX();
                const dy = da.tip.getY() - da.center.getY();
                const r2 = dx * dx + dy * dy;
                if (r2 < 1e-15) {
                    // 退化：杆长为零
                    row++;
                    continue;
                }
                // d(atan2(dy,dx))/d(dx) = -dy / r²
                // d(atan2(dy,dx))/d(dy) =  dx / r²
                const ddx = -dy / r2;
                const ddy =  dx / r2;

                // 中心节点固定不动，只对 tip 节点有偏导
                // 但若 center 是自由节点，也需要包含
                const idxTip = varIndex.get(da.tip.id);
                if (idxTip !== undefined) {
                    J[row][idxTip]     = ddx;
                    J[row][idxTip + 1] = ddy;
                }
                const idxCenter = varIndex.get(da.center.id);
                if (idxCenter !== undefined) {
                    J[row][idxCenter]     = -ddx;
                    J[row][idxCenter + 1] = -ddy;
                }
                row++;
            }

            // 5. 求解线性系统: J · Δx = -C
            //    使用最小二乘（超定）或直接求解（方阵）
            const negC = new Float64Array(nConstraints);
            for (let i = 0; i < nConstraints; i++) negC[i] = -C[i];

            let Δx;
            if (nVars === nConstraints) {
                // 适定系统: J·Δx = -C
                Δx = Planar.Matrix.solve(J, negC);
            } else if (nConstraints > nVars) {
                // 超定系统: 最小二乘
                Δx = Planar.Matrix.solveLeastSquares(J, negC);
            } else {
                // 欠定系统: 最小范数解 Δx = Jᵀ · (J·Jᵀ)⁻¹ · (-C)
                // 构造 A = J·Jᵀ (nConstraints × nConstraints，满秩)
                const A = Planar.Matrix.zeros(nConstraints, nConstraints);
                for (let i = 0; i < nConstraints; i++) {
                    for (let j = 0; j < nConstraints; j++) {
                        let sum = 0;
                        for (let k = 0; k < nVars; k++) {
                            sum += J[i][k] * J[j][k];
                        }
                        A[i][j] = sum;
                    }
                }
                // 解 A·λ = -C
                const λ = Planar.Matrix.solve(A, negC);
                if (λ) {
                    // Δx = Jᵀ · λ
                    const JT = Planar.Matrix.transpose(J);
                    Δx = Planar.Matrix.matVecMul(JT, λ);
                } else {
                    // 奇异，使用梯度下降
                    const JT = Planar.Matrix.transpose(J);
                    const grad = Planar.Matrix.matVecMul(JT, C);
                    for (let i = 0; i < grad.length; i++) grad[i] = -grad[i];
                    const stepSize = this._lineSearch(mech, varIndex, freeNodes, grad, maxErr);
                    Δx = grad;
                    for (let i = 0; i < Δx.length; i++) Δx[i] *= stepSize;
                }
            }

            if (!Δx) {
                // 奇异矩阵，尝试使用梯度下降法
                if (this.verbose) console.warn(`[Solver] Singular Jacobian at iter ${iter}, using gradient descent`);
                // 计算 Jᵀ·C 作为梯度
                const JT = Planar.Matrix.transpose(J);
                const grad = Planar.Matrix.matVecMul(JT, C);
                // 梯度方向取负
                for (let i = 0; i < grad.length; i++) grad[i] = -grad[i];
                // 简单线搜索
                const stepSize = this._lineSearch(mech, varIndex, freeNodes, grad, maxErr);
                Δx = grad;
                for (let i = 0; i < Δx.length; i++) Δx[i] *= stepSize;
            }

            // 6. 应用更新（带阻尼）
            const damping = Math.min(this.damping, 1.0 / (1.0 + Math.log10(1 + iter)));
            for (let i = 0; i < freeNodes.length; i++) {
                const node = freeNodes[i];
                const idx = i * 2;
                const dx = Δx[idx]     * damping;
                const dy = Δx[idx + 1] * damping;
                node.setPos(node.getX() + dx, node.getY() + dy);
            }

            // 7. 检查发散
            if (isNaN(maxErr) || maxErr > 1e10) {
                if (this.verbose) console.error('[Solver] Diverged!');
                this.singular = true;
                return false;
            }
        }

        this.finalError = this._computeMaxError(mech);
        if (this.verbose) console.warn(`[Solver] Failed to converge, finalError=${this.finalError.toExponential(3)}`);
        return false;
    }

    /**
     * 简单线搜索：在梯度方向找到合适的步长
     */
    _lineSearch(mech, varIndex, freeNodes, direction, currentError) {
        let step = 1.0;
        const originalPos = freeNodes.map(n => ({ x: n.getX(), y: n.getY() }));

        for (let i = 0; i < 8; i++) {
            // 试移动
            for (let j = 0; j < freeNodes.length; j++) {
                const node = freeNodes[j];
                node.setPos(
                    originalPos[j].x + direction[j * 2] * step,
                    originalPos[j].y + direction[j * 2 + 1] * step
                );
            }
            const newError = this._computeMaxError(mech);
            if (newError < currentError) {
                return step; // 有效步长
            }
            step *= 0.5;
        }

        // 恢复原位
        for (let j = 0; j < freeNodes.length; j++) {
            freeNodes[j].setPos(originalPos[j].x, originalPos[j].y);
        }
        return 0; // 无法找到有效步长
    }

    /** 计算当前最大约束误差 */
    _computeMaxError(mech) {
        let maxErr = 0;
        for (const link of mech.links.values()) {
            const pA = mech.getNode(link.nodeA).pos();
            const pB = mech.getNode(link.nodeB).pos();
            const err = Math.abs(link.constraint(pA, pB));
            if (err > maxErr) maxErr = err;
        }
        return maxErr;
    }

    /**
     * 一步拖动求解（针对交互拖拽）
     * @param {Mechanism} mech - 机构模型
     * @param {number} draggedNodeId - 被拖拽的节点 ID
     * @param {number} targetX - 拖拽目标 x
     * @param {number} targetY - 拖拽目标 y
     * @returns {boolean} 是否成功求解
     */
    solveDrag(mech, draggedNodeId, targetX, targetY) {
        const draggedNode = mech.getNode(draggedNodeId);
        if (!draggedNode || draggedNode.fixed) return false;

        // 保存原始位置以便失败时恢复
        const origX = draggedNode.getX();
        const origY = draggedNode.getY();

        // 设定目标位置作为初始估计
        draggedNode.setPos(targetX, targetY);

        // 迭代求解
        const converged = this.solve(mech);

        if (!converged) {
            // 求解失败，恢复到原始位置
            draggedNode.setPos(origX, origY);
            return false;
        }

        // 验证杆长约束
        const maxErr = mech.maxError();
        if (maxErr > 1e-6) {
            if (this.verbose) console.warn(`[Solver] Drag solution has large error: ${maxErr.toExponential(3)}`);
        }
        return true;
    }

    /**
     * 动画一步求解（推进驱动角 + 位置校正）
     * @param {Mechanism} mech - 机构模型
     * @param {number} dt - 时间步长 (s)
     * @returns {boolean} 是否成功
     */
    solveStep(mech, dt) {
        // 1. 保存当前位置快照（用于严重发散时回退）
        const snapshot = new Map();
        for (const [id, node] of mech.nodes) {
            snapshot.set(id, { x: node.getX(), y: node.getY() });
        }

        // 2. 保存驱动角度快照
        const driverSnapshot = [];
        for (const driver of mech.drivers.values()) {
            driverSnapshot.push({ id: driver.id, theta: driver.theta });
        }

        // 3. 推进驱动角度
        for (const driver of mech.drivers.values()) {
            driver.step(dt);
        }

        // 4. 用当前配置作为初始猜测，求解
        const converged = this.solve(mech);

        if (!converged) {
            // 5. 分级回退：
            //    严重发散（奇异）→ 回退到快照位置，机构保持静止
            //    轻度不收敛（residual 尚可）→ 保留最后迭代位置，机构继续运动但不完美
            if (this.singular) {
                for (const [id, node] of mech.nodes) {
                    const pos = snapshot.get(id);
                    if (pos) node.setPos(pos.x, pos.y);
                }
                for (const ds of driverSnapshot) {
                    const driver = mech.getDriver(ds.id);
                    if (driver) driver.setAngle(ds.theta);
                }
                return false;
            }
            // 轻度不收敛：保留解算位置，继续动画
        }

        return true;
    }

    /**
     * 重置求解器状态
     */
    reset() {
        this.iterations = 0;
        this.finalError = 0;
        this.converged = false;
        this.singular = false;
    }
}

// ---- 导出 ----
Planar.NewtonRaphsonSolver = NewtonRaphsonSolver;
window.Planar = Planar;