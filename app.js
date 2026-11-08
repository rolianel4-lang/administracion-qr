const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx3B0CBbj-SWr-DiEv2jjireS3ntpNparG8kElk3cW_UO21JdPRPah_HOZpdP84El4/exec";

let html5QrCode = new Html5Qrcode("reader");
let todosLosEstudiantes = [];
let estudianteActualModal = null;
let estudianteSeleccionadoIncidencia = null;
let estudianteSeleccionadoCitacion = null;
let estudianteFiltradoHistorial = null;

// -------------------------------------------------------------
// CONTROL DE ACCESO (LOGIN POR CONTRASEÑA CONSULTADA EN SHEETS)
// -------------------------------------------------------------
async function solicitarLogin() {
    let autenticado = false;

    while (!autenticado) {
        const { value: password } = await Swal.fire({
            title: 'Acceso Restringido',
            text: 'Por favor ingresa la contraseña de autorización:',
            input: 'password',
            inputPlaceholder: 'Contraseña de acceso',
            allowOutsideClick: false,
            allowEscapeKey: false,
            confirmButtonText: 'Ingresar',
            confirmButtonColor: '#1e3a8a',
            inputValidator: (value) => {
                if (!value) {
                    return 'Debes ingresar una contraseña';
                }
            }
        });

        Swal.fire({ title: 'Verificando contraseña...', didOpen: () => Swal.showLoading() });

        try {
            const res = await fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'validarLogin', password: password })
            }).then(r => r.json());

            if (res.success) {
                autenticado = true;
                Swal.fire({
                    icon: 'success',
                    title: '¡Bienvenido!',
                    text: `Acceso concedido a: ${res.usuario}`,
                    timer: 1500,
                    showConfirmButton: false
                });
            } else {
                await Swal.fire('Acceso Denegado', 'La contraseña ingresada no es válida', 'error');
            }
        } catch (e) {
            await Swal.fire('Error de conexión', 'No se pudo verificar la credencial', 'error');
        }
    }
}

// -------------------------------------------------------------
// FUNCIONES AUXILIARES DE FECHA Y HORA (HORA BOLIVIANA AMÉRICA/LA_PAZ)
// -------------------------------------------------------------
const obtenerFechaISO = () => {
    return new Intl.DateTimeFormat('en-CA', { 
        timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' 
    }).format(new Date());
};

const obtenerFechaBolivia = () => {
    const partes = new Intl.DateTimeFormat('es-BO', {
        timeZone: 'America/La_Paz', day: '2-digit', month: '2-digit', year: 'numeric'
    }).formatToParts(new Date());

    const dia = partes.find(p => p.type === 'day').value;
    const mes = partes.find(p => p.type === 'month').value;
    const anio = partes.find(p => p.type === 'year').value;

    return `${dia}/${mes}/${anio}`;
};

const formatearFechaDDMMYYYY = (fechaStr) => {
    if (!fechaStr) return '';
    const str = String(fechaStr).trim();

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;

    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
        const [y, m, d] = str.split('T')[0].split('-');
        return `${d}/${m}/${y}`;
    }

    const d = new Date(str);
    if (!isNaN(d.getTime())) {
        const partes = new Intl.DateTimeFormat('es-BO', {
            timeZone: 'America/La_Paz', day: '2-digit', month: '2-digit', year: 'numeric'
        }).formatToParts(d);
        const dia = partes.find(p => p.type === 'day').value;
        const mes = partes.find(p => p.type === 'month').value;
        const anio = partes.find(p => p.type === 'year').value;
        return `${dia}/${mes}/${anio}`;
    }

    return str;
};

