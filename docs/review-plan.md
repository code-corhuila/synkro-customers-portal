# Preparación de revisión — sin PR publicados

Owner Jordan Ramirez Gallego (`JordanRG420`); destino `develop`.

1. Portal: **feat(customers): complete Angular customers management portal**.
   Descripción: entrega Angular 21 zoneless como `synkro-customers-portal`, listado,
   filtros, registro idempotente, detalle, reemplazo y desactivación lógica. Adapta
   ShellContract v1 sin transporte ni sesión propios; navegación y cancelación
   verificadas. Incluye pruebas, Docker, entrada estable, archivo de assets y
   aceptación real separada. Consultar verification.md e infrastructure-handoff.md.
2. Host: **feat(customers): integrate protected portal and bounded asset delivery**.
   Descripción: carga Customers bajo demanda e inyecta el contrato como propiedad;
   limita carga/registro y permite recuperación explícita. Entrega assets bajo
   `/remotes/customers/`, conserva permisos/transporte y los límites de Sales
   incorporados desde develop `0e4b8ac7768a1416bdf9513f78a21054e4c22e69`.
   Incluye regresiones de autenticación, rutas, propiedades, aislamiento y entrega.

Orden de revisión: Portal y Host en paralelo; integración: merge aprobado de Portal,
publicación de su imagen/archivo de assets y después merge aprobado de Host.
HU-INF-02 selecciona esos merges; aquí no se alteran pins ni ramas permanentes.

## Límite de revisión

La regla vigente limita a 400 líneas de código por PR, excluyendo pruebas. El
lockfile completo añade 9.279 líneas; se conserva íntegro. La entrega Portal en
`216e3793296e6315b5abb45cb402621ba1498563` cambia 764 líneas excluyendo pruebas,
documentación y lockfile (incluye aceptación real de 177 líneas; 587 restantes),
además del lockfile completo y pruebas.
Medición reproducible: `git diff --numstat origin/develop...HEAD`.

Se solicita a los revisores una excepción específica para la primera aplicación
Angular y su lockfile completo, sin heredar la excepción de Auth. Cortes compilables:
configuración/bootstrap/contrato con pruebas; ciclo de clientes con pruebas;
despliegue/aceptación/handoff. Los commits existentes conservan la historia y
permiten revisión por archivo; no se ha reescrito historia para simular el límite.
Si no se concede la excepción, los revisores deben acordar PR dependientes antes
de publicarlos. La implementación y verificación continúan independientemente.

Los PR no se han creado, fusionado ni asignado automáticamente. La revisión humana
y los merges son requisitos posteriores de DoD; la evidencia no los sustituye.
