/**
 * ============================================================================
 *  Tableros · Flujo de Solicitudes de Materiales
 * ----------------------------------------------------------------------------
 *  Solicitud → PMO → Costos → Planificación → Operaciones
 *
 *  - El PMO ingresa la solicitud (proyecto, material, tipo de material,
 *    subfamilia y preguntas de factibilidad).
 *  - El material se valida contra la hoja "Reglas":
 *        Columna A = Descripción (Material)
 *        Columna E = Tipo Material (PT)
 *        Columna F = Subfamilia
 *    La combinación debe existir en una misma fila; si no, no se guarda.
 *  - Se crea en Drive:  <Carpeta raíz>/<Solicitante>/<Proyecto>/Factibilidad …
 *    (las carpetas se reutilizan si ya existen).
 *  - Cada etapa sólo puede ser modificada por su(s) correo(s) responsable(s).
 * ============================================================================
 */

const CONFIG = {
  SPREADSHEET_ID: '15CthLu7g7xMfp6KNg8veRVQQS0sah7QRbRCpoSEOoLo',
  CARPETA_FACTIBILIDAD_ID: '1_Y0B8odDYs_I9MAMtG39jqv9AB-ZUugJ',
  PREFIJO_SOLICITUD: 'SOL-',
  NOTIFICAR_POR_CORREO: true,
  ZONA_HORARIA: 'America/Santiago',
  REGLAS_PRIMERA_FILA: 4,          // fila donde empiezan los datos en "Reglas"
  HOJAS: {
    SOLICITUDES: 'Solicitudes PMO',
    REGLAS: 'Reglas',
    FACTIBILIDAD: 'Factibilidad',
    HISTORIAL: 'Historial'
  },
  // Correos con permiso total (pueden actuar en cualquier etapa). Opcional.
  ADMINS: []
};

/** Etapas del flujo en orden. `emails` = quienes pueden cambiar el estado. */
const ETAPAS = [
  { id: 'PMO',           nombre: 'PMO',           emails: ['jose.ortiz@masisa.com'],               hoja: null },
  { id: 'COSTOS',        nombre: 'Costos',        emails: ['giovanna.espinoza@masisa.com'],        hoja: 'Costos' },
  { id: 'PLANIFICACION', nombre: 'Planificación', emails: ['codificacion.corporativa@masisa.com'], hoja: 'Planificacion' },
  { id: 'OPERACIONES',   nombre: 'Operaciones',   emails: ['ramiro.gonzalez@masisa.com'],          hoja: 'Operaciones' }
];

const ESTADOS = ['Pendiente', 'En revisión', 'Aprobado', 'Rechazado'];

/**
 * Preguntas de factibilidad. Edita libremente esta lista:
 * tipo: 'text' | 'number' | 'date' | 'select' | 'textarea'
 */
const PREGUNTAS_FACTIBILIDAD = [
  { id: 'cliente',      texto: 'Cliente / mercado de destino',                    tipo: 'text',     requerida: true },
  { id: 'volumen',      texto: 'Volumen estimado mensual (m³)',                   tipo: 'number',   requerida: true },
  { id: 'espesor',      texto: 'Espesor requerido (mm)',                          tipo: 'number',   requerida: true },
  { id: 'formato',      texto: 'Formato / dimensiones (ej. 1830 x 2500)',         tipo: 'text',     requerida: true },
  { id: 'certificacion',texto: '¿Requiere certificación?',                        tipo: 'select',   requerida: true,
    opciones: ['No', 'FSC', 'EPA / TSCA', 'FSC + EPA / TSCA'] },
  { id: 'similar',      texto: '¿Existe hoy un material similar en el portafolio?', tipo: 'select', requerida: true,
    opciones: ['Sí', 'No', 'No sé'] },
  { id: 'planta',       texto: 'Planta / línea sugerida',                         tipo: 'text',     requerida: false },
  { id: 'fecha',        texto: 'Fecha requerida',                                 tipo: 'date',     requerida: true },
  { id: 'observaciones',texto: 'Observaciones',                                   tipo: 'textarea', requerida: false }
];

/* ---------- Estructura de columnas ---------- */

