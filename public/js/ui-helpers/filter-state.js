export function syncFilterSelectStates(root = document) {
  root.querySelectorAll('select[data-content-filter]').forEach(select => {
    const active = select.value !== (select.dataset.filterDefault || '');
    const label = select.closest('label');
    select.classList.toggle('is-filtering', active);
    label?.classList.toggle('has-active-filter', active);
    if (select.dataset.filterColor === 'pegi' && active) label.dataset.filterTone = select.value;
    else if (label) delete label.dataset.filterTone;
  });
}

export function bindFilterSelectStates(root = document) {
  syncFilterSelectStates(root);
  root.querySelectorAll('select[data-content-filter]').forEach(select => {
    if (select.dataset.filterStateBound === 'true') return;
    select.dataset.filterStateBound = 'true';
    select.addEventListener('change', () => syncFilterSelectStates(root));
  });
}
