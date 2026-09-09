const https = require('https');
const fs = require('fs');

const API_ID = '10020843';
const API_KEY = '9ef99297f8226eb6bb82cf2d336972ab';
const API_URL = 'https://cn.apihz.cn/api/caipiao/kuaile8.php';
const COUNT = 32;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchOne(qihao) {
  const params = `?id=${API_ID}&key=${API_KEY}` + (qihao ? `&qh=${qihao}` : '');
  const url = API_URL + params;
  return new Promise((resolve) => {
    https.get(url, { timeout: 15000 }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.code === 200) resolve(json);
          else resolve(null);
        } catch(e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

function prevQihao(qihao) {
  const year = parseInt(qihao.substring(0, 4));
  let num = parseInt(qihao.substring(4));
  num--;
  if (num <= 0) return null;
  return year + String(num).padStart(3, '0');
}

async function main() {
  console.log('Fetching latest period...');
  const latest = await fetchOne(null);
  if (!latest) {
    console.log('ERROR: Cannot fetch latest');
    process.exit(1);
  }
  console.log('Latest:', latest.qihao, latest.time);

  const draws = [{
    period: latest.qihao,
    date: latest.time,
    nums: latest.number.split('|').map(n => parseInt(n))
  }];

  let qihao = latest.qihao;
  for (let i = 1; i < COUNT; i++) {
    qihao = prevQihao(qihao);
    if (!qihao) break;

    // 每10次等7秒（避免超过频率限制10次/分钟）
    if (i % 10 === 0) {
      console.log(`Rate limit wait after ${i}...`);
      await sleep(7000);
    }

    const r = await fetchOne(qihao);
    if (r) {
      draws.push({
        period: r.qihao,
        date: r.time,
        nums: r.number.split('|').map(n => parseInt(n))
      });
      if (i % 5 === 0) console.log(`Got ${i}/${COUNT - 1}:`, r.qihao);
    } else {
      console.log('Missing period:', qihao);
    }
  }

  console.log(`Total fetched: ${draws.length}`);

  const htmlPath = 'index.html';
  let html = fs.readFileSync(htmlPath, 'utf8');

  const startMarker = 'const draws = [';
  const endMarker = '];';
  const startIdx = html.indexOf(startMarker);
  const endIdx = html.indexOf(endMarker, startIdx) + endMarker.length;

  if (startIdx === -1) {
    console.log('ERROR: draws array not found');
    process.exit(1);
  }

  const newDrawsBlock = 'const draws = [\n' + draws.map(d =>
    '  {period:"' + d.period + '",date:"' + d.date + '",nums:[' + d.nums.join(',') + ']}'
  ).join(',\n') + '\n];';

  html = html.slice(0, startIdx) + newDrawsBlock + html.slice(endIdx);
  html = html.replace(/id="infoPeriod">[^<]*/, 'id="infoPeriod">' + draws[0].period);
  html = html.replace(/id="infoDate">[^<]*/, 'id="infoDate">' + draws[0].date);

  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log('Updated to period', draws[0].period);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
