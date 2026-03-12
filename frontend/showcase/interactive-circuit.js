const seriesEdges = [
  ['battery_pos', 'switch_in'],
  ['switch_out', 'bulb1_in'],
  ['bulb1_out', 'bulb2_in'],
  ['bulb2_out', 'battery_neg'],
];

const parallelEdges = [
  ['battery_pos', 'split_pos'],
  ['split_pos', 'bulb1_in'],
  ['split_pos', 'bulb2_in'],
  ['bulb1_out', 'merge_neg'],
  ['bulb2_out', 'merge_neg'],
  ['merge_neg', 'battery_neg'],
];

const equipmentIds = ['battery', 'switch', 'bulb1', 'bulb2', 'wire'];

const state = {
  step: 1,
  identified: new Set(),
  selectedTerminal: null,
  connections: new Set(),
  errors: 0,
  seriesObserved: false,
  summaryChoice: '',
};

function normalizeEdge(a, b) {
  return [a, b].sort().join('__');
}

function requiredSetForStep(step) {
  return new Set((step === 2 ? seriesEdges : parallelEdges).map(([a, b]) => normalizeEdge(a, b)));
}

function board() {
  return document.getElementById('lab-board');
}

function svgLayer() {
  return document.getElementById('connection-layer');
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function updatePrompt(message) {
  setText('prompt-text', message);
}

function updateErrors() {
  setText('error-count', String(state.errors));
}

function updateIdentifiedCount() {
  setText('identified-count', `${state.identified.size}/${equipmentIds.length}`);
}

function updateCurrentStep() {
  setText('current-step-label', `步骤 ${state.step}/5`);
  document.querySelectorAll('[data-step-item]').forEach((item) => {
    const stepNumber = Number(item.getAttribute('data-step-item'));
    item.classList.toggle('active', stepNumber === state.step);
    item.classList.toggle('done', stepNumber < state.step);
  });
}

function updateEquipmentState() {
  equipmentIds.forEach((id) => {
    const chip = document.querySelector(`[data-equipment="${id}"]`);
    if (!chip) return;
    chip.classList.toggle('identified', state.identified.has(id));
  });
}

function updateBulbState(lit) {
  document.querySelectorAll('.lab-bulb').forEach((bulb) => bulb.classList.toggle('is-on', lit));
}

function updateLayout() {
  const step = state.step;
  document.querySelectorAll('[data-layout]').forEach((node) => {
    const layout = node.getAttribute('data-layout');
    const showSeries = step === 2 || step === 3;
    const shouldShow = showSeries ? layout === 'series' : layout === 'parallel';
    node.hidden = !shouldShow;
  });

  document.querySelectorAll('[data-terminal]').forEach((terminal) => {
    const layout = terminal.getAttribute('data-layout-scope');
    const showSeries = step === 2 || step === 3;
    const shouldShow = showSeries ? layout === 'series' : layout === 'parallel';
    terminal.hidden = !shouldShow;
  });
}

function clearConnections() {
  state.connections.clear();
  state.selectedTerminal = null;
  updateBulbState(false);
  drawConnections();
}

function centerOf(element) {
  const boardRect = board().getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left - boardRect.left + rect.width / 2,
    y: rect.top - boardRect.top + rect.height / 2,
  };
}

function drawConnections() {
  const svg = svgLayer();
  const boardElement = board();
  if (!svg || !boardElement) return;

  svg.innerHTML = '';
  svg.setAttribute('viewBox', `0 0 ${boardElement.clientWidth} ${boardElement.clientHeight}`);

  state.connections.forEach((edgeId) => {
    const [a, b] = edgeId.split('__');
    const aElement = document.querySelector(`[data-terminal="${a}"]`);
    const bElement = document.querySelector(`[data-terminal="${b}"]`);
    if (!aElement || !bElement || aElement.hidden || bElement.hidden) return;

    const start = centerOf(aElement);
    const end = centerOf(bElement);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(start.x));
    line.setAttribute('y1', String(start.y));
    line.setAttribute('x2', String(end.x));
    line.setAttribute('y2', String(end.y));
    line.setAttribute('stroke', '#65d9ff');
    line.setAttribute('stroke-width', '6');
    line.setAttribute('stroke-linecap', 'round');
    svg.appendChild(line);
  });
}

function moveToStep(nextStep, options = {}) {
  const { preserveConnections = false } = options;
  state.step = nextStep;
  state.selectedTerminal = null;
  if (!preserveConnections) {
    clearConnections();
  } else {
    drawConnections();
  }
  updateLayout();
  updateCurrentStep();

  if (nextStep === 2) {
    updatePrompt('请在实验台上连接串联电路：电池正极 → 开关 → 灯泡 A → 灯泡 B → 电池负极。');
  } else if (nextStep === 3) {
    updatePrompt('现在闭合开关并记录串联电路现象。');
  } else if (nextStep === 4) {
    updatePrompt('请重新连接并联电路：电池正极分成两条支路，分别接到两个灯泡后再汇回负极。');
  } else if (nextStep === 5) {
    updatePrompt('请选择正确结论，完成本次实验。');
  }
}

