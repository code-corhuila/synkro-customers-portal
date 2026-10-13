# HU-CLI-04 — contrato de entrega para HU-INF-02

Responsable: Jordan Ramirez Gallego (`JordanRG420`). Referencia: synkro-docs#249.
Los merges aprobados serán seleccionados por HU-INF-02. Esta entrega no modifica
la composición raíz, sus pins ni synkro-docs.

## Configuración confirmada

| Configuración | Valor |
|---|---|
| Servicio / DNS Docker | `synkro-customers-portal` |
| Puerto HTTP interno | `80` |
| Red externa | `platform` |
| Puerto publicado del portal | Ninguno |
| Variable de construcción del Host | `VITE_CUSTOMERS_PORTAL_ENTRY=/remotes/customers/remoteEntry.js` |
| Entrada estable | `/remotes/customers/remoteEntry.js`, `Cache-Control: no-store` |
| Assets | `/remotes/customers/main-HASH.js` y futuros chunks/CSS, immutable |
| Rutas de pantalla | `/customers`, `/customers/new`, `/customers/:id`, `/customers/:id/edit` |
| API | `/api/v1/customers`, exclusivamente mediante ShellContract v1 |

Nginx del Host resuelve DNS bajo demanda, elimina `/remotes/customers/` al
reenviar y conserva el cache de éxito del portal. Resolución/conexión: 2 segundos;
504 se convierte en 502 sin cache. Se preserva la corrección equivalente de Sales.
El fallback del Host sirve entrada directa y refresh de las pantallas.
La entrega es del mismo origen: Customers no necesita ampliar CORS.

## Construcción y operación

Desde el repositorio del portal, con Node 22:

```sh
npm ci
npm run lint
npm run typecheck
npm run coverage
node --test scripts/*.test.mjs
npm run build
node scripts/check-boundary.mjs --compiled
docker build -f deploy/Dockerfile -t synkro-customers-portal:<SHA-aprobado> .
docker compose -f deploy/compose.yml config --quiet
docker compose -f deploy/compose.yml up -d --build
```

La red `platform` debe existir. Construir el Host con su variable real; no cambiar
el transporte ni los secretos de sesión para conectar Customers. Las imágenes
son independientes: publicar el portal antes de habilitar su entrada en el Host.

## Pestañas abiertas y actualizaciones

Se entrega `scripts/publish-assets.mjs`: copia primero los bundles, conserva los
anteriores y cambia la entrada mediante rename en el mismo directorio. El overlay
`deploy/compose.assets.yml` monta ese directorio persistente como solo lectura.
La infraestructura puede adoptar este contrato sin editar el portal:

```sh
node scripts/publish-assets.mjs dist/customers/browser /srv/synkro/customers-assets
export CUSTOMERS_ASSETS_DIR=/srv/synkro/customers-assets
docker compose -f deploy/compose.yml -f deploy/compose.assets.yml up -d --build
```

Conservar todos los assets anteriores durante la vida de las pestañas abiertas;
este publicador no los elimina. El operador es responsable del archivo y de una
ventana de retiro acordada; sustituir solo una imagen sin el archivo no garantiza
la conservación. Rollback: restaurar la entrada estable de la versión aprobada
anterior, conservando sus bundles. La prueba del publicador comprueba ambas versiones.

## Aceptación separada

`node scripts/acceptance.mjs` requiere Docker y Chromium de Playwright instalado
(`npx playwright install chromium`). Usa `HEAD` de los dos repositorios afectados
y referencias `origin/develop` actualizadas de los participantes. Registra los SHA
y IDs de imagen realmente ejecutados. Crea PostgreSQL tmpfs, claves y usuarios
efímeros; no usa bases compartidas. Elimina únicamente recursos propios etiquetados.
No ejecutar contra producción. Resultados en `evidence/browser-result.json`;
capturas del navegador en `evidence/`. Los diagnósticos locales se sanitizan.

El escenario de pérdida de respuesta entrega el POST al backend real, descarta
su respuesta y verifica la repetición explícita con la misma clave/payload, un solo
registro y 200 con el mismo ID. No simula una respuesta de Customers API.

Propuesta documental para revisión, sin modificación de synkro-docs: enlazar esta
entrega desde la matriz de HU-CLI-04, guía de despliegue y handoff HU-INF-02; registrar
los merges aprobados posteriormente. La aceptación completa de plataforma y el
cierre de HU-INF-02 permanecen bajo su responsable.