const formatearHoraHHMM = (horaStr) => {
    if (!horaStr) return '';
    const str = String(horaStr).trim();

    if (str.includes('T')) {
        const d = new Date(str);
        if (!isNaN(d.getTime())) {
            return d.toLocaleTimeString('es-BO', {
                timeZone: 'America/La_Paz',
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }

    if (/^\d{2}:\d{2}/.test(str)) {
        return str.substring(0, 5);
    }

    return str;
};

const obtenerHoraBolivia = () => {
    return new Date().toLocaleTimeString('es-BO', {
        timeZone: 'America/La_Paz', hour12: false, hour: '2-digit', minute: '2-digit'
    });
};

function cambiarPestana(tabId, event) {
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(tb => tb.classList.remove('active'));

    document.getElementById(tabId).classList.add('active');
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    if (tabId === 'tab-historial' && (!event || event.type === 'click')) {
        estudianteFiltradoHistorial = null;
        document.getElementById("histTituloSub").innerText = "Consulta General de Todos los Estudiantes";
    }
}

function seleccionarModoEntrada(modo) {
    document.getElementById('btnModoQR').classList.remove('active');
    document.getElementById('btnModoManual').classList.remove('active');

    if (modo === 'qr') {
        document.getElementById('btnModoQR').classList.add('active');
        document.getElementById('seccionQR').style.display = 'block';
        document.getElementById('seccionManual').style.display = 'none';
    } else {
        document.getElementById('btnModoManual').classList.add('active');
        document.getElementById('seccionQR').style.display = 'none';
        document.getElementById('seccionManual').style.display = 'block';
    }
}

async function cargarEstudiantesGlobales() {
    try {
        const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=getData&sheet=estudiantes`).then(r => r.json());
        todosLosEstudiantes = Array.isArray(res) ? res : [];
        
        const cursosUnicos = [...new Set(todosLosEstudiantes.map(i => i.curso).filter(Boolean))].sort();
        const sel = document.getElementById("filtroCursoManual");
        if (sel) {
            sel.innerHTML = '<option value="">-- Seleccionar Curso --</option>';
            cursosUnicos.forEach(c => {
                let opt = document.createElement("option");
                opt.value = c; opt.innerText = c;
                sel.appendChild(opt);
            });
        }
    } catch (e) {
        console.error("Error al cargar estudiantes:", e);
    }
}

function abrirPanelAccionEstudiante(ci) {
    const alu = todosLosEstudiantes.find(e => String(e.ci).trim() === String(ci).trim());
    if (!alu) return Swal.fire('Error', 'Estudiante no registrado', 'error');

    estudianteActualModal = alu;

    Swal.fire({
        title: `<strong style="color:var(--primary);">${alu.nombre}</strong>`,
        html: `
            <p style="margin:0 0 12px; color:#64748b; font-size:0.88rem;">C.I: <b>${alu.ci}</b> | Curso: <b>${alu.curso}</b></p>
            
            <div style="text-align:left; font-size:0.75rem; font-weight:800; color:#475569; letter-spacing:0.5px;">1. REGISTRAR ASISTENCIA / PERMISO:</div>
            <div class="grid-asistencia-btns">
                <button class="btn-estado btn-p" onclick="marcarEstadoModal('P')">P<span>Presente</span></button>
                <button class="btn-estado btn-a" onclick="marcarEstadoModal('A')">A<span>Atraso</span></button>
                <button class="btn-estado btn-f" onclick="marcarEstadoModal('F')">F<span>Falta</span></button>
                <button class="btn-estado btn-l" onclick="marcarEstadoModal('L')">L<span>Licencia</span></button>
            </div>

            <textarea id="modalObs" placeholder="Observación / Motivo permiso (opcional)..." style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px; font-size:0.85rem; margin-bottom:15px;"></textarea>

            <div style="text-align:left; font-size:0.75rem; font-weight:800; color:#475569; letter-spacing:0.5px;">2. ACCIONES DIRECTAS PARA EL ALUMNO:</div>
            <div class="grid-acciones-estudiante">
                <button class="btn-accion-opt" onclick="irAIncidenciaModal()"><i class="fa-solid fa-triangle-exclamation" style="color:var(--warning);"></i> Incidencia</button>
                <button class="btn-accion-opt" onclick="irACitacionModal()"><i class="fa-solid fa-file-signature" style="color:var(--primary);"></i> Generar Citación</button>
                <button class="btn-accion-opt" onclick="irACredencialModal()"><i class="fa-solid fa-id-card" style="color:var(--info);"></i> Credencial</button>
                <button class="btn-accion-opt" onclick="consultarHistorialModal()"><i class="fa-solid fa-clock-rotate-left" style="color:var(--success);"></i> Ver Historial</button>
            </div>
        `,
        showConfirmButton: false,
        showCloseButton: true
    });
}

async function marcarEstadoModal(estado) {
    if (!estudianteActualModal) return;

    const payload = {
        action: 'guardarAsistencia',
        ci_estudiante: String(estudianteActualModal.ci).trim(),
        nombre_estudiante: estudianteActualModal.nombre,
        curso: estudianteActualModal.curso,
        fecha: obtenerFechaBolivia(),
        hora: obtenerHoraBolivia(),
        estado: estado,
        observacion: document.getElementById("modalObs") ? document.getElementById("modalObs").value : ""
    };

    Swal.fire({ title: 'Guardando...', didOpen: () => Swal.showLoading() });
    
    const res = await fetch(GOOGLE_SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) }).then(r => r.json());
    if (res.success) {
        Swal.fire('Registrado', `Asistencia (${estado}) guardada para ${estudianteActualModal.nombre}`, 'success');
    } else {
        Swal.fire('Error', 'No se pudo completar el registro', 'error');
    }
}

function irAIncidenciaModal() {
    Swal.close();
    cambiarPestana('tab-incidencias');
    selEstIncidencia(estudianteActualModal.ci);
}

function irACitacionModal() {
    Swal.close();
    cambiarPestana('tab-citaciones');
    selEstCitacion(estudianteActualModal.ci);
}

function irACredencialModal() {
    Swal.close();
    cambiarPestana('tab-credenciales');
    generarCredencialEstudiante(estudianteActualModal.ci);
}

function consultarHistorialModal() {
    if (!estudianteActualModal) return;
    
    estudianteFiltradoHistorial = String(estudianteActualModal.ci).trim();
    
    Swal.close();
    cambiarPestana('tab-historial');

    document.getElementById("histFecha").value = "";
    document.getElementById("histTituloSub").innerText = `Historial Exclusivo: ${estudianteActualModal.nombre} (C.I: ${estudianteActualModal.ci})`;
    
    buscarHistorial();
}

async function buscarHistorial() {
    const categoria = document.getElementById("histCategoria").value;
    const fechaSeleccionada = document.getElementById("histFecha").value;
    const fechaFiltroBolivia = fechaSeleccionada ? formatearFechaDDMMYYYY(fechaSeleccionada) : "";

    let sheetTarget = 'asistencias';
    if (categoria === 'incidencias') sheetTarget = 'incidencias';
    if (categoria === 'citaciones') sheetTarget = 'citaciones';

    Swal.fire({ title: 'Consultando historial...', didOpen: () => Swal.showLoading() });

    const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=getData&sheet=${sheetTarget}`).then(r => r.json());
    Swal.close();

    let filtrados = Array.isArray(res) ? res : [];

    if (estudianteFiltradoHistorial) {
        filtrados = filtrados.filter(item => String(item.ci_estudiante).trim() === String(estudianteFiltradoHistorial).trim());
    }

    if (categoria.startsWith('asistencias_') && categoria !== 'asistencias_TODAS') {
        const estadoCod = categoria.split('_')[1];
        filtrados = filtrados.filter(item => String(item.estado) === String(estadoCod));
    }

    if (fechaFiltroBolivia) {
        filtrados = filtrados.filter(item => {
            const fItem = formatearFechaDDMMYYYY(item.fecha || item.fecha_cita);
            return fItem === fechaFiltroBolivia;
        });
    }

    const tbody = document.getElementById("histCuerpo");
    if (!filtrados.length) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px;">No se encontraron registros para los criterios seleccionados.</td></tr>';
        return;
    }

    if (sheetTarget === 'asistencias') {
        tbody.innerHTML = filtrados.map(r => `
            <tr>
                <td><b>${r.nombre_estudiante}</b><br><small>C.I: ${r.ci_estudiante} (${r.curso})</small></td>
                <td>${formatearFechaDDMMYYYY(r.fecha)} ${formatearHoraHHMM(r.hora)}<br><small>${r.observacion || ''}</small></td>
                <td><span style="font-weight:bold; color:var(--primary);">${r.estado}</span></td>
            </tr>
        `).join('');
    } else if (sheetTarget === 'incidencias') {
        tbody.innerHTML = filtrados.map(r => `
            <tr>
                <td><b>${r.nombre_estudiante}</b><br><small>C.I: ${r.ci_estudiante}</small></td>
                <td><b>${r.tipo_incidencia}</b><br><small>${r.descripcion}</small></td>
                <td>${formatearFechaDDMMYYYY(r.fecha)}</td>
            </tr>
        `).join('');
    } else if (sheetTarget === 'citaciones') {
        tbody.innerHTML = filtrados.map(r => `
            <tr>
                <td><b>${r.nombre_estudiante}</b><br><small>C.I: ${r.ci_estudiante}</small></td>
                <td>Tutor: ${r.tutor}<br><small>Cita: ${formatearFechaDDMMYYYY(r.fecha_cita)} ${formatearHoraHHMM(r.hora_cita)}</small></td>
                <td><a href="${r.pdf_url}" target="_blank" style="color:var(--primary); font-weight:bold;"><i class="fa-solid fa-file-pdf"></i> PDF</a></td>
            </tr>
        `).join('');
    }
}

function limpiarFormularioEstudiante() {
    document.getElementById("crudCI").value = "";
    document.getElementById("crudNombre").value = "";
    document.getElementById("crudCurso").value = "";
    document.getElementById("crudTutor").value = "";
    document.getElementById("crudTelTutor").value = "";
    document.getElementById("crudQR").value = "";
    document.getElementById("crudCI").readOnly = false;
    document.getElementById("resGestionEst").style.display = "none";
}

function filtrarEstudiantesGestion(query) {
    const resDiv = document.getElementById("resGestionEst");
    if (!query || query.length < 2) return resDiv.style.display = "none";

    const q = query.toLowerCase();
    const filtrados = todosLosEstudiantes.filter(e => String(e.nombre).toLowerCase().includes(q) || String(e.ci).includes(q));

    resDiv.innerHTML = filtrados.map(e => `
        <div class="search-item" onclick="cargarEstudianteEnFormulario('${e.ci}')">
            <b>${e.nombre}</b> - C.I: ${e.ci} (${e.curso})
        </div>
    `).join('');
    resDiv.style.display = "block";
}

function cargarEstudianteEnFormulario(ci) {
    const alu = todosLosEstudiantes.find(e => String(e.ci).trim() === String(ci).trim());
    if (!alu) return;

    document.getElementById("crudCI").value = alu.ci;
    document.getElementById("crudCI").readOnly = true;
    document.getElementById("crudNombre").value = alu.nombre || "";
    document.getElementById("crudCurso").value = alu.curso || "";
    document.getElementById("crudTutor").value = alu.tutor || "";
    document.getElementById("crudTelTutor").value = alu.telefono_tutor || "";
    document.getElementById("crudQR").value = alu.codigo_qr || "";
    document.getElementById("resGestionEst").style.display = "none";
}

async function guardarEstudianteCrud() {
    const ci = document.getElementById("crudCI").value;
    const nombre = document.getElementById("crudNombre").value;
    const curso = document.getElementById("crudCurso").value;

    if (!ci || !nombre || !curso) {
        return Swal.fire('Atención', 'Por favor completa C.I., Nombre y Curso', 'warning');
    }

    const payload = {
        action: 'guardarEstudiante',
        ci: String(ci).trim(),
        nombre: nombre,
        curso: curso,
        tutor: document.getElementById("crudTutor").value,
        telefono_tutor: document.getElementById("crudTelTutor").value,
        codigo_qr: document.getElementById("crudQR").value || String(ci).trim()
    };

    Swal.fire({ title: 'Guardando registro...', didOpen: () => Swal.showLoading() });

    const res = await fetch(GOOGLE_SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) }).then(r => r.json());
    if (res.success) {
        Swal.fire('Éxito', 'Datos del estudiante guardados correctamente', 'success');
        limpiarFormularioEstudiante();
        await cargarEstudiantesGlobales();
    } else {
        Swal.fire('Error', 'No se pudo guardar la información', 'error');
    }
}

