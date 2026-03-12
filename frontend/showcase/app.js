const showcaseExperiments = [
  { title: '串联与并联电路', stage: '初中', subject: '物理', duration: '12 分钟', mode: '引导 / 练习 / 考核', status: '老师已布置' },
  { title: '氧气制备与收集', stage: '初中', subject: '化学', duration: '13 分钟', mode: '引导 / 练习', status: '推荐练习' },
  { title: '显微镜使用', stage: '初中', subject: '生物', duration: '11 分钟', mode: '引导 / 练习', status: '本周高频' },
  { title: '欧姆定律实验', stage: '高中', subject: '物理', duration: '15 分钟', mode: '引导 / 练习 / 考核', status: '待上线演示' },
  { title: '原电池基础', stage: '高中', subject: '化学', duration: '12 分钟', mode: '引导 / 练习 / 考核', status: '待上线演示' },
  { title: '酶活性影响因素', stage: '高中', subject: '生物', duration: '15 分钟', mode: '引导 / 练习 / 考核', status: '待上线演示' },
];

function renderCards() {
  const target = document.getElementById('showcase-list');
  if (!target) return;

  target.innerHTML = showcaseExperiments
    .map(
      (item) => `
      <article class="experiment-card">
        <header class="badge-row">
          <span class="badge">${item.stage}</span>
          <span class="badge">${item.subject}</span>
        </header>
        <h3>${item.title}</h3>
        <p>${item.duration} · ${item.mode}</p>
        <div class="banner" style="margin-top: 14px;">${item.status}</div>
      </article>
    `,
    )
    .join('');
}

renderCards();
