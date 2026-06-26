const fs = require('fs');

const clean = fs.readFileSync('src/App.jsx', 'utf8'); // currently 63d332fe (clean)
const bad = fs.readFileSync('App_bad.jsx', 'utf8');

function extractTextNodes(code) {
  let nodes = [];
  const regex = /(['"\`])(.*?)\1|>([^<]+)</g;
  let match;
  while ((match = regex.exec(code)) !== null) {
    let text = match[2] !== undefined ? match[2] : match[3];
    nodes.push(text);
  }
  return nodes;
}

const cleanNodes = extractTextNodes(clean).filter(t => /[А-Яа-яЁё]/.test(t));
const badNodes = extractTextNodes(bad).filter(t => /[Р][^\x00-\x7F]/.test(t));

console.log('Clean count:', cleanNodes.length);
console.log('Bad count:', badNodes.length);