async function eliminarEstudianteCrud() {
    const ci = document.getElementById("crudCI").value;
    if (!ci) return Swal.fire('Atención', 'Selecciona o escribe el C.I. del estudiante a eliminar', 'warning');

    const confirmacion = await Swal.fire({
        title: '¿Confirmar eliminación?',
        text: `Se eliminará permanentemente al estudiante con C.I.: ${ci}`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    });

    if (confirmacion.isConfirmed) {
        Swal.fire({ title: 'Eliminando...', didOpen: () => Swal.showLoading() });
        const res = await fetch(GOOGLE_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'eliminarEstudiante', ci: String(ci).trim() }) }).then(r => r.json());
        if (res.success) {
            Swal.fire('Eliminado', 'Estudiante eliminado de la base de datos', 'success');
            limpiarFormularioEstudiante();
            await cargarEstudiantesGlobales();
        } else {
            Swal.fire('Error', 'No se pudo eliminar el estudiante', 'error');
        }
    }
}

function cargarEstudiantesPorCurso(curso) {
    const selAlumnos = document.getElementById("selectAlumnosCurso");
    if (!curso) {
        selAlumnos.innerHTML = '<option value="">-- Selecciona un curso primero --</option>';
        return;
    }

    const filtrados = todosLosEstudiantes.filter(e => e.curso === curso);
    selAlumnos.innerHTML = '<option value="">-- Seleccionar Estudiante --</option>';
    filtrados.forEach(e => {
        let opt = document.createElement("option");
        opt.value = e.ci;
        opt.innerText = `${e.nombre} (C.I: ${e.ci})`;
        selAlumnos.appendChild(opt);
    });
}

