import { Suspense, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LazySectionBoundary } from './components/LazySectionBoundary';
import { StudentOverview } from './components/StudentOverview';
import { Topbar } from './components/Topbar';
import { getExperimentPlayer, hasDedicatedExperimentPlayer, preloadExperimentPlayerById } from './lib/experimentRegistry';
import { createModulePreloader, lazyNamed } from './lib/lazyNamedRetry';
import { isExperimentConfigStale, isExperimentIndexStale, loadExperimentConfig, loadExperimentIndex, peekExperimentConfig, peekExperimentIndex, preloadExperimentConfig, revalidateExperimentConfig, revalidateExperimentIndex } from './lib/loadExperiments';
import { getExperimentMultiscaleView, getFocusedExperimentMultiscaleView, type ExperimentMultiscaleView } from './lib/multiscaleLab';
import { clearAttemptRecords, createAssignment, loadPlatformBootstrap, recordTelemetryEvent, updateCurrentStudentSelection } from './lib/platformApi';
import { scheduleIdleTask } from './lib/scheduleIdleTask';
import { createSimulationGroundingSnapshot } from './lib/simulationBlueprint';
import type { LabAttemptRecord, LabTelemetryInput } from './lib/labTelemetry';
import { getStudentById, type DemoClassroom, type DemoStudent, type SchoolSummary } from './lib/schoolRoster';
import type { SimulationRuntimeSnapshot } from './lib/simulationRuntime';
import type { TeacherAssignmentDraft, TeacherAssignmentRecord } from './lib/teacherAssignments';
import type { ExperimentConfig, ExperimentIndexItem, MultiscaleLens } from './types/experiment';

const DEFAULT_EXPERIMENT_ID = 'phy-junior-circuit-001';
const LAB_WORKBENCH_LAYOUT_STORAGE_KEY = '3d-science-lab:workbench-layout';
const MULTISCALE_LENS_LABELS: Record<MultiscaleLens, string> = {
  macro: '宏观',
  meso: '中观',
  micro: '微观',
};
const MULTISCALE_SOURCE_LABELS: Record<ExperimentMultiscaleView['source'], string> = {
  configured: '显式配置',
  derived: '引擎推导',
};
const preloadTeacherOverview = createModulePreloader(() => import('./components/TeacherOverview'));
const preloadExperimentDetailPanel = createModulePreloader(() => import('./components/ExperimentDetailPanel'));
const preloadApparatusEnginePanel = createModulePreloader(() => import('./components/ApparatusEnginePanel'));
const preloadExperimentLaunchpad = createModulePreloader(() => import('./components/ExperimentLaunchpad'));
const preloadLabSceneMultiscalePortal = createModulePreloader(() => import('./components/LabSceneMultiscalePortal'));
const preloadLabWorkbenchEnginePortal = createModulePreloader(() => import('./components/LabWorkbenchEnginePortal'));
const preloadSharedWorkbenchThreeStagePortal = createModulePreloader(() => import('./components/SharedWorkbenchThreeStage'));
const preloadAiCopilotPanel = createModulePreloader(() => import('./components/AiCopilotPanel'));

const TeacherOverview = lazyNamed(preloadTeacherOverview, 'TeacherOverview');
const ExperimentDetailPanel = lazyNamed(preloadExperimentDetailPanel, 'ExperimentDetailPanel');
const ApparatusEnginePanel = lazyNamed(preloadApparatusEnginePanel, 'ApparatusEnginePanel');
const ExperimentLaunchpad = lazyNamed(preloadExperimentLaunchpad, 'ExperimentLaunchpad');
const LabSceneMultiscalePortal = lazyNamed(preloadLabSceneMultiscalePortal, 'LabSceneMultiscalePortal');
const LabWorkbenchEnginePortal = lazyNamed(preloadLabWorkbenchEnginePortal, 'LabWorkbenchEnginePortal');
const SharedWorkbenchThreeStagePortal = lazyNamed(preloadSharedWorkbenchThreeStagePortal, 'SharedWorkbenchThreeStagePortal');
const AiCopilotPanel = lazyNamed(preloadAiCopilotPanel, 'AiCopilotPanel');

function preloadExperimentSpecsShell() {
  return Promise.all([preloadExperimentDetailPanel(), preloadApparatusEnginePanel()]);
}

function preloadStudioShell() {
  return Promise.all([preloadSharedWorkbenchThreeStagePortal(), preloadLabSceneMultiscalePortal(), preloadLabWorkbenchEnginePortal()]);
}
type AppShellSection = 'workspace' | 'studio' | 'specs';
type LabStudioMode = 'operation' | 'record' | 'guide';
type LabInspectorView = 'all' | 'actions' | 'checklist' | 'recovery';
type LabInspectorSection = 'actions' | 'checklist' | 'recovery';
type LabWorkbenchPreset = 'focus' | 'balanced' | 'review' | 'custom';
type LabFullscreenUtilityView = 'steps' | 'copilot' | null;
type LabFullscreenStepSection = 'focus' | 'checks' | 'timeline' | null;
type LabWorkbenchLayout = {
  studioMode: LabStudioMode;
  preset: LabWorkbenchPreset;
  ribbonCollapsed: boolean;
  leftRailVisible: boolean;
  rightRailVisible: boolean;
  inspectorView: LabInspectorView;
  inspectorCollapsedSections: Record<LabInspectorSection, boolean>;
  stepDockCollapsed: boolean;
};

const DEFAULT_LAB_INSPECTOR_COLLAPSED_SECTIONS: Record<LabInspectorSection, boolean> = {
  actions: false,
  checklist: false,
  recovery: false,
};

function createDefaultLabWorkbenchLayout(): LabWorkbenchLayout {
  return {
    studioMode: 'operation',
    preset: 'balanced',
    ribbonCollapsed: true,
    leftRailVisible: false,
    rightRailVisible: false,
    inspectorView: 'actions',
    inspectorCollapsedSections: { ...DEFAULT_LAB_INSPECTOR_COLLAPSED_SECTIONS },
    stepDockCollapsed: true,
  };
}

function loadLabWorkbenchLayout(): LabWorkbenchLayout {
  const defaults = createDefaultLabWorkbenchLayout();

  if (typeof window === 'undefined') return defaults;

  try {
    const raw = window.localStorage.getItem(LAB_WORKBENCH_LAYOUT_STORAGE_KEY);
    if (!raw) return defaults;

    const parsed = JSON.parse(raw) as Partial<LabWorkbenchLayout>;

    return {
      studioMode: parsed.studioMode === 'record' || parsed.studioMode === 'guide' ? parsed.studioMode : defaults.studioMode,
      preset: parsed.preset === 'focus' || parsed.preset === 'review' || parsed.preset === 'custom' ? parsed.preset : defaults.preset,
      ribbonCollapsed: typeof parsed.ribbonCollapsed === 'boolean' ? parsed.ribbonCollapsed : defaults.ribbonCollapsed,
      leftRailVisible: typeof parsed.leftRailVisible === 'boolean' ? parsed.leftRailVisible : defaults.leftRailVisible,
      rightRailVisible: typeof parsed.rightRailVisible === 'boolean' ? parsed.rightRailVisible : defaults.rightRailVisible,
      inspectorView:
        parsed.inspectorView === 'all' || parsed.inspectorView === 'checklist' || parsed.inspectorView === 'recovery'
          ? parsed.inspectorView
          : defaults.inspectorView,
      inspectorCollapsedSections: {
        actions:
          typeof parsed.inspectorCollapsedSections?.actions === 'boolean'
            ? parsed.inspectorCollapsedSections.actions
            : defaults.inspectorCollapsedSections.actions,
        checklist:
          typeof parsed.inspectorCollapsedSections?.checklist === 'boolean'
            ? parsed.inspectorCollapsedSections.checklist
            : defaults.inspectorCollapsedSections.checklist,
        recovery:
          typeof parsed.inspectorCollapsedSections?.recovery === 'boolean'
            ? parsed.inspectorCollapsedSections.recovery
            : defaults.inspectorCollapsedSections.recovery,
      },
      stepDockCollapsed: typeof parsed.stepDockCollapsed === 'boolean' ? parsed.stepDockCollapsed : defaults.stepDockCollapsed,
    };
  } catch {
    return defaults;
  }
}

function saveLabWorkbenchLayout(layout: LabWorkbenchLayout) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(LAB_WORKBENCH_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // ignore storage failures
  }
}

function sortByUpdatedAt<T extends { updatedAt: string }>(records: T[]) {
  return [...records].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function getPreferredExperimentId(index: ExperimentIndexItem[]) {
  return (index.find((item) => item.id === DEFAULT_EXPERIMENT_ID) ?? index[0])?.id ?? '';
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

function ShellLoadingPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <article className="panel empty-panel loading-panel">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </article>
  );
}

