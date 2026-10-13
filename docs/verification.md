# HU-CLI-04 — verificación y evidencia de entrega

Owner Jordan Ramirez Gallego (`JordanRG420`), [issue publicado #249](https://github.com/code-corhuila/synkro-docs/issues/249).
Alcance implementado: ciclo MVP completo de clientes y conexión mínima al Host.
Angular 21 zoneless, custom element y ShellContract v1, sin runtime de federación
Angular, tokens, almacenamiento de sesión ni transporte API propios.

## Revisiones verificadas

| Repositorio | Rama de entrega | SHA de código ejecutado en navegador e imagen |
|---|---|---|
| synkro-customers-portal | feat/customers-management-portal | `216e3793296e6315b5abb45cb402621ba1498563` |
| synkro-front | feat/customers-portal-integration | `80211842ad444c7cc0100503506ab8f835ec0d7b` |

Los commits posteriores contienen informe, evidencia y documentación; no cambian
los archivos de construcción o ejecución. El SHA final publicado se obtiene con
`git rev-parse HEAD` en cada rama y los runs de CI identifican su headSha completo.
Las revisiones y los IDs de todas las imágenes realmente ejecutadas están en
[`browser-result.json`](../evidence/browser-result.json); no se atribuye ejecución
de navegador a un commit documental posterior.

Host incorporó develop `0e4b8ac7768a1416bdf9513f78a21054e4c22e69` mediante merge
normal `a56e5ba9e849238c29e6a7e625fac029069d6163`, sin conflictos ni rebase.
Se conservan los cambios de Sales de PR #12, la historia previa y los controles
Auth/Products/Sales. No hubo cambios concurrentes sin integrar al inicio de edición.

## Matriz CLI-UI-01…19

PASS corresponde al alcance comprobado indicado, no a un merge aprobado ni a la
aceptación completa de plataforma HU-INF-02.

| Criterio | Estado | Evidencia |
|---|---|---|
| 01 Montaje | PASS | bootstrap.spec.ts y app.component.spec.ts: registro único, contrato tardío/incompatible; Host PortalOutlet/customElement tests; montaje real |
| 02 Acceso | PASS | regresiones Host roleGuard y navegador: login restaura Customers, ADMIN/SALESPERSON operan, INVENTORY vuelve a dashboard sin elemento, API 403 |
| 03 Listado | PASS | customers-page tests: campos, paginación/límites, activos/inactivos; navegador muestra registros reales |
| 04 Filtros | PASS | tests: documento exacto, active opcional, reinicio y respuestas fuera de orden; navegador documento/estado |
| 05 Estados | PASS | tests: cargando/error/reintento/vacío/datos, traceId; navegador vacío inicial y recuperación |
| 06 Registro | PASS | pruebas de doble envío/payload cambiado; POST real commit + respuesta descartada + repetición explícita misma clave/payload/ID, SQL count=1 |
| 07 Validación | PASS | form/field-error tests; documento reservado inactivo rechazado 422 por API real |
| 08 Detalle | PASS | detalle y 404 en tests, GET real 200 antes y 404 después de desactivar |
| 09 Actualización | PASS | reemplazo y errores en tests; PUT real preserva ID/registrationDate y envía null; PUT de inactivo 404 |
| 10 Desactivación | PASS | dialog/foco/cancelación en tests; cancelar conserva activo, confirmar desactiva; DELETE repetido real 200 |
| 11 Transporte único | PASS | adapter y boundary scripts; Host apiClient/session suites conservan 401/logout y 403 sin logout/retry; llamadas reales mediante Host/Gateway |
| 12 Navegación | PASS | router bootstrap y Host routes tests; navegador entrada directa, refresh detalle, Back/forward y salida Host |
| 13 Lifecycle | PASS | adapter/page/bootstrap tests: AbortSignal, invalidación tardía, destruir aplicación/router, reentrar sin duplicaciones |
| 14 Aislamiento | PASS | Host deadline/error/retry tests; imágenes reales, caída y recuperación de assets de ambos portales; Customers remonta con botón sin refresh |
| 15 Accesibilidad | PASS | labels, mensajes asociados, foco de título/validación/dialog y controles nativos; regresión de colisión CSS Host; capturas móvil/español y tokens |
| 16 Despliegue | PASS | imágenes reales Docker de ambos SHA; compose config y overlay; DNS/80/red externa/sin ports; entrada no-store, JS hash immutable, preservación de bundles probada |
| 17 Testing/CI | PASS | 21 Angular + 3 Node; 81,84 % global/per-component >=70; Host 339 + 3 todo previos, 94,70 %; instalación/lint/tipos/build y CI en verde |
| 18 Aceptación real | PASS | browser-result.json y tres capturas, Chrome 154.0.8037.98; servicios reales con Postgres tmpfs exclusivo y usuarios/claves efímeros |
| 19 Handoff | PASS | design.md, tdd-evidence.md, review-plan.md, infrastructure-handoff.md; variables/rutas/red/DNS/puerto/comandos y selección posterior de merges |

## Pruebas y construcción

Portal: `npm ci`, lint, tipos, coverage, `node --test scripts/*.test.mjs`, build,
boundary compilado, configuración Compose base/overlay y Docker PASS. Cobertura:
81,84 % statements, 82,96 % branches, 80,68 % functions, 95,26 % lines.
Componentes: raíz 92,30 %, formulario 97,95 %, página 77,59 %; servicio 95 %.
Instalación desde lockfile con Node 22.23.3; audit: 0 vulnerabilidades.

Host: instalación desde lockfile, lint, coverage, tipos mediante build y chequeo
production-build PASS. 48 archivos, 339 pruebas verdes y 3 todo preexistentes.
Cobertura 94,70 % statements, 90,26 % branches, 91,61 % functions, 95,92 % lines.
Umbrales existentes conservados (incluido 85 % core). Root deploy Python: 2 PASS.
Docker del SHA indicado construido y servido en la aceptación real.

CI previamente comprobado:
[Host 32e73ac](https://github.com/code-corhuila/synkro-front/actions/runs/38339152053)
y [Portal 954cf09](https://github.com/code-corhuila/synkro-customers-portal/actions/runs/38339156612),
ambos success. `evidence/ci-runs.json` conserva las comprobaciones para los SHA
finales de código, con enlaces y conclusiones. El informe final enlaza también
los runs de los commits documentales publicados. No se considera
una suite con dobles equivalente a aceptación real.

## Navegador con servicios reales

Resultado final PASS para los dos SHA de código anteriores. Participantes exactos
en JSON: Auth API/DB, Customers API/DB, Gateway, Auth/Products/Sales portales.
Se ejecutó desde snapshots Git inmutables, sin cambiar sus checkouts.
Sales ausente después de calentar DNS: 502 no-store en 2,009 s; Customers: 502
no-store en 2,003 s. Host /customers y assets Products responden 200 durante esas
caídas. Ambos recuperan assets; Customers se recupera con retry del módulo.
No se ejecutó negocio de Sales/Products ni se certifican sus APIs.

Capturas verificadas visualmente: [inactivos](../evidence/customers-inactive.png),
[móvil](../evidence/customers-mobile.png), [caída localizada](../evidence/customers-unavailable.png).
Sin errores pageerror; limpieza propia PASS. Se preservaron contenedores previos.

Intentos previos: Auth local antiguo no tenía InitialAdminCli; se actualizaron
referencias y usó origin/develop aprobado. Chromium descargado no arrancó en
Windows; Chrome instalado sí. Un escenario esperaba Products en vez del destino
vigente dashboard para INVENTORY y se corrigió. Ninguno de esos intentos fallidos
se presenta como aceptación aprobada ni como rojo TDD funcional de producción.

## Revisión pendiente y límites

READY FOR MANUAL REVIEW: CI de los SHA de código está confirmado. El cierre de la historia
requiere revisión humana y merges aprobados. No se crearon PR ni se cerró el issue.
El límite de 400 líneas requiere la excepción concreta medida en review-plan.md;
su aprobación corresponde a los revisores, no se presume la excepción de Auth.
TDD acreditado y limitaciones en tdd-evidence.md. No se hizo auditoría WCAG externa.
HU-INF-02 debe seleccionar los merges y adoptar el archivo persistente de assets
descrito en el handoff; aquí no se cambian pins, infraestructura ni synkro-docs.
