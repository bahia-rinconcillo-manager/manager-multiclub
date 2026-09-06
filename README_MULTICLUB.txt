MANAGER MULTICLUB · BASE V1.0.0
================================

Base: CD San Bernabé Manager V27.2.49.
Clubes: C.R. Bahía de Algeciras + C.D. Rinconcillo.

CAMBIOS DE ESTA BASE
- Se ha eliminado del config.js la URL y clave del Supabase del CD San Bernabé.
- Al iniciar por primera vez se solicitan URL y Publishable Key del NUEVO Supabase.
- Tras autenticarse, aparece selector de club según club_usuarios.
- Las tablas principales se filtran automáticamente por club_id.
- Las altas/upserts principales incorporan club_id automáticamente.
- Los archivos subidos al bucket documents se prefijan con club_id.
- Los datos locales dependientes de temporada se separan también por club.

IMPORTANTE
Esta es la primera adaptación del frontend al nuevo backend multiclub.
Los módulos que en el San Bernabé dependían de RPC antiguas (acceso técnico,
calendario sincronizado, cierre anual, etc.) se conectarán a las RPC multiclub
en los siguientes bloques.


V1.0.3
- Añadida categoría Senior por encima de Juvenil en creación/edición de equipos.
- Añadida Senior al asistente de cambio de temporada.
- Reconocimiento automático de categoría Senior en nombres de equipo y edades adultas.

V1.0.4
- Añadido botón «Cambiar de club» en el menú lateral.
- Vuelve al selector Bahía/Rinconcillo sin cerrar la sesión de administrador.
- Al seleccionar el nuevo club se abre siempre el Panel principal.
- Se cierra el canal realtime del club anterior y se limpia el estado en memoria antes del cambio.
