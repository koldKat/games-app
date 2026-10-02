import { $$, copyrightYear } from '../core/dom.js';
import { GITHUB_URL, COPYRIGHT_START_YEAR } from '../core/site-config.js';
import { DECORATIVE_COVER_SLOT_MAX } from '../core/ui-policy.js';
import { mountThemedNumberSteppers } from '../ui-helpers/number-steppers.js';
import { mountThemedSearchClears } from '../ui-helpers/search-clears.js';

function mountDecorativeCoverSlots() {
  $$('[data-cover-slots]').forEach(field => {
    const count = Math.max(0, Math.min(DECORATIVE_COVER_SLOT_MAX, Number(field.dataset.coverSlots) || 0));
    const elementName = field.dataset.coverElement || 'i'; const baseClass = field.dataset.coverClass || '';
    field.replaceChildren(...Array.from({ length: count }, (_, index) => {
      const element = document.createElement(elementName);
      if (baseClass) element.className = `${baseClass} ${baseClass}-${index + 1}`;
      return element;
    }));
  });
  $$('[data-cover-decoration]').forEach(host => {
    const element = document.createElement('i'); element.className = host.dataset.coverDecoration;
    element.setAttribute('aria-hidden', 'true'); host.append(element);
  });
}

export function initializeBootShell() {
  $$('[data-repo-link]').forEach(element => { element.href = GITHUB_URL; });
  $$('[data-copyright-year]').forEach(element => {
    element.textContent = copyrightYear > COPYRIGHT_START_YEAR ? `© ${COPYRIGHT_START_YEAR}-${copyrightYear}` : `© ${COPYRIGHT_START_YEAR}`;
  });
  mountDecorativeCoverSlots();
  mountThemedNumberSteppers();
  mountThemedSearchClears();
}
