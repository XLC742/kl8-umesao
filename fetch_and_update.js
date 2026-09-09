const https = require('https');
const http = require('http');
const fs = require('fs');

// 使用多个数据源，避免单一源被拦截
const SOURCES = [
  {
    name: 'cwl-direct',
    hostname: 'www.cwl.gov.cn',
    path: '/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=kl8&issueCount=32&pageNo=1&pageSize=32&systemType=PC',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.cwl.gov.cn/ygkj/wqkjgg/kl8/',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'X-Requested-With': 'XMLHttpRequest'
    },
    parse: (data) => JSON.parse(data).result
  },
  {
    name: 'cwl-corsproxy',
    hostname: 'corsproxy.io',
    path: '/?url=https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=kl8%26issueCount=32%26pageNo=1%26pageSize=32%26systemType=PC',
    headers: { 'User-Agent': 'Mozilla/5.0' },
    parse: (data) => JSON.parse(data).result
  },
  {
    name: 'cwl-allorigins',
    hostname: 'api.allorigins.win',
    path: '/raw?url=' + encodeURIComponent('https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=kl8&issueCount=32&pageNo=1&pageSize=32&systemType=PC'),
    headers: { 'User-Agent': 'Mozilla/5.0' },
    parse: (data) => JSON.parse(data).result
  }
];

function fetchFromSource(source) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: source.hostname,
      path: source.path,
      headers: source.headers || {},
      timeout: 20000
    };

    const client = source.hostname.startsWith('https') ? https : (source.hostname.includes('http://') ? http : https);
    if (source.hostname.startsWith('http://')) {
      const url = new URL(source.hostname + source.path);
      options.hostname = url.hostname;
      options.path = url.pathname + url.search;
    }

    const req = client.get(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const results = source.parse(data);
          if (results && results.length > 0) {
            resolve(results);
          } else {
            reject(new Error('No results'));
          }
        } catch(e) {
          reject(new Error('Parse failed: ' + data.substring(0, 80)));
        }
      });
    });

    req.on('error', e => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function main() {
  let results = null;

  for (const source of SOURCES) {
    for (let i = 0; i < 2; i++) {
      try {
        console.log(`Trying ${source.name} (attempt ${i + 1})...`);
        results = await fetchFromSource(source);
        console.log(`Success with ${source.name}! Latest:`, results[0].code, results[0].date);
        break;
      } catch(e) {
        console.log(`${source.name} failed:`, e.message);
        if (i < 1) await new Promise(r => setTimeout(r, 2000));
      }
    }
    if (results) break;
  }

  if (!results) {
    console.log('ERROR: All sources failed');
    process.exit(1);
  }

  const draws = results.map(d => ({
    period: d.code,
    date: d.date,
    nums: d.red.split(',').map(n => parseInt(n))
  }));

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
  console.log('Updated index.html to period', draws[0].period);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
