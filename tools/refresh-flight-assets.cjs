'use strict';
// Compatibility entry point; versions the entire deployable site.
const { refresh } = require('./refresh-site-assets.cjs');
refresh(require('node:path').resolve(__dirname, '..'), process.argv.includes('--check'));
