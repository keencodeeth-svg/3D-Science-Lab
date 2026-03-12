# 技术架构路线

## 1. 产品级目标

- 不是做“会播放实验步骤的课件”，而是做“有真实运行态、可观测量、控制面和机理解释层”的实验仿真平台。
- AI 不是外挂问答框，而是必须读取仿真蓝图、运行态快照、错误轨迹和多尺度语义图的 grounded copilot。
- 技术路线要支持从当前 WebGL 产品化版本，平滑升级到更高保真资产、更强 GPU 管线和更深 AI agent 编排。

## 2. 对标后得到的方向

### 2.1 当前行业信号

- `Labster` 的核心价值不是单个 3D 场景，而是“实验流程 + 机理解释 + 结果判断”的完整 simulation loop。
- `PraxiLabs` 已经把 `OXI` 这类 AI 助手放进虚拟实验语境，说明同类产品竞争已经从“是否有 AI”转向“AI 是否真正懂实验现场”。
- `three.js WebGPURenderer` 和 WebGPU 正在把浏览器端高保真渲染与 GPU 计算的上限继续抬高。
- `OpenUSD / SimReady` 代表的是资产和语义标准化方向，后续要做更高精模型、更复杂材质、更强互操作，不能长期停留在孤立 glTF + 手写脚本。

### 2.2 结论

- 前端运行时要分成 `render runtime`、`simulation runtime`、`AI grounding runtime` 三层，而不是只剩一个播放器组件。
- 资产层要逐步从“能显示”升级到“有语义部件、材质通道、状态挂点、可复用器材蓝图”。
- AI 层要从“看文本描述回答”升级到“读取 observables / controls / risks / trace 后回答”。

## 3. 推荐总架构

### 3.1 前端

- `React + TypeScript + Vite`
- `Three.js`
- 懒加载专属播放器与共享实验台
- 本地 `simulation blueprint` 与 `simulation runtime` 双层 grounding

### 3.2 后端

- Node API 服务
- 实验配置目录 + 班级/学生/作业/遥测记录
- `POST /api/v1/ai/copilot` 统一承接 grounded AI 请求
- OpenAI Responses API 作为在线模型通道，fallback 规则引擎作为事实兜底

### 3.3 仿真内核分层

1. `Experiment Config`
   定义步骤、对象、能力、多尺度材料与规则。
2. `Simulation Blueprint`
   把实验配置归一成执行模型、渲染运行时、可观测量、控制输入、语义链路和升级目标。
3. `Simulation Runtime Snapshot`
   由专属播放器持续上报当前 phase、关键读数、控制状态、失败风险和 trace。
4. `AI Grounding Snapshot`
   把蓝图和运行态合并后送给 Copilot 与后端模型。

## 4. 这条路线为什么更对

### 4.1 解决“AI 不懂现场”

如果 AI 只能拿到：

- 实验标题
- 步骤文案
- 最近分数

它本质上还是在做文本问答。

如果 AI 能同时拿到：

- 当前 phase
- 当前焦点对象
- 当前关键读数
- 当前可控量
- 当前失败风险
- 当前运行轨迹

它才能做真正的仿真内嵌式辅导、纠错、巡检和教师洞察。

### 4.2 解决“实验越多越难维护”

- 专属播放器继续存在，但必须通过统一 runtime contract 向上汇报。
- 通用器材引擎、共享实验台、多尺度 portal、AI copilot 都读取统一语义层。
- 这样新增实验时，成本不只是“再写一个页面”，而是往统一仿真底座挂一个新 adapter。

### 4.3 解决“后续高保真升级断层”

- 当前可以先用 `glTF / GLB + Three.js WebGL` 快速产品化。
- 下一阶段可把高价值实验迁到 `WebGPU` 路线，优先用于粒子、场、流动、后处理和复杂材质。
- 资产层逐步向 `OpenUSD / SimReady` 的语义化部件组织靠拢，避免模型资产越积越乱。

## 5. 当前仓库应该坚持的技术原则

### 5.1 蓝图和运行态分离

- 蓝图回答“这个实验理论上由哪些状态、观测量、控制面组成”
- 运行态回答“学生此刻到底做到了哪一步、看到了什么、哪里有风险”

### 5.2 AI 必须基于 grounding，而不是自由发挥

- 前端发送 `simulationSnapshot`
- 后端做字段归一化
- fallback 和在线模型都优先读取 runtime summary、runtime observables、runtime controls、runtime risks

### 5.3 专属播放器不是终点

- 专属播放器继续承担高完成度交互
- 但输出一定要收敛成统一的 runtime snapshot
- 后续才有可能做跨实验 AI 巡检、通用评测和通用实验 agent

### 5.4 多尺度不是装饰层

- 宏观层：器材、现象、操作结果
- 中观层：材料状态、结构关系、局部过程
- 微观层：粒子、离子、场、反应路径

AI 解释、教师洞察和未来的自动实验生成都必须能读这三层。

## 6. 接下来 3 个技术阶段

### Phase A：现在就该做

- 全量专属播放器接入统一 `simulation runtime snapshot`
- 把运行态送进 AI Copilot、教师端和实验规格视图
- 把 chunk 继续拆小，尤其是 `three-vendor` 和 `playerRuntimeStyles`

### Phase B：中期产品升级

- 做双运行时：`WebGL stable path` + `WebGPU high-fidelity path`
- 把粒子、流动、电场/光路/热传导等连续机理实验优先迁到 WebGPU
- 建立器材/材料/部件的语义资产规范和导出约束

### Phase C：全球领先差异化

- 基于 runtime snapshot 做 AI 实验巡检 agent
- 基于 blueprint + runtime trace 做自动生成纠错脚本、巡检清单和课堂干预建议
- 做 scenario mutation：同一器材骨架自动派生不同实验
- 做可追溯的实验证据链，而不是只给一个 AI 回答

## 7. 当前参考资料

- Three.js WebGPU Renderer: https://threejs.org/docs/pages/WebGPURenderer.html
- web.dev WebGPU: https://web.dev/articles/webgpu
- OpenUSD: https://openusd.org
- NVIDIA OpenUSD / SimReady: https://developer.nvidia.com/usd
- NVIDIA SimReady assets: https://developer.nvidia.com/simready-assets
- Labster virtual labs: https://www.labster.com/product/virtual-labs
- PraxiLabs: https://praxilabs.com
- PraxiLabs OXI: https://praxilabs.com/oxi

## 8. 对这份仓库的直接要求

- 每个实验最终都要能导出统一的 `runtime snapshot`
- AI 输入必须持续保留 `blueprint + runtime + telemetry + multiscale`
- 新增实验时优先补语义部件、观测量和控制量定义，不要只补 UI
- 高价值实验优先规划 WebGPU 升级路径，不必一次性全量迁移
