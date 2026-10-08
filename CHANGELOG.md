# CubaGest — Changelog

Resumen aproximado de los cambios documentados en los planes de la raíz, los commits de backend/web/mobile y el trabajo realizado en esta colaboración. Cubre principalmente septiembre–octubre de 2026.

> Este changelog resume código y decisiones, no certifica que cada función esté desplegada ni que cada recomendación de los planes se haya completado. Los puntos de roadmap y las verificaciones pendientes se identifican al final.

## Cambios consolidados

### Plataforma, cuentas y seguridad
- Alta de empresa con configuración inicial, almacén central y administrador; aislamiento de datos por empresa y controles de acceso por rol/módulo.
- Sesiones con renovación y revocación de tokens, revalidación de usuario/empresa y comportamiento que conserva la sesión ante fallos temporales de red.
- Ventas idempotentes: una repetición de sincronización puede recuperar la factura existente en lugar de duplicarla. Validaciones de productos, cantidades, monedas, pagos, descuentos y ubicación se aplican en el servidor y las operaciones críticas usan escrituras atómicas.
- Correcciones de seguridad e integridad de suscripciones/QvaPay: no exponer credenciales y no tratar un cobro rechazado como exitoso.

### Punto de venta, pagos y descuentos
- POS conectado al inventario de la ubicación de venta; se admite stock cero o negativo para registrar una venta cuando la mercancía ya está físicamente en la caja. Esto no permite enviar mercancía inexistente desde un traspaso.
- Factura en una moneda de venta con pagos divididos entre monedas y métodos permitidos. Se recomienda la tasa automática si está activada; se puede escoger/introducir una tasa manual y queda registrado el valor aplicado.
- Monedas y métodos acordados: CUP (efectivo/transferencia), USD (efectivo, Zelle, Clásica, USDT, ACH), EUR y CAD (efectivo/transferencia) y MLC (transferencia).
- Descuentos por producto o venta, con vigencia, alcance y límite. Las ventas ya aceptadas offline se conservan aunque el límite se supere; al sincronizar se registra el uso y el descuento queda agotado para nuevas ventas.
- El POS web y mobile separan el catálogo/carrito del formulario de cobro. Vender abre el checkout con descuentos, pagos, moneda y datos de transferencia.
- En ambas interfaces, Calcular restante completa voluntariamente el importe en la moneda de la venta a partir de los otros pagos y sus tasas, con redondeo a centavos; no propone un importe negativo ni calcula con tasas inválidas.

### Inventario, traspasos y cronología
- Inventario por caja/almacén, ajustes y transferencias entre ubicaciones; permisos de aprobar/rechazar se resuelven con asignaciones reales, no con un propietario obsoleto.
- Cada evento conserva su hora de negocio y, por separado, su hora de sincronización/resolución. Un traspaso aprobado afecta el inventario desde su creación aunque se apruebe después; si se rechaza no genera movimiento.
- Anular una factura devuelve los productos en la fecha original de la venta. El recálculo incorpora esa devolución en las fotos posteriores, sin sumar artificialmente al stock actual.
- Los movimientos de stock identifican su origen (venta, transferencia o ajuste), evitando confundir mercancía con dinero o con una lectura física.

### Turnos, lecturas, cierres y dinero
- Apertura y cierre de turno registran lecturas físicas; la cadena compara cada foto con la inmediatamente anterior y toma en cuenta los eventos de negocio entre ambas.
- Se corrigen cálculos de stock y efectivo, lecturas previas, cierres provisionales y recálculos cuando llegan ventas/movimientos tarde. Dos turnos pueden mostrar los cuatro tramos entre fotos consecutivas, incluidos los intervalos cierre→apertura.
- Los cierres distinguen efectivo por moneda de pagos no físicos y muestran diferencias, faltantes/sobrantes, explicación y estado provisional.
- Caja operativa, traslado a caja fuerte y gasto de empresa son operaciones diferentes. Los gastos no reducen el efectivo de la caja; los movimientos de efectivo conservan sus aprobaciones y trazabilidad.