function seleccionarAlumnoDesdeLista(ci) {
    if (!ci) return;
    abrirPanelAccionEstudiante(ci);
}

function filtrarEstudiantesCredencial(query) {
    const resDiv = document.getElementById("resCredencialEst");
    if (!query || query.length < 2) return resDiv.style.display = "none";

    const q = query.toLowerCase();
    const filtrados = todosLosEstudiantes.filter(e => String(e.nombre).toLowerCase().includes(q) || String(e.ci).includes(q));

    resDiv.innerHTML = filtrados.map(e => `
        <div class="search-item" onclick="generarCredencialEstudiante('${e.ci}')"><b>${e.nombre}</b> (C.I: ${e.ci})</div>
    `).join('');
    resDiv.style.display = "block";
}

function generarCredencialEstudiante(ci) {
    const alu = todosLosEstudiantes.find(e => String(e.ci).trim() === String(ci).trim());
    if (!alu) return;

    document.getElementById("resCredencialEst").style.display = "none";
    document.getElementById("credNombre").innerText = alu.nombre;
    document.getElementById("credCurso").innerText = `Curso: ${alu.curso}`;
    document.getElementById("credCI").innerText = `C.I.: ${alu.ci}`;
    document.getElementById("credTutor").innerText = `Tutor: ${alu.tutor || 'No asignado'}`;
    document.getElementById("credTel").innerText = `Tel: ${alu.telefono_tutor || 'N/A'}`;

    const containerQR = document.getElementById("credQR");
    containerQR.innerHTML = "";
    new QRCode(containerQR, {
        text: String(alu.codigo_qr || alu.ci),
        width: 110,
        height: 110
    });

    document.getElementById("vistaPreviaCredencial").style.display = "block";
}