function App() {
  const initialLabWorkbenchLayout = useMemo(() => loadLabWorkbenchLayout(), []);
  const initialExperimentIndex = useMemo(() => peekExperimentIndex(), []);
  const [activeView, setActiveView] = useState<'student' | 'teacher'>('student');
  const [activeShellSection, setActiveShellSection] = useState<AppShellSection>('workspace');
  const [labStudioMode, setLabStudioMode] = useState<LabStudioMode>(initialLabWorkbenchLayout.studioMode);
  const [experiments, setExperiments] = useState<ExperimentIndexItem[]>(initialExperimentIndex);
  const [selectedExperiment, setSelectedExperiment] = useState<ExperimentConfig | null>(null);
  const [selectedId, setSelectedId] = useState<string>(() => getPreferredExperimentId(initialExperimentIndex));
  const [isSelectedExperimentLoading, setIsSelectedExperimentLoading] = useState(false);
  const [isSelectedExperimentRefreshing, setIsSelectedExperimentRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [platformIssue, setPlatformIssue] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [school, setSchool] = useState<SchoolSummary | null>(null);
  const [classrooms, setClassrooms] = useState<DemoClassroom[]>([]);
  const [students, setStudents] = useState<DemoStudent[]>([]);
  const [labAttempts, setLabAttempts] = useState<LabAttemptRecord[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignmentRecord[]>([]);
  const [currentStudentId, setCurrentStudentId] = useState<string>('');
  const [isLabRibbonCollapsed, setIsLabRibbonCollapsed] = useState(initialLabWorkbenchLayout.ribbonCollapsed);
  const [isLabWorkbenchFullscreen, setIsLabWorkbenchFullscreen] = useState(false);
  const [isLabLeftRailVisible, setIsLabLeftRailVisible] = useState(initialLabWorkbenchLayout.leftRailVisible);
  const [isLabRightRailVisible, setIsLabRightRailVisible] = useState(initialLabWorkbenchLayout.rightRailVisible);
  const [labInspectorView, setLabInspectorView] = useState<LabInspectorView>(initialLabWorkbenchLayout.inspectorView);
  const [labWorkbenchPreset, setLabWorkbenchPreset] = useState<LabWorkbenchPreset>(initialLabWorkbenchLayout.preset);
  const [labInspectorCollapsedSections, setLabInspectorCollapsedSections] = useState<Record<LabInspectorSection, boolean>>({
    ...initialLabWorkbenchLayout.inspectorCollapsedSections,
  });
  const [labPeekSide, setLabPeekSide] = useState<'left' | 'right' | null>(null);
  const [labFullscreenUtilityView, setLabFullscreenUtilityView] = useState<LabFullscreenUtilityView>(null);
  const [isLabFullscreenUtilityCollapsed, setIsLabFullscreenUtilityCollapsed] = useState(false);
  const [labFullscreenStepSection, setLabFullscreenStepSection] = useState<LabFullscreenStepSection>('focus');
  const [isLabStepDockCollapsed, setIsLabStepDockCollapsed] = useState(initialLabWorkbenchLayout.stepDockCollapsed);
  const [focusedWorkbenchStepId, setFocusedWorkbenchStepId] = useState<string>('');
  const [selectedExperimentRuntimeSnapshot, setSelectedExperimentRuntimeSnapshot] = useState<SimulationRuntimeSnapshot | null>(null);
  const [hasBootstrapIssue, setHasBootstrapIssue] = useState(false);
  const labWorkbenchRef = useRef<HTMLDivElement | null>(null);
  const fullscreenLayoutRestoreRef = useRef<LabWorkbenchLayout | null>(null);
  const lastLabFullscreenUtilityViewRef = useRef<Exclude<LabFullscreenUtilityView, null>>(
    initialLabWorkbenchLayout.studioMode === 'guide' ? 'copilot' : 'steps',
  );
  const selectedExperimentRequestRef = useRef(0);

  const bootstrapAppShell = useCallback(async () => {
    try {
      setLoading(true);
      setHasBootstrapIssue(false);
      const cachedIndex = peekExperimentIndex();
      const hasCachedIndex = cachedIndex.length > 0;

      if (hasCachedIndex) {
        setExperiments(cachedIndex);
        setSelectedId((current) => {
          if (current && cachedIndex.some((item) => item.id === current)) {
            return current;
          }
          return getPreferredExperimentId(cachedIndex);
        });
      }

      const indexPromise = hasCachedIndex
        ? (isExperimentIndexStale() ? revalidateExperimentIndex() : Promise.resolve(cachedIndex))
        : loadExperimentIndex();
      const [indexResult, platformResult] = await Promise.allSettled([indexPromise, loadPlatformBootstrap()]);
      let nextBootstrapIssue = false;

      if (indexResult.status === 'fulfilled') {
        const index = indexResult.value;
        setExperiments(index);
        setErrorMessage('');
        setSelectedId((current) => {
          if (current && index.some((item) => item.id === current)) {
            return current;
          }
          return getPreferredExperimentId(index);
        });
      } else {
        nextBootstrapIssue = true;
        const fallbackMessage = indexResult.reason instanceof Error ? indexResult.reason.message : '加载实验索引失败';
        setErrorMessage(hasCachedIndex ? `${fallbackMessage}，已显示缓存目录` : fallbackMessage);
      }

      if (platformResult.status === 'fulfilled') {
        const platform = platformResult.value;
        setSchool(platform.school);
        setClassrooms(platform.classrooms);
        setStudents(platform.students);
        setAssignments(sortByUpdatedAt(platform.assignments));
        setLabAttempts(sortByUpdatedAt(platform.attempts));
        setPlatformIssue('');
        setCurrentStudentId((current) => {
          if (current && platform.students.some((student) => student.id === current)) {
            return current;
          }
          return platform.currentStudentId || platform.students[0]?.id || '';
        });
      } else {
        nextBootstrapIssue = true;
        setPlatformIssue(platformResult.reason instanceof Error ? platformResult.reason.message : '加载平台信息失败');
      }

      setHasBootstrapIssue(nextBootstrapIssue);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void bootstrapAppShell();
  }, [bootstrapAppShell]);

  useEffect(() => {
    async function hydrateSelectedExperiment() {
      if (!selectedId) {
        selectedExperimentRequestRef.current += 1;
        setIsSelectedExperimentLoading(false);
        setIsSelectedExperimentRefreshing(false);
        startTransition(() => {
          setSelectedExperiment(null);
        });
        return;
      }

      const match = experiments.find((item) => item.id === selectedId);
      if (!match) {
        selectedExperimentRequestRef.current += 1;
        setIsSelectedExperimentLoading(false);
        setIsSelectedExperimentRefreshing(false);
        startTransition(() => {
          setSelectedExperiment(null);
        });
        return;
      }

      const requestId = selectedExperimentRequestRef.current + 1;
      selectedExperimentRequestRef.current = requestId;
      const cachedConfig = peekExperimentConfig(match.id);
      setErrorMessage('');

      if (cachedConfig) {
        setIsSelectedExperimentLoading(false);
        startTransition(() => {
          setSelectedExperiment(cachedConfig);
        });

        if (!isExperimentConfigStale(match.id)) {
          setIsSelectedExperimentRefreshing(false);
          return;
        }

        setIsSelectedExperimentRefreshing(true);
        void revalidateExperimentConfig(match.id)
          .then((config) => {
            if (selectedExperimentRequestRef.current !== requestId) return;
            startTransition(() => {
              setSelectedExperiment(config);
            });
          })
          .catch(() => undefined)
          .finally(() => {
            if (selectedExperimentRequestRef.current === requestId) {
              setIsSelectedExperimentRefreshing(false);
            }
          });
        return;
      }

      try {
        setIsSelectedExperimentLoading(true);
        setIsSelectedExperimentRefreshing(false);
        if (activeShellSection === 'workspace') {
          startTransition(() => {
            setSelectedExperiment(null);
          });
        }

        const config = await loadExperimentConfig(match.id);
        if (selectedExperimentRequestRef.current !== requestId) return;

        startTransition(() => {
          setSelectedExperiment(config);
        });
        setErrorMessage('');
      } catch (error) {
        if (selectedExperimentRequestRef.current !== requestId) return;
        startTransition(() => {
          setSelectedExperiment((current) => (current?.id === selectedId ? current : null));
        });
        setErrorMessage(error instanceof Error ? error.message : '加载实验配置失败');
      } finally {
        if (selectedExperimentRequestRef.current === requestId) {
          setIsSelectedExperimentLoading(false);
        }
      }
    }

    void hydrateSelectedExperiment();
  }, [activeShellSection, experiments, selectedId]);

  const currentStudent = useMemo(() => getStudentById(students, currentStudentId) ?? students[0] ?? null, [currentStudentId, students]);
  const selectedExperimentIndex = useMemo(() => experiments.find((experiment) => experiment.id === selectedId) ?? null, [experiments, selectedId]);
  const playableExperimentIds = useMemo(() => experiments.filter((experiment) => experiment.productStatus !== '规划中').map((experiment) => experiment.id), [experiments]);

  const handleTelemetry = useCallback((event: LabTelemetryInput) => {
    const nextEvent = currentStudent
      ? {
          ...event,
          studentId: currentStudent.id,
          studentName: currentStudent.name,
          classId: currentStudent.classId,
          className: currentStudent.className,
        }
      : event;

    void recordTelemetryEvent(nextEvent)
      .then((records) => {
        setLabAttempts(sortByUpdatedAt(records));
        setPlatformIssue('');
      })
      .catch((error) => {
        setPlatformIssue(error instanceof Error ? error.message : '同步实验记录失败');
      });
  }, [currentStudent]);

  const handleSimulationRuntimeChange = useCallback((snapshot: SimulationRuntimeSnapshot | null) => {
    setSelectedExperimentRuntimeSnapshot(snapshot);
  }, []);

  const handleClearLabAttempts = useCallback(() => {
    void clearAttemptRecords()
      .then(() => {
        setLabAttempts([]);
        setPlatformIssue('');
      })
      .catch((error) => {
        setPlatformIssue(error instanceof Error ? error.message : '清空实验记录失败');
      });
  }, []);

  const handleCreateAssignment = useCallback(async (draft: TeacherAssignmentDraft) => {
    const record = await createAssignment(draft);
    setAssignments((current) => sortByUpdatedAt([record, ...current.filter((item) => item.assignmentId !== record.assignmentId)]));
    setPlatformIssue('');
    return record;
  }, []);

  const handleSelectStudent = useCallback((studentId: string) => {
    setCurrentStudentId(studentId);
    void updateCurrentStudentSelection(studentId)
      .then(() => {
        setPlatformIssue('');
      })
      .catch((error) => {
        setPlatformIssue(error instanceof Error ? error.message : '切换学生身份失败');
      });
  }, []);

  const handleChangeView = useCallback((view: 'student' | 'teacher') => {
    if (view === 'teacher') {
      void preloadTeacherOverview().catch(() => undefined);
    }
    setActiveView(view);
    setActiveShellSection('workspace');
  }, []);

  const handleRetryBootstrap = useCallback(() => {
    void bootstrapAppShell();
  }, [bootstrapAppShell]);

  const warmExperimentSelection = useCallback((experimentId: string) => {
    const match = experiments.find((experiment) => experiment.id === experimentId);
    if (!match) return;

    void preloadExperimentConfig(experimentId).catch(() => undefined);
    void preloadExperimentSpecsShell().catch(() => undefined);
    void preloadExperimentLaunchpad().catch(() => undefined);
    void preloadExperimentPlayerById(experimentId, match.productStatus !== '规划中').catch(() => undefined);
  }, [experiments]);

  const handlePreviewExperiment = useCallback((experimentId: string) => {
    scheduleIdleTask(() => {
      void preloadExperimentConfig(experimentId).catch(() => undefined);
    }, 700);
  }, []);

  const handleChangeSection = useCallback((section: AppShellSection) => {
    if (section === 'studio') {
      void preloadStudioShell().catch(() => undefined);
      if (selectedId) {
        warmExperimentSelection(selectedId);
      }
    }

    if (section === 'specs') {
      void preloadExperimentSpecsShell().catch(() => undefined);
      if (selectedId) {
        void preloadExperimentConfig(selectedId).catch(() => undefined);
      }
    }

    setActiveShellSection(section);
  }, [selectedId, warmExperimentSelection]);

  const handleOpenStudio = useCallback(() => {
    if (!selectedId) return;
    void preloadStudioShell().catch(() => undefined);
    warmExperimentSelection(selectedId);
    setActiveShellSection('studio');
  }, [selectedId, warmExperimentSelection]);

  const handleOpenSpecs = useCallback(() => {
    void preloadExperimentSpecsShell().catch(() => undefined);
    if (selectedId) {
      void preloadExperimentConfig(selectedId).catch(() => undefined);
    }
    setActiveShellSection('specs');
  }, [selectedId]);

  const handleToggleLabRibbon = useCallback(() => {
    setLabWorkbenchPreset('custom');
    setIsLabRibbonCollapsed((current) => !current);
  }, []);

  const captureLabWorkbenchLayout = useCallback(
    (): LabWorkbenchLayout => ({
      studioMode: labStudioMode,
      preset: labWorkbenchPreset,
      ribbonCollapsed: isLabRibbonCollapsed,
      leftRailVisible: isLabLeftRailVisible,
      rightRailVisible: isLabRightRailVisible,
      inspectorView: labInspectorView,
      inspectorCollapsedSections: { ...labInspectorCollapsedSections },
      stepDockCollapsed: isLabStepDockCollapsed,
    }),
    [
      isLabLeftRailVisible,
      isLabRibbonCollapsed,
      isLabRightRailVisible,
      isLabStepDockCollapsed,
      labInspectorCollapsedSections,
      labInspectorView,
      labStudioMode,
      labWorkbenchPreset,
    ],
  );

  const applyLabWorkbenchLayout = useCallback((layout: LabWorkbenchLayout) => {
    setLabStudioMode(layout.studioMode);
    setLabWorkbenchPreset(layout.preset);
    setIsLabRibbonCollapsed(layout.ribbonCollapsed);
    setIsLabLeftRailVisible(layout.leftRailVisible);
    setIsLabRightRailVisible(layout.rightRailVisible);
    setLabInspectorView(layout.inspectorView);
    setLabInspectorCollapsedSections({ ...layout.inspectorCollapsedSections });
    setIsLabStepDockCollapsed(layout.stepDockCollapsed);
    setLabPeekSide(null);
  }, []);

  const handleToggleLabFullscreen = useCallback(async () => {
    const workbenchNode = labWorkbenchRef.current;
    if (!workbenchNode) return;

    if (document.fullscreenElement === workbenchNode) {
      await document.exitFullscreen();
      return;
    }

    fullscreenLayoutRestoreRef.current = captureLabWorkbenchLayout();
    setLabFullscreenUtilityView(null);
    setIsLabFullscreenUtilityCollapsed(false);
    applyLabWorkbenchLayout({
      ...fullscreenLayoutRestoreRef.current,
      preset: 'focus',
      ribbonCollapsed: true,
      leftRailVisible: false,
      rightRailVisible: false,
      stepDockCollapsed: true,
    });

    try {
      await workbenchNode.requestFullscreen();
    } catch (error) {
      if (fullscreenLayoutRestoreRef.current) {
        applyLabWorkbenchLayout(fullscreenLayoutRestoreRef.current);
        fullscreenLayoutRestoreRef.current = null;
      }
      throw error;
    }
  }, [applyLabWorkbenchLayout, captureLabWorkbenchLayout]);

  const handleApplyLabStudioMode = useCallback((mode: LabStudioMode) => {
    setLabWorkbenchPreset('custom');
    setLabStudioMode(mode);
    setLabInspectorView(mode === 'operation' ? 'actions' : mode === 'record' ? 'checklist' : 'recovery');
    setLabInspectorCollapsedSections({ actions: false, checklist: false, recovery: false });
    setLabPeekSide(null);
    setIsLabRibbonCollapsed(true);
    setIsLabStepDockCollapsed(true);
  }, []);

  const handleToggleFullscreenUtility = useCallback((view: Exclude<LabFullscreenUtilityView, null>) => {
    setLabFullscreenUtilityView((current) => {
      const nextView = current === view ? null : view;

      if (nextView === 'steps') {
        setLabFullscreenStepSection('focus');
      }

      if (nextView) {
        lastLabFullscreenUtilityViewRef.current = nextView;
      }

      setIsLabFullscreenUtilityCollapsed(false);

      return nextView;
    });
  }, []);

  const handleSelectFullscreenUtility = useCallback((view: Exclude<LabFullscreenUtilityView, null>) => {
    setLabFullscreenUtilityView(view);
    setIsLabFullscreenUtilityCollapsed(false);
    lastLabFullscreenUtilityViewRef.current = view;

    if (view === 'steps') {
      setLabFullscreenStepSection((current) => current ?? 'focus');
    }
  }, []);

  const handleOpenFullscreenUtility = useCallback(() => {
    handleSelectFullscreenUtility(lastLabFullscreenUtilityViewRef.current);
  }, [handleSelectFullscreenUtility]);

  const handleCloseFullscreenUtility = useCallback(() => {
    setLabFullscreenUtilityView(null);
    setIsLabFullscreenUtilityCollapsed(false);
  }, []);

  const handleToggleFullscreenUtilityCollapsed = useCallback(() => {
    if (!labFullscreenUtilityView) return;
    setIsLabFullscreenUtilityCollapsed((current) => !current);
  }, [labFullscreenUtilityView]);

  const handleToggleFullscreenStepSection = useCallback((section: Exclude<LabFullscreenStepSection, null>) => {
    setLabFullscreenStepSection((current) => (current === section ? null : section));
  }, []);

  const handleToggleLeftRail = useCallback(() => {
    setLabWorkbenchPreset('custom');
    setLabPeekSide(null);
    setIsLabLeftRailVisible((current) => !current);
  }, []);

  const handleToggleRightRail = useCallback(() => {
    setLabWorkbenchPreset('custom');
    setLabPeekSide(null);
    setIsLabRightRailVisible((current) => !current);
  }, []);

  const handlePreviewLeftRail = useCallback(() => {
    if (!isLabLeftRailVisible) {
      setLabPeekSide('left');
    }
  }, [isLabLeftRailVisible]);

  const handlePreviewRightRail = useCallback(() => {
    if (!isLabRightRailVisible) {
      setLabPeekSide('right');
    }
  }, [isLabRightRailVisible]);

  const handleClearRailPreview = useCallback(() => {
    setLabPeekSide(null);
  }, []);

  const handleSelectLabInspectorView = useCallback((view: LabInspectorView) => {
    setLabWorkbenchPreset('custom');
    if (view !== 'all') {
      setLabInspectorCollapsedSections((current) => ({ ...current, [view]: false }));
    }
    setLabInspectorView(view);
  }, []);

  const handleToggleLabInspectorSection = useCallback((section: LabInspectorSection) => {
    setLabWorkbenchPreset('custom');

    if (labInspectorView !== 'all') {
      setLabInspectorView(section);
      setLabInspectorCollapsedSections((current) => ({ ...current, [section]: false }));
      return;
    }

    setLabInspectorCollapsedSections((current) => ({ ...current, [section]: !current[section] }));
  }, [labInspectorView]);

  const handleRestoreLabWorkbenchLayout = useCallback(() => {
    applyLabWorkbenchLayout(createDefaultLabWorkbenchLayout());
  }, [applyLabWorkbenchLayout]);

  const handleToggleLabStepDock = useCallback(() => {
    setLabWorkbenchPreset('custom');
    setIsLabStepDockCollapsed((current) => !current);
  }, []);

  const handleApplyLabWorkbenchPreset = useCallback((preset: Exclude<LabWorkbenchPreset, 'custom'>) => {
    setLabWorkbenchPreset(preset);
    setLabPeekSide(null);
    setLabInspectorCollapsedSections({ actions: false, checklist: false, recovery: false });

    if (preset === 'focus') {
      setIsLabRibbonCollapsed(true);
      setIsLabLeftRailVisible(false);
      setIsLabRightRailVisible(false);
      setIsLabStepDockCollapsed(true);
      return;
    }

    if (preset === 'balanced') {
      setIsLabRibbonCollapsed(true);
      setIsLabLeftRailVisible(false);
      setIsLabRightRailVisible(false);
      setLabInspectorView(labStudioMode === 'operation' ? 'actions' : labStudioMode === 'record' ? 'checklist' : 'recovery');
      setIsLabStepDockCollapsed(true);
      return;
    }

    setIsLabRibbonCollapsed(true);
    setIsLabLeftRailVisible(false);
    setIsLabRightRailVisible(false);
    setLabInspectorView('all');
    setIsLabStepDockCollapsed(true);
  }, [labStudioMode]);

  const handleFocusWorkbenchStep = useCallback((stepId: string) => {
    setFocusedWorkbenchStepId(stepId);
  }, []);

  useEffect(() => {
    if ((activeView === 'teacher' || !selectedId) && activeShellSection === 'studio') {
      setActiveShellSection('workspace');
    }
  }, [activeShellSection, activeView, selectedId]);

  useEffect(() => {
    setLabPeekSide(null);
    setLabFullscreenUtilityView(null);
    setIsLabFullscreenUtilityCollapsed(false);
  }, [selectedId]);

  useEffect(() => {
    if (activeView !== 'student' || !selectedId) return;

    const cancel = scheduleIdleTask(() => {
      warmExperimentSelection(selectedId);
    }, 420);

    return cancel;
  }, [activeView, selectedId, warmExperimentSelection]);

  useEffect(() => {
    if (loading) return;

    const cancel = scheduleIdleTask(() => {
      void preloadTeacherOverview().catch(() => undefined);
    }, 1200);

    return cancel;
  }, [loading]);

  useEffect(() => {
    if (loading) return;

    const cancel = scheduleIdleTask(() => {
      void preloadAiCopilotPanel().catch(() => undefined);
    }, 1600);

    return cancel;
  }, [loading]);

  useEffect(() => {
    if (isLabWorkbenchFullscreen || fullscreenLayoutRestoreRef.current) return;

    saveLabWorkbenchLayout({
      studioMode: labStudioMode,
      preset: labWorkbenchPreset,
      ribbonCollapsed: isLabRibbonCollapsed,
      leftRailVisible: isLabLeftRailVisible,
      rightRailVisible: isLabRightRailVisible,
      inspectorView: labInspectorView,
      inspectorCollapsedSections: labInspectorCollapsedSections,
      stepDockCollapsed: isLabStepDockCollapsed,
    });
  }, [
    isLabLeftRailVisible,
    isLabRibbonCollapsed,
    isLabRightRailVisible,
    isLabStepDockCollapsed,
    isLabWorkbenchFullscreen,
    labInspectorCollapsedSections,
    labInspectorView,
    labStudioMode,
    labWorkbenchPreset,
  ]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreen = document.fullscreenElement === labWorkbenchRef.current;
      setIsLabWorkbenchFullscreen(isFullscreen);

      if (isFullscreen) {
        setLabFullscreenUtilityView(null);
        setIsLabFullscreenUtilityCollapsed(false);
        return;
      }

      if (fullscreenLayoutRestoreRef.current) {
        applyLabWorkbenchLayout(fullscreenLayoutRestoreRef.current);
        fullscreenLayoutRestoreRef.current = null;
      }

      setLabFullscreenUtilityView(null);
      setIsLabFullscreenUtilityCollapsed(false);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [applyLabWorkbenchLayout]);

  useEffect(() => {
    if ((activeView !== 'student' || activeShellSection !== 'studio') && document.fullscreenElement === labWorkbenchRef.current) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, [activeShellSection, activeView]);

  useEffect(() => {
    if (activeView !== 'student' || activeShellSection !== 'studio') return;

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) return;

      if (event.key === '1') {
        event.preventDefault();
        handleApplyLabStudioMode('operation');
        return;
      }

      if (event.key === '2') {
        event.preventDefault();
        handleApplyLabStudioMode('record');
        return;
      }

      if (event.key === '3') {
        event.preventDefault();
        handleApplyLabStudioMode('guide');
        return;
      }

      const lowerKey = event.key.toLowerCase();
      if (lowerKey === 'h') {
        event.preventDefault();
        setLabWorkbenchPreset('custom');
        setIsLabRibbonCollapsed((current) => !current);
        return;
      }

      if (lowerKey === 'f') {
        event.preventDefault();
        void handleToggleLabFullscreen();
        return;
      }

      if (lowerKey === 'l') {
        event.preventDefault();
        setLabWorkbenchPreset('custom');
        setIsLabLeftRailVisible((current) => !current);
        return;
      }

      if (lowerKey === 'r') {
        event.preventDefault();
        setLabWorkbenchPreset('custom');
        setIsLabRightRailVisible((current) => !current);
        return;
      }

      if (lowerKey === 'j') {
        event.preventDefault();
        if (document.fullscreenElement === labWorkbenchRef.current) {
          handleToggleFullscreenUtility('steps');
          return;
        }

        setLabWorkbenchPreset('custom');
        setIsLabStepDockCollapsed((current) => !current);
        return;
      }

      if (lowerKey === 'c' && document.fullscreenElement === labWorkbenchRef.current) {
        event.preventDefault();
        handleToggleFullscreenUtility('copilot');
        return;
      }

      if (event.key === 'Escape' && document.fullscreenElement === labWorkbenchRef.current) {
        event.preventDefault();
        void document.exitFullscreen().catch(() => undefined);
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [activeShellSection, activeView, handleApplyLabStudioMode, handleToggleFullscreenUtility, handleToggleLabFullscreen]);

  const SelectedExperimentPlayer = useMemo(() => getExperimentPlayer(selectedExperiment), [selectedExperiment]);
  const hasSelectedDedicatedPlayer = selectedExperiment ? hasDedicatedExperimentPlayer(selectedExperiment.id) : false;
  const productReadyCount = useMemo(() => experiments.filter((experiment) => experiment.productStatus === '产品级').length, [experiments]);
  const canOpenStudio = activeView === 'student' && Boolean(selectedId);
  const selectedExperimentTitle = selectedExperimentIndex?.title ?? selectedExperiment?.title ?? '';
  const selectedExperimentStage = selectedExperimentIndex?.stage ?? selectedExperiment?.stage ?? '';
  const selectedExperimentSubject = selectedExperimentIndex?.subject ?? selectedExperiment?.subject ?? '';
  const selectedExperimentGrade = selectedExperimentIndex?.grade ?? selectedExperiment?.grade ?? '';
  const selectedExperimentStatus = selectedExperiment?.productization.status ?? selectedExperimentIndex?.productStatus ?? '';
  const selectedExperimentTheme = selectedExperiment?.curriculum.theme ?? selectedExperimentIndex?.curriculumTheme ?? '';
  const selectedExperimentDurationMinutes = selectedExperiment?.durationMinutes ?? selectedExperimentIndex?.durationMinutes ?? 0;
  const selectedExperimentInteractionMode = selectedExperiment?.productization.interactionMode ?? selectedExperimentIndex?.interactionMode ?? '';
  const isDisplayedExperimentStale = Boolean(selectedExperiment && selectedExperiment.id !== selectedId);
  const isSelectedExperimentBackgroundRefreshing = isSelectedExperimentRefreshing && !isSelectedExperimentLoading;

  const shellStatus = useMemo(() => {
    if (loading) return '正在加载实验配置...';
    if (isSelectedExperimentLoading && selectedExperimentTitle) return `正在切换实验：${selectedExperimentTitle}`;
    if (errorMessage) return errorMessage;
    if (platformIssue) return platformIssue;
    if (isSelectedExperimentBackgroundRefreshing && selectedExperimentTitle) return `已命中缓存，正在后台更新：${selectedExperimentTitle}`;
    return `已加载 ${experiments.length} 个实验配置 · ${playableExperimentIds.length} 个可操作实验 · ${productReadyCount} 个产品级实验`;
  }, [
    errorMessage,
    experiments.length,
    isSelectedExperimentBackgroundRefreshing,
    isSelectedExperimentLoading,
    loading,
    platformIssue,
    playableExperimentIds.length,
    productReadyCount,
    selectedExperimentTitle,
  ]);

  const labStudioDescriptions: Record<LabStudioMode, string> = {
    operation: '放大实验台，优先完成当前动作。',
    record: '聚焦状态、读数和过程留痕。',
    guide: '只保留舞台和顶部提示，避免遮挡台面。',
  };

  const labGuideHighlights = selectedExperiment
    ? selectedExperiment.steps.slice(0, 3).map((step) => ({
        id: step.id,
        title: step.title,
        hint: step.failureHints[0] ?? step.successCondition,
      }))
    : [];

  const labShortcutHints = useMemo(
    () => [
      { key: '1', label: '操作' },
      { key: '2', label: '记录' },
      { key: '3', label: '提示' },
      { key: 'H', label: isLabRibbonCollapsed ? '展开顶栏' : '收起顶栏' },
      { key: 'L', label: isLabLeftRailVisible ? '左栏开' : '左栏关' },
      { key: 'R', label: isLabRightRailVisible ? '右栏开' : '右栏关' },
      { key: 'J', label: isLabStepDockCollapsed ? '展开步骤栏' : '收起步骤栏' },
      { key: 'F', label: isLabWorkbenchFullscreen ? '退出全屏' : '实验台全屏' },
    ],
    [isLabLeftRailVisible, isLabRibbonCollapsed, isLabRightRailVisible, isLabStepDockCollapsed, isLabWorkbenchFullscreen],
  );

  const activeWorkbenchAttempt = useMemo(
    () =>
      selectedExperiment
        ? labAttempts.find(
            (attempt) =>
              attempt.experimentId === selectedExperiment.id &&
              (attempt.studentId ?? '') === (currentStudent?.id ?? '') &&
              (attempt.classId ?? '') === (currentStudent?.classId ?? ''),
          ) ?? null
        : null,
    [currentStudent?.classId, currentStudent?.id, labAttempts, selectedExperiment],
  );

  const workbenchCurrentStep = activeWorkbenchAttempt?.currentStep ?? 1;
  const workbenchTotalSteps = selectedExperiment?.steps.length ?? 0;
  const workbenchLatestPrompt = activeWorkbenchAttempt?.latestPrompt ?? selectedExperiment?.steps[0]?.description ?? '进入实验后，这里会同步显示步骤推进。';
  const workbenchScore = activeWorkbenchAttempt?.score ?? 0;
  const workbenchErrors = activeWorkbenchAttempt?.errorCount ?? 0;
  const workbenchProgressPercent = workbenchTotalSteps ? Math.round((Math.min(workbenchCurrentStep, workbenchTotalSteps) / workbenchTotalSteps) * 100) : 0;

  const workbenchStepTrack = useMemo(
    () =>
      selectedExperiment
        ? selectedExperiment.steps.map((step, index) => ({
            id: step.id,
            order: index + 1,
            lens: getFocusedExperimentMultiscaleView(selectedExperiment, { step, focusTargetObject: step.targetObject }).focusedLens,
            title: step.title,
            successCondition: step.successCondition,
            helperText: step.description ?? step.successCondition,
            failureHint: step.failureHints[0] ?? '点击查看步骤要求',
            state:
              activeWorkbenchAttempt?.status === 'completed' || workbenchCurrentStep > index + 1
                ? 'done'
                : workbenchCurrentStep === index + 1
                  ? 'active'
                  : 'pending',
          }))
        : [],
    [activeWorkbenchAttempt?.status, selectedExperiment, workbenchCurrentStep],
  );

  const labInspectorMeta: Record<LabInspectorView, { title: string; description: string }> = {
    all: { title: '总览', description: '把操作、要求和纠错一起收进右侧属性栏。' },
    actions: { title: '操作', description: '只保留当前动作和控制入口，减少视线干扰。' },
    checklist: { title: '要求', description: '突出步骤要求、能力点和完成条件。' },
    recovery: { title: '纠错', description: '集中显示风险提醒、常见失误和恢复建议。' },
  };

  const activeInspectorMeta = labInspectorMeta[labInspectorView];

  const currentWorkbenchStepConfig = useMemo(() => {
    if (!selectedExperiment?.steps.length) return null;
    const currentStepIndex = Math.min(Math.max(workbenchCurrentStep, 1), selectedExperiment.steps.length) - 1;
    return selectedExperiment.steps[currentStepIndex] ?? null;
  }, [selectedExperiment, workbenchCurrentStep]);

  const focusedWorkbenchStep = useMemo(() => {
    if (!selectedExperiment?.steps.length) return null;
    return selectedExperiment.steps.find((step) => step.id === focusedWorkbenchStepId) ?? currentWorkbenchStepConfig ?? selectedExperiment.steps[0] ?? null;
  }, [currentWorkbenchStepConfig, focusedWorkbenchStepId, selectedExperiment]);
  const selectedMultiscale = useMemo(() => (selectedExperiment ? getExperimentMultiscaleView(selectedExperiment) : null), [selectedExperiment]);
  const focusedWorkbenchMultiscale = useMemo(() => {
    if (!selectedExperiment || !selectedMultiscale) return null;

    return {
      ...getFocusedExperimentMultiscaleView(selectedExperiment, {
        step: focusedWorkbenchStep,
        focusTargetObject: focusedWorkbenchStep?.targetObject ?? currentWorkbenchStepConfig?.targetObject,
      }),
      sourceLabel: MULTISCALE_SOURCE_LABELS[selectedMultiscale.source],
    };
  }, [currentWorkbenchStepConfig?.targetObject, focusedWorkbenchStep, selectedExperiment, selectedMultiscale]);

  const focusedWorkbenchTrack = workbenchStepTrack.find((step) => step.id === focusedWorkbenchStep?.id) ?? null;
  const focusedWorkbenchState = focusedWorkbenchTrack?.state ?? 'pending';
  const focusedWorkbenchOrder = focusedWorkbenchStep?.order ?? currentWorkbenchStepConfig?.order ?? 1;
  const focusedWorkbenchPrompt = focusedWorkbenchStep?.description ?? workbenchLatestPrompt;
  const focusedWorkbenchSuccess = focusedWorkbenchStep?.successCondition ?? '进入实验后会同步显示当前成功条件。';
  const focusedWorkbenchRecovery = focusedWorkbenchStep?.failureHints[0] ?? '当前暂无纠错提醒。';
  const focusedWorkbenchCapabilities = focusedWorkbenchStep?.requiredCapabilities?.join(' / ') ?? '通用实验交互';
  const isFocusedWorkbenchStepCurrent = currentWorkbenchStepConfig?.id === focusedWorkbenchStep?.id;

  const labInspectorOptions: { label: string; value: LabInspectorView }[] = [
    { label: '总览', value: 'all' },
    { label: '操作', value: 'actions' },
    { label: '要求', value: 'checklist' },
    { label: '纠错', value: 'recovery' },
  ];

  const labInspectorSectionOptions: { label: string; value: LabInspectorSection; summary: string }[] = [
    { label: '操作卡', value: 'actions', summary: '动作与控制入口' },
    { label: '要求卡', value: 'checklist', summary: '目标与能力要求' },
    { label: '纠错卡', value: 'recovery', summary: '风险与恢复建议' },
  ];

  const labInspectorOpenCount = labInspectorSectionOptions.filter((option) => !labInspectorCollapsedSections[option.value]).length;
  const labInspectorSummaryLabel = labInspectorView === 'all' ? `${labInspectorOpenCount}/3 分组展开` : `${activeInspectorMeta.title}聚焦`;
  const labInspectorSummaryText =
    labInspectorView === 'all'
      ? labInspectorOpenCount === labInspectorSectionOptions.length
        ? '所有主属性分组都保持可见。'
        : `已收起 ${labInspectorSectionOptions.length - labInspectorOpenCount} 个主分组，舞台留白更多。`
      : activeInspectorMeta.description;

  const labWorkbenchPresetOptions: { label: string; value: Exclude<LabWorkbenchPreset, 'custom'>; description: string }[] = [
    { label: '专注', value: 'focus', description: '只保留舞台和最小控制' },
    { label: '标准', value: 'balanced', description: '舞台净空，文字移到边栏与底栏' },
    { label: '复盘', value: 'review', description: '保留复盘能力，默认仍保持净空' },
  ];

  const labWorkbenchPresetLabel: Record<LabWorkbenchPreset, string> = {
    focus: '专注',
    balanced: '标准',
    review: '复盘',
    custom: '自定义',
  };

  const labWorkbenchModeLabel = labStudioMode === 'operation' ? '操作' : labStudioMode === 'record' ? '记录' : '提示';
  const labWorkbenchWindowLabel = isLabWorkbenchFullscreen ? '全屏' : '窗口';
  const labWorkbenchSessionLabel = activeWorkbenchAttempt?.status === 'completed' ? '已完成' : activeWorkbenchAttempt ? '进行中' : '待开始';
  const labLastActivityLabel = activeWorkbenchAttempt?.updatedAt
    ? new Date(activeWorkbenchAttempt.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : '未开始';
  const defaultWorkbenchLens = selectedMultiscale?.defaultLens ?? 'macro';
  const focusedWorkbenchLens = focusedWorkbenchMultiscale?.focusedLens ?? defaultWorkbenchLens;
  const defaultWorkbenchLensLabel = MULTISCALE_LENS_LABELS[defaultWorkbenchLens];
  const focusedWorkbenchLensLabel = MULTISCALE_LENS_LABELS[focusedWorkbenchLens];
  const selectedMultiscaleSourceLabel = selectedMultiscale ? MULTISCALE_SOURCE_LABELS[selectedMultiscale.source] : '';
  const selectedExperimentSimulationSnapshot = useMemo(
    () =>
      selectedExperiment
        ? createSimulationGroundingSnapshot(selectedExperiment, {
            hasDedicatedPlayer: hasSelectedDedicatedPlayer,
            focusStep: focusedWorkbenchStep,
            focusTargetObject: focusedWorkbenchStep?.targetObject ?? currentWorkbenchStepConfig?.targetObject,
            focusedLens: focusedWorkbenchLens,
            progressPercent: workbenchProgressPercent,
            score: workbenchScore,
            errors: workbenchErrors,
            latestPrompt: workbenchLatestPrompt,
            runtimeSnapshot: selectedExperimentRuntimeSnapshot,
          })
        : null,
    [
      currentWorkbenchStepConfig?.targetObject,
      focusedWorkbenchLens,
      focusedWorkbenchStep,
      hasSelectedDedicatedPlayer,
      selectedExperiment,
      selectedExperimentRuntimeSnapshot,
      workbenchErrors,
      workbenchLatestPrompt,
      workbenchProgressPercent,
      workbenchScore,
    ],
  );

  const labStatusBarItems = selectedExperiment && selectedMultiscale
    ? [
        { label: '状态', value: labWorkbenchSessionLabel },
        { label: '模式', value: labWorkbenchModeLabel },
        { label: '镜头', value: `默认${defaultWorkbenchLensLabel} · 焦点${focusedWorkbenchLensLabel}`, tone: focusedWorkbenchLens },
        {
          label: '焦点',
          value: focusedWorkbenchMultiscale
            ? `${focusedWorkbenchMultiscale.focusEquipmentLabel} · ${focusedWorkbenchMultiscale.componentSummary}`
            : `${selectedExperiment.equipment.length} 项器材`,
        },
        { label: '材料', value: focusedWorkbenchMultiscale?.materialSummary ?? `${selectedMultiscale.stats.materialCount} 类材料` },
        { label: '规则', value: focusedWorkbenchMultiscale?.ruleSummary ?? `${selectedMultiscale.stats.reactionRuleCount} 条规则` },
        { label: '更新', value: labLastActivityLabel },
      ]
    : [];
  const labStepNotes = [
    { label: '成功条件', value: focusedWorkbenchSuccess },
    { label: '风险提醒', value: focusedWorkbenchRecovery },
    { label: '能力要求', value: focusedWorkbenchCapabilities },
    ...(focusedWorkbenchMultiscale
      ? [
          { label: '材料路径', value: focusedWorkbenchMultiscale.traceSummary, tone: focusedWorkbenchLens },
          { label: '粒子解释', value: focusedWorkbenchMultiscale.ruleNarrative, tone: focusedWorkbenchLens },
        ]
      : []),
  ];

  const shouldShowLeftRailPeek = false;
  const shouldShowRightRailPeek = false;
  const shouldShowRibbonContextStrip = Boolean(selectedExperiment) && !isLabRibbonCollapsed && labWorkbenchPreset === 'review';
  const shouldShowRibbonBody = !isLabRibbonCollapsed && labWorkbenchPreset === 'review';

  useEffect(() => {
    if (!selectedExperiment?.steps.length) {
      setFocusedWorkbenchStepId('');
      return;
    }

    setFocusedWorkbenchStepId((current) => {
      if (current && selectedExperiment.steps.some((step) => step.id === current)) {
        return current;
      }

      return currentWorkbenchStepConfig?.id ?? selectedExperiment.steps[0]?.id ?? '';
    });
  }, [currentWorkbenchStepConfig?.id, selectedExperiment]);

  useEffect(() => {
    setSelectedExperimentRuntimeSnapshot(null);
  }, [selectedExperiment?.id]);

  return (
    <div className="app-shell">
      <Topbar
        activeSection={activeShellSection}
        activeView={activeView}
        canOpenStudio={canOpenStudio}
        currentClassName={currentStudent?.className}
        currentStudentName={currentStudent?.name}
        experimentCount={experiments.length}
        onChangeSection={handleChangeSection}
        onChangeView={handleChangeView}
        playableCount={playableExperimentIds.length}
        productReadyCount={productReadyCount}
        selectedExperimentTitle={selectedExperimentTitle}
      />

      <main className="shell-width main-stack">
        <section className="status-bar shell-status-card">
          <div className="shell-status-grid">
            <div className="shell-status-copy">
              <strong>{shellStatus}</strong>
              <span className="shell-status-source">配置源 `Backend API /api/v1/experiments`</span>
            </div>

            <div className="status-pill-row shell-status-pills">
              <span className="status-pill ready">产品级 {productReadyCount}</span>
              <span className="status-pill">可操作 {playableExperimentIds.length}</span>
              <span className={activeView === 'student' ? 'status-pill ready' : 'status-pill'}>
                {activeView === 'student' ? `学生 ${currentStudent?.name ?? '未选择'}` : '教师端已启用'}
              </span>
              <span className="status-pill">层级 {activeShellSection === 'workspace' ? '工作台' : activeShellSection === 'studio' ? '实验室' : '实验说明'}</span>
              {activeShellSection === 'studio' ? <span className="status-pill">模式 {labStudioMode === 'operation' ? '操作' : labStudioMode === 'record' ? '记录' : '提示'}</span> : null}
              {activeShellSection === 'studio' ? <span className={isLabWorkbenchFullscreen ? 'status-pill ready' : 'status-pill'}>视图 {isLabWorkbenchFullscreen ? '全屏' : '窗口'}</span> : null}
              {activeShellSection === 'studio' ? <span className="status-pill">侧栏 {isLabLeftRailVisible ? '左开' : '左关'} · {isLabRightRailVisible ? '右开' : '右关'}</span> : null}
              {activeShellSection === 'studio' ? <span className="status-pill">Inspector {labInspectorView === 'all' ? '总览' : labInspectorView === 'actions' ? '操作' : labInspectorView === 'checklist' ? '要求' : '纠错'}</span> : null}
              {activeShellSection === 'studio' ? <span className="status-pill">预设 {labWorkbenchPresetLabel[labWorkbenchPreset]}</span> : null}
              {activeShellSection === 'studio' ? <span className={isLabStepDockCollapsed ? 'status-pill' : 'status-pill ready'}>步骤栏 {isLabStepDockCollapsed ? '收起' : '展开'}</span> : null}
              {selectedExperimentTitle ? <span className="status-pill">实验 {selectedExperimentTitle}</span> : null}
              {isSelectedExperimentLoading ? <span className="status-pill">配置切换中</span> : null}
              {isSelectedExperimentBackgroundRefreshing ? <span className="status-pill syncing">后台刷新中</span> : null}
              {hasBootstrapIssue ? (
                <button className="anchor-chip shell-status-retry" disabled={loading} onClick={handleRetryBootstrap} type="button">
                  {loading ? '重试中...' : '重试加载'}
                </button>
              ) : null}
            </div>
          </div>
        </section>

        {activeShellSection === 'workspace' ? (
          <section className="shell-section" id="workspace">
            <div className="shell-section-head">
              <div className="shell-section-copy">
                <span className="eyebrow">Workspace</span>
                <h2>{activeView === 'student' ? '学习工作台' : '教学工作台'}</h2>
                <p>{activeView === 'student' ? '先定身份与任务，再进入目录或实验室。' : '按总览、布置、进度等层级处理，减少长页堆叠。'}</p>
              </div>
              <div className="badge-row shell-section-badges">
                <span className="badge">{activeView === 'student' ? '学生体验流' : '教师管理流'}</span>
                <span className="badge">{experiments.length} 个实验</span>
                <span className="badge badge-status">{productReadyCount} 个产品级</span>
              </div>
            </div>

            {activeView === 'student' ? (
              <StudentOverview
                assignments={assignments}
                attempts={labAttempts}
                currentStudent={currentStudent}
                experiments={experiments}
                onOpenSpecs={handleOpenSpecs}
                onOpenStudio={handleOpenStudio}
                onPreviewExperiment={handlePreviewExperiment}
                onSelectExperiment={setSelectedId}
                onSelectStudent={handleSelectStudent}
                playableExperimentIds={playableExperimentIds}
                selectedExperimentId={selectedId}
                selectedExperiment={selectedExperiment}
                students={students}
              />
            ) : (
              <LazySectionBoundary
                description="教师工作台资源加载失败，请刷新后重试。"
                title="教师工作台加载失败"
              >
                <Suspense
                  fallback={
                    <ShellLoadingPanel
                      title="正在加载教师工作台"
                      description="班级进度、作业布置和统计摘要正在异步准备。"
                    />
                  }
                >
                  <TeacherOverview
                    assignments={assignments}
                    attempts={labAttempts}
                    classrooms={classrooms}
                    experiments={experiments}
                    hasDedicatedPlayer={hasSelectedDedicatedPlayer}
                    runtimeSnapshot={selectedExperimentRuntimeSnapshot}
                    onClearAttempts={handleClearLabAttempts}
                    onCreateAssignment={handleCreateAssignment}
                    school={school}
                    selectedExperiment={selectedExperiment}
                    students={students}
                  />
                </Suspense>
              </LazySectionBoundary>
            )}

            <LazySectionBoundary
              description="AI Copilot 加载失败，请刷新页面后重试。"
              title="AI Copilot 加载失败"
            >
              <Suspense
                fallback={
                  <ShellLoadingPanel
                    title="正在加载 AI Copilot"
                    description="Study Mode、教师洞察和 grounded 提问能力正在异步准备。"
                  />
                }
              >
                <AiCopilotPanel
                  currentStudent={currentStudent}
                  role={activeView}
                  selectedExperiment={selectedExperiment}
                  simulationSnapshot={selectedExperimentSimulationSnapshot}
                />
              </Suspense>
            </LazySectionBoundary>
          </section>
        ) : null}

        {activeView === 'student' && activeShellSection === 'studio' ? (
          <section className="shell-section" id="studio">
            <div className="shell-section-head">
              <div className="shell-section-copy">
                <span className="eyebrow">Lab Studio</span>
                <h2>实验舞台</h2>
                <p>按操作、记录、提示三层切换，让实验台始终保持主角。</p>
              </div>
              {selectedExperimentTitle ? (
                <div className="badge-row shell-section-badges">
                  <span className="badge">{selectedExperimentStage}</span>
                  <span className="badge">{selectedExperimentSubject}</span>
                  <span className="badge">{selectedExperimentGrade}</span>
                  <span className="badge badge-status">{selectedExperimentStatus}</span>
                  {isSelectedExperimentLoading ? <span className="badge">正在切换</span> : null}
                  {isSelectedExperimentBackgroundRefreshing ? <span className="badge syncing">后台更新中</span> : null}
                </div>
              ) : null}
            </div>

            <div
              className={isLabWorkbenchFullscreen ? 'lab-workbench-shell is-fullscreen' : 'lab-workbench-shell'}
              data-fullscreen-utility-collapsed={isLabWorkbenchFullscreen && labFullscreenUtilityView && isLabFullscreenUtilityCollapsed ? 'true' : 'false'}
              data-fullscreen-utility={isLabWorkbenchFullscreen ? labFullscreenUtilityView ?? 'none' : 'hidden'}
              data-inspector-actions-collapsed={labInspectorCollapsedSections.actions ? 'true' : 'false'}
              data-inspector-checklist-collapsed={labInspectorCollapsedSections.checklist ? 'true' : 'false'}
              data-inspector-recovery-collapsed={labInspectorCollapsedSections.recovery ? 'true' : 'false'}
              data-inspector-view={labInspectorView}
              data-lab-mode={labStudioMode}
              data-left-rail-visible={isLabLeftRailVisible ? 'true' : 'false'}
              data-peek-side={labPeekSide ?? 'none'}
              data-ribbon-collapsed={isLabRibbonCollapsed ? 'true' : 'false'}
              data-right-rail-visible={isLabRightRailVisible ? 'true' : 'false'}
              data-step-dock-collapsed={isLabStepDockCollapsed ? 'true' : 'false'}
              data-workbench-preset={labWorkbenchPreset}
              onMouseLeave={handleClearRailPreview}
              ref={labWorkbenchRef}
            >
              <article className="panel wide-panel lab-window-chrome" aria-label="实验台窗口框架">
                <div className="lab-window-chrome-main">
                  <div aria-hidden="true" className="lab-window-controls">
                    <span className="lab-window-dot close" />
                    <span className="lab-window-dot warn" />
                    <span className="lab-window-dot safe" />
                  </div>
                  <div className="lab-window-breadcrumb">
                    <strong>{selectedExperimentTitle || '实验工作台'}</strong>
                    <small>{selectedExperimentTitle ? `${selectedExperimentSubject} · ${selectedExperimentGrade} · ${currentStudent?.name ?? '当前学生'} · ${currentStudent?.className ?? '当前班级'}` : '进入实验后，这里会显示课堂身份与实验上下文。'}</small>
                  </div>
                </div>
                <div className="lab-window-meta">
                  <span className="lab-window-meta-pill">{labWorkbenchWindowLabel}</span>
                  <span className="lab-window-meta-pill">{labWorkbenchPresetLabel[labWorkbenchPreset]}视图</span>
                  <span className="lab-window-meta-pill">{labWorkbenchSessionLabel}</span>
                  {isSelectedExperimentLoading ? <span className="lab-window-meta-pill">切换中</span> : null}
                  {isSelectedExperimentBackgroundRefreshing ? <span className="lab-window-meta-pill syncing">后台更新中</span> : null}
                  {selectedMultiscale ? <span className={`lab-window-meta-pill multiscale ${selectedMultiscale.defaultLens}`}>{selectedMultiscaleSourceLabel} · 默认{defaultWorkbenchLensLabel}层</span> : null}
                  {selectedMultiscale ? <span className={`lab-window-meta-pill focus-lens ${focusedWorkbenchLens}`}>焦点{focusedWorkbenchLensLabel}层</span> : null}
                </div>
              </article>

              <article className="panel wide-panel lab-ribbon-panel">
                <div className="lab-ribbon-top">
                  <div className="lab-ribbon-title lab-ribbon-title-clickable" onDoubleClick={handleToggleLabRibbon} title="双击可收起或展开顶部提示栏">
                    <span className="eyebrow">Workbench</span>
                    <strong>{selectedExperimentTitle || '实验工作台'}</strong>
                    <small>
                      {isSelectedExperimentLoading && selectedExperimentTitle
                        ? `正在切换到 ${selectedExperimentTitle} · 当前舞台会在资源就绪后更新`
                        : isSelectedExperimentBackgroundRefreshing
                          ? '已从缓存打开，正在后台同步最新实验配置'
                          : `${labStudioDescriptions[labStudioMode]} · 双击标题可收起 / 展开`}
                    </small>
                  </div>

                  <div className="lab-ribbon-utilities">
                    {isLabWorkbenchFullscreen ? (
                      <>
                        {!labFullscreenUtilityView ? (
                          <button
                            className="scene-action lab-fullscreen-launcher"
                            data-view={lastLabFullscreenUtilityViewRef.current}
                            onClick={handleOpenFullscreenUtility}
                            title="打开右侧助手任务窗格"
                            type="button"
                          >
                            <span>AI</span>
                            <i aria-hidden="true">{lastLabFullscreenUtilityViewRef.current === 'steps' ? '步' : 'AI'}</i>
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <button aria-keyshortcuts="H" className={isLabRibbonCollapsed ? 'scene-action' : 'scene-action active'} onClick={handleToggleLabRibbon} type="button">
                          {isLabRibbonCollapsed ? '展开提示' : '收起提示'}
                        </button>
                        <button className="scene-action" onClick={handleRestoreLabWorkbenchLayout} title="恢复默认净空工作台" type="button">
                          恢复布局
                        </button>
                      </>
                    )}
                    <button
                      aria-keyshortcuts="F"
                      className={isLabWorkbenchFullscreen ? 'scene-action active lab-fullscreen-exit' : 'scene-action'}
                      onClick={() => void handleToggleLabFullscreen()}
                      title={isLabWorkbenchFullscreen ? '退出全屏' : '实验台全屏'}
                      type="button"
                    >
                      {isLabWorkbenchFullscreen ? '退出' : '实验台全屏'}
                    </button>
                  </div>
                </div>

                <div className="lab-ribbon-toolbar">
                  <div className="lab-ribbon-toolbar-main">
                    <div className="lab-ribbon-group">
                      <div className="lab-ribbon-mode-bar" aria-label="实验室模式切换" role="tablist">
                        <button aria-keyshortcuts="1" className={labStudioMode === 'operation' ? 'workspace-layer-button active' : 'workspace-layer-button'} onClick={() => handleApplyLabStudioMode('operation')} type="button">操作</button>
                        <button aria-keyshortcuts="2" className={labStudioMode === 'record' ? 'workspace-layer-button active' : 'workspace-layer-button'} onClick={() => handleApplyLabStudioMode('record')} type="button">记录</button>
                        <button aria-keyshortcuts="3" className={labStudioMode === 'guide' ? 'workspace-layer-button active' : 'workspace-layer-button'} onClick={() => handleApplyLabStudioMode('guide')} type="button">提示</button>
                      </div>
                      <span className="lab-ribbon-group-label">模式</span>
                    </div>

                    <div className="lab-ribbon-group">
                      <div className="lab-ribbon-preset-bar" aria-label="工作台视图预设">
                        {labWorkbenchPresetOptions.map((option) => (
                          <button
                            className={labWorkbenchPreset === option.value ? 'lab-preset-button active' : 'lab-preset-button'}
                            key={option.value}
                            onClick={() => handleApplyLabWorkbenchPreset(option.value)}
                            title={option.description}
                            type="button"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <span className="lab-ribbon-group-label">视图</span>
                    </div>

                    <div className="lab-ribbon-group">
                      <div className="lab-ribbon-layout-bar" aria-label="实验台侧栏切换">
                        <button aria-keyshortcuts="L" className={isLabLeftRailVisible ? 'scene-action active' : 'scene-action'} onClick={handleToggleLeftRail} title={isLabLeftRailVisible ? '收起左侧目录栏' : '展开左侧目录栏'} type="button">目录</button>
                        <button aria-keyshortcuts="R" className={isLabRightRailVisible ? 'scene-action active' : 'scene-action'} onClick={handleToggleRightRail} title={isLabRightRailVisible ? '收起右侧属性栏' : '展开右侧属性栏'} type="button">属性</button>
                      </div>
                      <span className="lab-ribbon-group-label">布局</span>
                    </div>

                    <div className="lab-ribbon-group">
                      <div className="lab-inspector-bar" aria-label="右侧属性面板分组">
                        {labInspectorOptions.map((option) => (
                          <button
                            aria-pressed={labInspectorView === option.value}
                            className={labInspectorView === option.value ? 'lab-inspector-button active' : 'lab-inspector-button'}
                            key={option.value}
                            onClick={() => handleSelectLabInspectorView(option.value)}
                            type="button"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <div className="lab-inspector-section-row" aria-label="属性卡显隐与聚焦">
                        {labInspectorSectionOptions.map((option) => {
                          const isCollapsed = labInspectorCollapsedSections[option.value];
                          const isFocusedView = labInspectorView === option.value;

                          return (
                            <button
                              aria-pressed={labInspectorView === 'all' ? !isCollapsed : isFocusedView}
                              className={`lab-inspector-section-chip${labInspectorView === 'all' ? (isCollapsed ? ' collapsed' : ' open') : isFocusedView ? ' active' : ''}`}
                              key={option.value}
                              onClick={() => handleToggleLabInspectorSection(option.value)}
                              type="button"
                            >
                              <strong>{option.label}</strong>
                              <span>{labInspectorView === 'all' ? (isCollapsed ? '已收起' : '已展开') : isFocusedView ? '当前聚焦' : option.summary}</span>
                            </button>
                          );
                        })}
                      </div>
                      <span className="lab-ribbon-group-label">属性</span>
                    </div>
                  </div>

                  {selectedExperimentTitle ? (
                    <div className="badge-row lab-ribbon-badges">
                      <span className="badge">{selectedExperimentStage}</span>
                      <span className="badge">{selectedExperimentSubject}</span>
                      <span className="badge">{selectedExperimentGrade}</span>
                      <span className="badge badge-status">{selectedExperimentStatus}</span>
                      {isSelectedExperimentLoading ? <span className="badge">切换中</span> : null}
                      {isSelectedExperimentBackgroundRefreshing ? <span className="badge syncing">后台更新中</span> : null}
                    </div>
                  ) : null}
                </div>

                {shouldShowRibbonContextStrip ? (
                  <div className="lab-ribbon-context-strip" aria-label="实验台上下文摘要">
                    <button className={`lab-ribbon-context-card interactive ${focusedWorkbenchState}`} onClick={() => handleFocusWorkbenchStep(currentWorkbenchStepConfig?.id ?? focusedWorkbenchStep?.id ?? '')} title="回到当前步骤" type="button">
                      <span>聚焦步骤</span>
                      <strong>Step {String(focusedWorkbenchOrder).padStart(2, '0')} · {focusedWorkbenchStep?.title ?? activeWorkbenchAttempt?.currentStepLabel ?? '待开始'}</strong>
                      <small>{focusedWorkbenchSuccess}</small>
                    </button>
                    {focusedWorkbenchMultiscale ? (
                      <div className={`lab-ribbon-context-card multiscale ${focusedWorkbenchLens}`}>
                        <span>多尺度</span>
                        <strong>{focusedWorkbenchLensLabel}层追踪 · {focusedWorkbenchMultiscale.sourceLabel}</strong>
                        <small>{focusedWorkbenchMultiscale.traceSummary}</small>
                        <div className="lab-context-mini-pills" aria-hidden="true">
                          <span className="lab-context-mini-pill">
                            {focusedWorkbenchMultiscale.componentCount > 0 ? `${focusedWorkbenchMultiscale.componentCount} 组件` : '组件待解构'}
                          </span>
                          <span className="lab-context-mini-pill">{focusedWorkbenchMultiscale.materialCount} 材料</span>
                          <span className="lab-context-mini-pill">
                            {focusedWorkbenchMultiscale.speciesCount > 0 ? `${focusedWorkbenchMultiscale.speciesCount} 粒子簇` : '按需粒子'}
                          </span>
                        </div>
                      </div>
                    ) : null}
                    <div className="lab-ribbon-context-card">
                      <span>Inspector</span>
                      <strong>{labInspectorSummaryLabel}</strong>
                      <small>{labInspectorSummaryText}</small>
                      <div className="lab-context-mini-pills" aria-hidden="true">
                        {labInspectorSectionOptions.map((option) => (
                          <span className={labInspectorCollapsedSections[option.value] ? 'lab-context-mini-pill muted' : 'lab-context-mini-pill'} key={option.value}>
                            {option.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="lab-ribbon-context-card">
                      <span>实验状态</span>
                      <strong>进度 {workbenchProgressPercent}% · 得分 {workbenchScore}</strong>
                      <small>{labWorkbenchPresetLabel[labWorkbenchPreset]}视图 · 步骤栏{isLabStepDockCollapsed ? '已收起' : '已展开'} · 错误 {workbenchErrors}</small>
                    </div>
                  </div>
                ) : null}

                {shouldShowRibbonBody ? (
                  selectedExperiment ? (
                    <div className="lab-ribbon-body">
                      <div className="lab-ribbon-guide-head">
                        <strong>{labStudioMode === 'guide' ? '顶部提示已展开' : '顶部操作提示'}</strong>
                        <small>像文档工作台一样贴顶展示，需要时可一键收起，避免挡住实验台。</small>
                      </div>

                      <div className="lab-ribbon-shortcut-row" aria-label="实验台快捷键提示">
                        {labShortcutHints.map((item) => (
                          <span className="lab-shortcut-chip" key={item.key}>
                            <kbd>{item.key}</kbd>
                            <span>{item.label}</span>
                          </span>
                        ))}
                      </div>

                      <div className="lab-guide-grid lab-ribbon-guide-grid">
                        {labGuideHighlights.map((item) => (
                          <div className="lab-guide-card" key={item.id}>
                            <strong>{item.title}</strong>
                            <p>{item.hint}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="lab-ribbon-empty">
                      <strong>实验准备中</strong>
                      <small>选中实验后，这里会显示模式切换与关键操作提示。</small>
                    </div>
                  )
                ) : null}
              </article>

              {shouldShowLeftRailPeek || shouldShowRightRailPeek ? (
                <div className="lab-rail-peek-layer" aria-hidden="true">
                  {shouldShowLeftRailPeek ? (
                    <button
                      className={labPeekSide === 'left' ? 'lab-rail-peek-handle active left' : 'lab-rail-peek-handle left'}
                      onBlur={handleClearRailPreview}
                      onClick={handleToggleLeftRail}
                      onFocus={handlePreviewLeftRail}
                      onMouseEnter={handlePreviewLeftRail}
                      type="button"
                    >
                      <span aria-hidden="true" className="lab-rail-peek-icon">‹</span>
                      <span className="lab-rail-peek-label">目录</span>
                    </button>
                  ) : null}
                  {shouldShowRightRailPeek ? (
                    <button
                      className={labPeekSide === 'right' ? 'lab-rail-peek-handle active right' : 'lab-rail-peek-handle right'}
                      onBlur={handleClearRailPreview}
                      onClick={handleToggleRightRail}
                      onFocus={handlePreviewRightRail}
                      onMouseEnter={handlePreviewRightRail}
                      type="button"
                    >
                      <span aria-hidden="true" className="lab-rail-peek-label">属性</span>
                      <span aria-hidden="true" className="lab-rail-peek-icon">›</span>
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="lab-mode-shell" data-lab-mode={labStudioMode}>
                {isSelectedExperimentLoading && isDisplayedExperimentStale ? (
                  <div className="lab-loading-scrim" aria-live="polite" role="status">
                    <div className="lab-loading-scrim-card">
                      <strong>正在切换到 {selectedExperimentTitle}</strong>
                      <small>新实验配置正在同步，当前舞台暂时锁定，避免误操作。</small>
                    </div>
                  </div>
                ) : null}
                <LazySectionBoundary
                  description="实验舞台资源加载失败，请刷新页面后重新进入实验。"
                  title="实验舞台加载失败"
                >
                  {selectedExperiment ? (
                    <Suspense fallback={null}>
                      <SharedWorkbenchThreeStagePortal
                        experiment={selectedExperiment}
                        focusTargetObject={focusedWorkbenchStep?.targetObject ?? currentWorkbenchStepConfig?.targetObject}
                        focusPrompt={isFocusedWorkbenchStepCurrent ? workbenchLatestPrompt : focusedWorkbenchPrompt}
                        focusStepTitle={focusedWorkbenchStep?.title ?? activeWorkbenchAttempt?.currentStepLabel ?? currentWorkbenchStepConfig?.title}
                        preferredLens={focusedWorkbenchMultiscale?.focusedLens ?? selectedMultiscale?.defaultLens}
                        studioMode={labStudioMode}
                        workbenchPreset={labWorkbenchPreset}
                      />
                    </Suspense>
                  ) : null}
                  {selectedExperiment ? (
                    <Suspense fallback={null}>
                      <LabSceneMultiscalePortal
                        experiment={selectedExperiment}
                        focusStep={focusedWorkbenchStep}
                        focusTargetObject={focusedWorkbenchStep?.targetObject ?? currentWorkbenchStepConfig?.targetObject}
                        hostRef={labWorkbenchRef}
                      />
                    </Suspense>
                  ) : null}
                  {focusedWorkbenchMultiscale ? (
                    <Suspense fallback={null}>
                      <LabWorkbenchEnginePortal
                        focused={focusedWorkbenchMultiscale}
                        hostRef={labWorkbenchRef}
                        rightRailVisible={isLabRightRailVisible}
                        studioMode={labStudioMode}
                      />
                    </Suspense>
                  ) : null}
                  {selectedExperiment ? (
                    SelectedExperimentPlayer ? (
                      <Suspense
                        fallback={
                          <section className="detail-grid">
                            <article className="panel empty-panel loading-panel">
                              <div>
                                <h2>正在加载实验场景</h2>
                                <p>专属实验场景或通用实验播放器正在加载，首次打开该实验会稍慢一些，后续会更快。</p>
                              </div>
                            </article>
                          </section>
                        }
                      >
                        <SelectedExperimentPlayer
                          key={selectedExperiment.id}
                          experiment={selectedExperiment}
                          onSimulationRuntimeChange={handleSimulationRuntimeChange}
                          onTelemetry={handleTelemetry}
                        />
                      </Suspense>
                    ) : (
                      <Suspense
                        fallback={
                          <section className="detail-grid">
                            <ShellLoadingPanel
                              title="正在准备实验入口"
                              description="当前实验暂无专属播放器，正在切换到通用实验入口。"
                            />
                          </section>
                        }
                      >
                        <ExperimentLaunchpad experiment={selectedExperiment} hasInteractivePlayer={false} />
                      </Suspense>
                    )
                  ) : (
                    <section className="detail-grid">
                      <ShellLoadingPanel
                        title="正在准备实验舞台"
                        description="实验配置正在载入中。你也可以先切到“实验说明”，再回到“实验室”继续操作。"
                      />
                    </section>
                  )}
                </LazySectionBoundary>
              </div>

              {isLabWorkbenchFullscreen && selectedExperimentTitle && labFullscreenUtilityView ? (
                <aside
                  className="lab-fullscreen-utility-drawer"
                  data-collapsed={isLabFullscreenUtilityCollapsed ? 'true' : 'false'}
                  data-view={labFullscreenUtilityView}
                >
                  <div className="lab-fullscreen-utility-head">
                    <div className="lab-fullscreen-utility-head-main">
                      <div className="lab-fullscreen-utility-copy">
                        <span className="eyebrow">Docked Utility</span>
                        <strong>{labFullscreenUtilityView === 'steps' ? '步骤助手' : 'AI 助手'}</strong>
                      </div>
                      <div className="lab-fullscreen-utility-head-tools">
                        <div className="lab-fullscreen-utility-tab-row" role="tablist" aria-label="全屏助手切换">
                          <button
                            aria-label="切换到步骤助手"
                            aria-selected={labFullscreenUtilityView === 'steps'}
                            className={labFullscreenUtilityView === 'steps' ? 'lab-fullscreen-utility-tab active' : 'lab-fullscreen-utility-tab'}
                            onClick={() => handleSelectFullscreenUtility('steps')}
                            role="tab"
                            title="切换到步骤助手"
                            type="button"
                          >
                            {isLabFullscreenUtilityCollapsed ? '步' : '步骤'}
                          </button>
                          <button
                            aria-label="切换到 AI 助手"
                            aria-selected={labFullscreenUtilityView === 'copilot'}
                            className={labFullscreenUtilityView === 'copilot' ? 'lab-fullscreen-utility-tab active' : 'lab-fullscreen-utility-tab'}
                            onClick={() => handleSelectFullscreenUtility('copilot')}
                            role="tab"
                            title="切换到 AI 助手"
                            type="button"
                          >
                            AI
                          </button>
                        </div>
                        <div className="lab-fullscreen-utility-actions">
                          <button
                            aria-label={isLabFullscreenUtilityCollapsed ? '展开任务窗格' : '压缩为窄栏'}
                            className="lab-fullscreen-utility-action"
                            onClick={handleToggleFullscreenUtilityCollapsed}
                            title={isLabFullscreenUtilityCollapsed ? '展开任务窗格' : '压缩为窄栏'}
                            type="button"
                          >
                            {isLabFullscreenUtilityCollapsed ? '>' : '窄'}
                          </button>
                          <button
                            aria-label="关闭任务窗格"
                            className="lab-fullscreen-utility-action"
                            onClick={handleCloseFullscreenUtility}
                            title="关闭任务窗格"
                            type="button"
                          >
                            {isLabFullscreenUtilityCollapsed ? 'X' : '关'}
                          </button>
                        </div>
                      </div>
                    </div>
                    {!isLabFullscreenUtilityCollapsed ? (
                      <small className="lab-fullscreen-utility-caption">
                        {labFullscreenUtilityView === 'steps'
                          ? '围绕当前步骤收束查看步骤、检查点和跳转，不把大块说明铺回实验台。'
                          : '把 AI Copilot 压缩进右侧任务窗格，默认只在需要时展开，不覆盖实验台。'}
                      </small>
                    ) : null}
                  </div>

                  {!isLabFullscreenUtilityCollapsed && labFullscreenUtilityView === 'steps' ? (
                    <div className="lab-fullscreen-utility-body">
                      <div className="lab-fullscreen-utility-section-stack">
                        <section className={labFullscreenStepSection === 'focus' ? 'lab-fullscreen-utility-section open' : 'lab-fullscreen-utility-section'}>
                          <button
                            aria-expanded={labFullscreenStepSection === 'focus'}
                            className="lab-fullscreen-utility-section-toggle"
                            onClick={() => handleToggleFullscreenStepSection('focus')}
                            type="button"
                          >
                            <div>
                              <span>Step Focus</span>
                              <strong>步骤概览</strong>
                              <small>{isFocusedWorkbenchStepCurrent ? `当前步骤 ${Math.min(workbenchCurrentStep, workbenchTotalSteps)} / ${workbenchTotalSteps}` : `步骤预览 ${String(focusedWorkbenchOrder).padStart(2, '0')}`} · {focusedWorkbenchStep?.title ?? activeWorkbenchAttempt?.currentStepLabel ?? selectedExperiment?.steps[0]?.title ?? '待开始'}</small>
                            </div>
                            <i aria-hidden="true">{labFullscreenStepSection === 'focus' ? '−' : '+'}</i>
                          </button>
                          {labFullscreenStepSection === 'focus' ? (
                            <div className="lab-fullscreen-utility-section-body">
                              <div className="lab-fullscreen-step-summary">
                                <span className="eyebrow">Step Focus</span>
                                <strong>{isFocusedWorkbenchStepCurrent ? `当前步骤 ${Math.min(workbenchCurrentStep, workbenchTotalSteps)} / ${workbenchTotalSteps}` : `步骤预览 ${String(focusedWorkbenchOrder).padStart(2, '0')}`} · {focusedWorkbenchStep?.title ?? activeWorkbenchAttempt?.currentStepLabel ?? selectedExperiment?.steps[0]?.title ?? '待开始'}</strong>
                                <small>{isFocusedWorkbenchStepCurrent ? workbenchLatestPrompt : `步骤预览 · ${focusedWorkbenchPrompt}`}{focusedWorkbenchMultiscale ? ` · 焦点${focusedWorkbenchLensLabel}层` : ''}</small>
                              </div>
                              <div className="lab-fullscreen-step-metrics">
                                <span className="status-pill ready">进度 {workbenchProgressPercent}%</span>
                                <span className="status-pill ready">得分 {workbenchScore}</span>
                                <span className={workbenchErrors > 0 ? 'status-pill' : 'status-pill ready'}>错误 {workbenchErrors}</span>
                                {selectedMultiscale ? <span className="status-pill">镜头 {focusedWorkbenchLensLabel}</span> : null}
                              </div>
                            </div>
                          ) : null}
                        </section>

                        <section className={labFullscreenStepSection === 'checks' ? 'lab-fullscreen-utility-section open' : 'lab-fullscreen-utility-section'}>
                          <button
                            aria-expanded={labFullscreenStepSection === 'checks'}
                            className="lab-fullscreen-utility-section-toggle"
                            onClick={() => handleToggleFullscreenStepSection('checks')}
                            type="button"
                          >
                            <div>
                              <span>Checkpoints</span>
                              <strong>检查点</strong>
                              <small>{labStepNotes.length} 个当前步骤提示与风险提醒，围绕这一步收束查看。</small>
                            </div>
                            <i aria-hidden="true">{labFullscreenStepSection === 'checks' ? '−' : '+'}</i>
                          </button>
                          {labFullscreenStepSection === 'checks' ? (
                            <div className="lab-fullscreen-utility-section-body">
                              <div className="lab-step-dock-notes" aria-label="当前步骤摘要">
                                {labStepNotes.map((note) => (
                                  <div className={note.tone ? `lab-step-note multiscale ${note.tone}` : 'lab-step-note'} key={note.label}>
                                    <strong>{note.label}</strong>
                                    <small>{note.value}</small>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </section>

                        <section className={labFullscreenStepSection === 'timeline' ? 'lab-fullscreen-utility-section open' : 'lab-fullscreen-utility-section'}>
                          <button
                            aria-expanded={labFullscreenStepSection === 'timeline'}
                            className="lab-fullscreen-utility-section-toggle"
                            onClick={() => handleToggleFullscreenStepSection('timeline')}
                            type="button"
                          >
                            <div>
                              <span>Timeline</span>
                              <strong>步骤时间线</strong>
                              <small>{workbenchTotalSteps} 个步骤 · 当前进度 {workbenchProgressPercent}% · 仅在需要时展开跳转。</small>
                            </div>
                            <i aria-hidden="true">{labFullscreenStepSection === 'timeline' ? '−' : '+'}</i>
                          </button>
                          {labFullscreenStepSection === 'timeline' ? (
                            <div className="lab-fullscreen-utility-section-body">
                              <div className="lab-step-track lab-fullscreen-step-track" role="list">
                                {workbenchStepTrack.map((step) => {
                                  const isFocused = focusedWorkbenchStep?.id === step.id;

                                  return (
                                    <button
                                      aria-pressed={isFocused}
                                      className={`lab-step-chip ${step.state}${isFocused ? ' selected' : ''}`}
                                      key={step.id}
                                      onClick={() => {
                                        handleFocusWorkbenchStep(step.id);
                                        handleCloseFullscreenUtility();
                                      }}
                                      role="listitem"
                                      type="button"
                                    >
                                      <div className="lab-step-chip-head">
                                        <span>{String(step.order).padStart(2, '0')}</span>
                                        <i className={`lab-step-chip-lens ${step.lens}`}>{MULTISCALE_LENS_LABELS[step.lens]}</i>
                                      </div>
                                      <strong>{step.title}</strong>
                                      <small>{isFocused ? step.successCondition : step.state === 'done' ? '已完成，可复盘结果' : step.state === 'active' ? step.helperText : step.failureHint}</small>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                        </section>
                      </div>
                    </div>
                  ) : !isLabFullscreenUtilityCollapsed ? (
                    <LazySectionBoundary
                      description="实验台 AI Copilot 加载失败，请刷新页面后重试。"
                      title="实验台 AI Copilot 加载失败"
                    >
                      <Suspense
                        fallback={
                          <ShellLoadingPanel
                            title="正在加载实验台 Copilot"
                            description="当前步骤提示、纠错复盘和 grounded 引导正在异步准备。"
                          />
                        }
                      >
                        <AiCopilotPanel
                          currentStudent={currentStudent}
                          focusStepGoal={focusedWorkbenchSuccess}
                          focusStepId={focusedWorkbenchStep?.id ?? currentWorkbenchStepConfig?.id}
                          focusStepTitle={focusedWorkbenchStep?.title ?? activeWorkbenchAttempt?.currentStepLabel ?? currentWorkbenchStepConfig?.title ?? ''}
                          initialMode={labStudioMode === 'guide' ? 'study' : labStudioMode === 'record' ? 'review' : 'hint'}
                          role="student"
                          selectedExperiment={selectedExperiment}
                          simulationSnapshot={selectedExperimentSimulationSnapshot}
                          variant="studio"
                        />
                      </Suspense>
                    </LazySectionBoundary>
                  ) : null}
                </aside>
              ) : null}

              {selectedExperimentTitle && !isLabWorkbenchFullscreen ? (
                <>
                  <article className="panel wide-panel lab-step-dock" aria-label="实验步骤时间轴" data-collapsed={isLabStepDockCollapsed ? 'true' : 'false'}>
                    <div className="lab-step-progress" aria-hidden="true">
                      <i style={{ width: `${workbenchProgressPercent}%` }} />
                    </div>

                    <div className="lab-step-dock-head">
                      <div className="lab-step-dock-summary">
                        <span className="eyebrow">Step Dock</span>
                        <strong>{isFocusedWorkbenchStepCurrent ? `当前步骤 ${Math.min(workbenchCurrentStep, workbenchTotalSteps)} / ${workbenchTotalSteps}` : `步骤预览 ${String(focusedWorkbenchOrder).padStart(2, '0')}`} · {focusedWorkbenchStep?.title ?? activeWorkbenchAttempt?.currentStepLabel ?? selectedExperiment?.steps[0]?.title ?? '待开始'}</strong>
                        <small>{isFocusedWorkbenchStepCurrent ? workbenchLatestPrompt : `步骤预览 · ${focusedWorkbenchPrompt}`}{focusedWorkbenchMultiscale ? ` · 焦点${focusedWorkbenchLensLabel}层` : ''}</small>
                      </div>
                      <div className="lab-step-dock-actions">
                        <button aria-keyshortcuts="J" className={isLabStepDockCollapsed ? 'scene-action' : 'scene-action active'} onClick={handleToggleLabStepDock} type="button">
                          {isLabStepDockCollapsed ? '展开步骤栏' : '收起步骤栏'}
                        </button>
                        <div className="lab-step-dock-metrics">
                          <span className="status-pill ready">进度 {workbenchProgressPercent}%</span>
                          <span className="status-pill">Inspector {activeInspectorMeta.title}</span>
                          {selectedMultiscale ? <span className={focusedWorkbenchLens === 'micro' ? 'status-pill ready' : 'status-pill'}>镜头 {focusedWorkbenchLensLabel}</span> : null}
                          <span className="status-pill ready">得分 {workbenchScore}</span>
                          <span className={workbenchErrors > 0 ? 'status-pill' : 'status-pill ready'}>错误 {workbenchErrors}</span>
                        </div>
                      </div>
                    </div>

                    <div className="lab-step-dock-notes" aria-label="当前步骤摘要">
                      {labStepNotes.map((note) => (
                        <div className={note.tone ? `lab-step-note multiscale ${note.tone}` : 'lab-step-note'} key={note.label}>
                          <strong>{note.label}</strong>
                          <small>{note.value}</small>
                        </div>
                      ))}
                    </div>

                    <div className="lab-step-track" role="list">
                      {workbenchStepTrack.map((step) => {
                        const isFocused = focusedWorkbenchStep?.id === step.id;

                        return (
                          <button
                            aria-pressed={isFocused}
                            className={`lab-step-chip ${step.state}${isFocused ? ' selected' : ''}`}
                            key={step.id}
                            onClick={() => handleFocusWorkbenchStep(step.id)}
                            role="listitem"
                            type="button"
                          >
                            <div className="lab-step-chip-head">
                              <span>{String(step.order).padStart(2, '0')}</span>
                              <i className={`lab-step-chip-lens ${step.lens}`}>{MULTISCALE_LENS_LABELS[step.lens]}</i>
                            </div>
                            <strong>{step.title}</strong>
                            <small>{isFocused ? step.successCondition : step.state === 'done' ? '已完成，可复盘结果' : step.state === 'active' ? step.helperText : step.failureHint}</small>
                          </button>
                        );
                      })}
                    </div>
                  </article>

                  <LazySectionBoundary
                    description="实验台 AI Copilot 加载失败，请刷新页面后重试。"
                    title="实验台 AI Copilot 加载失败"
                  >
                    <Suspense
                      fallback={
                        <ShellLoadingPanel
                          title="正在加载实验台 Copilot"
                          description="当前步骤提示、纠错复盘和 grounded 引导正在异步准备。"
                        />
                      }
                    >
                      <AiCopilotPanel
                        currentStudent={currentStudent}
                        focusStepGoal={focusedWorkbenchSuccess}
                        focusStepId={focusedWorkbenchStep?.id ?? currentWorkbenchStepConfig?.id}
                        focusStepTitle={focusedWorkbenchStep?.title ?? activeWorkbenchAttempt?.currentStepLabel ?? currentWorkbenchStepConfig?.title ?? ''}
                        initialMode={labStudioMode === 'guide' ? 'study' : labStudioMode === 'record' ? 'review' : 'hint'}
                        role="student"
                        selectedExperiment={selectedExperiment}
                        simulationSnapshot={selectedExperimentSimulationSnapshot}
                        variant="studio"
                      />
                    </Suspense>
                  </LazySectionBoundary>

                  <article className="panel wide-panel lab-status-bar" aria-label="实验台状态栏">
                    <div className="lab-status-bar-cells">
                      {labStatusBarItems.map((item) => (
                        <div className={item.tone ? `lab-status-cell multiscale ${item.tone}` : 'lab-status-cell'} key={item.label}>
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                      ))}
                    </div>
                    <div className="lab-status-bar-actions" aria-label="快捷提示">
                      <span className="lab-status-shortcut"><kbd>F</kbd><span>全屏</span></span>
                      <span className="lab-status-shortcut"><kbd>J</kbd><span>步骤栏</span></span>
                      <span className="lab-status-shortcut"><kbd>H</kbd><span>顶栏</span></span>
                    </div>
                  </article>
                </>
              ) : null}
            </div>
          </section>
        ) : null}

        {activeShellSection === 'specs' ? (
          <section className="shell-section" id="specs">
            <div className="shell-section-head">
              <div className="shell-section-copy">
                <span className="eyebrow">Experiment Explorer</span>
                <h2>实验说明与产品配置</h2>
                <p>把步骤、器材和产品信息收进说明层，避免三块内容挤在同屏。</p>
              </div>
              {selectedExperimentTitle ? (
                <div className="badge-row shell-section-badges">
                  <span className="badge">{selectedExperimentTheme}</span>
                  <span className="badge">{selectedExperimentDurationMinutes} 分钟</span>
                  <span className="badge">{selectedExperimentInteractionMode}</span>
                  {isSelectedExperimentLoading ? <span className="badge">配置切换中</span> : null}
                  {isSelectedExperimentBackgroundRefreshing ? <span className="badge syncing">后台更新中</span> : null}
                </div>
              ) : null}
            </div>

            <LazySectionBoundary
              description="实验说明资源加载失败，请刷新后重试。"
              title="实验说明加载失败"
            >
              <Suspense
                fallback={
                  <ShellLoadingPanel
                    title="正在加载实验说明"
                    description="步骤说明、器材清单和产品配置面板正在异步准备。"
                  />
                }
              >
                <ExperimentDetailPanel
                  experiment={selectedExperiment}
                  hasDedicatedPlayer={hasSelectedDedicatedPlayer}
                  runtimeSnapshot={selectedExperimentRuntimeSnapshot}
                />
                <ApparatusEnginePanel experiment={selectedExperiment} />
              </Suspense>
            </LazySectionBoundary>
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default App;
