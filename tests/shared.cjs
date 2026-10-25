'use strict';

// Standalone entry point for all shared tests or one explicitly named group.
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length > 1) throw new Error('Usage: node tests/shared.cjs [group]');
  process.exitCode = require('./helpers/shared-runtime.cjs').run(args[0]).failed ? 1 : 0;
}
