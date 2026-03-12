# 产品包总览

这套文档用于把 `3D Science Lab` 从“想法”推进到“可执行产品方案”。

## 核心结论
- 覆盖小学、初中、高中，不做大学
- 学科范围为：小学科学 + 初高中理化生
- 首发 `Web` 端，优先电脑和平板
- 商业切入优先学校与教师，不先做纯个人用户
- 路线分三步：`课程库扩容` → `Pilot MVP` → `Commercial V1`

## 阅读顺序
1. `strategy.md`：产品定位与切入策略
2. `mvp-definition.md`：首发版本做什么、不做什么
3. `curriculum-expansion-plan.md`：中小学实验扩容与产品化路线
4. `user-flows.md`：学生、教师、学校的核心流程
5. `design-system.md`：视觉风格与组件规范
6. `page-ia.md`：页面信息架构
7. `page-wireframes.md`：页面线框与文案草案
8. `implementation-breakdown.md`：设计、前端、3D、后端任务拆解
9. `experiments/index.md`：首批实验产品卡
10. `business-model.md`：商业化与试点打法

## 已补充的关键产物
- 设计系统草案：`design-system.md`
- 课程扩容路线：`curriculum-expansion-plan.md`
- 页面信息架构：`page-ia.md`
- 页面线框与文案：`page-wireframes.md`
- 页面/引擎任务拆解：`implementation-breakdown.md`
- 首批实验标准卡：`experiments/`
- 低保真页面原型：`../../frontend/prototypes/`
- 高保真静态展示页：`../../frontend/showcase/`
- 正式 React 前端壳：`../../frontend/webapp/`
- 实验配置 Schema：`../../backend/schemas/experiment.schema.json`
- 实验配置：`../../backend/configs/experiments/`

## 当前建议
- 把“课程库完整度 + 交互可复用引擎 + 教师可见数据”作为第一闭环
- 不追求一开始把所有实验都做成 3D，先把实验目录、产品状态和优先级体系建好
- 不把产品定义成“3D 动画演示”，而是定义成“可交互、可判定、可评估的实验教学平台”

## 建议接下来的产出顺序
1. 根据 `frontend/webapp/` 把课程库筛选、状态流和教师看板继续做深
2. 根据 `backend/schemas/experiment.schema.json` 建实验内容生产规范
3. 根据 `docs/product/curriculum-expansion-plan.md` 先补小学科学和初中高频实验
4. 把已有 3D 实验逐步推进为 `产品级`
5. 准备试点学校演示材料与销售版本
