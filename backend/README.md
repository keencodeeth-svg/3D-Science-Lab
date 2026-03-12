# Backend MVP

当前后端是一个基于 Node 标准库的最小可运行服务，目标是先把学校、班级、学生、任务和实验记录从前端演示态抽成真实 API。

## 启动

- `npm run dev`
- `npm run start`
- `npm run reset:data`

默认监听 `http://127.0.0.1:4318`。

实验目录接口会复用 `frontend/webapp/src/lib/multiscaleLab.ts` 的摘要逻辑，因此首次启动前需要先在 `frontend/webapp/` 执行 `npm install`。

## 当前已实现接口

- `GET /api/v1/health`
- `GET /api/v1/platform/bootstrap`
- `PATCH /api/v1/platform/current-student`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/login`
- `GET /api/v1/experiments`
- `GET /api/v1/experiments/:id/config`
- `GET /api/v1/assignments`
- `POST /api/v1/assignments`
- `GET /api/v1/sessions`
- `POST /api/v1/sessions/telemetry`
- `DELETE /api/v1/sessions`
- `POST /api/v1/ai/copilot`
- `GET /api/v1/classes/:id/progress`
- `GET /api/v1/classes/:id/analytics`

## AI Copilot

`POST /api/v1/ai/copilot` 支持两类 grounded 能力：

- 学生侧 `study / hint / explain / review`
- 教师侧 `insight / plan / intervene`

其中学生端支持 `focusStepId`，可以把 AI 严格绑定到当前实验步骤；教师端支持 `assignmentMode` 与 `dueDate`，并会返回 `assignmentNotes / lessonPlan / teacherScript / checklist` 这类可直接落地的结构化产物。

如果前端同时传入 `simulationSnapshot`，Copilot 会额外读取当前仿真路线、可观测量、控制输入、多尺度焦点和运行时状态摘要。这样 AI 不再只是“懂题目”，而是开始“懂当前仿真”。

当前建议前端把 `simulationSnapshot` 分成两层：

- `blueprint` 语义：执行模型、渲染运行时、可观测量、控制输入、grounding channels
- `runtime` 语义：`runtimePhase / runtimeSummary / runtimeObservables / runtimeControls / runtimeRisks / runtimeTraceSummary`

后端会统一归一化这些字段，并在 fallback 与 OpenAI Responses 输入里优先引用运行态信号。

默认会使用后端内置的 grounded fallback，根据当前实验配置、班级数据和实验记录生成回答；如果配置了下面的环境变量，会优先调用 OpenAI Responses API：

- `OPENAI_API_KEY`
- `OPENAI_MODEL`，默认 `gpt-5-mini`
- `OPENAI_BASE_URL`，默认 `https://api.openai.com/v1`

推荐开发时先直接跑 grounded fallback，把工作流和事实约束调顺，再切正式模型。

## 数据文件

- `data/seed-state.json`：演示种子数据
- `data/app-state.json`：当前运行态数据

`npm run reset:data` 会把运行态重置回种子数据。
