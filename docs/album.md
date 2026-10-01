# Álbum de A&A

## Publicación

Aplicar `supabase/005_album_guests_social.sql` después de `004_album_digital.sql` en el proyecto que utiliza Vercel. La migración es transaccional y se puede repetir; mantiene todos los recuerdos existentes. El código conserva el álbum anterior mientras falta esta migración, para no interrumpir las cargas durante la actualización.

Vercel necesita las variables de `.env.example`, incluyendo `SUPABASE_SECRET_KEY` y las cuatro credenciales de R2. No se agregaron claves nuevas. El bucket debe permitir PUT desde el dominio de la web mediante su CORS existente.

## Prueba funcional

1. Abrir el enlace del QR (`/album/<slug>`) desde un celular. Ingresar un nombre; Quién está y Chispas requieren participación voluntaria. Chispas solicita confirmar 18 años o más.
2. Sacar una foto y elegir archivos de la galería. Los originales se guardan sin filtros ni recompresión; las previews se comprimen como antes.
3. Configurar cupo 2 en `/album-admin`. Dos recuerdos deben entrar y el tercero debe rechazarse también desde la API. Renombrar el perfil mantiene el cupo. 0 significa sin límite. Cada video cuenta como un recuerdo.
4. Abrir otro navegador o dispositivo. Activar Chispas en ambos perfiles y agregar Instagram. Una elección unilateral no expone al emisor ni el contacto; la elección mutua muestra el match. Desactivar participación oculta el perfil y deja de mostrar el contacto.
5. Probar likes, orden Más queridas, Favoritas de A&A y selección por persona. Las fotos anteriores a esta migración permanecen visibles pero no tienen un perfil de invitado asociado.
6. Desconectar Internet y elegir una foto. Volver a conectar con la página abierta o regresar desde el mismo navegador: la cola en IndexedDB permite reintentar sin duplicar archivos. El navegador puede borrar almacenamiento local; no se garantiza carga en segundo plano con la página cerrada.
7. Programar el revelado en el horario del dispositivo del administrador. La galería pública se oculta hasta ese momento; `/album/<slug>/live` se controla por separado.
8. Reportar una foto/persona y revisar el reporte desde el panel. Bloquear un participante detiene cargas, likes y Chispas y lo retira de Quién está. Sus recuerdos se moderan por separado.
9. Descargar originales/favoritas como ZIP desde el panel con una sesión autorizada. Se transmiten sin cargar el álbum completo en memoria. El tiempo máximo configurado es 300 segundos; el límite efectivo depende del plan de Vercel. El máximo actual de listado/exportación es 1000 recuerdos.

## Seguridad y límites

La identidad es por navegador mediante cookie HttpOnly de dos años y hash en servidor. No es una cuenta verificada: otro navegador o borrar cookies crea otro participante. El token no se expone por JSON ni a miembros del planner. Las tablas sociales no aceptan lecturas/escrituras anónimas; las APIs verifican álbum, identidad, bloqueo y consentimiento. Los contactos se devuelven solo a las dos personas con match.

Las reservas de carga y la finalización se serializan con bloqueo de fila por invitado. Las reservas pendientes vencen después de 24 horas; las fallidas liberan cupo. `client_upload_id` hace idempotentes los reintentos. El servidor verifica la presencia y el tamaño del original en R2 antes de marcar una carga como lista. Los enlaces firmados duran poco tiempo; si la pantalla en vivo está habilitada, su selección es accesible independientemente del revelado del álbum.

## Validación

`npm run test` ejecuta los controles de cupo, reintentos, vencimiento, bloqueo, permisos de contactos y funciones, acceso de miembros y consentimiento en un PostgreSQL aislado (PGlite). `npm run typecheck` y `npm run build` verifican el frontend y las rutas.