function iniciarDictadoVoz() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        return Swal.fire('Error', 'Tu navegador no soporta el dictado por voz.', 'error');
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-BO';
    recognition.interimResults = false;

    Swal.fire({
        title: 'Escuchando...',
        text: 'Dicta el nombre o C.I. del estudiante',
        icon: 'info',
        showConfirmButton: false,
        timer: 3000
    });

    recognition.start();

    recognition.onresult = (event) => {
        const textoDictado = event.results[0][0].transcript;
        document.getElementById("buscadorEstudiante").value = textoDictado;
        buscarEstudianteDirecto(textoDictado);
    };
}

function buscarEstudianteDirecto(query) {
    const resDiv = document.getElementById("resultadosBusqueda");
    if (!query || query.length < 2) {
        resDiv.style.display = "none";
        return;
    }

    const q = query.toLowerCase();
    const filtrados = todosLosEstudiantes.filter(e => 
        String(e.nombre).toLowerCase().includes(q) || String(e.ci).includes(q)
    );

    if (!filtrados.length) {
        resDiv.innerHTML = '<div class="search-item">Sin coincidencias</div>';
    } else {
        resDiv.innerHTML = filtrados.map(e => `
            <div class="search-item" onclick="abrirPanelAccionEstudiante('${e.ci}')">
                <b>${e.nombre}</b> - C.I: ${e.ci} (${e.curso})
            </div>
        `).join('');
    }
    resDiv.style.display = "block";
}

