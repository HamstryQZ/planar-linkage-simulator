/**
 * PLANAR - 通用平面连杆机构仿真平台
 * utils.js - 向量/矩阵运算工具
 */

var Planar = window.Planar || {};

// ============================================================
// 2D 向量运算
// ============================================================
Planar.Vec2 = {
    add(a, b)    { return { x: a.x + b.x, y: a.y + b.y }; },
    sub(a, b)    { return { x: a.x - b.x, y: a.y - b.y }; },
    scale(v, s)  { return { x: v.x * s, y: v.y * s }; },
    dot(a, b)    { return a.x * b.x + a.y * b.y; },
    cross(a, b)  { return a.x * b.y - a.y * b.x; },
    len(v)       { return Math.sqrt(v.x * v.x + v.y * v.y); },
    lenSq(v)     { return v.x * v.x + v.y * v.y; },
    dist(a, b)   { return Planar.Vec2.len(Planar.Vec2.sub(a, b)); },
    distSq(a, b) { return Planar.Vec2.lenSq(Planar.Vec2.sub(a, b)); },
    normalize(v) {
        const l = Planar.Vec2.len(v);
        return l < 1e-15 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
    },
    angleBetween(a, b) {
        return Math.atan2(Planar.Vec2.cross(a, b), Planar.Vec2.dot(a, b));
    },
    angle(v) {
        return Math.atan2(v.y, v.x);
    },
    rotate(v, theta) {
        const c = Math.cos(theta), s = Math.sin(theta);
        return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
    },
    perp(v) {
        return { x: -v.y, y: v.x };
    },
    fromAngle(theta, len = 1) {
        return { x: Math.cos(theta) * len, y: Math.sin(theta) * len };
    }
};

// ============================================================
// 线性代数（用于 Newton-Raphson 求解）
// 仅处理小型稠密矩阵（≤ 50×50），Gauss 消元
// ============================================================
Planar.Matrix = {
    /**
     * 创建 m×n 零矩阵（数组的数组）
     */
    zeros(m, n) {
        return Array.from({ length: m }, () => new Float64Array(n));
    },

    /**
     * 创建 n×n 单位矩阵
     */
    eye(n) {
        const A = Planar.Matrix.zeros(n, n);
        for (let i = 0; i < n; i++) A[i][i] = 1;
        return A;
    },

    /**
     * 矩阵拷贝
     */
    clone(A) {
        return A.map(row => new Float64Array(row));
    },

    /**
     * 矩阵-向量乘法: y = A·x
     * A: m×n, x: n-向量, y: m-向量
     */
    matVecMul(A, x) {
        const m = A.length, n = x.length;
        const y = new Float64Array(m);
        for (let i = 0; i < m; i++) {
            let sum = 0;
            const row = A[i];
            for (let j = 0; j < n; j++) sum += row[j] * x[j];
            y[i] = sum;
        }
        return y;
    },

    /**
     * 转置: A(m×n) → Aᵀ(n×m)
     */
    transpose(A) {
        const m = A.length, n = A[0].length;
        const AT = Planar.Matrix.zeros(n, m);
        for (let i = 0; i < m; i++)
            for (let j = 0; j < n; j++)
                AT[j][i] = A[i][j];
        return AT;
    },

    /**
     * 带部分主元的 Gauss 消元法求解 Ax = b
     * A: n×n 方阵, b: n-向量
     * 返回 x: n-向量 或 null（奇异）
     */
    solve(A, b) {
        const n = A.length;
        // 增广矩阵 [A | b]
        const aug = A.map((row, i) => {
            const r = new Float64Array(n + 1);
            for (let j = 0; j < n; j++) r[j] = row[j];
            r[n] = b[i];
            return r;
        });

        // 前向消元
        for (let col = 0; col < n; col++) {
            // 部分主元
            let maxVal = Math.abs(aug[col][col]);
            let maxRow = col;
            for (let row = col + 1; row < n; row++) {
                const v = Math.abs(aug[row][col]);
                if (v > maxVal) { maxVal = v; maxRow = row; }
            }
            if (maxVal < 1e-15) return null; // 奇异

            // 交换行
            if (maxRow !== col) {
                const tmp = aug[col];
                aug[col] = aug[maxRow];
                aug[maxRow] = tmp;
            }

            // 消去下方行
            const pivot = aug[col][col];
            for (let row = col + 1; row < n; row++) {
                const factor = aug[row][col] / pivot;
                for (let j = col; j <= n; j++) {
                    aug[row][j] -= factor * aug[col][j];
                }
            }
        }

        // 回代
        const x = new Float64Array(n);
        for (let i = n - 1; i >= 0; i--) {
            let sum = aug[i][n];
            for (let j = i + 1; j < n; j++) {
                sum -= aug[i][j] * x[j];
            }
            x[i] = sum / aug[i][i];
        }
        return x;
    },

    /**
     * 最小二乘求解（正规方程法）: (AᵀA)x = Aᵀb
     * 适用于超定/欠定系统
     * A: m×n, b: m-向量
     * 返回 x: n-向量
     */
    solveLeastSquares(A, b) {
        const m = A.length, n = A[0].length;
        // AᵀA (n×n)
        const ATA = Planar.Matrix.zeros(n, n);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                let sum = 0;
                for (let k = 0; k < m; k++) sum += A[k][i] * A[k][j];
                ATA[i][j] = sum;
            }
        }
        // Aᵀb (n-向量)
        const ATb = new Float64Array(n);
        for (let i = 0; i < n; i++) {
            let sum = 0;
            for (let k = 0; k < m; k++) sum += A[k][i] * b[k];
            ATb[i] = sum;
        }
        return Planar.Matrix.solve(ATA, ATb);
    },

    /**
     * 求向量 L2 范数
     */
    norm(v) {
        let sum = 0;
        for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
        return Math.sqrt(sum);
    },

    /**
     * 打印矩阵（调试用）
     */
    print(A, name = 'Matrix') {
        console.log(name + ' [' + A.length + '×' + A[0].length + ']:');
        for (const row of A) {
            console.log('  ' + Array.from(row).map(v => v.toFixed(4)).join(', '));
        }
    }
};

window.Planar = Planar;