### Trabajo sin conexión y sincronización
- Web/PWA y mobile guardan datos operativos cacheados, separan datos por empresa/usuario/ubicación, preservan el carrito y permiten completar ventas ya iniciadas sin red.
- La cola mantiene identificadores idempotentes, hora real de operación y estado pendiente/sincronizando/sincronizado/conflicto; los reintentos y cortes de conexión no deben borrar ni duplicar ventas.
- Se restauró la sesión de la PWA al abrirla offline y se corrigió el disparo repetido de sincronización al iniciar.
- En mobile se añadieron precarga de caché, resolución de caja/turno, sincronización controlada (incluidos ciclos periódicos en primer plano) y flujos offline que el servidor soporta. Los ciclos automáticos no equivalen a sincronización garantizada en segundo plano del sistema operativo.

### Experiencia y funciones de los clientes
- Navegación responsive de web y mobile, configuración organizada como modo/grupos del navegador, límite de cinco destinos visibles en mobile, tema, iconografía nativa y correcciones de estados/cargas.
- Catálogo (códigos/barra), existencias por ubicación, facturas/recibos y exportación, reportes, usuarios/roles, auditoría, descuentos, monedas/tasas, gastos, suscripciones/prueba, referidos y administración de plataforma forman parte del producto documentado.
- La revisión SaaS también documentó posicionamiento para PYMEs cubanas, propuesta de piloto, niveles de precio y recomendaciones de marca; son recomendaciones comerciales, no todas funciones de código.
- Las notificaciones se guardan en la bandeja interna; Web Push y Expo Push son complementos sujetos a permisos y configuración de despliegue.

## Decisiones acordadas en los planes
- La lectura física manda sobre el inventario calculado; el recálculo resuelve los movimientos atrasados en su período real.
- La aprobación de un traspaso tiene su propio tiempo, pero su movimiento usa la hora de creación; un rechazo no mueve stock.
- La anulación devuelve stock en el instante histórico de la venta.
- Superar offline el límite de un descuento no invalida una venta aceptada ni culpa al cajero.
- No se conserva compatibilidad con datos temporales anteriores al lanzamiento: la base se limpiará antes de abrir la plataforma a usuarios. La limpieza productiva requiere una tarea/ventana de lanzamiento explícita.
- La tasa automática es la recomendada cuando está habilitada, sin quitar la posibilidad de tasa manual.

## Planes y evidencias revisados
Incluye los alcances de CubaGest_P0_Implementation_Plan.md, CubaGest_Mobile_Offline_Sync_Plan.md, CubaGest_Mobile_Parity_Plan.md, CubaGest_UI_Parity_Plan.md, CubaGest_Shift_Chain_Plan.md, CubaGest_Remaining_Fixes_Plan.md, CubaGest_SaaS_Review.md, Sellable Features.md, Verificacion modo offline.md y VERIFICACION_READMES.md, además del historial de commits de los tres repos y la sesión de agente guardada en dsh-session-*. En conjunto cubren estabilidad P0, offline, paridad, navegación/UI, cierres, inventario, seguridad/billing, comercialización, pruebas de campo y documentación.

## Pendiente o sujeto a validación
- El alcance comercial P1/P2 (contabilidad completa/COGS, conversiones de valoración, fiscalidad, copias/restauración, cifrado y borrado remoto de dispositivos, entre otros) sigue siendo roadmap salvo donde el código demuestre lo contrario.
- El envío push nativo requiere proyecto EAS y credenciales/configuración Apple/Google.
- El checkout mobile de octubre se verificó con TypeScript y pruebas unitarias; falta aceptación visual/táctil en teléfono o emulador.
- La web no cuenta con suite automatizada de interacción; el build no sustituye pruebas manuales offline.
- Los planes y feedback de campo incluyen validaciones de orden/filtros de facturas y lecturas, aceptación en dispositivos y otros puntos de roadmap. No se presentan aquí como terminados sin evidencia de implementación y prueba.
