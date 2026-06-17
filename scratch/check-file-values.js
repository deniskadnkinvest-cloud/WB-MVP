import fs from 'fs';
const content = fs.readFileSync('.env.vercel.prod', 'utf8');
console.log('File length:', content.length);
const lines = content.split('\n');
for (const line of lines) {
  if (line.includes('=')) {
    const parts = line.split('=');
    const key = parts[0];
    const val = parts.slice(1).join('=').trim();
    console.log(`${key}: length = ${val.length}, is_empty_quotes = ${val === '""'}, is_empty = ${val === ''}`);
  }
}
