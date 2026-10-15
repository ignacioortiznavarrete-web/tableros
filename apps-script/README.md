# Solicitudes de Materiales · Tableros (Google Apps Script)

Web App que gestiona el flujo

```
Solicitud → PMO → ┬ Costos ┬ → Planificación → Producción* → Operaciones → Operaciones Portuarias*
                  └ T&D    ┘
```

- **Costos y T&D** son liberaciones en paralelo: el flujo se divide y sólo continúa cuando ambas aprueban.
- \* **Producción** sólo si la solicitud marca *¿Requiere producción? = Sí*.
- \* **Operaciones Portuarias** (hoja `Exportacion`) sólo si marca *¿Es de exportación? = Sí*.

Todo se registra en la planilla *Tableros*.

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
   - Ejecutar como: **Usuario que accede a la aplicación web**
   - Quién tiene acceso: **Cualquier usuario con cuenta de Google**
   (necesario porque Producción usa una cuenta @gmail.com; con "Ejecutar como: Yo" Google no
   entrega el correo de usuarios fuera de masisa.com).
5. Compartir **como Editor** con todos los responsables (incluida la cuenta gmail):
   la planilla *Tableros* y la carpeta *Factibilidad*.
6. Compartir la URL de la Web App. Cada usuario autoriza los permisos la primera vez que entra.

> Si el administrador de Google Workspace de Masisa bloquea compartir con cuentas externas,
> Producción debe usar una cuenta @masisa.com.
>
> Si ya existía una implementación, usar **Gestionar implementaciones → Editar → Nueva versión**
> para mantener la misma URL.

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
- **Hojas**: la solicitud se guarda en `Solicitudes PMO` (columnas *Exportación* y *Requiere producción*
  al final); cada etapa escribe su fila en `Costos`, `T&D`, `Planificacion`, `Produccion`,
  `Operaciones` y `Exportacion`; todos los movimientos quedan en `Historial`.
- **Permisos por etapa** (`ETAPAS` en `Code.gs`):

  | Etapa | Responsable |
  |---|---|
  | PMO (crea y aprueba) | jose.ortiz@masisa.com |
  | Costos (liberación en paralelo) | giovanna.espinoza@masisa.com |
  | T&D (liberación en paralelo) | **por definir** |
  | Planificación | codificacion.corporativa@masisa.com |
  | Producción (si aplica) | ignacio.ortiznavarrete@gmail.com |
  | Operaciones | ramiro.gonzalez@masisa.com |
  | Operaciones Portuarias (si es exportación) | **por definir** |

  Sólo el responsable puede cambiar el estado (*Pendiente, En revisión, Aprobado, Rechazado*) y
  comentar, y sólo cuando la solicitud está en su etapa. Al **aprobar** pasa a la siguiente etapa
  y se envía un correo al siguiente responsable; **rechazar** exige comentario.
- **Rol Administrador** (`CONFIG.ADMINS`, hoy `giovanna.espinoza@masisa.com`): puede crear,
  editar y aprobar/rechazar en todas las etapas para probar el flujo. Se ve con la etiqueta
  *Administrador* en la cabecera. Quitar el correo de `ADMINS` cuando termine la prueba.
- **Edición por el PMO**: en cualquier etapa (incluso rechazada o finalizada) el PMO puede usar
  *✎ Editar solicitud* para cambiar proyecto, solicitante, material, exportación/producción y
  factibilidad (se valida igual que al crear). Si la solicitud ya había pasado la aprobación del PMO,
  **vuelve a la primera liberación (Costos y T&D)**: esas etapas quedan *Pendiente* y las
  posteriores quedan *Reiniciado* hasta que el flujo las alcance de nuevo. El archivo de factibilidad
  se reescribe (y se mueve si cambió solicitante/proyecto), y el cambio queda en `Historial`.
- **Griffing**: la columna y la hoja ya existen; se integrará más adelante
  (los archivos podrán guardarse en la misma carpeta `<Solicitante>/<Proyecto>`).
