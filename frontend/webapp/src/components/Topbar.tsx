type ShellSection = 'workspace' | 'studio' | 'specs';

interface TopbarProps {
  activeView: 'student' | 'teacher';
  activeSection: ShellSection;
  onChangeSection: (section: ShellSection) => void;
  onChangeView: (view: 'student' | 'teacher') => void;
  currentStudentName?: string | null;
  currentClassName?: string | null;
  experimentCount: number;
  playableCount: number;
  productReadyCount: number;
  selectedExperimentTitle?: string | null;
  canOpenStudio: boolean;
}

export function Topbar({
  activeView,
  activeSection,
  onChangeSection,
  onChangeView,
  currentStudentName,
  currentClassName,
  experimentCount,
  playableCount,
  productReadyCount,
  selectedExperimentTitle,
  canOpenStudio,
}: TopbarProps) {
  const contextTitle = activeView === 'student'
    ? `${currentStudentName ?? '演示学生'} · ${currentClassName ?? '未选择班级'}`
    : '教师工作台 · 布置、跟踪、复盘';

  const activeSectionLabel = activeSection === 'workspace'
    ? '工作台'
    : activeSection === 'studio'
      ? '实验舞台'
      : '实验说明';

  const contextDescription = selectedExperimentTitle
    ? `聚焦实验：${selectedExperimentTitle}`
    : `当前层级：${activeSectionLabel}`;

  return (
    <header className="topbar-shell">
      <div className="topbar shell-width">
        <div className="topbar-main">
          <div className="brand">
            <span className="brand-mark">3D</span>
            <div>
              <strong>Science Lab</strong>
              <small>中小学科学实验课程平台</small>
            </div>
          </div>

          <div className="topbar-context">
            <span className="topbar-kicker">{activeView === 'student' ? 'Student' : 'Teacher'}</span>
            <strong>{contextTitle}</strong>
            <small>{contextDescription}</small>
          </div>
        </div>

        <div className="topbar-actions">
          <div className="topbar-stat-row" aria-label="平台概览">
            <div className="topbar-stat">
              <small>实验</small>
              <strong>{experimentCount}</strong>
            </div>
            <div className="topbar-stat">
              <small>可操作</small>
              <strong>{playableCount}</strong>
            </div>
            <div className="topbar-stat">
              <small>产品级</small>
              <strong>{productReadyCount}</strong>
            </div>
          </div>

          <nav className="nav-switch" aria-label="角色切换">
            <button
              className={activeView === 'student' ? 'switch active' : 'switch'}
              onClick={() => onChangeView('student')}
              type="button"
            >
              学生端
            </button>
            <button
              className={activeView === 'teacher' ? 'switch active' : 'switch'}
              onClick={() => onChangeView('teacher')}
              type="button"
            >
              教师端
            </button>
          </nav>
        </div>
      </div>

      <div className="workspace-anchor-bar shell-width" aria-label="页面分区导航" role="tablist">
        <button
          aria-pressed={activeSection === 'workspace'}
          className={activeSection === 'workspace' ? 'anchor-chip active' : 'anchor-chip'}
          onClick={() => onChangeSection('workspace')}
          type="button"
        >
          工作台
        </button>
        {activeView === 'student' ? (
          <button
            aria-pressed={activeSection === 'studio'}
            className={activeSection === 'studio' ? 'anchor-chip active' : 'anchor-chip'}
            disabled={!canOpenStudio}
            onClick={() => onChangeSection('studio')}
            type="button"
          >
            实验室
          </button>
        ) : null}
        <button
          aria-pressed={activeSection === 'specs'}
          className={activeSection === 'specs' ? 'anchor-chip active' : 'anchor-chip'}
          onClick={() => onChangeSection('specs')}
          type="button"
        >
          实验说明
        </button>
      </div>
    </header>
  );
}
