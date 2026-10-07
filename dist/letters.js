(() => {
  'use strict';
  const input = document.querySelector('textarea');
  const layer = document.createElement('canvas');
  layer.id = 'letters';
  layer.setAttribute('aria-hidden', 'true');
  document.body.prepend(layer);
  const context = layer.getContext('2d');
  if (!context || !window.Matter) return;
  const { Engine, Bodies, Body, Composite, Sleeping } = Matter;
  const engine = Engine.create({ enableSleeping: true, positionIterations: 8, velocityIterations: 6 });
  engine.gravity.y = 1.05;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  const split = text => segmenter ? Array.from(segmenter.segment(text), item => item.segment) : Array.from(text);
  // Physics runs in a coordinate system independent of page and pinch zoom.
  const initialPixelRatio = devicePixelRatio || 1;
  const renderRatio = Math.min(initialPixelRatio, 2);
  const viewport = window.visualViewport;
  let width = innerWidth, height = innerHeight, boundaries = [], entries = [], particles = [];
  let previous = [], composition = false, frame = 0, last = 0, accumulator = 0;
  let audio = null, lastPop = -Infinity, quietUntil = 0;
  let clearEpoch = 0;
  const colors = ['#ff6b92', '#ffd36e', '#66e8cc', '#74bbff', '#c397ff', '#ffffff'];

  function unlockAudio() {
    try {
      if (!audio) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (Audio) audio = new Audio();
      }
      if (audio?.state === 'suspended') audio.resume().catch(() => {});
    } catch (_) { /* Visual feedback remains available without audio. */ }
  }
  input.addEventListener('beforeinput', unlockAudio);
  input.addEventListener('keydown', unlockAudio);
  document.addEventListener('pointerdown', unlockAudio, { passive: true });

  function pop() {
    if (!audio || audio.state !== 'running' || audio.currentTime < quietUntil || audio.currentTime - lastPop < .04) return;
    const now = audio.currentTime;
    lastPop = now;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(.13, now + .003);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .095);
    gain.connect(audio.destination);
    const oscillator = audio.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(1300, now);
    oscillator.frequency.exponentialRampToValueAtTime(360, now + .065);
    oscillator.connect(gain);
    oscillator.start(now);
    oscillator.stop(now + .1);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }

  function resize() {
    const oldWidth = width, oldHeight = height;
    const pageScale = (devicePixelRatio || 1) / initialPixelRatio;
    const pinchScale = viewport?.scale || 1;
    const viewWidth = viewport?.width || innerWidth;
    const viewHeight = viewport?.height || innerHeight;
    const nextWidth = Math.round(viewWidth * pageScale * pinchScale);
    const nextHeight = Math.round(viewHeight * pageScale * pinchScale);
    // Browser zoom rounds viewport CSS dimensions. Ignore that tiny jitter.
    const geometryChanged = !boundaries.length || Math.abs(nextWidth - width) > 3 || Math.abs(nextHeight - height) > 3;
    if (geometryChanged) { width = nextWidth; height = nextHeight; }
    layer.style.width = `${viewWidth * pinchScale}px`;
    layer.style.height = `${viewHeight * pinchScale}px`;
    layer.style.left = `${viewport?.offsetLeft || 0}px`;
    layer.style.top = `${viewport?.offsetTop || 0}px`;
    layer.style.transformOrigin = '0 0';
    layer.style.transform = `scale(${1 / pinchScale})`;
    layer.width = Math.round(width * renderRatio); layer.height = Math.round(height * renderRatio);
    context.setTransform(renderRatio, 0, 0, renderRatio, 0, 0);
    if (!geometryChanged) { paint(0); return; }
    boundaries.forEach(body => Composite.remove(engine.world, body));
    boundaries = [
      Bodies.rectangle(width / 2, height + 25, width + 100, 50, { isStatic: true, friction: .8 }),
      Bodies.rectangle(-25, -height, 50, height * 6, { isStatic: true }),
      Bodies.rectangle(width + 25, -height, 50, height * 6, { isStatic: true })
    ];
    Composite.add(engine.world, boundaries);
    for (const entry of entries) if (entry.body) {
      Body.setPosition(entry.body, {
        x: Math.max(entry.size, Math.min(width - entry.size, entry.body.position.x * width / oldWidth)),
        y: Math.min(height - entry.size / 2, entry.body.position.y + height - oldHeight)
      });
      Sleeping.set(entry.body, false);
    }
    wake();
  }

  function createEntry(char, index) {
    if (/^\s+$/u.test(char)) return { char, body: null };
    // Capture the rendered editor font at birth in zoom-independent world units.
    // Existing entries keep this snapshot when the user changes zoom later.
    const textStyle = getComputedStyle(input);
    const pageScale = (devicePixelRatio || 1) / initialPixelRatio;
    const pinchScale = viewport?.scale || 1;
    const size = parseFloat(textStyle.fontSize) * pageScale * pinchScale;
    const font = `${textStyle.fontStyle} ${textStyle.fontWeight} ${size}px ${textStyle.fontFamily}`;
    context.font = font;
    const glyphWidth = Math.max(size * .52, context.measureText(char).width);
    const x = size + Math.random() * Math.max(1, width - size * 2);
    const y = -size - Math.floor(index / Math.max(1, Math.floor(width / (size * 2)))) * size * 2;
    const body = Bodies.rectangle(x, y, glyphWidth + 3, size + 2, {
      restitution: .32, friction: .72, frictionStatic: .9, frictionAir: .007,
      density: .002, sleepThreshold: 70, chamfer: { radius: 2 }
    });
    Body.setAngle(body, (Math.random() - .5) * .55);
    Body.setVelocity(body, { x: (Math.random() - .5) * 2, y: 1 + Math.random() });
    Body.setAngularVelocity(body, (Math.random() - .5) * .05);
    Composite.add(engine.world, body);
    return { char, body, size, font, area: body.area, hue: Math.random() * 360 };
  }

  function burst(x, y, count) {
    if (motion.matches) return;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2, speed = 75 + Math.random() * 210;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 130,
        life: .65 + Math.random() * .65, maxLife: 1.3, angle, spin: (Math.random() - .5) * 14,
        color: colors[Math.floor(Math.random() * colors.length)], size: 3 + Math.random() * 4 });
    }
    if (particles.length > 1200) particles.splice(0, particles.length - 1200);
  }

  let selection = null;
  input.addEventListener('beforeinput', event => {
    if (!composition) selection = { start: input.selectionStart, end: input.selectionEnd, type: event.inputType };
  });
  function sync() {
    if (composition) return;
    const next = split(input.value);
    let start = 0;
    // Use the original selection to disambiguate deleting or inserting repeated characters.
    let limit = selection ? split(previous.join('').slice(0, selection.start)).length : Math.min(previous.length, next.length);
    if (selection?.type === 'deleteContentBackward' && selection.start === selection.end) {
      limit = Math.max(0, limit - Math.max(0, previous.length - next.length));
    }
    if (selection?.type === 'historyUndo' || selection?.type === 'historyRedo') limit = Math.min(previous.length, next.length);
    while (start < limit && start < next.length && previous[start] === next[start]) start++;
    let oldEnd = previous.length, newEnd = next.length;
    while (oldEnd > start && newEnd > start && previous[oldEnd - 1] === next[newEnd - 1]) { oldEnd--; newEnd--; }
    const removed = entries.slice(start, oldEnd);
    const burstCount = Math.max(2, Math.min(22, Math.floor(900 / Math.max(1, removed.length))));
    let deletedVisible = false;
    for (const entry of removed) if (entry.body) {
      deletedVisible = true;
      burst(Math.max(10, Math.min(width - 10, entry.body.position.x)), Math.max(20, Math.min(height - 12, entry.body.position.y)), burstCount);
      Composite.remove(engine.world, entry.body);
    }
    if (removed.length && !deletedVisible) {
      const cursor = document.querySelector('#caret').getBoundingClientRect();
      const rect = layer.getBoundingClientRect();
      burst((cursor.left - rect.left) * width / rect.width, (cursor.top - rect.top) * height / rect.height, 16);
    }
    if (removed.length) {
      pop();
      entries.forEach(entry => { if (entry.body) Sleeping.set(entry.body, false); });
    }
    const added = next.slice(start, newEnd).map(createEntry);
    entries.splice(start, oldEnd - start, ...added);
    previous = next; selection = null;
    wake();
  }
  input.addEventListener('compositionstart', () => {
    selection = { start: input.selectionStart, end: input.selectionEnd, type: 'insertCompositionText' };
    composition = true;
  });
  input.addEventListener('compositionend', () => { composition = false; sync(); });
  input.addEventListener('input', sync);

  function paint(dt) {
    context.clearRect(0, 0, width, height);
    context.textAlign = 'center'; context.textBaseline = 'middle';
    for (const entry of entries) if (entry.body) {
      const body = entry.body;
      if (body.position.y < -entry.size || body.position.y > height + entry.size) continue;
      context.save();
      context.translate(body.position.x, body.position.y); context.rotate(body.angle);
      context.font = entry.font;
      context.fillStyle = `hsla(${entry.hue}, 58%, 86%, .64)`;
      context.fillText(entry.char, 0, 0); context.restore();
    }
    particles = particles.filter(particle => particle.life > 0);
    for (const p of particles) {
      p.life -= dt; p.vy += 420 * dt; p.vx *= Math.exp(-1.1 * dt);
      p.x += p.vx * dt; p.y += p.vy * dt; p.angle += p.spin * dt;
      context.save(); context.translate(p.x, p.y); context.rotate(p.angle);
      context.globalAlpha = Math.min(1, Math.max(0, p.life * 2)); context.fillStyle = p.color;
      context.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); context.restore();
    }
  }
  function tick(now) {
    frame = 0;
    if (document.hidden) { last = 0; return; }
    const dt = last ? Math.min((now - last) / 1000, .05) : 1 / 60;
    last = now; accumulator += dt;
    while (accumulator >= 1 / 60) { Engine.update(engine, 1000 / 60); accumulator -= 1 / 60; }
    paint(dt);
    if (particles.length || entries.some(entry => entry.body && !entry.body.isSleeping)) frame = requestAnimationFrame(tick);
    else { last = 0; accumulator = 0; }
  }
  function wake() { if (!frame && !document.hidden) { last = 0; frame = requestAnimationFrame(tick); } }
  window.CypeLetters = {
    modeSound() {
      unlockAudio();
      if (!audio || audio.state !== 'running') return;
      const now = Math.max(audio.currentTime, quietUntil);
      const tone = audio.createOscillator(), gain = audio.createGain();
      tone.type = 'sine'; tone.frequency.setValueAtTime(1850, now);
      gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(.09, now + .004); gain.gain.exponentialRampToValueAtTime(.0001, now + .28);
      tone.connect(gain); gain.connect(audio.destination); tone.start(now); tone.stop(now + .3);
      tone.onended = () => {tone.disconnect(); gain.disconnect();};
    },
    completionSound() {
      unlockAudio();
      if (!audio || audio.state !== 'running') return Promise.resolve();
      const now = Math.max(audio.currentTime, lastPop + .11);
      quietUntil = now + .8;
      const tones = [];
      function voice(start, duration, from, to, volume) {
        const tone = audio.createOscillator(), gain = audio.createGain();
        tone.type = 'sine'; tone.frequency.setValueAtTime(from, start); tone.frequency.exponentialRampToValueAtTime(to, start + duration * .55);
        gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(volume, start + .008); gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
        tone.connect(gain); gain.connect(audio.destination); tone.start(start); tone.stop(start + duration); tones.push(tone);
        tone.onended = () => {tone.disconnect(); gain.disconnect();};
      }
      voice(now, .2, 720, 180, .12);
      voice(now + .21, .55, 1050, 1700, .1);
      voice(now + .21, .5, 2100, 2550, .035);
      return new Promise(resolve => {
        const wait = () => {
          if (audio.state !== 'running' || audio.currentTime >= quietUntil) {resolve(); return;}
          setTimeout(wait, Math.max(20, (quietUntil - audio.currentTime) * 1000));
        };
        setTimeout(wait, Math.max(0, (quietUntil - audio.currentTime) * 1000));
      });
    },
    celebrateAt(rect, milestones = 1) {
      const canvasRect = layer.getBoundingClientRect();
      if (!canvasRect.width || !canvasRect.height) return;
      const x = (rect.left + rect.width / 2 - canvasRect.left) * width / canvasRect.width;
      const y = (rect.top + rect.height / 2 - canvasRect.top) * height / canvasRect.height;
      burst(x, y, Math.min(80, 28 + Math.max(0, milestones - 1) * 8)); wake();
    },
    capture() { return { entries: entries.slice(), width, height }; },
    restore(scene, text) {
      clearEpoch++;
      entries.forEach(entry => { if (entry.body) Composite.remove(engine.world, entry.body); });
      Engine.clear(engine);
      entries = scene?.entries?.slice() || [];
      if (scene && (scene.width !== width || scene.height !== height)) {
        for (const entry of entries) if (entry.body) {
          Body.setPosition(entry.body, { x: Math.max(entry.size / 2, Math.min(width - entry.size / 2, entry.body.position.x * width / scene.width)), y: Math.min(height - entry.size / 2, entry.body.position.y + height - scene.height) });
          Sleeping.set(entry.body, false);
        }
      }
      entries.forEach(entry => { if (entry.body) Composite.add(engine.world, entry.body); });
      particles = []; previous = split(text); selection = null; composition = false;
      input.value = text; paint(0); wake();
    },
    metrics(target) {
      const style = getComputedStyle(input);
      const size = parseFloat(style.fontSize) * (devicePixelRatio || 1) / initialPixelRatio * (viewport?.scale || 1);
      context.font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
      const futureArea = (context.measureText('文').width + 3) * (size + 2);
      const visible = entries.filter(entry => entry.size);
      const writtenArea = visible.reduce((sum, entry) => sum + (entry.area || entry.body?.area || futureArea), 0);
      const estimatedHeight = (writtenArea + Math.max(0, target - visible.length) * futureArea) / (width * .7);
      return { width, height, rect: layer.getBoundingClientRect(), pileHeight: Math.min(height - 48, Math.max(size, estimatedHeight)) };
    },
    clearTopDown() {
      const epoch = ++clearEpoch;
      const total = entries.filter(entry => entry.body).length;
      const batch = Math.max(1, Math.ceil(total / 40));
      return new Promise(resolve => {
        function step() {
          if (epoch !== clearEpoch) { resolve(false); return; }
          const remaining = entries.filter(entry => entry.body).sort((a, b) => a.body.position.y - b.body.position.y);
          if (!remaining.length) { resolve(true); return; }
          for (const entry of remaining.slice(0, batch)) {
            burst(Math.max(10, Math.min(width - 10, entry.body.position.x)), Math.max(20, Math.min(height - 12, entry.body.position.y)), Math.max(3, Math.min(18, Math.floor(100 / batch))));
            Composite.remove(engine.world, entry.body); entry.body = null;
          }
          entries.forEach(entry => { if (entry.body) Sleeping.set(entry.body, false); });
          pop(); wake(); setTimeout(step, motion.matches ? 0 : 45);
        }
        step();
      });
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; last = 0; }
    else wake();
  });
  addEventListener('resize', resize);
  viewport?.addEventListener('resize', resize);
  viewport?.addEventListener('scroll', resize);
  resize();
  if (input.value) sync();
})();
