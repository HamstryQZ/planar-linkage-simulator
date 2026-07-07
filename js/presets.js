/**
 * PLANAR - 通用平面连杆机构仿真平台
 * presets.js - 内置预设机构库
 */

var Planar = window.Planar || {};

// ============================================================
// Preset 预设机构
// ============================================================
Planar.Presets = {
    registry: new Map(),

    /**
     * 注册一个预设
     * @param {string} id
     * @param {string} name
     * @param {string} description
     * @param {Function} builder - (Mechanism) => Mechanism
     */
    register(id, name, description, builder) {
        this.registry.set(id, { id, name, description, builder });
    },

    /** 获取预设列表 */
    list() {
        return Array.from(this.registry.values());
    },

    /** 根据 ID 构建预设机构 */
    build(id) {
        const preset = this.registry.get(id);
        if (!preset) throw new Error(`Preset '${id}' not found`);
        const mech = new Planar.Mechanism();
        preset.builder(mech);
        mech.name = preset.name;
        return mech;
    }
};

// ============================================================
// 预设 1: 四杆曲柄摇杆机构 (1 DOF)
// ============================================================
Planar.Presets.register(
    'four-bar-crank-rocker',
    '曲柄摇杆机构 (四杆)',
    '经典的 Grashof 曲柄摇杆机构，1 自由度。固定铰链位于 (0,0) 和 (200,0)，曲柄长 50，连杆长 180，摇杆长 120。',
    (mech) => {
        mech.addNode(0, 0, true);      // 节点 1: 固定铰链 A (曲柄固定端)
        mech.addNode(200, 0, true);    // 节点 2: 固定铰链 B (摇杆固定端)
        mech.addNode(50, 0, false);    // 节点 3: 自由铰链 C (曲柄-连杆连接)
        mech.addNode(200, -120, false);// 节点 4: 自由铰链 D (连杆-摇杆连接)

        mech.addLink(1, 3, 50);        // 连杆 1: 曲柄
        mech.addLink(3, 4, 180);       // 连杆 2: 连杆
        mech.addLink(2, 4, 120);       // 连杆 3: 摇杆

        mech.addDriver(1, 'rotary', 1.0, 0); // 驱动曲柄
    }
);

// ============================================================
// 预设 2: 双曲柄机构 (1 DOF)
// ============================================================
Planar.Presets.register(
    'four-bar-double-crank',
    '双曲柄机构 (四杆)',
    '双曲柄机构，两固定铰链距离 100，较短两边为曲柄。1 自由度。',
    (mech) => {
        mech.addNode(0, 0, true);
        mech.addNode(100, 0, true);
        mech.addNode(40, 0, false);
        mech.addNode(140, 20, false);

        mech.addLink(1, 3, 40);
        mech.addLink(3, 4, 100);
        mech.addLink(2, 4, 50);

        mech.addDriver(1, 'rotary', 1.0, 0);
    }
);

// ============================================================
// 预设 3: 五杆机构 (2 DOF)
// ============================================================
Planar.Presets.register(
    'five-bar',
    '五杆机构',
    '经典的 2 自由度五杆机构。两个固定铰链位于 (0,0) 和 (200,0)，需要两个驱动器。',
    (mech) => {
        mech.addNode(0, 0, true);      // 节点 1: 固定
        mech.addNode(200, 0, true);    // 节点 2: 固定
        mech.addNode(50, 0, false);    // 节点 3: 自由
        mech.addNode(150, 0, false);   // 节点 4: 自由
        mech.addNode(100, -100, false);// 节点 5: 自由 (连接点)

        mech.addLink(1, 3, 50);        // 连杆 1: 左曲柄
        mech.addLink(2, 4, 50);        // 连杆 2: 右曲柄
        mech.addLink(3, 5, 120);       // 连杆 3: 左连杆
        mech.addLink(4, 5, 120);       // 连杆 4: 右连杆
        mech.addLink(1, 2, 200);       // 连杆 5: 机架（固定杆）

        mech.addDriver(1, 'rotary', 1.0, 0);   // 驱动左曲柄
        mech.addDriver(2, 'rotary', 1.5, 0.5); // 驱动右曲柄
    }
);

// ============================================================
// 预设 4: SCARA 型平面 2R 机械臂 (2 DOF)
// ============================================================
Planar.Presets.register(
    'scara-2r',
    'SCARA 平面 2R 机械臂',
    '仿 SCARA 的平面 2 自由度机械臂。基座位于 (200, 200)，大臂长 100，小臂长 80。末端执行器可到达圆形工作空间。',
    (mech) => {
        mech.addNode(200, 200, true);   // 节点 1: 基座 (固定)
        mech.addNode(300, 200, false);  // 节点 2: 肘关节
        // 小臂初始位置与驱动角度一致: theta0=1.0rad, 大臂在0rad时肘关节在(300,200)
        // 所以末端 = (300 + 80*cos(1.0), 200 + 80*sin(1.0))
        mech.addNode(343.2, 267.3, false);  // 节点 3: 腕关节 (末端)

        mech.addLink(1, 2, 100);        // 大臂
        mech.addLink(2, 3, 80);         // 小臂

        mech.addDriver(1, 'rotary', 0.8, 0);     // 肩关节驱动
        mech.addDriver(2, 'rotary', -1.2, 1.0);  // 肘关节驱动
    }
);

