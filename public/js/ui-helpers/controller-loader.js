const CONTROLLER_MARKUP = `<svg class="library-loader-controller" viewBox="0 0 64 64" aria-hidden="true">
  <g class="library-loader-mark">
    <path class="loader-controller-body" d="M15 25c1-7 6-11 13-11h8c7 0 12 4 13 11l4 18c1 5-5 9-9 5l-7-7H27l-7 7c-4 4-10 0-9-5z"/>
    <path class="loader-control loader-dpad" d="M23.5 24v10M18.5 29h10"/>
    <circle class="loader-control loader-action-a" cx="41" cy="26" r="3"/>
    <circle class="loader-control loader-action-b" cx="46" cy="32" r="3"/>
  </g>
</svg>`;

export function controllerLoaderMarkup(label) {
  return `<div class="library-loader-inner">${CONTROLLER_MARKUP}<span>${label}</span></div>`;
}