const COL_SOL = {
  NUMERO: 1, MATERIAL: 2, FACTIBILIDAD: 3, GRIFFING: 4, ESTADO: 5, SOLICITANTE: 6,
  PROYECTO: 7, TIPO: 8, SUBFAMILIA: 9, FECHA: 10, ETAPA: 11, ESTADO_PMO: 12,
  COMENTARIO_PMO: 13, CORREO: 14, CARPETA: 15, ACTUALIZADO: 16
};
const ENC_SOL = [
  'Numero de solicitud', 'Material', 'Factibilidad', 'Griffing', 'Estado', 'Solicitante',
  'Proyecto', 'Tipo Material', 'Subfamilia', 'Fecha solicitud', 'Etapa actual', 'Estado PMO',
  'Comentario PMO', 'Correo solicitante', 'Carpeta proyecto', 'Última actualización'
];

const COL_ETAPA = { NUMERO: 1, MATERIAL: 2, FACTIBILIDAD: 3, ESTADO: 4, COMENTARIO: 5, RESPONSABLE: 6, ACTUALIZADO: 7 };
const ENC_ETAPA = ['Numero de solicitud', 'Material', 'Factibilidad', 'Estado', 'Comentario', 'Responsable', 'Última actualización'];

const ENC_HISTORIAL = ['Fecha', 'Numero de solicitud', 'Etapa', 'Estado', 'Comentario', 'Usuario'];

const ETAPA_FINALIZADA = 'FINALIZADA';

/* ============================================================================
 *  Web App
 * ========================================================================== */

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Solicitudes de Materiales · Tableros')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

/** Datos iniciales para la interfaz. */
function getInicio() {
  const usuario = usuarioActual_();
  return {
    usuario: usuario,
    roles: ETAPAS.filter(function (e) { return puede_(usuario, e.id); }).map(function (e) { return e.id; }),
    etapas: ETAPAS.map(function (e) { return { id: e.id, nombre: e.nombre, emails: e.emails }; }),
    estados: ESTADOS,
    preguntas: PREGUNTAS_FACTIBILIDAD,
    catalogo: getCatalogo_(),
    solicitudes: listarSolicitudes_(),
    carpetaRaizUrl: 'https://drive.google.com/drive/folders/' + CONFIG.CARPETA_FACTIBILIDAD_ID
  };
}

function getSolicitudes() {
  usuarioActual_();
  return listarSolicitudes_();
}

/* ============================================================================
 *  Crear solicitud
 * ========================================================================== */

