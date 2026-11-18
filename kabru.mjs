const dialog = document.querySelector('#kabru-dialog');
const wheel = dialog.querySelector('.kabru-wheel');
const start = dialog.querySelector('#kabru-spin');
const back = dialog.querySelector('#kabru-back');
const result = dialog.querySelector('#kabru-result');

let spinning = false;

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

back.addEventListener('click', () => dialog.close());
dialog.addEventListener('cancel', event => {
  if (spinning) event.preventDefault();
});

export function openKabru(entries, onResult) {
  if (dialog.open || !entries.length) return;
  spinning = false;
  start.disabled = false;
  back.disabled = false;
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
  dialog.showModal();
  start.focus();

  start.onclick = () => {
    if (spinning) return;
    spinning = true;
    start.disabled = true;
    back.disabled = true;
    const audio = sound();
    const chosen = Math.floor(Math.random() * entries.length);
    const target = 7 * 360 - (chosen + .5) * step;
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 700 : 4200;
    let initialTime;
    let lastSlice = 0;

    function frame(time) {
      initialTime ??= time;
      const progress = Math.min(1, (time - initialTime) / duration);
      const rotation = target * (1 - (1 - progress) ** 3);
      wheel.style.setProperty('--rotation', `${rotation}deg`);
      const slice = Math.floor(rotation / step);
      if (slice !== lastSlice) audio.tick();
      lastSlice = slice;
      if (progress < 1) {
        requestAnimationFrame(frame);
        return;
      }
      audio.close();
      const winner = entries[chosen];
      const name = document.createElement('strong');
      name.textContent = winner.name;
      result.replaceChildren(name, document.createTextNode('الشرهة عليك!'));
      dialog.classList.add('celebrating');
      onResult(winner.index);
      setTimeout(() => {
        spinning = false;
        dialog.close();
        document.querySelector('#penalty-team')?.focus();
      }, 2000);
    }

    requestAnimationFrame(frame);
  };
}
