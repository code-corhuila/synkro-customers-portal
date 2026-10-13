# Evidencia TDD y límites

Ejecuciones reales del 12 de octubre de 2026 (America/Bogota). No se reconstruyeron
fases rojas después de implementar. Los logs completos locales están ignorados;
los resúmenes y hashes se conservan en `evidence/tdd-runs.json` para auditoría.

| Ciclo | Rojo funcional registrado | Verde |
|---|---|---|
| Adaptador ShellContract | `adapter-red.log`: 3 fallos de opciones/cancelación/error | adaptador implementado, 3 pruebas |
| Contrato tardío y versión | `root-red.log`: 3 fallos de estado/montaje | suite de raíz |
| Ciclo de clientes | `views-red.log`: 14 fallos por vistas/acciones ausentes | suite de vistas; se corrigieron además sincronización del fixture y polyfill de dialog |
| Custom element real | `bootstrap-red.log`: registro ausente | montaje, desmontaje y nueva aplicación/router al reentrar |
| Entrada estable | `entry-red.log`: salida vacía y falta de rechazo de build ambiguo | 2 pruebas del publicador de entrada |
| Foco y PUT 404 | `focus-inactive-red.log`: 2 fallos, 18 pruebas verdes | `focus-inactive-green.log`: 20 pruebas verdes |
| Conservación de assets | `assets-red.log`: publicador ausente | `assets-green.log`: 3 pruebas Node verdes |
| Propiedad en Host | `customers-contract-red.log`: 1 fallo, 9 verdes | inyección y adaptación coordinada |
| Recuperación de Host | `customers-recovery-red.log`: 4 fallos, 16 verdes | deadline de import/registro, retry y despliegue |
| Límites de Customers | `customers-warm-red.log`: falta resolver_timeout de Customers, 2 verdes | límites preservados de Sales y añadidos de Customers |
| Cache de fallos Customers | `customers-cache-red.log`: falta interceptar 502 | suite completa Host: 339 verdes, 3 todo preexistentes |
| Aislamiento visual | `styles-red.log`: texto hereda uppercase de Host, 20 verdes | `styles-green.log`: 21 verdes, cobertura 81,84 % |

Limitaciones: los cambios de instalación/configuración tuvieron fallos de entorno
y compilación que no cuentan como rojo funcional. Algunas aserciones adicionales
del adaptador Host se añadieron después de implementar la propiedad; no tienen
rojo histórico acreditado. Bootstrap-red incluía fallos del fixture de vistas,
que tampoco acreditan rojo de comportamiento nuevo. Las suites finales ejecutan
todos esos comportamientos. La aceptación con servicios reales es una verificación
separada; ningún doble de ShellContract certifica integración real.

Refactor: aislamiento del adaptador único, generación para invalidar respuestas,
estrategia pública de Angular Elements con aplicación por montaje y entrada
estable generada desde el bundle real. No se redujeron umbrales para conseguir verde.