function crearSolicitud(datos) {
  const usuario = usuarioActual_();
  if (!puede_(usuario, 'PMO')) {
    throw new Error('Sólo el PMO (' + etapa_('PMO').emails.join(', ') + ') puede ingresar solicitudes.');
  }

  const proyecto = limpiar_(datos && datos.proyecto);
  const solicitante = limpiar_(datos && datos.solicitante);
  if (!proyecto) throw new Error('Debes indicar el nombre del proyecto.');
  if (!solicitante) throw new Error('Debes indicar el nombre del solicitante.');

  const mat = validarMaterial_(datos.material, datos.tipo, datos.subfamilia);
  const respuestas = validarFactibilidad_(datos.factibilidad || {});

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = hoja_(CONFIG.HOJAS.SOLICITUDES, ENC_SOL);
    const numero = siguienteNumero_(sh);
    const ahora = new Date();

    const carpeta = carpetaProyecto_(solicitante, proyecto);
    const archivo = crearArchivoFactibilidad_(carpeta, {
      numero: numero, proyecto: proyecto, solicitante: solicitante, correo: usuario,
      fecha: ahora, material: mat, respuestas: respuestas
    });

    const fila = new Array(ENC_SOL.length).fill('');
    fila[COL_SOL.NUMERO - 1] = numero;
    fila[COL_SOL.MATERIAL - 1] = seguro_(mat.d);
    fila[COL_SOL.FACTIBILIDAD - 1] = archivo.getUrl();
    fila[COL_SOL.GRIFFING - 1] = '';
    fila[COL_SOL.ESTADO - 1] = 'En PMO';
    fila[COL_SOL.SOLICITANTE - 1] = seguro_(solicitante);
    fila[COL_SOL.PROYECTO - 1] = seguro_(proyecto);
    fila[COL_SOL.TIPO - 1] = mat.t;
    fila[COL_SOL.SUBFAMILIA - 1] = mat.s;
    fila[COL_SOL.FECHA - 1] = ahora;
    fila[COL_SOL.ETAPA - 1] = 'PMO';
    fila[COL_SOL.ESTADO_PMO - 1] = 'Pendiente';
    fila[COL_SOL.COMENTARIO_PMO - 1] = '';
    fila[COL_SOL.CORREO - 1] = usuario;
    fila[COL_SOL.CARPETA - 1] = carpeta.getUrl();
    fila[COL_SOL.ACTUALIZADO - 1] = ahora;
    sh.appendRow(fila);

    registrarFactibilidad_(numero, respuestas, archivo.getUrl(), ahora);
    registrarHistorial_(numero, 'Solicitud', 'Creada', 'Proyecto: ' + proyecto, usuario, ahora);
    SpreadsheetApp.flush();

    return {
      numero: numero,
      factibilidadUrl: archivo.getUrl(),
      carpetaUrl: carpeta.getUrl(),
      solicitudes: listarSolicitudes_()
    };
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================================
 *  Cambiar estado de una etapa
 * ========================================================================== */

function actualizarEtapa(numero, etapaId, estado, comentario) {
  const usuario = usuarioActual_();
  const idx = ETAPAS.findIndex(function (e) { return e.id === etapaId; });
  if (idx < 0) throw new Error('Etapa desconocida: ' + etapaId);
  const etapa = ETAPAS[idx];

  if (!puede_(usuario, etapaId)) {
    throw new Error('No tienes permiso para modificar la etapa ' + etapa.nombre +
      '. Responsable: ' + etapa.emails.join(', '));
  }
  if (ESTADOS.indexOf(estado) < 0) throw new Error('Estado no válido: ' + estado);
  comentario = String(comentario || '').trim();
  if (estado === 'Rechazado' && !comentario) throw new Error('Debes dejar un comentario al rechazar.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let siguiente = null;
  let datosCorreo;
  try {
    const sh = hoja_(CONFIG.HOJAS.SOLICITUDES, ENC_SOL);
    const fila = buscarFila_(sh, numero);
    if (!fila) throw new Error('No existe la solicitud ' + numero);
    const r = sh.getRange(fila, 1, 1, ENC_SOL.length).getValues()[0];

    const etapaActual = String(r[COL_SOL.ETAPA - 1] || '');
    if (etapaActual === ETAPA_FINALIZADA) throw new Error('La solicitud ' + numero + ' ya está finalizada.');
    if (etapaActual !== etapaId) {
      const actual = etapa_(etapaActual);
      throw new Error('La solicitud ' + numero + ' se encuentra en la etapa ' +
        (actual ? actual.nombre : etapaActual) + '. Aún no puedes modificar ' + etapa.nombre + '.');
    }

    const ahora = new Date();
    const materialTxt = textoMaterial_(r[COL_SOL.MATERIAL - 1], r[COL_SOL.TIPO - 1], r[COL_SOL.SUBFAMILIA - 1]);
    const factUrl = r[COL_SOL.FACTIBILIDAD - 1];

    if (etapa.id === 'PMO') {
      sh.getRange(fila, COL_SOL.ESTADO_PMO, 1, 2).setValues([[estado, seguro_(comentario)]]);
    } else {
      upsertEtapa_(etapa, numero, materialTxt, factUrl, estado, comentario, usuario, ahora);
    }

    let estadoGlobal;
    let nuevaEtapa = etapaId;
    if (estado === 'Aprobado') {
      siguiente = ETAPAS[idx + 1] || null;
      if (siguiente) {
        nuevaEtapa = siguiente.id;
        upsertEtapa_(siguiente, numero, materialTxt, factUrl, 'Pendiente', '', siguiente.emails.join(', '), ahora);
        estadoGlobal = 'En ' + siguiente.nombre;
      } else {
        nuevaEtapa = ETAPA_FINALIZADA;
        estadoGlobal = 'Finalizada';
      }
    } else if (estado === 'Rechazado') {
      estadoGlobal = 'Rechazada en ' + etapa.nombre;
    } else {
      estadoGlobal = 'En ' + etapa.nombre + (estado === 'En revisión' ? ' · En revisión' : '');
    }

    sh.getRange(fila, COL_SOL.ESTADO).setValue(estadoGlobal);
    sh.getRange(fila, COL_SOL.ETAPA).setValue(nuevaEtapa);
    sh.getRange(fila, COL_SOL.ACTUALIZADO).setValue(ahora);
    registrarHistorial_(numero, etapa.nombre, estado, comentario, usuario, ahora);
    SpreadsheetApp.flush();

    datosCorreo = {
      numero: numero,
      proyecto: r[COL_SOL.PROYECTO - 1],
      material: materialTxt,
      factUrl: factUrl,
      etapa: etapa.nombre,
      estado: estado,
      comentario: comentario,
      usuario: usuario,
      correoSolicitante: r[COL_SOL.CORREO - 1],
      estadoGlobal: estadoGlobal
    };
  } finally {
    lock.releaseLock();
  }

  // Notificaciones (fuera del lock)
  if (estado === 'Aprobado' && siguiente) {
    notificar_(siguiente.emails, '[' + numero + '] Solicitud pendiente en ' + siguiente.nombre, datosCorreo,
      'Tienes una solicitud de material pendiente de revisión en la etapa <b>' + siguiente.nombre + '</b>.');
  } else if (estado === 'Aprobado' || estado === 'Rechazado') {
    const destinatarios = etapa_('PMO').emails.concat(datosCorreo.correoSolicitante ? [datosCorreo.correoSolicitante] : []);
    notificar_(destinatarios, '[' + numero + '] ' + datosCorreo.estadoGlobal, datosCorreo,
      estado === 'Aprobado' ? 'La solicitud completó todo el flujo y quedó <b>Finalizada</b>.'
                            : 'La solicitud fue <b>rechazada</b> en la etapa ' + etapa.nombre + '.');
  }

  return listarSolicitudes_();
}

/* ============================================================================
 *  Catálogo y validación de material (hoja Reglas)
 * ========================================================================== */

function getCatalogo_() {
  const cache = CacheService.getScriptCache();
  const enCache = cache.get('catalogo_reglas_v1');
  if (enCache) return JSON.parse(enCache);

  const sh = ss_().getSheetByName(CONFIG.HOJAS.REGLAS);
  if (!sh) throw new Error('No existe la hoja "' + CONFIG.HOJAS.REGLAS + '".');
  const ultima = sh.getLastRow();
  if (ultima < CONFIG.REGLAS_PRIMERA_FILA) return [];

  const valores = sh.getRange(CONFIG.REGLAS_PRIMERA_FILA, 1, ultima - CONFIG.REGLAS_PRIMERA_FILA + 1, 7).getValues();
  const vistos = {};
  const lista = [];
  let ultimaDescripcion = '';

  valores.forEach(function (r) {
    let d = limpiar_(r[0]);   // A  Descripción
    const t = limpiar_(r[4]); // E  Tipo Material (PT)
    const s = limpiar_(r[5]); // F  Subfamilia
    const sn = limpiar_(r[6]); // G  Nombre subfamilia
    if (!t) { ultimaDescripcion = ''; return; }   // filas de título de sección
    if (!d) d = ultimaDescripcion;                // celdas combinadas en A
    else ultimaDescripcion = d;
    if (!d) return;
    const k = clave_(d, t, s);
    if (vistos[k]) return;
    vistos[k] = true;
    lista.push({ d: d, t: t, s: s, sn: sn });
  });

  cache.put('catalogo_reglas_v1', JSON.stringify(lista), 600);
  return lista;
}

/** Limpia la caché del catálogo (ejecutar si se modifica la hoja Reglas). */
function refrescarCatalogo() {
  CacheService.getScriptCache().remove('catalogo_reglas_v1');
  return getCatalogo_().length;
}

function validarMaterial_(material, tipo, subfamilia) {
  const d = limpiar_(material), t = limpiar_(tipo), s = limpiar_(subfamilia);
  if (!d) throw new Error('Debes seleccionar el material (descripción).');
  if (!t) throw new Error('Debes seleccionar el tipo de material.');
  if (!s) throw new Error('Debes seleccionar la subfamilia.');

  const cat = getCatalogo_();
  const porDesc = cat.filter(function (x) { return norm_(x.d) === norm_(d); });
  if (!porDesc.length) {
    throw new Error('El material "' + d + '" no existe en la hoja Reglas.');
  }
  const porTipo = porDesc.filter(function (x) { return norm_(x.t) === norm_(t); });
  if (!porTipo.length) {
    throw new Error('El tipo de material "' + t + '" no corresponde a "' + d + '". Tipos válidos: ' +
      unicos_(porDesc.map(function (x) { return x.t; })).join(', ') + '.');
  }
  const exacto = porTipo.filter(function (x) { return norm_(x.s) === norm_(s); })[0];
  if (!exacto) {
    throw new Error('La subfamilia "' + s + '" no corresponde a "' + d + '" / ' + t + '. Subfamilias válidas: ' +
      unicos_(porTipo.map(function (x) { return x.s; })).join(', ') + '.');
  }
  return exacto;
}

function validarFactibilidad_(entrada) {
  return PREGUNTAS_FACTIBILIDAD.map(function (p) {
    const valor = String(entrada[p.id] == null ? '' : entrada[p.id]).trim();
    if (p.requerida && !valor) throw new Error('Factibilidad: falta responder "' + p.texto + '".');
    if (valor && p.tipo === 'number' && isNaN(Number(valor.replace(',', '.')))) {
      throw new Error('Factibilidad: "' + p.texto + '" debe ser numérico.');
    }
    if (valor && p.tipo === 'select' && p.opciones.indexOf(valor) < 0) {
      throw new Error('Factibilidad: respuesta no válida en "' + p.texto + '".');
    }
    return { id: p.id, pregunta: p.texto, respuesta: valor };
  });
}

/* ============================================================================
 *  Drive: carpetas y archivo de factibilidad
 * ========================================================================== */

/** <raíz>/<Solicitante>/<Proyecto>. Reutiliza carpetas existentes. */
function carpetaProyecto_(solicitante, proyecto) {
  const raiz = DriveApp.getFolderById(CONFIG.CARPETA_FACTIBILIDAD_ID);
  const carpetaSolicitante = obtenerOCrearCarpeta_(raiz, nombreSeguro_(solicitante));
  return obtenerOCrearCarpeta_(carpetaSolicitante, nombreSeguro_(proyecto));
}

function obtenerOCrearCarpeta_(padre, nombre) {
  const it = padre.getFolders();
  const buscado = norm_(nombre);
  while (it.hasNext()) {
    const f = it.next();
    if (norm_(f.getName()) === buscado) return f;
  }
  return padre.createFolder(nombre);
}

function crearArchivoFactibilidad_(carpeta, info) {
  const nombre = 'Factibilidad ' + info.numero + ' - ' + nombreSeguro_(info.proyecto);
  const libro = SpreadsheetApp.create(nombre);
  const sh = libro.getSheets()[0];
  sh.setName('Factibilidad');

  const filas = [
    ['Factibilidad de material', ''],
    ['', ''],
    ['Número de solicitud', info.numero],
    ['Proyecto', seguro_(info.proyecto)],
    ['Solicitante', seguro_(info.solicitante)],
    ['Correo', info.correo],
    ['Fecha', fecha_(info.fecha)],
    ['Material (descripción)', info.material.d],
    ['Tipo de material', info.material.t],
    ['Subfamilia', info.material.s + (info.material.sn ? ' — ' + info.material.sn : '')],
    ['', ''],
    ['Pregunta', 'Respuesta']
  ].concat(info.respuestas.map(function (r) { return [r.pregunta, seguro_(r.respuesta)]; }));

  sh.getRange(1, 1, filas.length, 2).setValues(filas);
  sh.getRange('A1:B1').merge().setFontSize(16).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#0f5c4a').setVerticalAlignment('middle');
  sh.setRowHeight(1, 40);
  sh.getRange(3, 1, 8, 1).setFontWeight('bold').setFontColor('#334155');
  sh.getRange(3, 1, 8, 2).setBackground('#f1f5f4');
  sh.getRange(12, 1, 1, 2).setFontWeight('bold').setFontColor('#ffffff').setBackground('#1f7a63');
  sh.getRange(12, 1, filas.length - 11, 2).setBorder(true, true, true, true, true, true, '#cbd5e1',
    SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(1, 1, filas.length, 2).setWrap(true).setVerticalAlignment('middle');
  sh.setColumnWidth(1, 320);
  sh.setColumnWidth(2, 420);
  sh.setFrozenRows(1);
  SpreadsheetApp.flush();

  const archivo = DriveApp.getFileById(libro.getId());
  archivo.moveTo(carpeta);
  return archivo;
}

/* ============================================================================
 *  Lectura de solicitudes
 * ========================================================================== */

function listarSolicitudes_() {
  const sh = hoja_(CONFIG.HOJAS.SOLICITUDES, ENC_SOL);
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const valores = sh.getRange(2, 1, n, ENC_SOL.length).getValues();

  const porEtapa = {};
  ETAPAS.forEach(function (e) { if (e.hoja) porEtapa[e.id] = leerEtapa_(e); });
  const historial = leerHistorial_();

  return valores
    .filter(function (r) { return String(r[0]).trim() !== ''; })
    .map(function (r) {
      const numero = String(r[COL_SOL.NUMERO - 1]);
      const pmo = etapa_('PMO');
      return {
        numero: numero,
        material: String(r[COL_SOL.MATERIAL - 1]),
        tipo: String(r[COL_SOL.TIPO - 1]),
        subfamilia: String(r[COL_SOL.SUBFAMILIA - 1]),
        proyecto: String(r[COL_SOL.PROYECTO - 1]),
        solicitante: String(r[COL_SOL.SOLICITANTE - 1]),
        correo: String(r[COL_SOL.CORREO - 1]),
        factibilidadUrl: String(r[COL_SOL.FACTIBILIDAD - 1]),
        griffing: String(r[COL_SOL.GRIFFING - 1]),
        carpetaUrl: String(r[COL_SOL.CARPETA - 1]),
        estado: String(r[COL_SOL.ESTADO - 1]),
        etapaActual: String(r[COL_SOL.ETAPA - 1]),
        fecha: fecha_(r[COL_SOL.FECHA - 1]),
        actualizado: fecha_(r[COL_SOL.ACTUALIZADO - 1]),
        etapas: ETAPAS.map(function (e) {
          if (e.id === 'PMO') {
            return {
              id: 'PMO',
              estado: String(r[COL_SOL.ESTADO_PMO - 1] || 'Pendiente'),
              comentario: String(r[COL_SOL.COMENTARIO_PMO - 1] || ''),
              responsable: pmo.emails.join(', ')
            };
          }
          const x = porEtapa[e.id][numero];
          return x ? { id: e.id, estado: x.estado, comentario: x.comentario, responsable: x.responsable, actualizado: x.actualizado }
                   : { id: e.id, estado: '', comentario: '', responsable: '' };
        }),
        historial: historial[numero] || []
      };
    })
    .reverse();
}

function leerEtapa_(etapa) {
  const sh = hoja_(etapa.hoja, ENC_ETAPA);
  const n = sh.getLastRow() - 1;
  const mapa = {};
  if (n < 1) return mapa;
  sh.getRange(2, 1, n, ENC_ETAPA.length).getValues().forEach(function (r) {
    const num = String(r[COL_ETAPA.NUMERO - 1]).trim();
    if (!num) return;
    mapa[num] = {
      estado: String(r[COL_ETAPA.ESTADO - 1] || ''),
      comentario: String(r[COL_ETAPA.COMENTARIO - 1] || ''),
      responsable: String(r[COL_ETAPA.RESPONSABLE - 1] || ''),
      actualizado: fecha_(r[COL_ETAPA.ACTUALIZADO - 1])
    };
  });
  return mapa;
}

function leerHistorial_() {
  const sh = hoja_(CONFIG.HOJAS.HISTORIAL, ENC_HISTORIAL);
  const n = sh.getLastRow() - 1;
  const mapa = {};
  if (n < 1) return mapa;
  sh.getRange(2, 1, n, ENC_HISTORIAL.length).getValues().forEach(function (r) {
    const num = String(r[1]);
    (mapa[num] = mapa[num] || []).push({
      fecha: fecha_(r[0]), etapa: String(r[2]), estado: String(r[3]), comentario: String(r[4]), usuario: String(r[5])
    });
  });
  return mapa;
}

/* ============================================================================
 *  Escritura auxiliar
 * ========================================================================== */

function upsertEtapa_(etapa, numero, materialTxt, factUrl, estado, comentario, responsable, fecha) {
  const sh = hoja_(etapa.hoja, ENC_ETAPA);
  const valores = [numero, seguro_(materialTxt), factUrl, estado, seguro_(comentario), responsable, fecha];
  const fila = buscarFila_(sh, numero);
  if (fila) sh.getRange(fila, 1, 1, valores.length).setValues([valores]);
  else sh.appendRow(valores);
}

function registrarFactibilidad_(numero, respuestas, url, fecha) {
  const enc = ['Solicitud'].concat(PREGUNTAS_FACTIBILIDAD.map(function (p) { return p.texto; }), ['Link archivo', 'Fecha']);
  const sh = hoja_(CONFIG.HOJAS.FACTIBILIDAD, enc);
  sh.appendRow([numero].concat(respuestas.map(function (r) { return seguro_(r.respuesta); }), [url, fecha]));
}

function registrarHistorial_(numero, etapa, estado, comentario, usuario, fecha) {
  hoja_(CONFIG.HOJAS.HISTORIAL, ENC_HISTORIAL)
    .appendRow([fecha, numero, etapa, estado, seguro_(comentario), usuario]);
}

function siguienteNumero_(sh) {
  let max = 0;
  const n = sh.getLastRow() - 1;
  if (n > 0) {
    sh.getRange(2, 1, n, 1).getValues().forEach(function (r) {
      const m = String(r[0]).match(/(\d+)\s*$/);
      if (m) max = Math.max(max, Number(m[1]));
    });
  }
  return CONFIG.PREFIJO_SOLICITUD + ('0000' + (max + 1)).slice(-4);
}

function buscarFila_(sh, numero) {
  const n = sh.getLastRow() - 1;
  if (n < 1) return 0;
  const col = sh.getRange(2, 1, n, 1).getValues();
  for (let i = 0; i < col.length; i++) {
    if (String(col[i][0]).trim() === String(numero).trim()) return i + 2;
  }
  return 0;
}

/* ============================================================================
 *  Notificaciones
 * ========================================================================== */

function notificar_(destinatarios, asunto, d, intro) {
  if (!CONFIG.NOTIFICAR_POR_CORREO) return;
  const para = unicos_(destinatarios.filter(String)).join(',');
  if (!para) return;
  const url = ScriptApp.getService().getUrl();
  const html =
    '<div style="font-family:Arial,sans-serif;max-width:560px;color:#0f172a">' +
    '<div style="background:#0f5c4a;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0;font-size:18px">' +
    'Solicitud ' + esc_(d.numero) + '</div>' +
    '<div style="border:1px solid #e2e8f0;border-top:0;padding:20px;border-radius:0 0 10px 10px">' +
    '<p>' + intro + '</p>' +
    '<table style="border-collapse:collapse;font-size:14px">' +
    filaCorreo_('Proyecto', d.proyecto) + filaCorreo_('Material', d.material) +
    filaCorreo_('Etapa', d.etapa) + filaCorreo_('Estado', d.estado) +
    (d.comentario ? filaCorreo_('Comentario', d.comentario) : '') +
    filaCorreo_('Actualizado por', d.usuario) +
    '</table>' +
    '<p style="margin-top:20px">' +
    (url ? '<a href="' + url + '" style="background:#1f7a63;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir aplicación</a> ' : '') +
    (d.factUrl ? '&nbsp;<a href="' + d.factUrl + '">Ver factibilidad</a>' : '') +
    '</p></div></div>';
  try {
    MailApp.sendEmail({ to: para, subject: asunto, htmlBody: html });
  } catch (e) {
    console.warn('No se pudo enviar correo: ' + e);
  }
}

function filaCorreo_(k, v) {
  return '<tr><td style="padding:4px 12px 4px 0;color:#64748b">' + esc_(k) + '</td><td style="padding:4px 0"><b>' +
    esc_(v) + '</b></td></tr>';
}

/* ============================================================================
 *  Utilidades
 * ========================================================================== */

let _ss = null;
function ss_() {
  if (!_ss) _ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  return _ss;
}

function hoja_(nombre, encabezados) {
  let sh = ss_().getSheetByName(nombre);
  if (!sh) sh = ss_().insertSheet(nombre);
  if (encabezados) asegurarEncabezados_(sh, encabezados);
  return sh;
}

/** Completa encabezados vacíos sin sobrescribir los existentes. */
function asegurarEncabezados_(sh, encabezados) {
  if (sh.getMaxColumns() < encabezados.length) {
    sh.insertColumnsAfter(sh.getMaxColumns(), encabezados.length - sh.getMaxColumns());
  }
  const rango = sh.getRange(1, 1, 1, encabezados.length);
  const actual = rango.getValues()[0];
  let cambio = false;
  encabezados.forEach(function (h, i) {
    if (String(actual[i]).trim() === '') { actual[i] = h; cambio = true; }
  });
  if (cambio) {
    rango.setValues([actual]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
}

function usuarioActual_() {
  const email = String(Session.getActiveUser().getEmail() || '').toLowerCase().trim();
  if (!email) {
    throw new Error('No se pudo identificar tu correo. Ingresa con tu cuenta @masisa.com ' +
      '(la aplicación debe estar publicada para usuarios del dominio).');
  }
  return email;
}

function puede_(email, etapaId) {
  email = String(email || '').toLowerCase();
  if (CONFIG.ADMINS.map(lower_).indexOf(email) >= 0) return true;
  const e = etapa_(etapaId);
  return !!e && e.emails.map(lower_).indexOf(email) >= 0;
}

function etapa_(id) {
  return ETAPAS.filter(function (e) { return e.id === id; })[0] || null;
}

function textoMaterial_(d, t, s) {
  return [d, t, s].filter(function (x) { return String(x).trim(); }).join(' · ');
}

function limpiar_(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
function norm_(v) { return limpiar_(v).toUpperCase(); }
function lower_(v) { return String(v).toLowerCase().trim(); }
function clave_(d, t, s) { return norm_(d) + '|' + norm_(t) + '|' + norm_(s); }
function unicos_(arr) { return arr.filter(function (x, i) { return arr.indexOf(x) === i; }); }

/** Evita que un texto ingresado se interprete como fórmula. */
function seguro_(v) {
  const s = String(v == null ? '' : v);
  return /^[=+@]/.test(s) ? "'" + s : s;
}

function nombreSeguro_(v) {
  return limpiar_(v).replace(/[\\/:*?"<>|#]/g, '-').slice(0, 120);
}

function fecha_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, CONFIG.ZONA_HORARIA, 'dd-MM-yyyy HH:mm');
  return v ? String(v) : '';
}

function esc_(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/** Ejecutar una vez desde el editor para crear encabezados y autorizar permisos. */
function configurarHojas() {
  hoja_(CONFIG.HOJAS.SOLICITUDES, ENC_SOL);
  ETAPAS.forEach(function (e) { if (e.hoja) hoja_(e.hoja, ENC_ETAPA); });
  hoja_(CONFIG.HOJAS.HISTORIAL, ENC_HISTORIAL);
  hoja_(CONFIG.HOJAS.FACTIBILIDAD,
    ['Solicitud'].concat(PREGUNTAS_FACTIBILIDAD.map(function (p) { return p.texto; }), ['Link archivo', 'Fecha']));
  DriveApp.getFolderById(CONFIG.CARPETA_FACTIBILIDAD_ID).getName();
  return 'Hojas listas. Materiales en catálogo: ' + refrescarCatalogo();
}
