const experiments = [
  { title: '串联与并联电路', stage: '初中', subject: '物理', duration: '12 分钟', mode: '引导模式', summary: '连接电路、识别元件、观察电流变化。' },
  { title: '凸透镜成像规律', stage: '初中', subject: '物理', duration: '10 分钟', mode: '练习模式', summary: '移动物距与像距，观察成像大小规律。' },
  { title: '欧姆定律实验', stage: '高中', subject: '物理', duration: '15 分钟', mode: '考核模式', summary: '接线、测量和绘制电流电压关系。' },
  { title: '单摆周期实验', stage: '高中', subject: '物理', duration: '14 分钟', mode: '引导模式', summary: '调节摆长并比较周期变化趋势。' },
  { title: '氧气制备与收集', stage: '初中', subject: '化学', duration: '13 分钟', mode: '引导模式', summary: '完成器材组装、加热与气体收集。' },
  { title: '酸碱中和反应', stage: '初中', subject: '化学', duration: '9 分钟', mode: '练习模式', summary: '观察指示剂变化并理解中和过程。' },
  { title: '化学反应速率', stage: '高中', subject: '化学', duration: '16 分钟', mode: '考核模式', summary: '比较温度、浓度与催化剂对速率的影响。' },
  { title: '原电池基础', stage: '高中', subject: '化学', duration: '12 分钟', mode: '引导模式', summary: '搭建原电池并观察电子流动方向。' },
  { title: '显微镜使用', stage: '初中', subject: '生物', duration: '11 分钟', mode: '引导模式', summary: '完成对光、调焦和样本观察。' },
  { title: '光合作用条件探究', stage: '初中', subject: '生物', duration: '14 分钟', mode: '练习模式', summary: '对比光照、二氧化碳等条件变化。' },
  { title: '酶活性影响因素', stage: '高中', subject: '生物', duration: '15 分钟', mode: '考核模式', summary: '比较温度和 pH 对酶活性的影响。' },
  { title: '有丝分裂过程观察', stage: '高中', subject: '生物', duration: '10 分钟', mode: '引导模式', summary: '按阶段观察细胞分裂和染色体变化。' },
];

function renderHeroStats() {
  const target = document.getElementById('hero-stats');
  if (!target) return;

  const stats = [
    { label: '首批 MVP 实验', value: `${experiments.length} 个` },
    { label: '覆盖学科', value: '3 门' },
    { label: '核心角色', value: '学生 / 教师 / 学校' },
  ];

  target.innerHTML = stats
    .map(
      (item) => `
        <article class="stat-card">
          <span>${item.label}</span>
          <strong>${item.value}</strong>
        </article>
      `,
    )
    .join('');
}

function renderExperiments(filters = { stage: '全部', subject: '全部' }) {
  const grid = document.getElementById('experiment-grid');
  const countAll = document.getElementById('count-all');
  if (!grid) return;

  const filtered = experiments.filter((item) => {
    const stageMatch = filters.stage === '全部' || item.stage === filters.stage;
    const subjectMatch = filters.subject === '全部' || item.subject === filters.subject;
    return stageMatch && subjectMatch;
  });

  if (countAll) countAll.textContent = filtered.length;

  grid.innerHTML = filtered
    .map(
      (item) => `
        <article class="experiment-card">
          <header>
            <span class="badge">${item.stage}</span>
            <span class="badge">${item.subject}</span>
          </header>
          <h3>${item.title}</h3>
          <p>${item.summary}</p>
          <footer>
            <div class="badge-row">
              <span class="badge">${item.mode}</span>
              <span class="badge">${item.duration}</span>
            </div>
          </footer>
        </article>
      `,
    )
    .join('');
}

function mountFilters() {
  const groups = document.querySelectorAll('[data-filter-group]');
  if (!groups.length) return;

  const state = { stage: '全部', subject: '全部' };

  groups.forEach((group) => {
    group.addEventListener('click', (event) => {
      const button = event.target.closest('[data-value]');
      if (!button) return;

      const filterGroup = group.getAttribute('data-filter-group');
      state[filterGroup] = button.getAttribute('data-value');

      group.querySelectorAll('[data-value]').forEach((item) => item.classList.remove('is-active'));
      button.classList.add('is-active');
      renderExperiments(state);
    });
  });

  renderExperiments(state);
}

renderHeroStats();
mountFilters();
