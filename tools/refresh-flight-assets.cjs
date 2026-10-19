'use strict';

// Development helper only: the checked-in HTML remains directly deployable.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
for (const name of ['flight.html', 'mission-asteroid-patrol.html', 'engine-lab.html']) {
const page = path.resolve(__dirname, '../experiments/', name);
const before = fs.readFileSync(page, 'utf8');
const after = before.replace(/(<(?:script|link)\b[^>]*\b(?:src|href)=")([^"?#]+)(?:\?([^"#]*))?("[^>]*>)/g,
  (match, prefix, asset, query, suffix) => {
    if (/^(?:[a-z]+:|\/\/)/i.test(asset) || !/\.(?:js|css)$/.test(asset)) return match;
    const file = path.resolve(path.dirname(page), asset);
    // Git may check text out with CRLF on Windows and LF on Linux. Normalize
    // only line endings, preserving all other bytes (including legacy encodings).
    const bytes = fs.readFileSync(file).toString('latin1').replace(/\r\n/g, '\n');
    const version = crypto.createHash('sha256').update(bytes, 'latin1').digest('hex').slice(0, 12);
    const params = new URLSearchParams(query);
    params.set('v', version);
    return prefix + asset + '?' + params.toString() + suffix;
  });
if (process.argv.includes('--check')) {
  if (before !== after) {
    console.error('Flight asset versions are stale. Run node tools/refresh-flight-assets.cjs and deploy the updated HTML with its assets.');
    process.exitCode = 1;
  } else console.log('Flight asset versions match their file contents.');
} else if (before !== after) {
  fs.writeFileSync(page, after);
  console.log('Updated flight asset versions. Deploy flight.html together with its assets.');
} else console.log('Flight asset versions already match.');

}
