function controlLabel(input) {
  return input.getAttribute('aria-label') || input.closest('label')?.querySelector(':scope > span')?.textContent?.trim() || 'Number';
}

function step(input, direction) {
  const before = input.value;
  try {
    if (direction < 0) input.stepDown();
    else input.stepUp();
  } catch {
    return;
  }
  if (input.value !== before) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function button(input, direction) {
  const element = document.createElement('button');
  const label = controlLabel(input);
  element.type = 'button';
  element.className = 'number-stepper-button';
  element.textContent = direction < 0 ? '−' : '+';
  element.setAttribute('aria-label', `${direction < 0 ? 'Decrease' : 'Increase'} ${label}`);
  element.addEventListener('click', () => step(input, direction));
  return element;
}

export function mountThemedNumberSteppers(root = document) {
  root.querySelectorAll('input[type="number"]:not([data-themed-stepper])').forEach(input => {
    if (input.hidden || input.closest('[hidden]')) return;
    input.dataset.themedStepper = 'true';
    // A real block wrapper is deliberate: form labels and legacy grid rules can
    // otherwise turn inline spans into three stacked controls.
    const wrapper = document.createElement('div'); wrapper.className = 'number-stepper';
    input.before(wrapper); wrapper.append(button(input, -1), input, button(input, 1));
  });
}
