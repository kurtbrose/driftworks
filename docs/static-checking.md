# Static checking

Driftworks remains a deployable static site: TypeScript is a development-time
checker only and never participates in the browser load path or emits files.

Install the development dependency once, then run both checks from the
repository root:

```text
npm install
npm test
npm run check:types
```

The shared contracts live in `src/types.d.ts`. JavaScript files should adopt
them with JSDoc as subsystems are changed, for example:

```js
/** @param {import('./types').Order} order */
function targetFor(order) {
  return order.kind === 'idle' ? null : order.target;
}
```

The migration is intentionally incremental. New or extracted subsystem
interfaces should be annotated first, followed by the world root, entities,
and order issuers/consumers. Runtime tests still own invariants TypeScript
cannot prove, such as reciprocal tow relationships and cargo conservation.
The long-term target is strict checking of all first-party JavaScript; the
current configuration makes failures visible so each migration step can be
completed rather than silently excluded.
