'use strict';

// Development helper only: the checked-in HTML remains directly deployable.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const page = path.resolve(__dirname, '../experiments/flight.html');
const before = fs.readFileSync(page, 'utf8');
const after = before.replace(/(<(?:script|link)\b[^>]*\b(?:src|href)=")([^"?#]+)(?:\?([^"#]*))?("[^>]*>)/g,
  (match, prefix, asset, query, suffix) => {
    if (/^(?:[a-z]+:|\/\/)/i.test(asset) || !/\.(?:js|css)$/.test(asset)) return match;
    const file = path.resolve(path.dirname(page), asset);
    const version = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 12);
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
