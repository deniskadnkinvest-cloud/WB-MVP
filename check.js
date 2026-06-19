const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const html = fs.readFileSync('./dist/index.html', 'utf8');

const dom = new JSDOM(html, {
  url: 'http://localhost/',
  runScripts: 'dangerously',
  resources: 'usable'
});

dom.window.console.log = function(...args) { console.log('[LOG]', ...args); };
dom.window.console.error = function(...args) { console.error('[ERROR]', ...args); };
dom.window.addEventListener('error', event => {
  console.error('[UNCAUGHT ERROR]', event.error);
});

setTimeout(() => {
  console.log('Done waiting.');
}, 3000);
