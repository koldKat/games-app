import { initializeApp } from './js/boot/init.js';

Promise.resolve().then(initializeApp).catch(() => globalThis.appStartup?.fail());
