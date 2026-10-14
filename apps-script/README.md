# Solicitudes de Materiales · Tableros (Google Apps Script)

Web App que gestiona el flujo **Solicitud → PMO → Costos → Planificación → Operaciones**
sobre la planilla *Tableros*.

## Archivos

| Archivo | Contenido |
|---|---|
| `Code.gs` | Lógica de servidor: validación contra **Reglas**, creación de carpetas/archivo de factibilidad, cambios de estado, correos. |
| `Index.html` | Estructura de la página (línea de tiempo arriba). |
| `Styles.html` | Diseño (CSS). |
| `JavaScript.html` | Lógica de la interfaz. |
| `appsscript.json` | Manifiesto (zona horaria, Web App). |

## Instalación

1. Abrir la planilla → **Extensiones → Apps Script**.
2. Crear los archivos `Code.gs`, `Index.html`, `Styles.html` y `JavaScript.html` con el contenido de esta carpeta
   (en el editor: *Configuración del proyecto → Mostrar archivo de manifiesto* para pegar `appsscript.json`).
3. Ejecutar una vez la función **`configurarHojas`** desde el editor y aceptar los permisos
   (crea encabezados faltantes y la hoja `Historial`; no sobrescribe los encabezados existentes).
4. **Implementar → Nueva implementación → Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario de masisa.com**
5. Compartir la URL de la Web App con los responsables.

> La cuenta que implementa debe tener edición en la planilla y en la carpeta de Drive de factibilidad.

## Reglas de negocio

- **Validación del material** (hoja `Reglas`): Material = columna **A** (Descripción),
  Tipo de material = columna **E**, Subfamilia = columna **F**. La combinación debe existir en una
  misma fila; si no coincide (p. ej. descripción correcta con un tipo que no le corresponde)
  la solicitud **no se guarda**. Se valida en la interfaz (listas en cascada) y nuevamente en el servidor.
  Si se modifica `Reglas`, ejecutar `refrescarCatalogo` (o esperar 10 min de caché).
- **Número de solicitud** correlativo: `SOL-0001`, `SOL-0002`, …
- **Factibilidad**: las preguntas se configuran en `PREGUNTAS_FACTIBILIDAD` (`Code.gs`).
  Se crea un Google Sheet `Factibilidad SOL-XXXX - <Proyecto>` en
  `Carpeta Factibilidad / <Solicitante> / <Proyecto>`. Las carpetas del solicitante y del proyecto
  se reutilizan si ya existen. Las respuestas también quedan en la hoja `Factibilidad`.
- **Hojas**: la solicitud se guarda en `Solicitudes PMO`; cada etapa escribe su fila en
  `Costos`, `Planificacion` y `Operaciones`; todos los movimientos quedan en `Historial`.
- **Permisos por etapa** (`ETAPAS` en `Code.gs`):

  | Etapa | Responsable |
  |---|---|
  | PMO (crea y aprueba) | jose.ortiz@masisa.com |
  | Costos | giovanna.espinoza@masisa.com |
  | Planificación | codificacion.corporativa@masisa.com |
  | Operaciones | ramiro.gonzalez@masisa.com |

  Sólo el responsable puede cambiar el estado (*Pendiente, En revisión, Aprobado, Rechazado*) y
  comentar, y sólo cuando la solicitud está en su etapa. Al **aprobar** pasa a la siguiente etapa
  y se envía un correo al siguiente responsable; **rechazar** exige comentario.
- **Griffing**: la columna y la hoja ya existen; se integrará más adelante
  (los archivos podrán guardarse en la misma carpeta `<Solicitante>/<Proyecto>`).