function filtrarEstudiantesIncidencias(query) {
    const resDiv = document.getElementById("resIncidenciaEst");
    if (!query || query.length < 2) return resDiv.style.display = "none";

    const q = query.toLowerCase();
    const filtrados = todosLosEstudiantes.filter(e => String(e.nombre).toLowerCase().includes(q) || String(e.ci).includes(q));

    resDiv.innerHTML = filtrados.map(e => `
        <div class="search-item" onclick="selEstIncidencia('${e.ci}')"><b>${e.nombre}</b> (C.I: ${e.ci})</div>
    `).join('');
    resDiv.style.display = "block";
}

function selEstIncidencia(ci) {
    estudianteSeleccionadoIncidencia = todosLosEstudiantes.find(e => String(e.ci).trim() === String(ci).trim());
    document.getElementById("resIncidenciaEst").style.display = "none";
    document.getElementById("lblEstIncidenciaSel").innerText = `Seleccionado: ${estudianteSeleccionadoIncidencia.nombre} (${estudianteSeleccionadoIncidencia.curso})`;
}

async function guardarIncidencia() {
    if (!estudianteSeleccionadoIncidencia) return Swal.fire('Atención', 'Selecciona un estudiante primero', 'warning');

    const payload = {
        action: 'guardarIncidencia',
        ci_estudiante: String(estudianteSeleccionadoIncidencia.ci).trim(),
        nombre_estudiante: estudianteSeleccionadoIncidencia.nombre,
        curso: estudianteSeleccionadoIncidencia.curso,
        fecha: obtenerFechaBolivia(),
        tipo_incidencia: document.getElementById("incTipo").value,
        descripcion: document.getElementById("incDescripcion").value
    };

    Swal.fire({ title: 'Guardando...', didOpen: () => Swal.showLoading() });
    const res = await fetch(GOOGLE_SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) }).then(r => r.json());
    if (res.success) {
        Swal.fire('Éxito', 'Incidencia registrada', 'success');
        document.getElementById("incDescripcion").value = "";
    }
}

function filtrarEstudiantesCitacion(query) {
    const resDiv = document.getElementById("resCitacionEst");
    if (!query || query.length < 2) return resDiv.style.display = "none";

    const q = query.toLowerCase();
    const filtrados = todosLosEstudiantes.filter(e => String(e.nombre).toLowerCase().includes(q) || String(e.ci).includes(q));

    resDiv.innerHTML = filtrados.map(e => `
        <div class="search-item" onclick="selEstCitacion('${e.ci}')"><b>${e.nombre}</b> (C.I: ${e.ci})</div>
    `).join('');
    resDiv.style.display = "block";
}

