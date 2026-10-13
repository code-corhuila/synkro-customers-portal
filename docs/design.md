# HU-CLI-04 implementation design

Owner: Jordan Ramirez Gallego (`JordanRG420`). Acceptance: [issue 249](https://github.com/code-corhuila/synkro-docs/issues/249).
Recorded before application implementation on 2026-10-12.

## Sources and inspection

Read-only design revision: synkro-docs `61056c93e6e0783a9199bf56778e9494739bc458`.
Reviewed ADR-011, `_stacks/frontend.md`, Customers OpenAPI and `_shared.yaml`,
domain entities/map, navigation-map, wireframes, design-system, testing-strategy,
tdd-guide, DoR, DoD, git-conventions and branching-policy. No local synkro-docs
checkout exists; sources were read using authenticated GitHub access.
No applicable AGENTS.md was found in workspace repositories or ancestor paths.

Verified local participants: Customers API `58a0ef9f6fc05b788b2e65002468cd9c14783540`,
Host `a1fecc671ada1384dcaeeec5f59dff3c13a35e26`, Auth Portal
`02e71fcab39a98aa14a082c68957e750c35347c0`, infrastructure
`02643d5c52042f61c67f101a394ca11ff6049efa` (Customers handoff reviewed).
Portal starts at `875b269d217f17568b8125c4fd805e825f01867d` with common files only.
At initial inspection, Host remote branch `codex/sales-upstream-timeout` had an
unmerged correction `24d5368`. Subsequently develop
`0e4b8ac7768a1416bdf9513f78a21054e4c22e69` incorporated it; the integration branch
merged develop normally at `a56e5ba9e849238c29e6a7e625fac029069d6163` without conflicts.

## Screens, API and state

`/customers`: paginated list, exact document and tri-state active filter. Default
page 1, limit 20; user limit 1..100. Omit active for both states. Filters reset page.
Show all contractual fields, inactive badges and no inactive detail/edit actions.
`/customers/new`: creation form. `/customers/:id`: active detail.
`/customers/:id/edit`: replacement form. Unknown inner paths show local 404.
All data views have loading, error/retry, empty/not-found and populated states.
Destructive action uses native accessible modal confirmation with cancellation,
focus return and pending lock. UI and local messages are Spanish.

HTTP paths remain `/api/v1/customers`. Required name (1..150) and identityDocument
(1..30); optional nullable email (email, <=255), phone (<=20), address (<=255).
HTTP response uses `registrationDate`, despite domain prose saying registeredAt.
PUT sends all editable fields and explicit nulls for cleared optional fields;
never sends customerId/registrationDate/active. No extra document/phone patterns.
404 means missing/inactive; 422 document conflicts include inactive customers;
400/422 field details are attached to inputs. Show traceId, translate known
validation messages and keep unexpected server text out of generic UI messages.
401 is handled by Host; 403 shows access denied without logout or automatic retry.

Creation owns a frozen payload and UUID key per intent. Pending clicks are ignored.
Uncertain failures retain both and offer explicit retry. Changed data requires an
explicit new-intent choice with warning that the prior creation may have committed.
No render effect writes, no automatic mutation retries. Aborted reads are invalidated
by generation and AbortController, even when a fake/transport ignores abort.

## Contract, router and lifecycle

Duplicate the exact ADR-011 ShellContract v1 type in the two repositories. Host
adapts its existing path-first client to method-first contract; identity has no
tokens. Pass `shellContract` as an element property after whenDefined, through a
ref callback. Root setter supports delayed assignment and validates version.
One component-scoped Angular adapter owns requests and cancellation. ADMIN and
SALESPERSON allowed; Host guards remain the authority before remote loading.

Angular Router renders inner screens. Each element has its own application injector
and Router, using disabled initial navigation. Angular Elements' public strategy API
creates/destroys that application on connect/disconnect (a child injector alone
would retain root-scoped Router transition services after disposal).
Explicitly synchronize the full owned
path when the Host supplies the contract (including on React location changes), using
`navigateByUrl(..., {skipLocationChange:true})`. All browser-history commits use v1
`navigate`; Angular never writes a competing history state or listens outside its
base. No new contract function is needed. Initial/deep-link/Back/reentry tests must
prove this arrangement. Root destroys Router subscriptions and adapter operations.
Custom element definition is guarded; reentry creates fresh component/router state.

## Delivery and quality

Coordinated same-origin asset base `/remotes/customers/`; Host build input
`VITE_CUSTOMERS_PORTAL_ENTRY=/remotes/customers/remoteEntry.js` and lazy DNS nginx
proxy to `synkro-customers-portal:80`. Angular application builder outputs hashed
JS; stable remoteEntry imports the hashed main using relative ESM URL. Component
CSS is in JS; all additional JS assets live under the same base.
Stable entry no-store; hashed assets immutable. Release operator must preserve prior
hashed assets for open tabs (deploy archive/rolling asset retention); single image
replacement alone does not guarantee retention. Same-origin needs no additional CORS.
External platform network, internal HTTP 80, no published portal port.

Node 22 LTS, Angular 21, no zone.js/HttpClient/federation runtime. Strict TS, Angular
unit-test builder with Vitest/TestBed and >=70% statements globally and per component
and service. Host thresholds remain unchanged. Behavioral red runs are retained;
tool/install failures never count as functional red. Separately execute real-service
browser acceptance on disposable resources and record participant SHAs.

Policy conflict: full Angular lockfile and portal exceed the 400-line PR rule. Measure
both separately and propose review slices plus an explicit lockfile/full-delivery
exception for human review; do not claim the Auth exception applies here.

Traceability: CLI-UI-01 contract/bootstrap; 02 Host guards; 03 list/pagination;
04 filters/races; 05 view states; 06 frozen intent; 07 validation; 08 detail/404;
09 replacement; 10 confirmation/delete; 11 adapter/Host transport; 12 router/history;
13 teardown/reentry; 14 boundary/retry; 15 Spanish/a11y/tokens; 16 image/assets;
17 suites/coverage/CI; 18 separate real browser acceptance; 19 evidence/handoff.
