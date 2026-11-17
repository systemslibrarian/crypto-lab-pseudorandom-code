import './style.css';
import { renderChoosePanel } from './ui/choosePanel.js';
import { renderDetectPanel } from './ui/detectPanel.js';
import { renderKeyBar } from './ui/keyBar.js';
import { renderKeysPanel } from './ui/keysPanel.js';
import { renderRandomnessPanel } from './ui/randomnessPanel.js';
import { renderRobustPanel } from './ui/robustPanel.js';
import { renderWeakPanel } from './ui/weakPanel.js';
import { store } from './ui/store.js';
import { publishKey } from './ui/testHook.js';

type PanelKey = 'keys' | 'detect' | 'robust' | 'randomness' | 'weak' | 'choose';

const renderers: Record<PanelKey, (root: HTMLElement) => void> = {
  keys: renderKeysPanel,
  detect: renderDetectPanel,
  robust: renderRobustPanel,
  randomness: renderRandomnessPanel,
  weak: renderWeakPanel,
  choose: renderChoosePanel,
};

const rendered = new Set<PanelKey>();

function panelEl(key: PanelKey): HTMLElement {
  return document.getElementById(`panel-${key}`) as HTMLElement;
}

function ensureRendered(key: PanelKey): void {
  if (rendered.has(key)) return;
  renderers[key](panelEl(key));
  rendered.add(key);
}

function selectTab(key: PanelKey): void {
  for (const tab of Array.from(document.querySelectorAll<HTMLButtonElement>('.tab-btn'))) {
    const isActive = tab.dataset.panel === key;
    tab.setAttribute('aria-selected', String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
    tab.classList.toggle('active', isActive);
    panelEl(tab.dataset.panel as PanelKey).hidden = !isActive;
  }
  ensureRendered(key);
}

function wireTabs(): void {
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab-btn'));
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.panel as PanelKey));
    // Roving-tabindex arrow-key navigation across the tablist (WAI-ARIA pattern).
    tab.addEventListener('keydown', (event) => {
      let next = -1;
      if (event.key === 'ArrowRight') next = (i + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      if (next >= 0) {
        event.preventDefault();
        tabs[next].focus();
        selectTab(tabs[next].dataset.panel as PanelKey);
      }
    });
  });
}

// The claims suite reads the arrays the page rendered from; see ui/testHook.ts
// for why that seam exists and why the public and secret halves are separate.
store.subscribe((state) => {
  if (state.key !== null) publishKey(state.key);
});

renderKeyBar(document.getElementById('key-bar') as HTMLElement);
wireTabs();
selectTab('keys');

// The first key. Everything on the page waits on this one promise: the exhibits
// render a "generating" state until it lands, and a failure renders the reason
// rather than an empty panel.
void store.regenerate();
