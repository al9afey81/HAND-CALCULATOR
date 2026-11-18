const version = document.querySelector('meta[name="calculator-version"]').content;
const checkButton = document.querySelector('#check-update');
const applyButton = document.querySelector('#apply-update');
const banner = document.querySelector('#update-banner');
const notice = document.querySelector('#notice');
let available;
let checking;
let noticeTimer;

function isNewer(candidate) {
  if (!/^\d+\.\d+\.\d+$/.test(candidate)) return false;
  const current = version.split('.').map(Number);
  const next = candidate.split('.').map(Number);
  const difference = next.findIndex((part, index) => part !== current[index]);
  return difference !== -1 && next[difference] > current[difference];
}

function freshURL() {
  const url = new URL(window.location.href);
  url.searchParams.set('_update', String(Date.now()));
  return url;
}

async function discoverUpdate() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let html;
  try {
    const response = await fetch(freshURL(), { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('Update request failed');
    html = await response.text();
  } finally {
    clearTimeout(timeout);
  }
  const page = new DOMParser().parseFromString(html, 'text/html');
  const candidate = page.querySelector('meta[name="calculator-version"]')?.content;
  if (!candidate) throw new Error('Release version is missing');
  available = isNewer(candidate) ? candidate : undefined;
  banner.hidden = !available;
  return available;
}

function check() {
  checking ??= discoverUpdate().finally(() => { checking = undefined; });
  return checking;
}

function report(message) {
  notice.textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    if (notice.textContent === message) notice.textContent = '';
  }, 4500);
}

async function updateNow() {
  checkButton.disabled = true;
  applyButton.disabled = true;
  try {
    if (await check()) {
      window.location.replace(freshURL());
      return;
    }
    report('الحاسبة محدّثة.');
  } catch {
    report('تعذر التحقق من التحديث. حاول مرة أخرى عند توفر الاتصال.');
  }
  checkButton.disabled = false;
  applyButton.disabled = false;
}

function checkSilently() {
  check().catch(() => {});
}

checkButton.hidden = false;
checkButton.addEventListener('click', updateNow);
applyButton.addEventListener('click', updateNow);
window.addEventListener('pageshow', checkSilently);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkSilently();
});
checkSilently();
