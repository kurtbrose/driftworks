'use strict';

// Development-only: runtime deployment and tests/run.cjs remain dependency-free.
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const diagnostics = [config.error, ...parsed.errors, ...ts.getPreEmitDiagnostics(program)].filter(Boolean);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => root,
    getCanonicalFileName: name => name,
    getNewLine: () => '\n'
  }));
  process.exit(1);
}

// noImplicitAny permits inferred `any` from JSON.parse and evolving nulls.
// Inspect source identifiers too, so those escape hatches cannot spread silently.
const checker = program.getTypeChecker();
const errors = [];
for (const source of program.getSourceFiles()) {
  if (!parsed.fileNames.includes(source.fileName)) continue;
  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword ||
        (ts.isIdentifier(node) && (checker.getTypeAtLocation(node).flags & ts.TypeFlags.Any))) {
      const pos = source.getLineAndCharacterOfPosition(node.getStart(source));
      errors.push(`${path.relative(root, source.fileName)}:${pos.line + 1}:${pos.character + 1}: unchecked any: ${node.getText(source)}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('All application scripts pass strict type checking and the any audit.');