function selEstCitacion(ci) {
    estudianteSeleccionadoCitacion = todosLosEstudiantes.find(e => String(e.ci).trim() === String(ci).trim());
    document.getElementById("resCitacionEst").style.display = "none";
    document.getElementById("lblEstCitacionSel").innerText = `Seleccionado: ${estudianteSeleccionadoCitacion.nombre} (${estudianteSeleccionadoCitacion.curso})`;
    if (estudianteSeleccionadoCitacion.tutor) {
        document.getElementById("citTutor").value = estudianteSeleccionadoCitacion.tutor;
    }
}

async function generarCitacionPDF() {
    if (!estudianteSeleccionadoCitacion) return Swal.fire('Atención', 'Selecciona un estudiante primero', 'warning');

    const fechaCitaVal = document.getElementById("citFechaCita").value;

    const payload = {
        action: 'crearCitacion',
        ci_estudiante: String(estudianteSeleccionadoCitacion.ci).trim(),
        nombre_estudiante: estudianteSeleccionadoCitacion.nombre,
        curso: estudianteSeleccionadoCitacion.curso,
        tutor: document.getElementById("citTutor").value,
        motivo: document.getElementById("citMotivo").value,
        fecha_cita: formatearFechaDDMMYYYY(fechaCitaVal),
        hora_cita: document.getElementById("citHoraCita").value
    };

    Swal.fire({ title: 'Generando PDF (Doble)...', text: 'Creando impreso Original + Copia', didOpen: () => Swal.showLoading() });

    const res = await fetch(GOOGLE_SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) }).then(r => r.json());
    if (res.success && res.pdfUrl) {
        Swal.fire({
            title: '¡Citación Lista!',
            html: `<a href="${res.pdfUrl}" target="_blank" class="btn btn-primary" style="display:inline-flex; text-decoration:none;"><i class="fa-solid fa-print"></i> Abrir e Imprimir PDF (Original + Copia)</a>`,
            icon: 'success'
        });
    } else {
        Swal.fire('Error', 'No se pudo generar la citación en PDF', 'error');
    }
}

function imprimirReportePDF() {
    const cuerpo = document.getElementById("histCuerpo");
    if (!cuerpo || cuerpo.innerText.includes("No se encontraron registros")) {
        return Swal.fire('Atención', 'No hay registros cargados para generar el reporte', 'warning');
    }

    const categoriaSel = document.getElementById("histCategoria");
    const nombreCategoria = categoriaSel.options[categoriaSel.selectedIndex].text;
    const fechaFiltro = document.getElementById("histFecha").value;
    const subtituloSel = document.getElementById("histTituloSub").innerText;

    document.getElementById("repTitulo").innerText = `REPORTE OFICIAL DE ${nombreCategoria.toUpperCase()}`;
    document.getElementById("repSubtitulo").innerText = `${subtituloSel} ${fechaFiltro ? '| Fecha: ' + formatearFechaDDMMYYYY(fechaFiltro) : ''}`;
    document.getElementById("repFechaEmision").innerText = `Fecha de Emisión: ${obtenerFechaBolivia()} a hrs. ${obtenerHoraBolivia()}`;

    document.body.classList.add("modo-impresion-reporte");
    
    window.print();

    setTimeout(() => {
        document.body.classList.remove("modo-impresion-reporte");
    }, 1000);
}

