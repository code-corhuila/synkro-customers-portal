# synkro-customers-portal

> customers bounded context: web UI (remote)

Part of the **SynkroTech SAS Sales Management System** — organization `code-corhuila`.
Governance and documentation live in [`synkro-docs`](https://github.com/code-corhuila/synkro-docs).

## Branching

Three permanent branches. **None of them accepts a direct commit** — you enter through a child
branch and leave through a Pull Request.

```
develop  <--PR--  feat/... fix/... chore/...
qa       <--PR--  qa/...
main     <--PR--  release/...  hotfix/...
```

Promotion happens **by re-application** (`git cherry-pick -x`), never by merging one permanent
branch into another: `merge develop -> qa` and `merge qa -> main` do not exist in this model.

`main` requires **1 approval from `ariel5253`**. On `develop` and `qa` the team sets its own review
rule.

Full policy: `00-governance/branching-policy.md` in `synkro-docs`.

## Customers Portal — HU-CLI-04

Angular 21 zoneless, TypeScript estricto y custom element `synkro-customers-portal`.
El Host entrega `shellContract` v1 mediante propiedad y administra identidad,
transporte y navegación. El portal cubre listado, filtros, registro idempotente,
detalle, actualización y desactivación lógica para ADMIN y SALESPERSON.

Con Node 22, ejecutar `npm ci`, `npm run lint`, `npm run typecheck`,
`npm run coverage`, `node --test scripts/*.test.mjs` y `npm run build`.
La salida está en `dist/customers/browser`; `remoteEntry.js` importa el bundle
real con hash. Ejecutar dentro del Host para obtener sesión y transporte.

Documentación de entrega:

- [Diseño y fuentes consultadas](docs/design.md).
- [Pruebas, matriz CLI-UI-01…19 y evidencia](docs/verification.md).
- [TDD y limitaciones acreditadas](docs/tdd-evidence.md).
- [Contrato operativo e infraestructura](docs/infrastructure-handoff.md).
- [Títulos, descripciones, secuencia y excepción de tamaño para revisión](docs/review-plan.md).

La aceptación de navegador usa servicios reales y recursos desechables; se ejecuta
separadamente mediante `node scripts/acceptance.mjs`. No usa dobles de API para
certificar integración. Ningún PR, merge o cierre de issue forma parte de esta entrega.
