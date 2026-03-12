# 实验配置说明

## 目录
- `schemas/experiment.schema.json`：统一实验配置 Schema
- `configs/experiments/`：当前实验配置样例（含小学、初中、高中）

## 当前用途
- 给前端/3D 明确实验页面需要读取的结构
- 给后端/内容系统明确实验配置的数据边界
- 给产品和学科顾问作为结构化审校基线
- 给课程库提供 `curriculum` 与 `productization` 元数据，用于扩容和排期

## 关键新增字段
- `curriculum`：课程主题、所属单元、知识点
- `productization`：产品状态、交互层级、考核准备度、教师闭环准备度、资产准备度
