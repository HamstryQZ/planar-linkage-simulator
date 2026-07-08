/**
 * PLANAR - 通用平面连杆机构仿真平台
 * ui.js - 用户界面管理器
 *
 * 管理右侧属性面板、工具栏、状态栏等 UI 元素。
 * 使用事件驱动方式与 InteractionManager 通信。
 */

var Planar = window.Planar || {};

// ============================================================
// UIManager
// ============================================================
class UIManager {
    /**
     * @param {InteractionManager} interaction
     */
    constructor(interaction) {
        this.interaction = interaction;
        this.renderer = interaction.renderer;
        this.mechanism = interaction.mechanism;

        // DOM 元素缓存
        this.els = {};

        // 当前选中的预设
        this._currentPresetId = null;

        // 注入 UI
        this._createUI();
        this._bindUIEvents();
        this._registerCallbacks();
    }

    /** 注入 UI 到主布局 */
    _createUI() {
        // 插入面板
        const panel = document.getElementById('panel');
        if (!panel) return;

        panel.innerHTML = `
            <div class="panel-section">
                <h3 class="panel-title">机构属性</h3>
                <div class="info-grid">
                    <span class="info-label">自由度</span>
                    <span class="info-value" id="info-dof">0</span>
                    <span class="info-label">节点</span>
                    <span class="info-value" id="info-nodes">0</span>
                    <span class="info-label">连杆</span>
                    <span class="info-value" id="info-links">0</span>
                    <span class="info-label">驱动</span>
                    <span class="info-value" id="info-drivers">0</span>
                </div>
            </div>

            <div class="panel-section">
                <h3 class="panel-title">预设机构</h3>
                <select id="preset-select" class="ui-select">
                    <option value="">— 选择预设 —</option>
                </select>
            </div>

            <div class="panel-section">
                <h3 class="panel-title">模式</h3>
                <div class="mode-buttons">
                    <button class="mode-btn active" data-mode="build" title="构建模式 [1]">
                        <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="3" fill="currentColor"/><line x1="8" y1="0" x2="8" y2="5" stroke="currentColor"/><line x1="8" y1="11" x2="8" y2="16" stroke="currentColor"/><line x1="0" y1="8" x2="5" y2="8" stroke="currentColor"/><line x1="11" y1="8" x2="16" y2="8" stroke="currentColor"/></svg>
                        构建
                    </button>
                    <button class="mode-btn" data-mode="drag" title="拖动模式 [2]">
                        <svg width="16" height="16" viewBox="0 0 16 16"><path d="M4 2 L4 14 L8 14 L8 2 Z M8 2 L8 14 L12 8 Z" fill="currentColor"/></svg>
                        拖动
                    </button>
                    <button class="mode-btn" data-mode="animate" title="动画模式 [3]">
                        <svg width="16" height="16" viewBox="0 0 16 16"><polygon points="4,2 14,8 4,14" fill="currentColor"/></svg>
                        动画
                    </button>
                </div>
            </div>

            <div class="panel-section" id="animate-controls" style="display:none;">
                <h3 class="panel-title">运动控制</h3>
                <div class="control-row">
                    <button id="btn-play" class="ui-btn icon-btn" title="播放/暂停 [空格]">
                        <svg width="16" height="16" viewBox="0 0 16 16"><polygon points="4,2 14,8 4,14" fill="currentColor"/></svg>
                    </button>
                    <button id="btn-reset" class="ui-btn icon-btn" title="重置 [R]">
                        <svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 8 A6 6 0 1 1 14 8 A6 6 0 1 1 2 8 M8 4 L8 8 L11 8" fill="none" stroke="currentColor" stroke-width="2"/></svg>
                    </button>
                    <span class="speed-label">速度</span>
                    <input type="range" id="speed-slider" class="ui-slider" min="0.1" max="5" step="0.1" value="1.0">
                    <span id="speed-value" class="speed-value">1.0x</span>
                </div>
            </div>

            <div class="panel-section">
                <h3 class="panel-title">显示选项</h3>
                <label class="checkbox-row">
                    <input type="checkbox" id="chk-grid" checked>
                    <span>网格</span>
                </label>
                <label class="checkbox-row">
                    <input type="checkbox" id="chk-traces" checked>
                    <span>轨迹</span>
                </label>
                <label class="checkbox-row">
                    <input type="checkbox" id="chk-labels" checked>
                    <span>节点标签</span>
                </label>
                <label class="checkbox-row">
                    <input type="checkbox" id="chk-dimensions">
                    <span>杆长标注</span>
                </label>
            </div>

            <div class="panel-section">
                <h3 class="panel-title">操作</h3>
                <button id="btn-fit" class="ui-btn" title="适应窗口">适应视图</button>
                <button id="btn-clear-traces" class="ui-btn" title="清除轨迹">清除轨迹</button>
                <button id="btn-theme" class="ui-btn">暗色模式</button>
                <button id="btn-export" class="ui-btn">导出 JSON</button>
                <button id="btn-import" class="ui-btn">导入 JSON</button>
                <input type="file" id="import-file" accept=".json" style="display:none;">
            </div>

            <div class="panel-section mobile-actions" id="mobile-actions">
                <h3 class="panel-title">移动端快捷操作</h3>
                <div class="mobile-action-grid">
                    <button id="btn-mobile-driver" class="ui-btn">设/取消驱动</button>
                    <button id="btn-mobile-delete" class="ui-btn">删除选中</button>
                    <button id="btn-mobile-play" class="ui-btn">播放/暂停</button>
                    <button id="btn-mobile-reset" class="ui-btn">重置</button>
                    <button id="btn-mobile-clear-traces" class="ui-btn">清轨迹</button>
                </div>
                <div class="mobile-hint">先点击节点/连杆选中，再执行操作。</div>
            </div>

            <div class="panel-section">
                <h3 class="panel-title">机构检查</h3>
                <div id="validation-panel" style="font-size:11px;max-height:100px;overflow-y:auto;color:#666;">
                    <span style="color:#999;">（暂无检查信息）</span>
                </div>
            </div>

            <div class="panel-section" id="driver-panel" style="display:none;">
                <h3 class="panel-title">驱动属性</h3>
                <div id="driver-editor" style="font-size:11px;"></div>
            </div>

            <div class="panel-section">
                <h3 class="panel-title">本地库</h3>
                <div class="control-row">
                    <button id="btn-save-local" class="ui-btn" title="保存当前机构到本地">保存</button>
                    <button id="btn-load-local" class="ui-btn" title="从本地加载机构">加载</button>
                    <button id="btn-del-local" class="ui-btn" title="删除选中的本地机构">删除</button>
                </div>
                <select id="local-list" class="ui-select" size="4" style="width:100%;margin-top:4px;font-size:11px;">
                    <option value="" disabled>（暂无保存的机构）</option>
                </select>
            </div>

            <div class="panel-section">
                <h3 class="panel-title">快捷键</h3>
                <div class="shortcuts">
                    <span><kbd>1</kbd> 构建</span>
                    <span><kbd>2</kbd> 拖动</span>
                    <span><kbd>3</kbd> 动画</span>
                    <span><kbd>空格</kbd> 播放</span>
                    <span><kbd>R</kbd> 重置</span>
                    <span><kbd>C</kbd> 清轨迹</span>
                    <span><kbd>D</kbd> 开关驱动</span>
                    <span><kbd>Del</kbd> 删除</span>
                    <span><kbd>Esc</kbd> 取消</span>
                </div>
            </div>
        `;

        // 缓存 DOM
        this.els = {
            infoDof: document.getElementById('info-dof'),
            infoNodes: document.getElementById('info-nodes'),
            infoLinks: document.getElementById('info-links'),
            infoDrivers: document.getElementById('info-drivers'),
            presetSelect: document.getElementById('preset-select'),
            modeBtns: document.querySelectorAll('.mode-btn'),
            animateControls: document.getElementById('animate-controls'),
            btnPlay: document.getElementById('btn-play'),
            btnReset: document.getElementById('btn-reset'),
            speedSlider: document.getElementById('speed-slider'),
            speedValue: document.getElementById('speed-value'),
            chkGrid: document.getElementById('chk-grid'),
            chkTraces: document.getElementById('chk-traces'),
            chkLabels: document.getElementById('chk-labels'),
            chkDimensions: document.getElementById('chk-dimensions'),
            btnFit: document.getElementById('btn-fit'),
            btnClearTraces: document.getElementById('btn-clear-traces'),
            btnTheme: document.getElementById('btn-theme'),
            btnExport: document.getElementById('btn-export'),
            btnImport: document.getElementById('btn-import'),
            importFile: document.getElementById('import-file'),
            btnMobileDriver: document.getElementById('btn-mobile-driver'),
            btnMobileDelete: document.getElementById('btn-mobile-delete'),
            btnMobilePlay: document.getElementById('btn-mobile-play'),
            btnMobileReset: document.getElementById('btn-mobile-reset'),
            btnMobileClearTraces: document.getElementById('btn-mobile-clear-traces'),
            btnSaveLocal: document.getElementById('btn-save-local'),
            btnLoadLocal: document.getElementById('btn-load-local'),
            btnDelLocal: document.getElementById('btn-del-local'),
            localList: document.getElementById('local-list'),
            validationPanel: document.getElementById('validation-panel'),
            driverPanel: document.getElementById('driver-panel'),
            driverEditor: document.getElementById('driver-editor')
        };

        // 初始化本地库列表
        this._refreshLocalList();

        // 填充预设列表
        this._populatePresets();
    }

