const https = require('https');
const fs = require('fs');

const API_PATH = '/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=kl8&issueCount=32&pageNo=1&pageSize=32&systemType=PC';

const options = {
  hostname: 'www.cwl.gov.cn',
  path: API_PATH,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://www.cwl.gov.cn/ygkj/wqkjgg/kl8/',
    'Accept': 'application/json'
  }
};

https.get(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const results = JSON.parse(data).result;
      if (!results || results.length === 0) {
        console.log('ERROR: No results');
        process.exit(1);
      }

      const draws = results.map(d => ({
        period: d.code,
        date: d.date,
        nums: d.red.split(',').map(n => parseInt(n))
      }));

      console.log('Fetched latest period:', draws[0].period, draws[0].date);

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
    } catch(e) {
      console.log('ERROR:', e.message);
      process.exit(1);
    }
  });
}).on('error', e => {
  console.log('ERROR:', e.message);
  process.exit(1);
});
