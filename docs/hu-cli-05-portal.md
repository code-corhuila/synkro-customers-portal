# HU-CLI-05 — Contactos obligatorios, búsqueda y reactivación (portal de Clientes)

Refs [code-corhuila/synkro-docs#304](https://github.com/code-corhuila/synkro-docs/issues/304). Alcance: solo
`synkro-customers-portal`. El portal sigue hablando únicamente con el Host (`shellContract`); no hay otro transporte.

> **Dependencia.** El contrato de `POST /api/v1/customers/search` y `POST /api/v1/customers/{id}/activate` es una
> **propuesta** hasta que el responsable de Ventas (HU-VEN-20) lo acepte; está descrito en
> `synkro-customers-api/docs/hu-cli-05-contacts-search-reactivation.md`. Este portal necesita la API y las migraciones
> V008–V013 de Customers DB desplegadas.

## Qué cambia para la persona usuaria

| Pantalla | Comportamiento |
|---|---|
| Registro / edición | Correo, teléfono y dirección son **obligatorios** (marcados con `*`). El teléfono son exactamente 10 dígitos (`inputmode="numeric"`, `autocomplete="tel-national"`, ayuda visible). La validación aparece junto a cada campo antes de enviar, con foco en el primero inválido; los errores del servidor (`required`, `invalid_format`, `too_long`) se asignan a su campo sin perder lo escrito. |
| Cliente histórico sin contactos | Se muestra con los campos vacíos y un aviso: debe completarlos para guardar. No se inventa ningún valor. Desactivar no los exige. |
| Lista → búsqueda | Campo «Buscar por nombre o documento» (2–100 caracteres tras recortar). Hasta 5 coincidencias con el motivo (documento exacto, inicio de documento, nombre), estado y, si hay más, el aviso «Hay más de 5 coincidencias». Estados: cargando, vacío, error con referencia (`traceId`) y «Reintentar búsqueda». Una búsqueda nueva cancela la anterior y se ignora cualquier respuesta tardía. |
| Reactivación (solo ADMIN) | Las filas/coincidencias inactivas ofrecen **Reactivar**, con un diálogo de confirmación accesible. El estado a buscar (Activos/Inactivos) también solo lo ve ADMIN. SALESPERSON ve «Solo un administrador puede reactivar clientes.» y no recibe ningún control. El botón se bloquea mientras la petición está en curso; si el resultado es incierto se puede reintentar porque la API es idempotente. |

La autorización real está en la API (ruta y caso de uso); el portal solo decide qué ofrecer según `session.user().role`.

## Privacidad

- El texto de búsqueda viaja en el **cuerpo** del `POST`, nunca en la URL ni en `query`; no se guarda en `localStorage`,
  no se escribe en consola y los resultados solo contienen id, nombre, documento y estado (sin correo ni teléfono).
- Los datos de las pruebas son sintéticos (`example.test`).

## Decisiones

- La validación del cliente refleja las reglas de la API para ahorrar un viaje, pero la API manda: el correo del portal
  es deliberadamente más laxo (la API aplica además las reglas RFC y de longitud por parte).
- Solo el correo y el teléfono se recortan (un espacio accidental nunca es válido en ellos); nombre, documento y dirección
  se envían tal como se escriben, igual que los almacena la API.
- La búsqueda y la carga de la lista son independientes: paginar o filtrar no aborta una búsqueda en curso.

## Verificación

`npm test` (56 pruebas: servicio, validación, formulario, búsqueda, reactivación, accesibilidad básica y cancelación),
`npm run typecheck`, `npm run lint`, `npm run coverage` y `npm run build` pasan en local.

### Aceptación en navegador con servicios reales (solo Clientes)

`node scripts/acceptance.mjs` (Microsoft Edge de Playwright, Host `synkro-front`, Gateway, Auth, API de Clientes y PostgreSQL
desechable; ningún doble de respuesta de API) pasa, con las revisiones y las imágenes exactas en `evidence/browser-result.json`.
Para esta HU comprueba, además de los flujos previos:

- alta y edición con contactos obligatorios: errores por campo, foco en el primer campo inválido y **ninguna** petición cuando
  el formulario es inválido; la API rechaza por su cuenta correo/teléfono/dirección inválidos con `400` sin escribir nada;
- búsqueda: validación 2–100 antes de enviar, sin tildes ni mayúsculas, documento exacto primero, máximo 5 con el aviso de
  que hay más, estados vacío / cargando / error con referencia y reintento, **respuesta tardía descartada**, texto solo en
  el cuerpo del POST (no en URL, consola ni logs de los participantes) y teclado (Tab, Enter);
- reactivación como ADMIN: diálogo con foco, Escape devuelve el foco, una fila de auditoría y repetición idempotente;
- SALESPERSON: sin control de reactivar ni selector de estado; la API responde `403` también con cabeceras falsificadas,
  para INVENTORY y `401` sin token; `PUT` sobre un inactivo sigue siendo `404`;
- el mismo flujo contra `http://localhost` y `http://127.0.0.1` (la sonda de `127.0.0.1` inicia sesión y busca).

Límites: es **solo Clientes**. La integración conjunta con el portal de Ventas (HU-VEN-20) sigue **pendiente** y requiere la
revisión concreta de Sergio. El Gateway limita el inicio de sesión (5 rápidos y luego 1 por minuto), por eso el script espera
65 s antes de los inicios de sesión sexto y séptimo; no se modificó el Gateway.