async function copiarCitacionWhatsApp() {
    if (!estudianteSeleccionadoCitacion) {
        return Swal.fire('Atención', 'Selecciona un estudiante y completa el formulario de citación primero.', 'warning');
    }

    const tutor = document.getElementById("citTutor").value;
    const motivo = document.getElementById("citMotivo").value;
    const fechaCitaVal = document.getElementById("citFechaCita").value;
    const horaCitaVal = document.getElementById("citHoraCita").value;

    if (!tutor || !motivo || !fechaCitaVal) {
        return Swal.fire('Atención', 'Por favor completa todos los datos de la citación.', 'warning');
    }

    document.getElementById("prevCitTutor").innerText = tutor;
    document.getElementById("prevCitAlumno").innerText = estudianteSeleccionadoCitacion.nombre;
    document.getElementById("prevCitCurso").innerText = estudianteSeleccionadoCitacion.curso;
    document.getElementById("prevCitCI").innerText = estudianteSeleccionadoCitacion.ci;
    document.getElementById("prevCitMotivo").innerText = motivo;
    document.getElementById("prevCitFecha").innerText = formatearFechaDDMMYYYY(fechaCitaVal);
    document.getElementById("prevCitHora").innerText = horaCitaVal;

    const elem = document.getElementById("tarjetaCitacionParaCaptura");
    elem.style.display = "block";

    Swal.fire({ title: 'Generando imagen para WhatsApp...', didOpen: () => Swal.showLoading() });

    try {
        const canvas = await html2canvas(elem, { scale: 2, backgroundColor: '#ffffff' });
        elem.style.display = "none";

        canvas.toBlob(async (blob) => {
            if (!blob) throw new Error("No se pudo generar la imagen");
            
            try {
                const item = new ClipboardItem({ "image/png": blob });
                await navigator.clipboard.write([item]);
                Swal.fire({
                    title: '¡Imagen Copiada!',
                    text: 'Abre WhatsApp y presiona Ctrl + V (o pegar) para enviarla al apoderado.',
                    icon: 'success'
                });
            } catch (errClipboard) {
                const link = document.createElement('a');
                link.download = `Citacion_${estudianteSeleccionadoCitacion.nombre}.png`;
                link.href = canvas.toDataURL();
                link.click();
                Swal.fire('Imagen Descargada', 'La citación se descargó como imagen para que la adjuntes en WhatsApp.', 'info');
            }
        }, 'image/png');
    } catch (e) {
        elem.style.display = "none";
        Swal.fire('Error', 'No se pudo capturar la citación en imagen', 'error');
    }
}

async function copiarHistorialWhatsApp() {
    const cuerpo = document.getElementById("histCuerpo");
    if (!cuerpo || cuerpo.innerText.includes("No se encontraron registros")) {
        return Swal.fire('Atención', 'No hay registros cargados para copiar.', 'warning');
    }

    const elem = document.getElementById("areaImpresionReporte");

    Swal.fire({ title: 'Generando imagen de la consulta...', didOpen: () => Swal.showLoading() });

    try {
        const canvas = await html2canvas(elem, { scale: 2, backgroundColor: '#ffffff' });

        canvas.toBlob(async (blob) => {
            if (!blob) throw new Error("No se pudo generar la imagen");

            try {
                const item = new ClipboardItem({ "image/png": blob });
                await navigator.clipboard.write([item]);
                Swal.fire({
                    title: '¡Consulta Copiada!',
                    text: 'La imagen del historial fue copiada al portapapeles. Pégala en WhatsApp (Ctrl + V).',
                    icon: 'success'
                });
            } catch (errClipboard) {
                const link = document.createElement('a');
                link.download = `Historial_Consulta.png`;
                link.href = canvas.toDataURL();
                link.click();
                Swal.fire('Imagen Descargada', 'El historial se descargó como imagen para adjuntarlo en WhatsApp.', 'info');
            }
        }, 'image/png');
    } catch (e) {
        Swal.fire('Error', 'No se pudo generar la captura del historial', 'error');
    }
}

function iniciarScanner() {
    html5QrCode.start({ facingMode: "environment" }, { fps: 5, qrbox: 250 }, (codigo) => {
        const alu = todosLosEstudiantes.find(e => String(e.codigo_qr).trim() === String(codigo).trim() || String(e.ci).trim() === String(codigo).trim());
        if (alu) {
            abrirPanelAccionEstudiante(alu.ci);
        } else {
            Swal.fire('Error', 'Código QR no registrado', 'error');
        }
    }).catch(err => console.error(err));
}

window.onload = async () => {
    await solicitarLogin();

    document.getElementById('displayFecha').innerText = new Date().toLocaleDateString('es-BO', {
        timeZone: 'America/La_Paz', weekday:'long', day:'numeric', month:'long', year:'numeric'
    });

    document.getElementById('citFechaCita').value = obtenerFechaISO();
    document.getElementById('histFecha').value = obtenerFechaISO();

    await cargarEstudiantesGlobales();
    iniciarScanner();
};