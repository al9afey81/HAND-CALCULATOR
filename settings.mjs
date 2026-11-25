export const SETTINGS_KEY = 'hind-calculator.settings.v1';
export const THEMES = Object.freeze({
  original: 'الأخضر والذهبي (الأصلي)',
  black: 'الأسود والذهبي',
  navy: 'الكحلي والفضي',
  burgundy: 'العنابي والذهبي',
  blue: 'الأزرق والأبيض',
  brown: 'البني والكريمي',
});

export const DEFAULT_SETTINGS = Object.freeze({
  name: 'النخبة', theme: 'original', baseRounds: 5, jokers: 3, penaltyEnabled: true,
});

export function normalizeBrand(value) {
  const name = typeof value?.name === 'string' ? value.name.trim().slice(0, 40) : '';
  return {
    name: name || DEFAULT_SETTINGS.name,
    theme: Object.hasOwn(THEMES, value?.theme) ? value.theme : DEFAULT_SETTINGS.theme,
  };
}

export function normalizeSettings(value) {
  return {
    ...normalizeBrand(value),
    baseRounds: value?.baseRounds === 7 ? 7 : 5,
    jokers: value?.jokers === 2 ? 2 : 3,
    penaltyEnabled: value?.penaltyEnabled !== false,
  };
}

export function loadSettings(storage) {
  try {
    return normalizeSettings(JSON.parse(storage.getItem(SETTINGS_KEY)));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage, value) {
  const settings = normalizeSettings(value);
  storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  return settings;
}

export function matchRules({ baseRounds, jokers, penaltyEnabled }) {
  return { baseRounds, jokers, penaltyEnabled };
}
