(() => {
  'use strict';
  const input = document.querySelector('textarea');
  const writing = document.querySelector('.writing');
  writing.insertAdjacentHTML('afterbegin', `<div class="essay-prompt" aria-hidden="true"><span id="word-label">写多少字</span></div>`);
  document.body.insertAdjacentHTML('beforeend', `
    <aside class="mode-sidebar" aria-label="切换打字模式">
      <button class="mode-handle" aria-label="展开模式侧边栏" aria-expanded="false" aria-controls="mode-options">「模式」</button>
      <div id="mode-options" class="mode-options" inert><div><button class="mode-choice" tabindex="-1">「作文」</button></div></div>
    </aside>
    <button class="essay-finish" disabled aria-hidden="true">「完成」</button>
    <div class="essay-goal" role="progressbar" aria-label="作文字数进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-hidden="true"><span class="goal-fill"></span></div>
    <span class="sr-only" id="essay-status" role="status" aria-live="polite"></span>`);
  const sidebar = document.querySelector('.mode-sidebar');
  const handle = document.querySelector('.mode-handle');
  const options = document.querySelector('#mode-options');
  const choice = document.querySelector('.mode-choice');
  const finish = document.querySelector('.essay-finish');
  const prompt = document.querySelector('.essay-prompt');
  const wordLabel = document.querySelector('#word-label');
  const goal = document.querySelector('.essay-goal');
  const fill = document.querySelector('.goal-fill');
  const status = document.querySelector('#essay-status');
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  const split = text => segmenter ? Array.from(segmenter.segment(text), item => item.segment) : Array.from(text);
  const countWords = text => split(text).filter(char => !/^\s+$/u.test(char)).length;
  const scenes = {
    free: { text: input.value, scene: null },
    essay: { text: '', setupText: '', scene: null, setupScene: null, target: null, done: false, celebrated: -1 }
  };
  let mode = 'free', phase = 'free', hoverTimer = 0, hoverLocked = false, opened = false, epoch = 0, completing = false, composing = false, restoring = false;
  document.body.dataset.mode = mode; document.body.dataset.phase = phase;

  function menu(open) {
    opened = open; sidebar.classList.toggle('expanded', open);
    handle.setAttribute('aria-expanded', String(open));
    handle.setAttribute('aria-label', open ? '收起模式侧边栏' : '展开模式侧边栏');
    options.inert = !open; choice.tabIndex = open ? 0 : -1;
  }
  sidebar.addEventListener('pointerenter', event => {
    if (event.pointerType === 'touch' || hoverLocked) return;
    clearTimeout(hoverTimer); hoverTimer = setTimeout(() => menu(true), 300);
  });
  sidebar.addEventListener('pointerleave', () => {
    clearTimeout(hoverTimer); hoverLocked = false;
    if (!sidebar.contains(document.activeElement)) menu(false);
  });
  handle.addEventListener('click', () => { clearTimeout(hoverTimer); menu(!opened); });
  handle.addEventListener('focus', () => { if (handle.matches(':focus-visible')) menu(true); });
  sidebar.addEventListener('focusout', () => { setTimeout(() => { if (!sidebar.contains(document.activeElement)) menu(false); }, 0); });
  sidebar.addEventListener('keydown', event => { if (event.key === 'Escape') { menu(false); input.focus(); } });

  function setPhase(value) {
    phase = value; document.body.dataset.phase = value;
    prompt.setAttribute('aria-hidden', String(value !== 'setup'));
    input.inputMode = value === 'setup' ? 'numeric' : 'text';
    input.enterKeyHint = value === 'setup' ? 'done' : 'enter';
    input.setAttribute('aria-label', value === 'setup' ? '输入作文目标字数，按 Enter 确认' : mode === 'essay' ? '输入作文' : '自由输入文字');
    finish.setAttribute('aria-hidden', String(value !== 'writing'));
    goal.setAttribute('aria-hidden', String(value !== 'writing'));
    finish.disabled = value !== 'writing' || scenes.essay.done || completing;
  }
  function updateGoal() {
    if (mode !== 'essay' || phase !== 'writing' || !scenes.essay.target) return;
    const target = scenes.essay.target, current = countWords(input.value);
    const progress = Math.min(1, current / target);
    const metrics = window.CypeLetters?.metrics(target);
    if (metrics) {
      const { rect, width, height, pileHeight } = metrics;
      goal.style.left = `${rect.left + rect.width * .04}px`;
      goal.style.top = `${rect.top + (height - pileHeight) * rect.height / height}px`;
      goal.style.width = `${rect.width * .92}px`;
    } else { goal.style.left = '4vw'; goal.style.width = '92vw'; goal.style.top = '85vh'; }
    fill.style.transform = `scaleX(${progress})`;
    goal.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
    goal.setAttribute('aria-valuetext', `${current} / ${target} 字`);
    goal.title = `${current} / ${target} 字 · 预计堆积高度`;
  }
  function changeText(text) {
    input.value = text;
    input.selectionStart = input.selectionEnd = text.length;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function celebrateProgress() {
    const essay = scenes.essay, current = countWords(input.value);
    if (current < essay.target || completing) return;
    const milestone = Math.floor((current - essay.target) / 2);
    if (milestone <= essay.celebrated) return;
    const crossed = milestone - essay.celebrated;
    essay.celebrated = milestone;
    window.CypeLetters?.celebrateAt(finish.getBoundingClientRect(), crossed);
  }
  function shake(element, className) {
    element.classList.remove(className); void element.offsetWidth;
    element.classList.add(className);
  }
  wordLabel.addEventListener('animationend', () => wordLabel.classList.remove('invalid-shake'));
  finish.addEventListener('animationend', () => finish.classList.remove('finish-shake'));

  function switchMode(next) {
    epoch++; completing = false; clearTimeout(hoverTimer); hoverLocked = true; menu(false);
    const current = scenes[mode];
    if (mode === 'essay' && phase === 'setup') { current.setupText = input.value; current.setupScene = window.CypeLetters?.capture(); }
    else { current.text = input.value; current.scene = window.CypeLetters?.capture(); }
    mode = next; document.body.dataset.mode = next;
    const scene = scenes[next];
    const setup = next === 'essay' && !scene.target;
    const text = setup ? scene.setupText : scene.text;
    input.readOnly = false; composing = false;
    window.CypeLetters?.restore(setup ? scene.setupScene : scene.scene, text);
    input.value = text; input.removeAttribute('aria-invalid');
    wordLabel.classList.remove('invalid-shake'); finish.classList.remove('finish-shake');
    choice.textContent = next === 'free' ? '「作文」' : '「自由」';
    setPhase(next === 'free' ? 'free' : setup ? 'setup' : 'writing');
    input.selectionStart = input.selectionEnd = text.length;
    restoring = true;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    restoring = false;
    input.focus(); updateGoal();
    status.textContent = next === 'free' ? '自由模式' : setup ? '作文模式，请输入目标字数' : '已返回作文模式';
  }
  choice.addEventListener('click', () => switchMode(mode === 'free' ? 'essay' : 'free'));
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; onInput(); });
  function onInput() {
    if (composing || restoring) return;
    if (input.hasAttribute('aria-invalid')) input.removeAttribute('aria-invalid');
    if (mode === 'essay' && phase === 'writing') {
      if (!completing) { scenes.essay.done = false; finish.disabled = false; }
      scenes.essay.text = input.value; updateGoal(); celebrateProgress();
    }
  }
  input.addEventListener('input', onInput);
  input.addEventListener('keydown', event => {
    if (mode !== 'essay' || phase !== 'setup' || event.key !== 'Enter' || composing || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    const raw = input.value.trim(), number = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(number) || number <= 0) {
      input.setAttribute('aria-invalid', 'true'); shake(wordLabel, 'invalid-shake');
      status.textContent = '请输入大于零的整数作为字数'; return;
    }
    scenes.essay.target = number; scenes.essay.setupText = ''; scenes.essay.setupScene = null; scenes.essay.celebrated = -1;
    changeText(''); scenes.essay.text = ''; scenes.essay.done = false;
    setPhase('writing'); updateGoal(); input.focus();
    status.textContent = `目标 ${number} 字，可以开始写作文了`;
  });
  finish.addEventListener('click', async () => {
    if (mode !== 'essay' || phase !== 'writing' || completing || composing) return;
    if (countWords(input.value) < scenes.essay.target) {
      const chars = split(input.value);
      // Ignore trailing whitespace when choosing the final counted character.
      let last = chars.length - 1;
      while (last >= 0 && /^\s+$/u.test(chars[last])) last--;
      if (last >= 0) { chars.splice(last, 1); changeText(chars.join('')); }
      shake(finish, 'finish-shake'); status.textContent = '字数未达标，最后一个字已删除'; input.focus(); return;
    }
    const token = ++epoch; completing = true; finish.disabled = true; input.readOnly = true;
    await window.CypeLetters?.clearTopDown();
    if (token !== epoch || mode !== 'essay') return;
    completing = false; scenes.essay.done = true; input.readOnly = false;
    status.textContent = `作文已完成，共 ${countWords(input.value)} 字`;
    input.focus();
  });
  addEventListener('resize', updateGoal);
  window.visualViewport?.addEventListener('resize', updateGoal);
  window.visualViewport?.addEventListener('scroll', updateGoal);
})();