function completeExperiment() {
  const result = document.getElementById('completion-result');
  if (result) {
    result.hidden = false;
  }
  updatePrompt('实验完成。你已经成功完成串联与并联电路的搭建与比较。');
  setText('score-text', String(Math.max(70, 100 - state.errors * 5)));
}

function validateCurrentCircuit() {
  const expected = requiredSetForStep(state.step);
  const matches = state.connections.size === expected.size && [...expected].every((edge) => state.connections.has(edge));

  if (!matches) {
    state.errors += 1;
    updateErrors();
    updatePrompt('连接还不正确，请检查导线是否接到了正确端子；也可以点击“重置当前电路”重试。');
    return false;
  }

  if (state.step === 2) {
    moveToStep(3, { preserveConnections: true });
    return true;
  }

  if (state.step === 4) {
    moveToStep(5);
    return true;
  }

  return true;
}

function handleEquipmentClick(event) {
  const target = event.currentTarget;
  const equipmentId = target.getAttribute('data-equipment');
  if (!equipmentId || state.step !== 1) return;

  state.identified.add(equipmentId);
  updateEquipmentState();
  updateIdentifiedCount();

  if (state.identified.size === equipmentIds.length) {
    updatePrompt('器材识别完成，进入串联电路搭建。');
    moveToStep(2);
  } else {
    updatePrompt('继续点击并识别剩余器材。');
  }
}

function handleTerminalClick(event) {
  const target = event.currentTarget;
  if (!(state.step === 2 || state.step === 4)) return;

  const terminalId = target.getAttribute('data-terminal');
  if (!terminalId) return;

  document.querySelectorAll('.terminal').forEach((terminal) => terminal.classList.remove('selected'));

  if (!state.selectedTerminal) {
    state.selectedTerminal = terminalId;
    target.classList.add('selected');
    updatePrompt('已选择第一个端子，请再选择一个端子完成连线。');
    return;
  }

  if (state.selectedTerminal === terminalId) {
    state.selectedTerminal = null;
    updatePrompt('已取消当前端子选择。');
    return;
  }

  const edgeId = normalizeEdge(state.selectedTerminal, terminalId);
  if (state.connections.has(edgeId)) {
    state.connections.delete(edgeId);
    updatePrompt('已移除一条导线连接。');
  } else {
    state.connections.add(edgeId);
    updatePrompt('已添加一条导线连接。');
  }

  state.selectedTerminal = null;
  drawConnections();
}

function handleCheckCircuit() {
  if (!(state.step === 2 || state.step === 4)) return;
  validateCurrentCircuit();
}

function handleObserveSeries() {
  if (state.step !== 3) return;

  const expected = requiredSetForStep(2);
  const matches = state.connections.size === expected.size && [...expected].every((edge) => state.connections.has(edge));

  if (!matches) {
    state.errors += 1;
    updateErrors();
    updatePrompt('当前串联电路连接已丢失，请重新检查并连接。');
    moveToStep(2);
    return;
  }

  state.seriesObserved = true;
  updateBulbState(true);
  updatePrompt('两个小灯泡已经点亮。请点击“记录观察”进入并联电路。');
  document.getElementById('record-series-btn')?.removeAttribute('disabled');
}

function handleRecordSeries() {
  if (!state.seriesObserved || state.step !== 3) return;
  moveToStep(4);
}

function handleSummaryChoice(event) {
  const target = event.currentTarget;
  state.summaryChoice = target.getAttribute('data-summary') || '';
  document.querySelectorAll('[data-summary]').forEach((item) => item.classList.remove('active'));
  target.classList.add('active');
}

function handleSubmitSummary() {
  if (state.step !== 5) return;

  if (state.summaryChoice !== 'parallel-branches') {
    state.errors += 1;
    updateErrors();
    updatePrompt('结论不正确。提示：并联电路和串联电路最大的差别是支路数量。');
    return;
  }

  completeExperiment();
}

function init() {
  updateCurrentStep();
  updateIdentifiedCount();
  updateErrors();
  updateEquipmentState();
  updateLayout();
  updatePrompt('先点击实验器材，完成器材识别。');
  drawConnections();

  document.querySelectorAll('[data-equipment]').forEach((item) => item.addEventListener('click', handleEquipmentClick));
  document.querySelectorAll('[data-terminal]').forEach((item) => item.addEventListener('click', handleTerminalClick));

  document.getElementById('reset-circuit-btn')?.addEventListener('click', () => {
    clearConnections();
    updatePrompt('当前电路已重置，请重新连接。');
  });

  document.getElementById('check-circuit-btn')?.addEventListener('click', handleCheckCircuit);
  document.getElementById('observe-series-btn')?.addEventListener('click', handleObserveSeries);
  document.getElementById('record-series-btn')?.addEventListener('click', handleRecordSeries);
  document.querySelectorAll('[data-summary]').forEach((item) => item.addEventListener('click', handleSummaryChoice));
  document.getElementById('submit-summary-btn')?.addEventListener('click', handleSubmitSummary);
  window.addEventListener('resize', drawConnections);
}

init();
