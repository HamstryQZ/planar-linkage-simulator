# PLANAR - 平面连杆机构仿真平台

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Status: Unstable](https://img.shields.io/badge/Status-Unstable-orange)](.)

**PLANAR** 是一个通用交互式平面连杆机构仿真软件。它运行在浏览器中，无需安装任何依赖，支持从简单的四杆机构到复杂的多自由度机械臂的建模与仿真。

![PLANAR Screenshot](assets/screenshot.png)

## 特性

- **Newton-Raphson 精确求解** — 基于 NR 迭代的运动学求解器，保证连杆为绝对刚体（杆长误差 < 1e-12）
- **多自由度支持** — 支持 0~3+ DOF 的任意拓扑结构，天然适配 2R 机械臂、五杆机构等
- **三种交互模式**：
  - **构建模式** [1] — 自由添加节点（左键自由/右键固定）、连杆、驱动器
  - **拖动模式** [2] — 拖拽节点进行逆运动学实时求解
  - **动画模式** [3] — 多驱动器同步运动仿真
- **9 个内置预设** — 曲柄摇杆、双曲柄、五杆、SCARA 2R 机械臂、并联五杆、Watt 六杆、平行四边形、曲柄滑块、Dobot Magician 机械臂
- **轨迹追踪** — 自动记录并显示自由节点的运动轨迹
- **亮色/暗色双主题** — 一键切换
- **导入/导出** — JSON 格式的机构定义导入导出
- **本地库** — 浏览器 localStorage 保存/加载自定义机构，关闭后仍在
- **零依赖** — 纯 HTML + CSS + JavaScript，无需任何外部库
- **响应式设计** — 支持桌面大屏和移动设备

## 快速开始

### 使用本地服务器（推荐）

由于浏览器安全策略，直接双击 `index.html` 用 `file://` 协议打开可能无法正常工作（控制台出现 `Unsafe attempt to load URL` 安全警告）。请务必使用本地 HTTP 服务器运行：

```bash
# 使用 Python 3
python -m http.server 8080
# 然后打开 http://localhost:8080

# 使用 Node.js (npx)
npx serve .

# 使用 VS Code Live Server 插件
# 右键 index.html → Open with Live Server
```

### 直接打开（不推荐）

直接用浏览器打开 `index.html` 也可，但部分浏览器安全策略可能导致异常。

```bash
# Windows
start index.html

# macOS
open index.html

# Linux
xdg-open index.html
```

## 项目结构

```
planar-linkage-simulator/
├── index.html              # 入口页面
├── css/
│   └── style.css           # 样式表（双主题）
├── js/
│   ├── main.js             # 主入口，应用初始化
│   ├── utils.js            # 向量/矩阵运算工具
│   ├── model.js            # 机构数据模型 (Node/Link/Driver/Mechanism)
│   ├── solver.js           # Newton-Raphson 运动学求解器
│   ├── presets.js          # 9 个内置预设机构
│   ├── canvas.js           # Canvas 2D 渲染器
│   ├── interaction.js      # 交互系统（三种模式状态机）
│   └── ui.js               # 用户界面管理器
├── assets/
│   └── icons/              # SVG 图标资源
└── README.md
```

## 使用说明

### 构建模式

| 操作 | 效果 |
|------|------|
| 左键点击空白 | 添加自由节点 |
| 右键点击空白 | 添加固定节点 |
| 左键点击节点×2 | 创建连杆 |
| 点击连杆 + D 键 | 设为/取消驱动 |
| Delete 键 | 删除选中元素 |
| Escape 键 | 取消选中 |

### 拖动模式

| 操作 | 效果 |
|------|------|
| 拖拽自由节点 | 逆运动学实时求解，杆长严格不变 |
| 滚轮 | 缩放画布 |
| 中键/Shift+拖拽 | 平移画布 |

### 动画模式

| 操作 | 效果 |
|------|------|
| 空格键 | 播放/暂停 |
| R 键 | 重置位置 |
| 速度滑块 | 调节 0.1x ~ 5x |
| C 键 | 清除轨迹 |

## 技术架构

### 求解器

核心求解器采用 **Newton-Raphson 迭代法**：

1. 建立约束方程：杆长约束 `C = |p_i - p_j|² - L² = 0`，旋转驱动约束 `angle(p_i - p_j) = θ`
2. 组装雅可比矩阵 `J = ∂C/∂x`
3. 迭代修正 `Δx = -J⁺·C`，直到 `max|C| < 1e-12`

固定节点从求解变量中排除，适定/超定/欠定系统自动切换求解策略。

### 渲染

基于 HTML5 Canvas 2D，支持：
- 视口变换（缩放/平移）
- HiDPI (Retina) 支持
- 分层渲染（网格 → 轨迹 → 连杆 → 节点 → 选中高亮）
- 命中检测（用于交互）

### 交互

三层状态机：BUILD → DRAG → ANIMATE，每层独立处理指针事件，通过回调与 UI 通信。

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件。

## 贡献

欢迎提交 Issue 和 Pull Request！

## 致谢

本项目受到以下项目的启发：
- [mec2](https://github.com/hengel-/mec2) - 2D 机构仿真引擎
- [mecEdit](https://mecedit.com) - 在线平面机构编辑器
- [PMKS](https://github.com/) - 平面机构运动学仿真