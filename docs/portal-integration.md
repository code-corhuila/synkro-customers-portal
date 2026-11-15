# Portal integration

Detailed procedures and delivery notes moved from the repository README at
[source c10afe2](https://github.com/code-corhuila/synkro-customers-portal/blob/c10afe21bba1aff8fe220dd6b2dea032b79f0a52/README.md).
Recorded execution results retain their original scope; moving them does not
constitute a new execution or certify a different revision.

Run commands from the repository root unless a step explicitly changes directory.

## Customers portal integration

Angular 21 zoneless, strict TypeScript and the synkro-customers-portal custom element. The Host supplies shellContract v1 as a property and owns identity, transport and navigation. The portal provides listing, filters, idempotent registration, detail, updates and logical deactivation to ADMIN and SALESPERSON. The later contact/search/reactivation delivery is documented separately.

With Node 22, run npm ci, npm run lint, npm run typecheck, npm run coverage, node --test scripts/*.test.mjs and npm run build from the repository root. Output is dist/customers/browser; remoteEntry.js imports the actual hashed bundle. Run within the Host for session and transport.

Delivery documentation:

- [Design and consulted sources](design.md).
- [CLI-UI-01–19 matrix and verification](verification.md).
- [TDD and evidenced limits](tdd-evidence.md).
- [Operational/infrastructure contract](infrastructure-handoff.md).
- [Review sequence and original size exception](review-plan.md).
- [Required contacts, search and reactivation](hu-cli-05-portal.md).

Browser acceptance uses real services and disposable owned resources through node scripts/acceptance.mjs. API doubles do not certify integration. The original delivery notes did not themselves merge PRs, promote environments or close an issue.

### Consumer contract verification

Run `npm ci && npm run test:contract` with Node 22. The isolated test tooling
pins Pact JS in `tests/pact/package-lock.json`; application dependencies and
production images do not include it. Tests call the real portal client through
the Host transport boundary and generate the committed `tests/pact/pacts/`
artifacts. CI rejects stale artifacts. Providers verify these files against
their real disposable databases; consumer mock success alone is not provider
acceptance. No Pact broker or published verification result is implied.
