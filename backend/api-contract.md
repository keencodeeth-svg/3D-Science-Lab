# API Contract Draft

## 目标
为学生端、教师端、学校管理端提供统一 API，支持实验内容读取、实验过程记录、作业布置和数据统计。

## 1. Auth
- `POST /api/v1/auth/login`：账号登录
- `POST /api/v1/auth/logout`：退出登录
- `GET /api/v1/auth/me`：获取当前用户信息

## 2. Experiments
- `GET /api/v1/experiments`：按学段/学科/年级获取实验列表
- `GET /api/v1/experiments/:id`：获取单个实验详情
- `GET /api/v1/experiments/:id/config`：获取实验步骤与交互配置

## 3. Sessions
- `POST /api/v1/sessions`：创建实验会话
- `PATCH /api/v1/sessions/:id/step`：上报当前步骤结果
- `PATCH /api/v1/sessions/:id/complete`：提交实验结果
- `GET /api/v1/sessions/:id`：查看实验记录

## 4. Teacher
- `POST /api/v1/assignments`：布置实验到班级
- `GET /api/v1/assignments`：查看教师布置列表
- `GET /api/v1/classes/:id/progress`：查看班级实验完成情况
- `GET /api/v1/classes/:id/analytics`：查看错因、时长、得分分析

## 5. Reports
- `GET /api/v1/reports/student/:id`：学生实验报告
- `GET /api/v1/reports/class/:id`：班级实验报告
- `GET /api/v1/reports/school/:id`：学校级实验统计

## 6. AI Copilot
- `POST /api/v1/ai/copilot`：基于实验配置、学生记录、班级数据生成 grounded AI 回答

### `POST /api/v1/ai/copilot`
```json
{
  "role": "student",
  "mode": "study",
  "experimentId": "phy-junior-circuit-001",
  "studentId": "stu-701-01",
  "classId": "class-701",
  "focusStepId": "step-identify-apparatus",
  "simulationSnapshot": {
    "executionModel": "混合语义仿真：专属交互播放器 + 多尺度状态解释 + 规则触发",
    "renderRuntime": "Three.js WebGL + 专属 Player + DOM/Portal 多尺度叠层",
    "observables": ["步骤状态", "连接关系", "材料状态"],
    "controlInputs": ["连线操作", "开关控制", "镜头切换"],
    "groundingChannels": ["实验配置", "步骤定义", "目标对象", "多尺度语义图"],
    "focusLens": "中观",
    "focusStepTitle": "识别器材",
    "focusTargetObject": "battery-box",
    "runtimePhase": "连接串联电路",
    "runtimeSummary": "连接串联电路 · 串联回路仍在搭建，当前 3 条连接已生效。 · 回路拓扑 串联回路 · 连接数 3",
    "runtimeObservables": ["开关状态 断开", "连接数 3", "发光状态 未点亮"],
    "runtimeControls": ["导线拖拽 待操作", "开关控制 断开", "镜头机位 angled"],
    "runtimeRisks": ["观察现象前还未闭合开关，灯泡不会进入有效读数状态。"]
  },
  "question": "我现在应该先检查什么？"
}
```

```json
{
  "provider": "grounded-fallback",
  "role": "student",
  "mode": "study",
  "answer": "进入 Study Mode。我不会直接把答案塞给你，而是先帮你判断。",
  "suggestions": [
    "继续追问我，不要直接给答案",
    "把这一步变成判断题来问我"
  ],
  "evidence": [
    { "label": "实验", "value": "串联与并联电路" },
    { "label": "当前步骤", "value": "识别器材" }
  ],
  "citations": [
    "实验主题：电与磁",
    "步骤：识别器材"
  ],
  "contextLabel": "串联与并联电路 · 林语晨",
  "grounded": true,
  "generatedAt": "2026-03-12T01:00:00.000Z"
}
```

教师端额外支持：

- `assignmentMode`：把当前布置模式（如 `引导 / 练习 / 考核`）带给 Copilot
- `dueDate`：把当前截止日期带给 Copilot
- `simulationSnapshot`：把当前仿真技术路线、可观测量、焦点镜头和运行时快照带给 Copilot

其中运行时快照建议至少包含：

- `runtimePhase`：当前仿真阶段
- `runtimeSummary`：当前状态摘要
- `runtimeObservables`：当前关键读数/现象
- `runtimeControls`：当前可控输入
- `runtimeRisks`：当前失败风险
- `runtimeTraceSummary`：当前运行轨迹

教师 `plan / intervene / insight` 响应会额外返回可落地的 `artifacts`，例如：

```json
{
  "artifacts": {
    "assignmentNotes": "可直接写入任务说明的文案",
    "lessonPlan": "课堂编排草案",
    "teacherScript": "适合投屏或口播的话术",
    "checklist": "课堂巡检清单"
  }
}
```

支持模式：

- 学生侧：`study`、`hint`、`explain`、`review`
- 教师侧：`insight`、`plan`、`intervene`

## 7. Admin
- `POST /api/v1/admin/experiments`：创建实验
- `PATCH /api/v1/admin/experiments/:id`：更新实验
- `POST /api/v1/admin/assets/upload`：上传模型/贴图/音频
- `GET /api/v1/admin/audit-logs`：查看审计日志

## 8. 推荐核心数据返回

### `GET /api/v1/experiments`
```json
{
  "items": [
    {
      "id": "phy-junior-circuit-001",
      "title": "串联与并联电路",
      "stage": "初中",
      "subject": "物理",
      "grade": "八年级",
      "durationMinutes": 12,
      "modes": ["引导", "练习", "考核"],
      "curriculumTheme": "电与磁",
      "productStatus": "产品级",
      "interactionMode": "全交互",
      "assessmentReady": true,
      "teacherReady": true,
      "assetsReady": true,
      "multiscaleSummary": {
        "source": "configured",
        "defaultLens": "meso",
        "materialCount": 3,
        "speciesCount": 4,
        "reactionRuleCount": 2,
        "componentCount": 6
      },
      "dataFile": "phy-junior-circuit.json"
    }
  ]
}
```

### `GET /api/v1/experiments/:id/config`
```json
{
  "id": "phy-junior-circuit-001",
  "scene": {
    "environment": "physics-electricity-bench",
    "cameraPreset": "desk-front-close",
    "assets": [
      "bench.glb",
      "battery-box.glb",
      "switch.glb",
      "bulb.glb",
      "wire.glb"
    ]
  },
  "steps": [
    {
      "order": 1,
      "actionType": "connect-wire",
      "targetObject": "battery-slot-a",
      "successCondition": "closed-circuit"
    }
  ],
  "multiscale": {
    "defaultLens": "meso"
  }
}
```