// ============================================================
// 预设 5: 并联五杆机械臂 (2 DOF)
// ============================================================
Planar.Presets.register(
    'parallel-5bar',
    '并联五杆机械臂',
    '2 自由度并联机械臂。两个固定基座位于 (0,0) 和 (160,0)，末端执行器由两组连杆并联驱动，刚性好、精度高。',
    (mech) => {
        mech.addNode(0, 0, true);       // 节点 1: 固定基座左
        mech.addNode(160, 0, true);     // 节点 2: 固定基座右
        mech.addNode(60, 0, false);     // 节点 3: 左主动臂末端
        mech.addNode(100, 0, false);    // 节点 4: 右主动臂末端
        mech.addNode(80, -120, false);  // 节点 5: 末端执行器

        mech.addLink(1, 3, 60);         // 左主动臂
        mech.addLink(2, 4, 60);         // 右主动臂
        mech.addLink(3, 5, 130);        // 左从动杆
        mech.addLink(4, 5, 130);        // 右从动杆

        mech.addDriver(1, 'rotary', 1.0, 0.5);
        mech.addDriver(2, 'rotary', 1.0, -0.5);
    }
);

// ============================================================
// 预设 6: 六杆 Watt 机构 (1 DOF)
// ============================================================
Planar.Presets.register(
    'sixbar-watt',
    'Watt 六杆机构',
    'Watt 型六杆机构，1 自由度。由两个四杆回路串联而成，常用于机械夹持和步进运动。',
    (mech) => {
        // 第一回路：四杆
        mech.addNode(0, 0, true);       // 1: 固定
        mech.addNode(180, -100, true);  // 2: 固定
        mech.addNode(50, 0, false);     // 3: 自由
        mech.addNode(160, -100, false); // 4: 自由
        mech.addNode(160, 30, false);   // 5: 自由 (第一回路连杆上延伸)
        mech.addNode(120, 80, false);   // 6: 自由 (末端)

        mech.addLink(1, 3, 50);         // 曲柄
        mech.addLink(3, 4, 150);        // 连杆1
        mech.addLink(2, 4, 100);        // 摇杆
        mech.addLink(1, 5, 170);        // 延伸杆（连接至节点5）
        mech.addLink(4, 5, 130);        // 连接第二回路
        mech.addLink(5, 6, 70);         // 末端连杆
        mech.addLink(2, 6, 150);        // 最终连杆

        mech.addDriver(1, 'rotary', 0.8, 0);
    }
);

// ============================================================
// 预设 7: 平行四边形机构 (1 DOF)
// ============================================================
Planar.Presets.register(
    'parallelogram',
    '平行四边形机构',
    '平行四边形四杆机构。输入与输出始终保持平行，常用于平移台和举升机构。1 自由度。',
    (mech) => {
        mech.addNode(0, 0, true);       // 1: 固定
        mech.addNode(150, 0, true);     // 2: 固定
        mech.addNode(50, -80, false);   // 3: 自由
        mech.addNode(200, -80, false);  // 4: 自由

        mech.addLink(1, 3, 50);         // 左曲柄
        mech.addLink(2, 4, 50);         // 右曲柄（平行于左曲柄）
        mech.addLink(3, 4, 150);        // 顶杆（平行于底杆）
        mech.addLink(1, 2, 150);        // 底杆（固定）

        mech.addDriver(1, 'rotary', 1.0, 0);
    }
);

// ============================================================
// 预设 8: 曲柄滑块机构 (1 DOF)
// ============================================================
Planar.Presets.register(
    'crank-slider',
    '曲柄滑块机构',
    '曲柄滑块机构，将旋转运动转化为近似直线运动。曲柄长 60，连杆长 180，滑块轨迹近似水平直线。1 自由度。',
    (mech) => {
        mech.addNode(0, 0, true);       // 1: 固定曲柄轴
        mech.addNode(60, 0, false);     // 2: 曲柄销
        mech.addNode(200, 80, false);   // 3: 滑块端点

        mech.addLink(1, 2, 60);         // 曲柄
        mech.addLink(2, 3, 180);        // 连杆

        mech.addDriver(1, 'rotary', 1.5, 0);
    }
);

window.Planar = Planar;