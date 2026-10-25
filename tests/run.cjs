'use strict';

const runner = require('./helpers/runner.cjs');
module.exports = runner;
if (require.main === module) {
  try {process.exitCode = runner.main();}
  catch (error) {console.error(error.message); process.exitCode = 1;}
}
