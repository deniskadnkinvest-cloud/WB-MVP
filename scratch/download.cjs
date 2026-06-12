const fs = require('fs');
const https = require('https');
const path = require('path');

const dir = path.join(__dirname, 'downloads');
if (!fs.existsSync(dir)) fs.mkdirSync(dir);

const files = {
  'mug.jpg': 'https://upload.wikimedia.org/wikipedia/commons/4/45/A_small_cup_of_coffee.JPG',
  'perfume.jpg': 'https://upload.wikimedia.org/wikipedia/commons/1/1a/Perfume_Bottle.jpg',
  'sneaker.jpg': 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Nike_Air_Max_90_Sneaker.jpg'
};

Promise.all(Object.entries(files).map(async ([name, url]) => {
  try {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(path.join(dir, name), Buffer.from(buffer));
    console.log(`Скачан: ${name}`);
  } catch (e) {
    console.error(`Ошибка при скачивании ${name}:`, e.message);
  }
})).then(() => console.log('Images downloaded!'));
