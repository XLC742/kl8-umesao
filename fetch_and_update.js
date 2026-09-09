const https = require('https');
const fs = require('fs');

const API_PATH = '/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=kl8&issueCount=32&pageNo=1&pageSize=32&systemType=PC';

function fetchData() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.cwl.gov.cn',
      path: API_PATH,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.cwl.gov.cn/ygkj/wqkjgg/kl8/',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'X-Requested-With': 'XMLHttpRequest'
      },
      timeout: 30000
    };

    const req = https.get(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.result && json.result.length > 0) {
            resolve(json.result);
          } else {
            reject(new Error('No results in response: ' + data.substring(0, 100)));
          }
        } catch(e) {
          reject(new Error('JSON parse failed: ' + data.substring(0, 100)));
        }
      });
    });

    req.on('error', e => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

async function main() {
  let results = null;
  
  // 最多重试5次，每次间隔3秒
  for (let i = 0; i < 5; i++) {
    try {
      console.log(`Attempt ${i + 1}...`);
      results = await fetchData();
      console.log('Success! Latest period:', results[0].code, results[0].date);
      break;
    } catch(e) {
      console.log(`Attempt ${i + 1} failed:`, e.message);
      if (i < 4) {
        console.log('Waiting 3 seconds before retry...');
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  if (!results) {
    console.log('ERROR: All attempts failed');
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
