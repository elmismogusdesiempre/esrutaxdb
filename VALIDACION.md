# Validación

- 11 pruebas de servidor/validadores aprobadas: permisos admin, reglas de entrega, PIN con sal, ajustes parciales, revocación de sesión, origen y endpoints push.
- 4 pruebas Chromium aprobadas, móvil y escritorio: perfil y cierre de sesión; PIN admin de 6 dígitos; ajustes por destinatario, avisos, CSV y eliminación; saneamiento HTML.
- Pruebas SQL sobre esrutaxdb con ROLLBACK: asignación atómica, entrega y reintento sin duplicación, rechazo de entrega duplicada, aislamiento de ajustes, avisos para todos, deshacer, eliminación y límite de intentos.
- Las 9 tablas tienen RLS activado y acceso de cliente bloqueado. Los avisos informativos de «RLS sin políticas» son intencionales: solo accede Vercel. Se añadieron los índices de claves foráneas señalados por el asesor.
- No se importaron datos históricos ni se guardaron datos de prueba. No hay administrador con PIN predeterminado.
- Producción aún no se sustituye. Drive, push y Vercel necesitan las variables privadas y permisos de dispositivos.

Antes de activar: probar acceso admin, alta de repartidor, CSV, entrega con dos fotos y firma, enlaces Drive desde otro dispositivo, ajustes individuales/globales, avisos en dispositivos reales, cierre de sesión y retención.