    /** 填充预设下拉框 */
    _populatePresets() {
        const select = this.els.presetSelect;
        if (!select) return;
        const presets = Planar.Presets.list();
        for (const p of presets) {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.name} (DOF=${this._getPresetDOF(p.id)})`;
            select.appendChild(opt);
        }
    }

    /** 获取预设机构的自由度 */
    _getPresetDOF(presetId) {
        try {
            const mech = Planar.Presets.build(presetId);
            return mech.getDOF();
        } catch { return '?'; }
    }

    /** 绑定 UI 事件 */
    _bindUIEvents() {
        // 模式按钮
        this.els.modeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.interaction.setMode(btn.dataset.mode);
            });
        });

        // 预设选择
        if (this.els.presetSelect) {
            this.els.presetSelect.addEventListener('change', (e) => {
                const id = e.target.value;
                if (!id) return;
                this.loadPreset(id);
            });
        }

        // 动画控制
        if (this.els.btnPlay) {
            this.els.btnPlay.addEventListener('click', () => {
                this.interaction.toggleAnimation();
                this._updatePlayButton();
            });
        }
        if (this.els.btnReset) {
            this.els.btnReset.addEventListener('click', () => {
                this.interaction.resetAnimation();
            });
        }
        if (this.els.speedSlider) {
            this.els.speedSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                this.interaction.setSpeed(val);
                if (this.els.speedValue) this.els.speedValue.textContent = val.toFixed(1) + 'x';
            });
        }

        // 显示选项
        if (this.els.chkGrid) {
            this.els.chkGrid.addEventListener('change', (e) => {
                this.renderer.showGrid = e.target.checked;
                this.renderer.render(this.mechanism);
            });
        }
        if (this.els.chkTraces) {
            this.els.chkTraces.addEventListener('change', (e) => {
                this.renderer.showTraces = e.target.checked;
                this.renderer.render(this.mechanism);
            });
        }
        if (this.els.chkLabels) {
            this.els.chkLabels.addEventListener('change', (e) => {
                this.renderer.showLabels = e.target.checked;
                this.renderer.render(this.mechanism);
            });
        }
        if (this.els.chkDimensions) {
            this.els.chkDimensions.addEventListener('change', (e) => {
                this.renderer.showDimensions = e.target.checked;
                this.renderer.render(this.mechanism);
            });
        }

        // 操作按钮
        if (this.els.btnFit) {
            this.els.btnFit.addEventListener('click', () => this.interaction.fitView());
        }
        if (this.els.btnClearTraces) {
            this.els.btnClearTraces.addEventListener('click', () => {
                this.renderer.clearTraces();
                this.renderer.render(this.mechanism);
            });
        }
        if (this.els.btnTheme) {
            this.els.btnTheme.addEventListener('click', () => this._toggleTheme());
        }
        if (this.els.btnExport) {
            this.els.btnExport.addEventListener('click', () => this._exportJSON());
        }
        if (this.els.btnImport) {
            this.els.btnImport.addEventListener('click', () => {
                if (this.els.importFile) this.els.importFile.click();
            });
        }
        if (this.els.importFile) {
            this.els.importFile.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                this._importJSON(file);
            });
        }

        // 移动端操作按钮
        if (this.els.btnMobileDriver) {
            this.els.btnMobileDriver.addEventListener('click', () => {
                if (!this.interaction.toggleDriverOnSelection()) {
                    alert('请先选中连杆');
                }
            });
        }
        if (this.els.btnMobileDelete) {
            this.els.btnMobileDelete.addEventListener('click', () => {
                if (!this.interaction.deleteSelection()) {
                    alert('请先选中节点或连杆');
                }
            });
        }
        if (this.els.btnMobilePlay) {
            this.els.btnMobilePlay.addEventListener('click', () => {
                if (this.interaction.getMode() !== this.interaction.MODE.ANIMATE) {
                    this.interaction.setMode(this.interaction.MODE.ANIMATE);
                }
                this.interaction.toggleAnimation();
                this._updatePlayButton();
            });
        }
        if (this.els.btnMobileReset) {
            this.els.btnMobileReset.addEventListener('click', () => this.interaction.resetAnimation());
        }
        if (this.els.btnMobileClearTraces) {
            this.els.btnMobileClearTraces.addEventListener('click', () => {
                this.renderer.clearTraces();
                this.renderer.render(this.mechanism);
            });
        }

        // 本地库按钮
        if (this.els.btnSaveLocal) {
            this.els.btnSaveLocal.addEventListener('click', () => this._saveLocal());
        }
        if (this.els.btnLoadLocal) {
            this.els.btnLoadLocal.addEventListener('click', () => this._loadLocal());
        }
        if (this.els.btnDelLocal) {
            this.els.btnDelLocal.addEventListener('click', () => this._delLocal());
        }
    }

    /** 注册交互管理器的回调 */
    _registerCallbacks() {
        this.interaction.onStatus = (status) => {
            this._updateStatusBar(status);
            this._updateValidation();
        };
        this.interaction.onModeChange = (mode) => this._onModeChanged(mode);
        this.interaction.onChange = (mech) => {
            this.mechanism = mech;
            this._updateValidation();
            this._updateDriverPanel();
        };
    }

    /** 模式切换回调 */
    _onModeChanged(mode) {
        this.els.modeBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        if (this.els.animateControls) {
            this.els.animateControls.style.display = mode === 'animate' ? 'block' : 'none';
        }

        // 同步更新播放按钮图标（处理键盘快捷键触发的播放/暂停）
        this._updatePlayButton();
    }

    /** 加载预设机构 */
    loadPreset(presetId) {
        try {
            const mech = Planar.Presets.build(presetId);
            this._currentPresetId = presetId;
            this._applyLoadedMechanism(mech, { solveInitial: true, presetId });
        } catch (err) {
            console.error('Failed to load preset:', err);
        }
    }

    // ============================================================
    // 主题切换
    // ============================================================
    _toggleTheme() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const newTheme = isDark ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        this.renderer.setTheme(newTheme);
        this.renderer.render(this.mechanism);
        if (this.els.btnTheme) {
            this.els.btnTheme.textContent = newTheme === 'dark' ? '亮色模式' : '暗色模式';
        }
    }

    // ============================================================
    // 导出/导入
    // ============================================================
    _exportJSON() {
        if (!this.mechanism) return;
        const json = JSON.stringify(this.mechanism.toJSON(), null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.mechanism.name.replace(/\s+/g, '_') + '.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    _importJSON(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                const mech = Planar.Mechanism.fromJSON(data);
                this._currentPresetId = null;
                this._applyLoadedMechanism(mech);
                if (this.els.presetSelect) this.els.presetSelect.value = '';
            } catch (err) {
                console.error('Failed to import JSON:', err);
                alert('导入失败：无效的 JSON 文件');
            }
            // 在异步读取完成后重置 input，确保同一文件可再次触发 change 事件
            if (this.els.importFile) {
                this.els.importFile.value = '';
            }
        };
        reader.readAsText(file);
    }

    // ============================================================
    // 状态栏更新
    // ============================================================
    _updateStatusBar(status) {
        if (this.els.infoDof) this.els.infoDof.textContent = status.dof;
        if (this.els.infoNodes) this.els.infoNodes.textContent = status.nodes;
        if (this.els.infoLinks) this.els.infoLinks.textContent = status.links;
        if (this.els.infoDrivers) this.els.infoDrivers.textContent = status.drivers;

        // 更新状态栏
        const statusBar = document.getElementById('status-bar');
        if (statusBar) {
            const modeNames = { build: '构建', drag: '拖动', animate: '动画' };
            const playing = status.playing ? ' ▶ 播放中' : '';
            const scale = status.scale ? `缩放: ${(status.scale * 100).toFixed(0)}%` : '';
            statusBar.textContent = `模式: ${modeNames[status.mode] || status.mode}${playing}  |  DOF: ${status.dof}  |  节点: ${status.nodes}  连杆: ${status.links}  驱动: ${status.drivers}  |  ${scale}`;
        }
    }

    // ============================================================
    // 机构检查面板
    // ============================================================
    _updateValidation() {
        const panel = this.els.validationPanel;
        if (!panel) return;
        if (!this.mechanism || this.mechanism.nodes.size === 0) {
            panel.innerHTML = '<span style="color:#999;">（暂无检查信息）</span>';
            return;
        }
        const msgs = this.mechanism.validate();
        if (msgs.length === 0) {
            panel.innerHTML = '<span style="color:#27ae60;">✓ 未发现问题</span>';
            return;
        }
        panel.innerHTML = msgs.map(m => {
            const c = m.type === 'error' ? '#e74c3c' : m.type === 'warn' ? '#f39c12' : '#3498db';
            const icon = m.type === 'error' ? '✗' : m.type === 'warn' ? '⚠' : 'ℹ';
            return `<div style="color:${c};"><span>${icon} ${m.message}</span></div>`;
        }).join('');
    }

    // ============================================================
    // 驱动属性编辑面板
    // ============================================================
    _updateDriverPanel() {
        const panel = this.els.driverPanel;
        const editor = this.els.driverEditor;
        if (!panel || !editor) return;
        
        if (!this.mechanism || this.mechanism.drivers.size === 0) {
            panel.style.display = 'block';
            editor.innerHTML = '<div style="color:#999;padding:4px;">无驱动。<br>方法：选中连杆后按 <kbd>D</kbd> 设置为主动杆</div>';
            return;
        }

        panel.style.display = 'block';
        let html = '';
        const drivers = Array.from(this.mechanism.drivers.values()).sort((a, b) => a.id - b.id);
        for (const driver of drivers) {
            const link = this.mechanism.getLink(driver.linkId);
            const nodeLabel = link ? `N#${link.nodeA} → N#${link.nodeB}` : '连杆不存在';
            const linkLabel = link ? `L#${driver.linkId}` : `L#${driver.linkId} (失效)`;
            html += `
                <div style="margin-bottom:6px;padding:4px;border:1px solid #ddd;border-radius:3px;">
                    <div style="font-weight:bold;margin-bottom:2px;">驱动 D#${driver.id} ${driver.active?'🟢':'⚪'} ${linkLabel}</div>
                    <div style="font-size:10px;color:#777;margin-bottom:4px;">${nodeLabel}</div>
                    <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
                        <span style="font-size:10px;">ω:</span>
                        <input type="number" step="0.1" value="${driver.omega.toFixed(1)}"
                            style="width:50px;font-size:10px;padding:1px 2px;"
                            data-driver-id="${driver.id}" data-field="omega">
                        <span style="font-size:10px;">θ₀:</span>
                        <input type="number" step="0.1" value="${driver.theta0.toFixed(1)}"
                            style="width:50px;font-size:10px;padding:1px 2px;"
                            data-driver-id="${driver.id}" data-field="theta0">
                        <label style="font-size:10px;">
                            <input type="checkbox" ${driver.active?'checked':''}
                                data-driver-id="${driver.id}" data-field="active"> 启用
                        </label>
                    </div>
                </div>`;
        }
        editor.innerHTML = html;

