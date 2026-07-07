/**
 * PLANAR - 通用平面连杆机构仿真平台
 * canvas.js - Canvas 2D 渲染器
 */

var Planar = window.Planar || {};

class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.dpr = window.devicePixelRatio || 1;

        this.offsetX = 0;
        this.offsetY = 0;
        this.scale = 1.0;
        this.theme = 'light';

        this.showGrid = true;
        this.showLabels = true;
        this.showDimensions = false;
        this.showTraces = true;

        this.traces = new Map();
        this.maxTracePoints = 2000;
        this.selectedNode = null;
        this.selectedLink = null;
        this.hoveredNode = null;
        this.hoveredLink = null;
        this.mechanism = null;

        this.colors = this._getColors();
        this._sizeCanvas();
    }

    // 设置 canvas 尺寸，保证宽高为正数
    _sizeCanvas() {
        const parent = this.canvas.parentElement;
        if (!parent) return;
        const rect = parent.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width));
        const h = Math.max(1, Math.round(rect.height));
        const dpr = this.dpr;
        if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
            this.canvas.width = w * dpr;
            this.canvas.height = h * dpr;
        }
    }

    _getColors() {
        const d = this.theme === 'dark';
        return {
            bg: d ? '#1a1d23' : '#f8f9fa',
            grid: d ? '#2d3239' : '#dee2e6',
            fixedNode: d ? '#ff6b6b' : '#e74c3c',
            freeNode: d ? '#5dade2' : '#3498db',
            link: d ? '#bdc3c7' : '#2c3e50',
            driverLink: d ? '#f39c12' : '#e67e22',
            selected: '#f1c40f',
            hover: d ? '#ffffff' : '#000000',
            trace: d ? '#2ecc71' : '#27ae60',
            text: d ? '#e0e0e0' : '#333333',
            ground: d ? '#888888' : '#666666'
        };
    }

    setTheme(t) { this.theme = t; this.colors = this._getColors(); }
    setMechanism(m) { this.mechanism = m; this.traces.clear(); }

    worldToScreen(wx, wy) {
        return { x: (wx + this.offsetX) * this.scale, y: (wy + this.offsetY) * this.scale };
    }
    screenToWorld(sx, sy) {
        return { x: sx / this.scale - this.offsetX, y: sy / this.scale - this.offsetY };
    }

    render(mech) {
        this.mechanism = mech;
        this._sizeCanvas();

        const W = this.canvas.width / this.dpr;
        const H = this.canvas.height / this.dpr;
        if (W < 2 || H < 2) return;

        const ctx = this.ctx;
        const dpr = this.dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = this.colors.bg;
        ctx.fillRect(0, 0, W, H);

        if (this.showGrid) this._grid(ctx, W, H);
        if (!mech) return;

        if (this.showTraces) this._drawTraces(ctx);
        this._drawLinks(ctx, mech);
        this._drawNodes(ctx, mech);
        this._drawSelection(ctx, mech);
        if (this.showLabels) this._drawLabels(ctx, mech);
        if (this.showDimensions) this._drawDimensions(ctx, mech);
    }

    _grid(ctx, W, H) {
        const s = this.scale;
        const gs = s > 4 ? 5 : s > 2 ? 10 : s > 1 ? 20 : s > 0.5 ? 50 : s > 0.2 ? 100 : 200;
        const tl = this.screenToWorld(0, 0);
        const br = this.screenToWorld(W, H);
        const sx_ = Math.floor(tl.x / gs) * gs;
        const sy_ = Math.floor(tl.y / gs) * gs;

        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (let x = sx_; x <= br.x + gs; x += gs) {
            const px = (x + this.offsetX) * this.scale;
            ctx.moveTo(px, 0); ctx.lineTo(px, H);
        }
        for (let y = sy_; y <= br.y + gs; y += gs) {
            const py = (y + this.offsetY) * this.scale;
            ctx.moveTo(0, py); ctx.lineTo(W, py);
        }
        ctx.stroke();

        const o = this.worldToScreen(0, 0);
        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(o.x, 0); ctx.lineTo(o.x, H);
        ctx.moveTo(0, o.y); ctx.lineTo(W, o.y);
        ctx.stroke();
    }

    _drawLinks(ctx, mech) {
        for (const link of mech.links.values()) {
            const pA = mech.getNode(link.nodeA);
            const pB = mech.getNode(link.nodeB);
            if (!pA || !pB) continue;
            const sA = this.worldToScreen(pA.getX(), pA.getY());
            const sB = this.worldToScreen(pB.getX(), pB.getY());
            const isDriver = this._isDriven(mech, link.id);
            const isHov = this.hoveredLink === link.id;
            let lw = isDriver ? 4 : 3;
            if (isHov) lw++;
            let c = isDriver ? this.colors.driverLink : this.colors.link;
            if (link.id === this.selectedLink) c = this.colors.selected;
            ctx.strokeStyle = c;
            ctx.lineWidth = lw;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(sA.x, sA.y);
            ctx.lineTo(sB.x, sB.y);
            ctx.stroke();
        }
    }

    _isDriven(mech, id) {
        for (const d of mech.drivers.values()) if (d.linkId === id && d.active) return true;
        return false;
    }

    _drawNodes(ctx, mech) {
        for (const node of mech.nodes.values()) {
            const s = this.worldToScreen(node.getX(), node.getY());
            const r = node.fixed ? 6 : 5;
            const hov = this.hoveredNode === node.id;
            if (node.fixed) {
                ctx.fillStyle = this.colors.fixedNode;
                ctx.strokeStyle = hov ? this.colors.hover : this.colors.fixedNode;
                ctx.lineWidth = hov ? 3 : 2;
                ctx.beginPath();
                ctx.arc(s.x, s.y, r + (hov ? 2 : 0), 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.strokeStyle = this.colors.ground;
                ctx.lineWidth = 1.5;
                for (let i = -2; i <= 2; i++) {
                    ctx.beginPath();
                    ctx.moveTo(s.x + i * 4 - 3, s.y + r + 4);
                    ctx.lineTo(s.x + i * 4 + 3, s.y + r + 8);
                    ctx.stroke();
                }
            } else {
                const fc = node.id === this.selectedNode ? this.colors.selected : this.colors.freeNode;
                ctx.fillStyle = fc;
                ctx.strokeStyle = hov ? this.colors.hover : fc;
                ctx.lineWidth = hov ? 3 : 2;
                ctx.beginPath();
                ctx.arc(s.x, s.y, r + (hov ? 2 : 0), 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = this.colors.bg;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(s.x, s.y, r * 0.4, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    _drawSelection(ctx, mech) {
        if (this.selectedNode) {
            const n = mech.getNode(this.selectedNode);
            if (n) {
                const s = this.worldToScreen(n.getX(), n.getY());
                ctx.strokeStyle = this.colors.selected;
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.arc(s.x, s.y, 12, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
        if (this.selectedLink) {
            const l = mech.getLink(this.selectedLink);
            if (l) {
                const pA = mech.getNode(l.nodeA);
                const pB = mech.getNode(l.nodeB);
                if (pA && pB) {
                    const sA = this.worldToScreen(pA.getX(), pA.getY());
                    const sB = this.worldToScreen(pB.getX(), pB.getY());
                    ctx.strokeStyle = this.colors.selected;
                    ctx.lineWidth = 6;
                    ctx.globalAlpha = 0.3;
                    ctx.beginPath();
                    ctx.moveTo(sA.x, sA.y);
                    ctx.lineTo(sB.x, sB.y);
                    ctx.stroke();
                    ctx.globalAlpha = 1.0;
                }
            }
        }
    }

    _drawLabels(ctx, mech) {
        ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        for (const n of mech.nodes.values()) {
            const s = this.worldToScreen(n.getX(), n.getY());
            ctx.fillStyle = this.colors.text;
            ctx.globalAlpha = 0.7;
            ctx.fillText(`#${n.id}`, s.x, s.y - 10);
            ctx.globalAlpha = 1.0;
        }
    }

    _drawDimensions(ctx, mech) {
        ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        for (const l of mech.links.values()) {
            const pA = mech.getNode(l.nodeA);
            const pB = mech.getNode(l.nodeB);
            if (!pA || !pB) continue;
            const sA = this.worldToScreen(pA.getX(), pA.getY());
            const sB = this.worldToScreen(pB.getX(), pB.getY());
            const mx = (sA.x + sB.x) / 2, my = (sA.y + sB.y) / 2;
            ctx.fillStyle = this.colors.text;
            ctx.globalAlpha = 0.5;
            ctx.fillText(`${l.length.toFixed(1)}`, mx, my - 8);
            ctx.globalAlpha = 1.0;
        }
    }

    recordTraces(mech) {
        for (const n of mech.nodes.values()) {
            if (n.fixed) continue;
            if (!this.traces.has(n.id)) this.traces.set(n.id, []);
            const t = this.traces.get(n.id);
            t.push({ x: n.getX(), y: n.getY() });
            if (t.length > this.maxTracePoints) t.shift();
        }
    }

    clearTraces() { this.traces.clear(); }

    _drawTraces(ctx) {
        for (const pts of this.traces.values()) {
            if (pts.length < 2) continue;
            ctx.strokeStyle = this.colors.trace;
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.6;
            ctx.beginPath();
            for (let i = 0; i < pts.length; i++) {
                const s = this.worldToScreen(pts[i].x, pts[i].y);
                if (i === 0) ctx.moveTo(s.x, s.y);
                else ctx.lineTo(s.x, s.y);
            }
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }
    }

    // 命中检测
    hitTestNode(sx, sy) {
        if (!this.mechanism) return null;
        let best = null, bestD = 9;
        for (const n of this.mechanism.nodes.values()) {
            const s = this.worldToScreen(n.getX(), n.getY());
            const d = Math.hypot(sx - s.x, sy - s.y);
            if (d < bestD) { bestD = d; best = n; }
        }
        return best ? { node: best, dist: bestD } : null;
    }

    hitTestLink(sx, sy) {
        if (!this.mechanism) return null;
        let best = null, bestD = 6;
        for (const l of this.mechanism.links.values()) {
            const pA = this.mechanism.getNode(l.nodeA);
            const pB = this.mechanism.getNode(l.nodeB);
            if (!pA || !pB) continue;
            const sA = this.worldToScreen(pA.getX(), pA.getY());
            const sB = this.worldToScreen(pB.getX(), pB.getY());
            const d = this._segDist(sx, sy, sA, sB);
            if (d < bestD) { bestD = d; best = l; }
        }
        return best ? { link: best, dist: bestD } : null;
    }

    _segDist(px, py, a, b) {
        const abx = b.x - a.x, aby = b.y - a.y;
        const apx = px - a.x, apy = py - a.y;
        const dot = apx * abx + apy * aby;
        const l2 = abx * abx + aby * aby;
        let t = l2 > 0 ? dot / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (a.x + t * abx), py - (a.y + t * aby));
    }
}

Planar.Renderer = Renderer;
window.Planar = Planar;