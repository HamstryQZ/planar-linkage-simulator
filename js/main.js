/**
 * PLANAR - 通用平面连杆机构仿真平台
 * main.js - 主入口
 */

(function () {
    'use strict';

    function init() {
        const canvas = document.querySelector('#canvas-container canvas');
        if (!canvas) {
            console.error('Canvas element not found');
            return;
        }

        // 1. 创建空机构
        const mechanism = new Planar.Mechanism();

        // 2. 创建渲染器
        const renderer = new Planar.Renderer(canvas);
        renderer.setMechanism(mechanism);

        // 3. 创建求解器
        const solver = new Planar.NewtonRaphsonSolver({
            maxIter: 80,
            tolerance: 1e-12,
            damping: 0.8,
            verbose: false
        });

        // 4. 创建交互管理器
        const interaction = new Planar.InteractionManager(renderer, solver, mechanism);

        // 5. 创建 UI
        const ui = new Planar.UIManager(interaction);

        // 6. 等待一帧确保布局完成，再加载预设
        requestAnimationFrame(() => {
            ui.loadPreset('four-bar-crank-rocker');
            interaction.fitView();
        });

        // 7. 窗口自适应（canvas 在 render() 中自动调整尺寸）
        window.addEventListener('resize', () => {
            renderer.render(mechanism);
        });

        // 8. 更新工具栏
        document.getElementById('toolbar-status').textContent =
            '快捷键: [1]构建 [2]拖动 [3]动画 [空格]播放 [R]重置 [C]清轨迹';

        console.log('[PLANAR] 初始化完成');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();