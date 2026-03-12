# 3D Science Lab

面向小学、初中、高中阶段的线上三维模拟实验产品，覆盖：

- 小学：科学
- 初中：物理 / 化学 / 生物
- 高中：物理 / 化学 / 生物

不包含大学阶段内容。

## 项目目标

打造一个可独立运营的 Web 端实验课程平台，让学生、老师和学校可以在线完成实验演示、操作练习、课堂讲解、课后复盘与数据评估。

## 当前已完成方向

### 产品文档
- `docs/prd.md`
- `docs/tech-architecture.md`
- `docs/mvp-roadmap.md`
- `docs/product/`
- `docs/product/curriculum-expansion-plan.md`

### 页面原型
- `frontend/prototypes/`：低保真页面原型
- `frontend/showcase/`：高保真静态展示页

### 正式前端壳
- `frontend/webapp/`：`React + TypeScript + Vite`
- 通过 `scripts/sync-experiments.mjs` 读取 `backend/configs/experiments/`
- 已支持课程主题、产品状态、学段/学科筛选
- 已支持学生身份切换、教师布置实验、班级进度、学生状态、学校概览和实验复盘
- 已支持专属 3D 播放器 + 通用实验播放器，优先扩大实验覆盖面
- 已把测量固体密度、酸碱性检验、光的折射规律、植物蒸腾作用现象、二氧化碳的制取与检验、绿叶在光下制造淀粉、探究加速度与力、质量的关系、过滤与蒸发、种子萌发条件、酸碱中和滴定、空气占据空间、磁铁的基本性质、影子的方向与长度、物质在水中的溶解、热胀冷缩现象、液体压强大小规律、让小灯泡亮起来、水的蒸发与凝结、植物细胞吸水和失水、化学反应速率影响因素、浮与沉、声音的产生、观察植物细胞有丝分裂，以及焰色反应、铁离子与硫氰酸根显色、银镜反应、碘钟反应、黄金雨实验、蓝瓶子反应、氨气喷泉、鲁米诺化学发光、铬酸根与重铬酸根平衡、氯化钴可逆变色、植物的向光性、观察口腔上皮细胞、观察洋葱表皮细胞、观察叶片气孔、大气压托水实验、热对流现象、摩擦起电、浮力的大小规律、二力平衡、惯性现象，以及燃烧条件探究、灭火原理、铁生锈条件、质量守恒定律、金属与酸反应、电解水、实验室制取氢气、沉淀反应、用 pH 试纸测酸碱度、紫甘蓝指示剂变色，以及滑动变阻器、平面镜成像、光的反射规律、电磁铁、水的沸腾、声音传播需要介质、光的色散、测量液体密度、固体压强大小规律、测量平均速度，以及杠杆的作用、定滑轮和动滑轮、导体和绝缘体、摩擦力大小比较、热传导快慢比较、摆的快慢、水的表面张力、斜面的作用、轮轴的作用、潜望镜，并继续补齐光是沿直线传播的、小孔成像、转动的彩色轮、纸条吸水与毛细现象、虹吸现象、呼吸模型与吸气过程、运动前后心率变化、观察小鱼尾鳍内血液流动、观察草履虫、酵母发酵现象，以及唾液对淀粉的消化作用、呼出气体与空气的差异、观察菜豆种子的结构、观察酵母菌的出芽生殖、观察人血永久涂片、观察植物细胞的质壁分离与复原、绿叶中色素的分离、茎对水和无机盐的运输作用、马铃薯条吸水与失水、DNA 的粗提取与观察等专属实验页
- 通用实验播放器已加入分学科读数面板、实验记录与错误恢复提示；当前 100 个实验均已具备专属实验页入口，并全部提升到产品级交互，逐步向可运营产品收敛

### 后端配置
- `backend/schemas/experiment.schema.json`
- `backend/configs/experiments/`
- `backend/api-contract.md`
- 已加入 `curriculum` 与 `productization` 字段，为课程库扩容做准备
- 当前已维护 `100` 个实验配置样例

## 初始目录

- `docs/`：产品文档、路线图、需求分析
- `frontend/`：前端原型、展示页、正式前端壳
- `backend/`：后端服务、接口草案、实验配置与 Schema
- `assets/`：模型、贴图、图标、音频
- `experiments/`：按学科整理的实验内容

## 推荐查看顺序

1. `docs/product/index.md`
2. `docs/product/curriculum-expansion-plan.md`
3. `frontend/showcase/index.html`
4. `frontend/webapp/README.md`

## 本地开发

1. 进入 `backend/` 执行 `npm run dev`
2. 进入 `frontend/webapp/` 执行 `npm run dev`
3. 前端通过 `/api` 访问本地后端，实验目录与实验配置统一由后端基于 `backend/configs/experiments/` 提供；`public/data/experiments/` 仅作为构建同步产物保留

## 当前交接（2026-03-12）

### 本轮已完成
- `frontend/webapp/src/components/MicroscopeLabPlayer.tsx`：补回缺失的 `clamp`，恢复显微镜专属页构建。
- `frontend/webapp/src/components/OnionCellLabPlayer.tsx`：重做洋葱表皮专属实验的装片、染色、显微镜镜体和镜下细胞视野，并补上更细粒度的 `SimulationRuntimeSnapshot` 输出，继续给 Copilot / 教师视图 / 实验详情提供 grounded 运行态。
- `frontend/webapp/src/styles/player-runtime-expansion-a.css`：新增洋葱表皮实验的高拟真样式，包括载玻片层次、染色层、盖玻片反光、显微镜结构、镜下细胞形态、镜头机位和响应式收口。
- `cd frontend/webapp && npm run build` 已通过。
- 当前仍只有一个非阻塞构建提示：`Circular chunk: three-rendering -> three-vendor -> three-rendering`。

### 重开后先做什么
1. 先重启本地环境：
   `cd backend && npm run dev`
   `cd frontend/webapp && npm run dev`
2. 打开本地前端：`http://127.0.0.1:4173/`
3. 重点进入“观察洋葱表皮细胞”和显微镜相关实验页，直接看全屏状态与镜下视野。

### 重开后待办
1. 录制屏幕。
   已经允许录屏/截屏，但上一轮没有拿到有效的页面画面，重开后需要重新执行。
2. 录屏时重点检查三件事：
   全屏状态下实验台是否仍是主角，辅助信息不能压住实验台。
   洋葱表皮实验的玻片、染色层、显微视野是否已经明显比原先更逼真。
   Copilot / Step Dock / scene overlay 在全屏下是否仍有遮挡，是否需要继续集中收纳或折叠。
3. 如果录屏里还看到遮挡，优先继续收：
   全屏模式下的 scene overlay、floating chips、step dock 收纳。
   让辅助功能更接近 Word / 专业软件那种“集中在一侧、默认收起、按需展开”的结构。
4. 继续补实验真实感：
   `OxygenLabPlayer` 和 `EnzymeLabPlayer` 接更细 runtime trace，不只依赖 generic heuristics。
   `apparatus schema` 再往 semantic asset / digital twin 推一层，为 OpenUSD 留接口。
5. 后续构建整理：
   清理 `three-rendering -> three-vendor -> three-rendering` 的 circular chunk note。

## 下一步建议

1. 继续补高频实验配置，并把访问量最高的实验逐步替换为专属高拟真 3D 播放器
2. 提升通用实验播放器的器材动画、读数反馈和错误引导细节
3. 接登录、真实账号、班级成员和权限体系
