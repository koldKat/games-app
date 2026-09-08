function clearLabel(input) {
  return input.getAttribute('aria-label') || input.placeholder || 'search';
}

export function syncSearchClears(root = document) {
  root.querySelectorAll('.themed-search-field').forEach(field => {
    const input = field.querySelector('input');
    const button = field.querySelector('.themed-search-clear');
    if (input && button) button.hidden = !input.value;
  });
}

export function mountThemedSearchClears(root = document) {
  root.querySelectorAll('input[type="search"]:not([data-themed-search-clear])').forEach(input => {
    if (input.hidden) return;
    input.dataset.themedSearchClear = 'true';

    const field = document.createElement('div');
    field.className = 'themed-search-field';
    input.before(field); field.append(input);

    const clear = document.createElement('button');
    clear.type = 'button'; clear.className = 'themed-search-clear'; clear.textContent = '×';
    clear.setAttribute('aria-label', `Clear ${clearLabel(input)}`);
    field.append(clear);

    const sync = () => { clear.hidden = !input.value; };
    clear.addEventListener('click', () => {
      if (!input.value) return;
      input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus();
    });
    input.addEventListener('input', sync); sync();
  });
}
