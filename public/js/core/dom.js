

export const $ = selector => document.querySelector(selector);
export const $$ = selector => [...document.querySelectorAll(selector)];
export const selectedCopyIds = new Set();
export const copyrightYear = new Date().getFullYear();
