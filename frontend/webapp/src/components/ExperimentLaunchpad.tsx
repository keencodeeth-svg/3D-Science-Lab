import type { ExperimentConfig } from '../types/experiment';

interface ExperimentLaunchpadProps {
  experiment: ExperimentConfig;
  hasInteractivePlayer: boolean;
}

function ProductChecklistItem({ label, ready }: { label: string; ready: boolean }) {
  return <span className={ready ? 'status-pill ready' : 'status-pill'}>{label}{ready ? ' 已完成' : ' 待完善'}</span>;
}

export function ExperimentLaunchpad({ experiment, hasInteractivePlayer }: ExperimentLaunchpadProps) {
  const blockers = [
    !experiment.productization.assetsReady ? '补齐 3D 资产与材质' : null,
    !experiment.productization.assessmentReady ? '补评分与考核规则' : null,
    !experiment.productization.teacherReady ? '补教师布置与复盘视图' : null,
    !hasInteractivePlayer ? '挂接专属交互场景' : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <section className="detail-grid launchpad-grid">
      <article className="panel wide-panel hero-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Product Launchpad</span>
            <h2>{experiment.title}</h2>
            <p>
              这个实验已经进入统一课程库，可以按学段、学科、主题和产品状态管理；
              下一步就是把内容、判定、教师闭环和 3D 场景逐项补齐。
            </p>
          </div>
          <div className="badge-row">
            <span className="badge">{experiment.stage}</span>
            <span className="badge">{experiment.subject}</span>
            <span className="badge">{experiment.grade}</span>
            <span className="badge badge-status">{experiment.productization.status}</span>
          </div>
        </div>

        <div className="metric-row launchpad-metric-row">
          <div className="metric-card">
            <span>课程主题</span>
            <strong>{experiment.curriculum.theme}</strong>
          </div>
          <div className="metric-card">
            <span>交互层级</span>
            <strong>{experiment.productization.interactionMode}</strong>
          </div>
          <div className="metric-card">
            <span>实验模式</span>
            <strong>{experiment.modes.join(' / ')}</strong>
          </div>
        </div>
      </article>

      <article className="panel">
        <span className="eyebrow">Readiness</span>
        <h2>产品化清单</h2>
        <div className="status-pill-row launchpad-pill-row">
          <ProductChecklistItem label="3D 资产" ready={experiment.productization.assetsReady} />
          <ProductChecklistItem label="实验考核" ready={experiment.productization.assessmentReady} />
          <ProductChecklistItem label="教师闭环" ready={experiment.productization.teacherReady} />
          <ProductChecklistItem label="交互场景" ready={hasInteractivePlayer} />
        </div>
      </article>

      <article className="panel">
        <span className="eyebrow">Curriculum</span>
        <h2>课程锚点</h2>
        <div className="detail-list compact-detail-list">
          <div className="detail-row">
            <div className="detail-copy">
              <strong>所属单元</strong>
              <span>{experiment.curriculum.unit}</span>
            </div>
            <span className="badge">{experiment.durationMinutes} 分钟</span>
          </div>
          {experiment.curriculum.knowledgePoints.map((point) => (
            <div className="detail-row" key={point}>
              <div className="detail-copy">
                <strong>知识点</strong>
                <span>{point}</span>
              </div>
              <span className="badge">课程库</span>
            </div>
          ))}
        </div>
      </article>

      <article className="panel wide-panel">
        <span className="eyebrow">Next Steps</span>
        <h2>建议推进动作</h2>
        {blockers.length ? (
          <ul className="bullet-list">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
            <li>补齐该实验的讲义、课堂演示稿和题后复盘文案</li>
          </ul>
        ) : (
          <div className="empty-panel launchpad-ready-panel">
            <div>
              <h3>该实验已经具备产品级基础</h3>
              <p>可以直接用于试点学校演示，下一步建议补账号体系、班级任务与学校级统计。</p>
            </div>
          </div>
        )}
      </article>
    </section>
  );
}
