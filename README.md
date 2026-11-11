# Ruta X · Supabase + Drive + Vercel

Mapas gratuitos Leaflet/OpenStreetMap; datos en Supabase; evidencias en Drive. Por decisión del propietario, no se importan datos históricos. La base `esrutaxdb` ya tiene el esquema y no contiene usuarios, rutas ni entregas reales.

## Cambios

- Repartidor: PIN de 4 dígitos, tema, foto de perfil y cierre de sesión con revocación en servidor.
- Admin: PIN de 6 dígitos, repartidores, CSV, entregas y ajustes operativos. «Agregar repartidor» está disponible en la barra lateral de escritorio y en la vista móvil. PIN cifrado con scrypt y sal, sin recuperación ni visualización en administración; puede restablecerse.
- Ajustes operativos: nombre de quien recibe, permitir entrega sin foto, preguntar WhatsApp, firma, color de firma y región de geocodificación. Aplicar una o varias opciones a uno, varios o todos los repartidores. «Todos» también cambia los valores para nuevos repartidores.
- Avisos masivos: rojo urgente, amarillo informativo, verde amigable; bandeja y push a dispositivos autorizados.
- Selección individual/múltiple de entregas para eliminarlas. Baja lógica con fecha y admin responsable: desaparecen del historial y los indicadores; no reabre paquetes ni elimina fotos inmediatamente.
- Evidencias pendientes en IndexedDB, con reintentos idempotentes. Se necesita conexión para validar reglas antes de registrar una entrega; no se promete funcionamiento completo sin conexión.
- Historial paginado de 100 en 100 y sincronización por versión para evitar descargar datos sin cambios.
- En la tabla de rutas del admin: selección individual, múltiple o de todos los pendientes visibles para retirarlos de la ruta. El servidor omite destinos que ya cambiaron de estado y conserva el historial y las evidencias.
- Mapa del repartidor bloqueado inicialmente para permitir el scroll de la página. Doble toque o «Activar mapa» habilita movimiento y zoom; «Volver a desplazar», salir del mapa o 15 segundos sin usarlo lo bloquean de nuevo.

## Configurar Vercel antes de fusionar con main

Usar **Framework Preset: Other**, raíz del repositorio, Node.js 22 o posterior, sin comando de build. Hay una función Node en `api/rutax.js`: no basta servir el HTML como archivo estático.

En **Vercel → esrutaxdb → Settings → Environment Variables**, configurar para Production y Preview si se prueba la rama:

| Variable | Valor |
| --- | --- |
| `SUPABASE_URL` | `https://uwjtzttzggdeqoircmbi.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Clave pública del proyecto para recibir avisos de actualización de ruta. |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servidor del proyecto, desde Supabase → Project Settings → API Keys. Usar legacy `service_role`; nunca la publishable/anon. |
| `INITIAL_ADMIN_PIN` | Elegir exactamente 6 dígitos en esta configuración privada. |
| `DRIVE_BRIDGE_URL` | URL `/exec` del nuevo Apps Script descrito abajo. |
| `DRIVE_BRIDGE_SECRET` | Secreto aleatorio compartido entre Vercel y el nuevo Apps Script. |
| `VAPID_PUBLIC_KEY` | Generar localmente con `npm run vapid`. |
| `VAPID_PRIVATE_KEY` | Del mismo comando; solo servidor. |
| `VAPID_SUBJECT` | `mailto:` seguido del correo de contacto del admin. |

No subir `.env`, claves o PIN al repositorio ni compartirlos en el chat. No hay credenciales incluidas.

Generar claves desde una terminal local:

```sh
npm ci
npm run vapid
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

El último comando genera `DRIVE_BRIDGE_SECRET`. Guardar el mismo secreto en las dos configuraciones privadas.

Después de desplegar, abrir «Acceso administración» y escribir el PIN configurado. Se crea ADMIN en el primer acceso válido. **Eliminar `INITIAL_ADMIN_PIN` de Vercel y volver a desplegar tras ese primer acceso.** El hash ya queda guardado en la base. El admin puede cambiar el PIN desde «Ajustes y avisos → Mi perfil». Crear repartidores y cargar rutas CSV.

## Configurar Drive

**Configuración guiada sin crear propiedades manualmente:** abrir un proyecto nuevo en Apps Script, pegar `scripts/drive-bridge.gs` completo, guardar y ejecutar `configurarRutaX`. Autorizar Google. La función crea una carpeta nueva, guarda las propiedades privadas y programa la retención de 30 días. El registro muestra el secreto para copiarlo directamente a Vercel como `DRIVE_BRIDGE_SECRET`; no compartirlo en el chat. Después desplegar la aplicación web con ejecución como propietario y acceso «Cualquiera», y guardar su enlace `/exec` como `DRIVE_BRIDGE_URL`. Repetir la función conserva el secreto y la carpeta existentes.

También se puede configurar manualmente:

1. Crear una carpeta de Drive para las evidencias nuevas y copiar su ID de la URL.
2. Crear un proyecto NUEVO en Apps Script; pegar `scripts/drive-bridge.gs`. Conservar el proyecto anterior intacto.
3. Configuración del proyecto → Propiedades del script: añadir `DRIVE_BRIDGE_SECRET` y `DRIVE_ROOT_FOLDER_ID`.
4. Desplegar como aplicación web, ejecutar como propietario, acceso «Cualquiera». Copiar `/exec` en `DRIVE_BRIDGE_URL` de Vercel. Las solicitudes se autentican con el secreto enviado únicamente desde el servidor.
5. Probar una entrega con dos fotos y firma y abrir sus evidencias desde otro dispositivo.
6. Ejecutar `activarRetencion30Dias` una vez en el editor y autorizar Google. El trigger diario envía a papelera fotos y firmas **nuevas** `rx-v2_` de más de 30 días. No toca históricos ni otras carpetas. La papelera puede conservarlas hasta 30 días más; revisar espacio y vaciarla cuando corresponda.

Como en la app anterior, las evidencias son enlaces de Drive accesibles para quien tenga el enlace: no están protegidas por la sesión. Si la organización prohíbe ese acceso, el envío falla explícitamente. Apps Script y Drive tienen cuotas propias; validar la cuenta real con una prueba de carga para 500 entregas/día.

## Espacio estimado

500 entregas/día × 2 fotos × 30 días = **30.000 fotos**. Con 100–200 KB cada una son **3–6 GB**, más firmas y papelera. El cliente comprime a 640 px y JPEG 0,5; medir el peso real con fotografías habituales.

Supabase Free publica 1 GB de archivos, 500 MB de base de datos y 5 GB de transferencia no cacheada. Por eso las fotos permanecen en Drive y Supabase guarda referencias. No garantiza coste cero indefinido: Drive comparte espacio con otros productos y el historial de datos de Supabase crece. La baja lógica de entregas no libera inmediatamente espacio en la base.

Fuentes: [Supabase Pricing](https://supabase.com/pricing), [cuotas Apps Script](https://developers.google.com/apps-script/guides/services/quotas), [almacenamiento Google](https://support.google.com/drive/answer/6374270).

## Notificaciones

Cada repartidor abre «Avisos → Activar en este dispositivo» y acepta el permiso. En iPhone/iPad hace falta una versión compatible y añadir la app a la pantalla de inicio. Push depende del permiso, la conexión y las restricciones del sistema; no garantiza visualización inmediata. Los avisos permanecen en la bandeja.

El contador del admin indica solicitudes aceptadas por el proveedor, no visualizaciones confirmadas. Vigencia push: 24 horas. Repartidores deshabilitados no reciben envíos; se limpian suscripciones expiradas. Cerrar sesión elimina la suscripción del dispositivo de esa cuenta.

## Base y seguridad

Tablas `rx_*` con RLS y permisos denegados a `anon`/`authenticated`. Vercel valida rol, sesión y propietario antes de usar su clave de servidor. Son sesiones propias con PIN; no usa Supabase Auth. Cookies HttpOnly/Secure/SameSite=Strict, tokens aleatorios guardados como SHA-256, límite persistente de intentos y sesiones revocables.

SQL ya aplicado, en orden: `db/schema.sql`, `db/atomic-operations.sql`, `db/efficient-sync.sql`, `db/admin-indexes.sql` y `db/delete-pending.sql`. **No volver a ejecutar estos archivos en esrutaxdb.** Solo documentan el esquema para revisión o una instalación vacía distinta.

## Pruebas

```sh
npm ci
npm test
npm run dev
# Otra terminal; Chromium instalado:
CHROMIUM_PATH=/usr/bin/chromium npx playwright test
```

Las pruebas de navegador usan una API simulada. También se probaron las operaciones SQL en la base real dentro de una transacción revertida. Faltan pruebas reales de Drive, Web Push y despliegue Vercel hasta configurar las credenciales.

## Actualizaciones automáticas de destinos

Al asignar un CSV o retirar pendientes, Vercel confirma primero la operación en la base y envía un aviso de Supabase Realtime al repartidor afectado. Con la app abierta, el aviso hace que consulte su ruta mediante la sesión habitual y actualice la lista y el mapa, con un mensaje breve «Ruta actualizada». No necesita aceptar una ventana ni recargar.

La señal no contiene nombres, direcciones ni identificadores de destinos. El nombre de canal es opaco, derivado en el servidor con HMAC; se entrega únicamente a la sesión de ese repartidor. El cliente usa una clave publishable sin acceso a las tablas. Los datos siguen pasando por la API con validación de sesión y propietario; no se exponen claves de servidor ni se abre el acceso a las tablas.

Si se pierde la conexión en tiempo real, sigue la sincronización por versión cada 45 segundos mientras la página esté visible. Al volver al primer plano se consultan los cambios de inmediato. Con la app cerrada o sin conexión no se promete una actualización instantánea; no se añaden notificaciones push para cada cambio de ruta.

Las fotos, firma y campos de una entrega abierta permanecen intactos. Si administración retira precisamente ese destino, aparece un aviso en el formulario y se evita enviar una entrega sobre una asignación retirada. Las evidencias locales pendientes de subida y los destinos manuales sin confirmar se conservan al refrescar.

Realtime consume las cuotas incluidas del proyecto; no se ha contratado ningún plan ni servicio adicional. Se usa una suscripción por app del repartidor y un aviso pequeño por cambio de ruta, en lugar de aumentar la frecuencia de consultas a la base.
