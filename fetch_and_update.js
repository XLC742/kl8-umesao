const https = require('https');
const fs = require('fs');

const API_ID = '10020843';
const API_KEY = '9ef99297f8226eb6bb82cf2d336972ab';
const API_URL = 'https://cn.apihz.cn/api/caipiao/kuaile8.php';
const TOTAL = 32;

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
  // 读取现有的 index.html 里的数据作为基础
  let existingDraws = [];
  try {
    const html = fs.readFileSync('index.html', 'utf8');
    const m = html.match(/const draws = \[([\s\S]*?)\];/);
    if (m) existingDraws = eval('[' + m[1] + ']');
  } catch(e) {}

  console.log('Existing periods:', existingDraws.length, existingDraws[0] ? existingDraws[0].period : 'none');

  // 获取最新一期
  console.log('Fetching latest period...');
  const latest = await fetchOne(null);
  if (!latest) {
    console.log('ERROR: Cannot fetch latest, keeping existing data');
    // 即使获取失败也要更新 data.json（确保文件存在）
    if (existingDraws.length > 0) {
      const jsonData = JSON.stringify({ draws: existingDraws, updated: new Date().toISOString() }, null, 2);
      fs.writeFileSync('data.json', jsonData, 'utf8');
      console.log('data.json updated with existing data');
    }
    process.exit(0);
  }
  console.log('Latest:', latest.qihao, latest.time);

  const latestPeriod = latest.qihao;
  const existingLatest = existingDraws[0] ? existingDraws[0].period : '0';

  // 如果最新期号和已有一样，不用更新
  if (latestPeriod === existingLatest && existingDraws.length >= TOTAL) {
    console.log('Data is already up to date');
    const jsonData = JSON.stringify({ draws: existingDraws, updated: new Date().toISOString() }, null, 2);
    fs.writeFileSync('data.json', jsonData, 'utf8');
    console.log('data.json refreshed');
    process.exit(0);
  }

  // 增量获取：从最新期往回找，直到遇到已有的期号或者凑够TOTAL期
  const newDraws = [{
    period: latest.qihao,
    date: latest.time,
    nums: latest.number.split('|').map(n => parseInt(n))
  }];

  const existingMap = new Set(existingDraws.map(d => d.period));
  let qihao = latestPeriod;

  for (let i = 1; i < TOTAL; i++) {
    qihao = prevQihao(qihao);
    if (!qihao) break;

    // 如果这一期已经在已有数据里，用已有的
    if (existingMap.has(qihao)) {
      const existing = existingDraws.find(d => d.period === qihao);
      // 把已有数据里从这一期往后的都接上
      const remaining = existingDraws.filter(d => {
        const num = parseInt(d.period);
        return num <= parseInt(qihao);
      }).slice(0, TOTAL - newDraws.length);
      newDraws.push(...remaining);
      break;
    }

    // 否则从API获取（注意频率限制，每5次等一下）
    if (i % 5 === 0 && i > 0) {
      console.log('Rate limit wait...');
      await sleep(8000);
    }

    const r = await fetchOne(qihao);
    if (r) {
      newDraws.push({ period: r.qihao, date: r.time, nums: r.number.split('|').map(n => parseInt(n)) });
      console.log(`Got ${newDraws.length - 1}/${TOTAL - 1}:`, r.qihao);
    } else {
      console.log('Missing period:', qihao);
    }
  }

  console.log(`Total draws: ${newDraws.length}`);

  // 写 data.json
  const jsonData = JSON.stringify({ draws: newDraws, updated: new Date().toISOString() }, null, 2);
  fs.writeFileSync('data.json', jsonData, 'utf8');
  console.log('data.json saved');

  // 更新 index.html
  const htmlPath = 'index.html';
  let html = fs.readFileSync(htmlPath, 'utf8');

  const startMarker = 'const draws = [';
  const endMarker = '];';
  const startIdx = html.indexOf(startMarker);
  const endIdx = html.indexOf(endMarker, startIdx) + endMarker.length;

  const newDrawsBlock = 'const draws = [\n' + newDraws.map(d =>
    '  {period:"' + d.period + '",date:"' + d.date + '",nums:[' + d.nums.join(',') + ']}'
  ).join(',\n') + '\n];';

  html = html.slice(0, startIdx) + newDrawsBlock + html.slice(endIdx);
  html = html.replace(/id="infoPeriod">[^<]*/, 'id="infoPeriod">' + newDraws[0].period);
  html = html.replace(/id="infoDate">[^<]*/, 'id="infoDate">' + newDraws[0].date);

  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log('index.html updated to period', newDraws[0].period);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
