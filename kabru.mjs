const dialog = document.querySelector('#kabru-dialog');
const wheel = dialog.querySelector('.kabru-wheel');
const start = dialog.querySelector('#kabru-spin');
const back = dialog.querySelector('#kabru-back');
const result = dialog.querySelector('#kabru-result');

let spinning = false;
let viewedDraw;
let animation;
const resultDuration = 2000;

dialog.addEventListener('keydown', event => {
  if (event.key === 'Escape' && (back.hidden || spinning)) event.preventDefault();
});

dialog.addEventListener('cancel', event => {
  event.preventDefault();
  if (!back.hidden && !spinning) back.click();
});

function sound() {
  let context;
  try {
    const Audio = window.AudioContext ?? window.webkitAudioContext;
    context = new Audio();
    context.resume().catch(() => {});
  } catch {
    return { tick() {}, close() {} };
  }
  return {
    tick() {
      if (context.state !== 'running') return;
      const time = context.currentTime;
      const tone = context.createOscillator();
      const volume = context.createGain();
      tone.type = 'triangle';
      tone.frequency.setValueAtTime(950, time);
      tone.frequency.exponentialRampToValueAtTime(360, time + .035);
      volume.gain.setValueAtTime(.09, time);
      volume.gain.exponentialRampToValueAtTime(.001, time + .045);
      tone.connect(volume).connect(context.destination);
      tone.start(time);
      tone.stop(time + .05);
    },
    close() { context.close().catch(() => {}); },
  };
}

function showWheel(entries, watching) {
  start.hidden = back.hidden = watching;
  dialog.setAttribute('closedby', watching ? 'none' : 'closerequest');
  start.disabled = back.disabled = false;
  result.replaceChildren();
  dialog.classList.remove('celebrating');
  wheel.replaceChildren();
  wheel.style.removeProperty('--rotation');
  const step = 360 / entries.length;
  const colors = entries.map((_, index) =>
    `${index % 2 ? '#efca7a' : '#11563e'} ${index * step}deg ${(index + 1) * step}deg`);
  const divider = entries.length > 1
    ? `repeating-conic-gradient(#d9ae5d 0deg 1deg, transparent 1deg ${step}deg), `
    : '';
  wheel.style.background = `${divider}conic-gradient(${colors.join(', ')})`;
  wheel.parentElement.setAttribute('aria-label', `عجلة القرعة · ${entries.map(entry => entry.name).join('، ')}`);
  entries.forEach(({ name }, index) => {
    const angle = (index + .5) * step * Math.PI / 180;
    const label = document.createElement('span');
    label.className = 'kabru-name';
    label.style.left = `${50 + 32 * Math.sin(angle)}%`;
    label.style.top = `${50 - 32 * Math.cos(angle)}%`;
    label.dataset.gold = String(index % 2 === 1);
    label.dir = 'auto';
    label.textContent = name;
    wheel.append(label);
  });
  if (!dialog.open) dialog.showModal();
}

function animate(entries, draw, now, audio, onResult, onClose) {
  const { chosen, startsAt, duration } = draw;
  const step = 360 / entries.length;
  const target = 7 * 360 - (chosen + .5) * step;
  let lastSlice = 0;
  let finished = false;

  function frame() {
    const elapsed = now() - startsAt;
    if (elapsed >= duration + resultDuration && finished) {
      animation = undefined;
      onClose();
      return;
    }
    if (!finished) {
      const progress = Math.max(0, Math.min(1, elapsed / duration));
      const rotation = target * (1 - (1 - progress) ** 3);
      wheel.style.setProperty('--rotation', `${rotation}deg`);
      const slice = Math.floor(rotation / step);
      if (slice !== lastSlice && progress < 1) audio?.tick();
      lastSlice = slice;
      if (progress === 1) {
        finished = true;
        audio?.close();
        const winner = entries[chosen];
        const name = document.createElement('strong');
        name.textContent = winner.name;
        result.replaceChildren(name, document.createTextNode('الشرهة عليك!'));
        dialog.classList.add('celebrating');
        onResult?.(winner.index);
      }
    }
    animation = requestAnimationFrame(frame);
  }

  frame();
}

export function openKabru(entries, onResult, onChange, now = Date.now) {
  if (dialog.open || !entries.length) return;
  spinning = false;
  const draw = { id: crypto.randomUUID(), positions: entries.map(entry => entry.index) };
  const close = () => {
    spinning = false;
    dialog.close();
    onChange?.(null);
  };
  showWheel(entries, false);
  onChange?.(draw);
  start.focus();

  back.onclick = close;
  start.onclick = () => {
    if (spinning) return;
    spinning = true;
    start.disabled = back.disabled = true;
    dialog.setAttribute('closedby', 'none');
    const audio = sound();
    const chosen = Math.floor(Math.random() * entries.length);
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 700 : 4200;
    const spin = { ...draw, chosen, duration, startsAt: Math.round(now()) + (onChange ? 800 : 0) };
    onChange?.(spin);
    animate(entries, spin, now, audio, onResult, () => {
      close();
      document.querySelector('#penalty-team')?.focus();
    });
  };
}

export function renderWatchedKabru(draw, names, now) {
  if (draw?.id === viewedDraw?.id && draw?.startsAt === viewedDraw?.startsAt) return;
  viewedDraw = draw;
  cancelAnimationFrame(animation);
  animation = undefined;
  if (!draw || (draw.startsAt !== undefined && now() >= draw.startsAt + draw.duration + resultDuration)) {
    if (dialog.open) dialog.close();
    return;
  }

  const entries = draw.positions.map(index => ({ index, name: names[index] }));
  showWheel(entries, true);
  if (draw.startsAt !== undefined) animate(entries, draw, now, null, null, () => dialog.close());
}