        // 绑定输入事件
        editor.querySelectorAll('input').forEach(inp => {
            inp.addEventListener('change', (e) => {
                const did = parseInt(e.target.dataset.driverId);
                const field = e.target.dataset.field;
                const driver = this.mechanism.getDriver(did);
                if (!driver) return;
                if (field === 'omega') driver.omega = parseFloat(e.target.value) || 0;
                else if (field === 'theta0') {
                    driver.theta0 = parseFloat(e.target.value) || 0;
                    driver.theta = driver.theta0;
                } else if (field === 'active') driver.active = e.target.checked;
                this.renderer.render(this.mechanism);
            });
        });
    }

    /** 更新播放按钮图标 */
    _updatePlayButton() {
        const btn = this.els.btnPlay;
        if (!btn) return;
        const playing = this.interaction.isPlaying();
        btn.innerHTML = playing
            ? '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="3" y="2" width="4" height="12" fill="currentColor"/><rect x="9" y="2" width="4" height="12" fill="currentColor"/></svg>'
            : '<svg width="16" height="16" viewBox="0 0 16 16"><polygon points="4,2 14,8 4,14" fill="currentColor"/></svg>';
        btn.title = playing ? '暂停 [空格]' : '播放 [空格]';
    }

    // ============================================================
    // 本地库 (localStorage)
    // ============================================================

    /**
     * 获取所有本地保存的机构列表
     */
    _getLocalList() {
        try {
            return JSON.parse(localStorage.getItem('planar_saved') || '[]');
        } catch { return []; }
    }

    /**
     * 保存机构列表到 localStorage
     */
    _setLocalList(list) {
        localStorage.setItem('planar_saved', JSON.stringify(list));
    }

    /**
     * 刷新本地库下拉列表
     */
    _refreshLocalList() {
        const sel = this.els.localList;
        if (!sel) return;
        const list = this._getLocalList();
        sel.innerHTML = '';
        if (list.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.disabled = true;
            opt.textContent = '（暂无保存的机构）';
            sel.appendChild(opt);
        } else {
            for (const item of list) {
                const opt = document.createElement('option');
                opt.value = item.key;
                opt.textContent = `${item.name}  (${item.nodes}节点)`;
                sel.appendChild(opt);
            }
        }
    }

    /**
     * 保存当前机构到本地
     */
    _saveLocal() {
        if (!this.mechanism || this.mechanism.nodes.size === 0) {
            alert('没有机构可保存');
            return;
        }
        const name = prompt('请输入机构名称：', this.mechanism.name || '自定义机构');
        if (!name) return;

        const json = this.mechanism.toJSON();
        const key = 'planar_mech_' + Date.now();
        const list = this._getLocalList();
        list.push({
            key,
            name: name,
            nodes: this.mechanism.nodes.size,
            links: this.mechanism.links.size,
            drivers: this.mechanism.drivers.size,
            savedAt: new Date().toLocaleString()
        });
        this._setLocalList(list);
        localStorage.setItem(key, JSON.stringify(json));
        this._refreshLocalList();
    }

    /**
     * 从本地加载选中的机构
     */
    _loadLocal() {
        const sel = this.els.localList;
        if (!sel || !sel.value) {
            alert('请先在列表中选择一个机构');
            return;
        }
        const key = sel.value;
        try {
            const data = JSON.parse(localStorage.getItem(key));
            if (!data) throw new Error('数据不存在');
            const mech = Planar.Mechanism.fromJSON(data);
            this._currentPresetId = null;
            this._applyLoadedMechanism(mech);
            if (this.els.presetSelect) this.els.presetSelect.value = '';
        } catch (err) {
            console.error('Failed to load local mechanism:', err);
            alert('加载失败：数据损坏或不存在');
        }
    }

    _buildStatusPayload() {
        if (!this.mechanism) {
            return {
                mode: this.interaction.getMode(),
                dof: 0,
                nodes: 0,
                links: 0,
                drivers: 0,
                playing: this.interaction.isPlaying(),
                scale: this.renderer.scale
            };
        }
        return {
            mode: this.interaction.getMode(),
            dof: this.mechanism.getDOF(),
            nodes: this.mechanism.nodes.size,
            links: this.mechanism.links.size,
            drivers: this.mechanism.drivers.size,
            playing: this.interaction.isPlaying(),
            scale: this.renderer.scale
        };
    }

    _refreshMechanismUI() {
        this._updateStatusBar(this._buildStatusPayload());
        this._updateValidation();
        this._updateDriverPanel();
        this._updatePlayButton();
    }

    _applyLoadedMechanism(mech, options = {}) {
        this.mechanism = mech;
        this.interaction.setMechanism(mech);
        this.renderer.setMechanism(mech);
        this.renderer.clearTraces();
        this.interaction.resetAnimation();

        if (options.solveInitial) {
            this.interaction.solver.solve(mech);
        }

        this.renderer.render(mech);
        this.interaction.fitView();
        this.renderer.clearTraces();
        this.renderer.render(mech);

        if (options.presetId && this.els.presetSelect) {
            this.els.presetSelect.value = options.presetId;
        }

        this._refreshMechanismUI();
    }

    /**
     * 删除选中的本地机构
     */
    _delLocal() {
        const sel = this.els.localList;
        if (!sel || !sel.value) {
            alert('请先在列表中选择一个机构');
            return;
        }
        const key = sel.value;
        if (!confirm('确定删除选中的机构？')) return;

        localStorage.removeItem(key);
        const list = this._getLocalList().filter(item => item.key !== key);
        this._setLocalList(list);
        this._refreshLocalList();
    }
}

Planar.UIManager = UIManager;
window.Planar = Planar;
