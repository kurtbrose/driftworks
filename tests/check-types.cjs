'use strict';

// Development-only: runtime deployment and tests/run.cjs remain dependency-free.
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
// A successful check must cover every authored application script, including labs.
// Keep this independent of tsconfig's include list so narrowing it cannot silently
// turn a green check into partial coverage again.
const checkedFiles = new Set(parsed.fileNames.map(file => path.resolve(file)));
const omitted = ['src', 'experiments'].flatMap(directory =>
  ts.sys.readDirectory(path.join(root, directory), ['.js']).filter(file => !checkedFiles.has(path.resolve(file))));
if (omitted.length) {
  console.error('Application scripts missing from type checking:\n' + omitted.map(file => path.relative(root, file)).join('\n'));
  process.exit(1);
}
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
// Containers such as Map<any, any> are object types, so checking only the
// identifier's outer flags misses the unchecked values stored inside them.
function containsAny(type, seen = new Set()) {
  if (seen.has(type)) return false;
  seen.add(type);
  if (type.flags & ts.TypeFlags.Any) return true;
  if (type.isUnionOrIntersection()) return type.types.some(member => containsAny(member, seen));
  if ((type.flags & ts.TypeFlags.Object) && (type.objectFlags & ts.ObjectFlags.Reference)) {
    return checker.getTypeArguments(type).some(argument => containsAny(argument, seen));
  }
  return false;
}
for (const source of program.getSourceFiles()) {
  if (!parsed.fileNames.includes(source.fileName)) continue;
  if (source.checkJsDirective && !source.checkJsDirective.enabled) {
    errors.push(`${path.relative(root, source.fileName)}: type checking cannot be disabled for application scripts`);
  }
  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword ||
        (ts.isIdentifier(node) && containsAny(checker.getTypeAtLocation(node)))) {
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
