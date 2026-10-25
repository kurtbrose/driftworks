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

All application scripts in `src/` and `experiments/` pass strict checking and
an additional audit rejecting explicit and inferred `any`. The checker rejects
omitted application scripts and disabled per-file checking. Tests and vendored
libraries are outside that application audit.

Shared contracts live in `src/types.d.ts` and `experiments/types.d.ts`.
Use them with JSDoc when changing subsystem interfaces, for example:

```js
/** @param {import('./types').Order} order */
function targetFor(order) {
  return order.kind === 'idle' ? null : order.target;
}
```

New or extracted subsystem interfaces should use explicit shared contracts.
Runtime tests still own invariants TypeScript cannot prove, such as reciprocal
tow relationships and cargo conservation.
