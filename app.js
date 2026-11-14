/**
 * ============================================================================
 * EDUTOKEN LMS - CORE APPLICATION SCRIPT (app.js)
 * Arquitectura SPA (Single Page Application) con roles dinámicos.
 * ============================================================================
 */

// ==========================================
// 1. CONFIGURACIÓN Y CONEXIÓN A BASE DE DATOS
// ==========================================
const SUPABASE_URL = 'https://nrzigtuwwtvsnuaoiwsc.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_ojR7q5-vOsEiZ4nrWzkxTQ_s6CyVHP8'; 
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.app = {};

// ==========================================
// 2. ENRUTADOR (SPA VIEWS) Y SESIONES
// ==========================================
const views = {
    studentLogin: document.getElementById('view-student-login'),
    staffLogin: document.getElementById('view-staff-login'),
    studentDash: document.getElementById('view-student-dashboard'),
    staffDash: document.getElementById('view-staff-dashboard')
};

function switchView(viewName) {
    Object.values(views).forEach(v => {
        v.classList.remove('active');
        setTimeout(() => { v.style.display = 'none'; }, 400); 
    });
    setTimeout(() => {
        views[viewName].style.display = 'flex';
        void views[viewName].offsetWidth; 
        views[viewName].classList.add('active');
    }, 400);
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('link-to-staff').addEventListener('click', (e) => { e.preventDefault(); switchView('staffLogin'); });
    document.getElementById('link-to-student').addEventListener('click', (e) => { e.preventDefault(); switchView('studentLogin'); });

    const studentSession = JSON.parse(sessionStorage.getItem('lms_student_session'));
    const staffSession = JSON.parse(sessionStorage.getItem('lms_staff_session'));

    if (staffSession) {
        initStaffDashboard(staffSession);
    } else if (studentSession) {
        initStudentDashboard(studentSession);
    } else {
        views.studentLogin.style.display = 'flex';
        views.studentLogin.classList.add('active');
    }
});

function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ============================================================================
// MÓDULO ESTUDIANTE: PORTAL, CONTENIDOS Y EXÁMENES
// ============================================================================

let AppState = { grado: 1, periodo: 1, materia: 'Matemáticas', examenActual: null, session: null };

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = document.getElementById('student-token').value.trim().toUpperCase();
    const alertBox = document.getElementById('auth-alert');
    const btn = document.getElementById('btn-submit-login');

    btn.disabled = true; btn.textContent = 'Verificando...';
    alertBox.style.display = 'none';

    try {
        const { data, error } = await supabaseClient.from('estudiantes_llaves').select('*').eq('token', token).maybeSingle();
        if (error || !data) throw new Error('Llave incorrecta o no registrada.');
        if (!data.estado) throw new Error('Esta llave está inactiva. Contacta a tu docente.');

        sessionStorage.setItem('lms_student_session', JSON.stringify(data));
        initStudentDashboard(data);
    } catch (err) {
        alertBox.textContent = err.message; alertBox.className = 'alert alert--error'; alertBox.style.display = 'block';
    } finally {
        btn.disabled = false; btn.textContent = 'Ingresar a mi Portal';
    }
});

function initStudentDashboard(sessionData) {
    AppState.session = sessionData;
    AppState.grado = sessionData.grado;
    
    const displayName = sessionData.apodo ? sessionData.apodo : sessionData.nombre_estudiante;
    document.getElementById('student-name-display').textContent = `Hola, ${displayName}`;
    document.getElementById('student-grade-display').textContent = `Grado ${sessionData.grado}°`;
    
    switchView('studentDash');
    fetchModuleData();
}

document.getElementById('student-name-display').addEventListener('click', async () => {
    const currentName = AppState.session.apodo || '';
    const newApodo = prompt('Ingresa cómo quieres que te llamemos en tu portal (tu nombre oficial en planillas no cambiará):', currentName);
    
    if (newApodo !== null && newApodo.trim() !== '') {
        try {
            await supabaseClient.from('estudiantes_llaves').update({ apodo: newApodo.trim() }).eq('id', AppState.session.id);
            AppState.session.apodo = newApodo.trim();
            sessionStorage.setItem('lms_student_session', JSON.stringify(AppState.session));
            document.getElementById('student-name-display').textContent = `Hola, ${newApodo.trim()}`;
        } catch (error) {
            alert('Hubo un error de conexión al guardar tu apodo.');
        }
    }
});

document.querySelectorAll('#view-student-dashboard .btn-period').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('#view-student-dashboard .btn-period').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        AppState.periodo = parseInt(e.target.dataset.period, 10);
        fetchModuleData();
    });
});

document.querySelectorAll('#view-student-dashboard .btn-subject').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('#view-student-dashboard .btn-subject').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        AppState.materia = e.target.dataset.subject;
        fetchModuleData();
    });
});

async function fetchModuleData() {
    const loader = document.getElementById('content-loader');
    const container = document.getElementById('module-container');
    
    loader.style.display = 'flex';
    container.style.display = 'none';
    
    try {
        const [contentRes, examRes] = await Promise.all([
            supabaseClient.from('materias_contenido').select('*').eq('grado', AppState.grado).eq('periodo', AppState.periodo).eq('materia', AppState.materia).maybeSingle(),
            supabaseClient.from('examenes').select('*').eq('grado', AppState.grado).eq('periodo', AppState.periodo).eq('materia', AppState.materia).maybeSingle()
        ]);
        
        if (contentRes.data) {
            document.getElementById('lesson-title').textContent = `${AppState.materia} - Periodo ${AppState.periodo}`;
            document.getElementById('lesson-subtitle').textContent = contentRes.data.titulo_tema;
            document.getElementById('lesson-body').innerHTML = contentRes.data.contenido_html;
        } else {
            document.getElementById('lesson-title').textContent = AppState.materia;
            document.getElementById('lesson-subtitle').textContent = `Periodo ${AppState.periodo}`;
            document.getElementById('lesson-body').innerHTML = '<p class="text-muted">El docente aún no ha publicado el contenido teórico de esta unidad.</p>';
        }

        const examContainer = document.getElementById('exam-container');
        if (examRes.data && examRes.data.preguntas_json.length > 0) {
            AppState.examenActual = examRes.data.preguntas_json;
            let html = `<form id="exam-form">`;
            
            AppState.examenActual.forEach((item, index) => {
                html += `
                    <div class="question-block" style="background: var(--bg-main); padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; border: 1px solid var(--border-color);">
                        <p style="font-weight: 600; margin-bottom: 1rem; font-size: 1.05rem;">${index + 1}. ${item.pregunta}</p>
                        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                `;
                item.opciones.forEach((opcion, i) => {
                    html += `
                        <label class="option-label" style="display: flex; gap: 0.75rem; padding: 0.75rem 1rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer;">
                            <input type="radio" name="q${index}" value="${i}" required style="accent-color: var(--primary); transform: scale(1.2);"> 
                            <span>${opcion}</span>
                        </label>`;
                });
                html += `</div></div>`;
            });
            html += `
                <button type="submit" class="btn btn--primary" style="font-size: 1.05rem; padding: 1rem;">Calificar Examen</button>
                <div id="exam-feedback" class="exam-result" style="display:none; margin-top: 1.5rem; padding: 1.5rem; border-radius: 8px; text-align: center; font-weight: bold; font-size: 1.1rem;"></div>
            </form>`;
            examContainer.innerHTML = html;
            document.getElementById('exam-form').addEventListener('submit', handleExamSubmit);
        } else {
            examContainer.innerHTML = '<p class="text-muted">Aún no hay evaluación habilitada para esta materia.</p>';
        }
    } finally {
        loader.style.display = 'none';
        container.style.display = 'block';
    }
}

async function handleExamSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const submitBtn = e.target.querySelector('button');
    
    let correctAnswers = 0;
    AppState.examenActual.forEach((item, index) => {
        if (parseInt(formData.get(`q${index}`), 10) === item.respuesta_correcta) correctAnswers++;
    });
    
    const totalQuestions = AppState.examenActual.length;
    const grade = ((correctAnswers / totalQuestions) * 5).toFixed(1);
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando calificación...';
    
    try {
        await supabaseClient.from('calificaciones').insert([{
            estudiante_token: AppState.session.token,
            nombre_estudiante: AppState.session.nombre_estudiante,
            grado: AppState.grado, 
            periodo: AppState.periodo, 
            materia: AppState.materia,
            nota: grade, 
            respuestas_correctas: correctAnswers, 
            total_preguntas: totalQuestions
        }]);
        
        const feedback = document.getElementById('exam-feedback');
        feedback.style.display = 'block';
        feedback.className = `exam-result ${grade >= 3.0 ? 'aprobado' : 'reprobado'}`;
        feedback.style.background = grade >= 3.0 ? 'var(--success-bg)' : 'var(--error-bg)';
        feedback.style.color = grade >= 3.0 ? 'var(--success)' : 'var(--error)';
        feedback.style.border = `1px solid ${grade >= 3.0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`;
        feedback.textContent = grade >= 3.0 
            ? `¡Aprobado! Tu nota es: ${grade} / 5.0 (${correctAnswers}/${totalQuestions}). Enviada al docente.`
            : `Necesitas mejorar. Tu nota es: ${grade} / 5.0 (${correctAnswers}/${totalQuestions}). Enviada al docente.`;

        e.target.querySelectorAll('input[type="radio"]').forEach(radio => radio.disabled = true);
        submitBtn.textContent = 'Examen Finalizado';
    } catch (err) {
        alert("Hubo un error de conexión al guardar tu nota. Toma captura de pantalla y avisa a tu docente.");
        submitBtn.disabled = false; submitBtn.textContent = 'Reintentar Guardar';
    }
}

document.getElementById('btn-logout-student').addEventListener('click', () => {
    sessionStorage.removeItem('lms_student_session'); window.location.reload();
});

// ============================================================================
// MÓDULO INSTITUCIONAL: STAFF (ADMINISTRADORES Y DOCENTES)
// ============================================================================

document.getElementById('staff-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = document.getElementById('staff-pin').value.trim();
    const alertBox = document.getElementById('staff-auth-alert');
    const btn = document.getElementById('btn-submit-staff');
    
    btn.disabled = true; btn.textContent = 'Verificando red...';
    alertBox.style.display = 'none';

    try {
        const { data, error } = await supabaseClient.from('personal_institucional').select('*').eq('pin', pin).maybeSingle();
        if (error || !data) throw new Error('PIN incorrecto o acceso denegado.');

        const userRole = {
            id: data.id,
            name: data.nombre,
            role: data.rol,
            canPublish: data.rol === 'admin',
            canManageStaff: data.rol === 'admin'
        };

        sessionStorage.setItem('lms_staff_session', JSON.stringify(userRole));
        initStaffDashboard(userRole);
    } catch (err) {
        alertBox.textContent = err.message; alertBox.className = 'alert alert--error'; alertBox.style.display = 'block';
    } finally {
        btn.disabled = false; btn.textContent = 'Desbloquear Panel';
    }
});

function initStaffDashboard(roleData) {
    const roleTitle = roleData.role === 'admin' ? 'Administrador' : 'Docente';
    document.getElementById('staff-role-display').textContent = `${roleData.name} (${roleTitle})`;
    
    document.getElementById('nav-publish').style.display = roleData.canPublish ? 'block' : 'none';
    document.getElementById('nav-personal').style.display = roleData.canManageStaff ? 'block' : 'none';
    
    switchView('staffDash');
    app.switchStaffTab('tab-llaves'); 
}

document.getElementById('btn-logout-staff').addEventListener('click', () => {
    sessionStorage.removeItem('lms_staff_session'); window.location.reload();
});

app.switchStaffTab = function(tabId) {
    document.querySelectorAll('.staff-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    
    document.querySelectorAll('#view-staff-dashboard .btn-subject').forEach(b => b.classList.remove('active'));
    if(event && event.target) event.target.classList.add('active');

    if (tabId === 'tab-llaves') loadRecentTokens();
    if (tabId === 'tab-personal') loadPersonal();
};

// ==========================================
// SUB-MÓDULO: GESTOR DE LLAVES
// ==========================================
async function loadRecentTokens() {
    const tbody = document.getElementById('recent-tokens-tbody');
    const { data } = await supabaseClient.from('estudiantes_llaves').select('*').order('created_at', { ascending: false }).limit(15);
    
    tbody.innerHTML = (!data || data.length === 0) 
        ? '<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">Sin registros.</td></tr>' 
        : data.map(row => {
            const estadoColor = row.estado ? 'var(--success)' : 'var(--error)';
            const nombreHtml = row.apodo ? `${escapeHtml(row.nombre_estudiante)} <i style="color:var(--text-muted); font-size:0.85em;">(${escapeHtml(row.apodo)})</i>` : escapeHtml(row.nombre_estudiante);
            
            return `
            <tr style="opacity: ${row.estado ? '1' : '0.5'}; transition: 0.3s;">
                <td><strong style="color: ${estadoColor};"><code>${escapeHtml(row.token)}</code></strong></td>
                <td>${nombreHtml}</td>
                <td><span class="badge-grade">Grado ${row.grado}°</span></td>
                <td style="text-align: right;">
                    <button onclick="app.toggleToken('${row.id}', ${row.estado})" class="btn btn--sm btn--outline">${row.estado ? 'Desactivar' : 'Activar'}</button>
                </td>
            </tr>`;
        }).join('');
}

app.toggleToken = async function(id, currentState) {
    if(confirm(currentState ? '¿Desactivar el acceso de este estudiante?' : '¿Reactivar llave?')) {
        await supabaseClient.from('estudiantes_llaves').update({ estado: !currentState }).eq('id', id);
        loadRecentTokens();
    }
};

document.getElementById('admin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-generate');
    const alertBox = document.getElementById('admin-alert');
    btn.disabled = true; btn.textContent = 'Creando...';
    
    const grado = document.getElementById('student-grade').value;
    const token = `EST-G${grado.padStart(2,'0')}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    
    try {
        await supabaseClient.from('estudiantes_llaves').insert([{ 
            token: token, 
            nombre_estudiante: document.getElementById('student-name').value.trim(), 
            grado: grado, 
            estado: true 
        }]);
        
        alertBox.className = 'alert alert--success';
        alertBox.textContent = `¡Llave generada y guardada! Token: ${token}`;
        alertBox.style.display = 'block';
        
        document.getElementById('admin-form').reset();
        loadRecentTokens();
    } catch(err) {
        alertBox.className = 'alert alert--error'; alertBox.textContent = 'Error al crear llave.'; alertBox.style.display = 'block';
    } finally {
        btn.disabled = false; btn.textContent = 'Generar';
    }
});

// ==========================================
// SUB-MÓDULO: CALIFICACIONES Y EXCEL
// ==========================================
let currentDataExport = [];
document.getElementById('filter-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tbody = document.getElementById('grades-tbody');
    const btn = document.getElementById('btn-search');
    
    btn.disabled = true; btn.textContent = 'Buscando...';
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;"><div class="spinner" style="margin: 0 auto; width: 24px; height: 24px;"></div></td></tr>';
    
    try {
        const { data } = await supabaseClient.from('calificaciones').select('*')
            .eq('grado', document.getElementById('filter-grade').value)
            .eq('periodo', document.getElementById('filter-period').value)
            .eq('materia', document.getElementById('filter-subject').value)
            .order('nota', { ascending: false });

        currentDataExport = data;
        document.getElementById('btn-export').style.display = (data && data.length > 0) ? 'block' : 'none';
        
        tbody.innerHTML = (!data || data.length === 0) 
            ? '<tr><td colspan="3" style="text-align:center; color: var(--text-muted); padding: 2rem;">No hay exámenes entregados aún.</td></tr>' 
            : data.map(row => `
            <tr>
                <td><strong>${escapeHtml(row.nombre_estudiante)}</strong><br><code style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(row.estudiante_token)}</code></td>
                <td style="text-align:center;">
                    <span style="background: ${row.nota >= 3 ? 'var(--success-bg)' : 'var(--error-bg)'}; color: ${row.nota >= 3 ? 'var(--success)' : 'var(--error)'}; padding: 0.3rem 0.8rem; border-radius: 99px; font-weight: 700;">
                        ${Number(row.nota).toFixed(1)}
                    </span>
                </td>
                <td style="text-align:right; color: var(--text-muted); font-size: 0.85rem;">
                    ${new Date(row.created_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </td>
            </tr>`).join('');
    } finally {
        btn.disabled = false; btn.textContent = 'Buscar';
    }
});

document.getElementById('btn-export').addEventListener('click', () => {
    if(currentDataExport.length === 0) return;
    
    // CORRECCIÓN EXCEL: Usamos punto y coma (;) como delimitador para que Excel en español no lo agrupe.
    let csv = "\uFEFFEstudiante;Token;Nota;Correctas;Total;Fecha\n";
    
    currentDataExport.forEach(r => {
        const nombreLimpio = r.nombre_estudiante.replace(/;/g, ''); 
        const fecha = new Date(r.created_at).toLocaleDateString('es-CO');
        csv += `${nombreLimpio};${r.estudiante_token};${r.nota};${r.respuestas_correctas};${r.total_preguntas};${fecha}\n`;
    });
    
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    link.download = `Notas_G${document.getElementById('filter-grade').value}_${document.getElementById('filter-subject').value}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
});

// ==========================================
// SUB-MÓDULO: PUBLICADOR (SOLO ADMINS)
// ==========================================
let questionCount = 0;
document.getElementById('btn-add-question').addEventListener('click', () => {
    const qIndex = questionCount++;
    const div = document.createElement('div');
    div.style.cssText = "background: var(--bg-main); padding: 1.5rem; margin-bottom: 1rem; border: 1px solid var(--border-color); border-radius: 8px;";
    div.innerHTML = `
        <input type="text" class="form-input q-text" placeholder="Escribe la pregunta ${qIndex+1} aquí..." style="margin-bottom: 1rem; font-weight: 600;" required>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.75rem; margin-bottom:1rem;">
            <input type="text" class="form-input q-opt0" placeholder="Opción A" required><input type="text" class="form-input q-opt1" placeholder="Opción B" required>
            <input type="text" class="form-input q-opt2" placeholder="Opción C" required><input type="text" class="form-input q-opt3" placeholder="Opción D" required>
        </div>
        <select class="form-select q-correct" style="border-color: var(--success); color: var(--success); font-weight: 600;" required>
            <option value="0">Respuesta Correcta: Opción A</option><option value="1">Respuesta Correcta: Opción B</option>
            <option value="2">Respuesta Correcta: Opción C</option><option value="3">Respuesta Correcta: Opción D</option>
        </select>`;
    document.getElementById('questions-container').appendChild(div);
});
document.getElementById('btn-add-question').click(); 

document.getElementById('publish-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-publish'); 
    const alertBox = document.getElementById('publish-alert');
    btn.disabled = true; btn.textContent = "Guardando...";
    alertBox.style.display = 'none';
    
    const baseData = {
        grado: document.getElementById('pub-grade').value,
        periodo: document.getElementById('pub-period').value,
        materia: document.getElementById('pub-subject').value
    };

    const preguntasJson = Array.from(document.querySelectorAll('#questions-container > div')).map(block => ({
        pregunta: block.querySelector('.q-text').value.trim(),
        opciones: [block.querySelector('.q-opt0').value, block.querySelector('.q-opt1').value, block.querySelector('.q-opt2').value, block.querySelector('.q-opt3').value],
        respuesta_correcta: parseInt(block.querySelector('.q-correct').value)
    }));

    try {
        await supabaseClient.from('materias_contenido').upsert({ ...baseData, titulo_tema: document.getElementById('pub-title').value, contenido_html: document.getElementById('pub-html').value }, { onConflict: 'grado, periodo, materia' });
        if(preguntasJson.length > 0) {
            await supabaseClient.from('examenes').upsert({ ...baseData, preguntas_json: preguntasJson }, { onConflict: 'grado, periodo, materia' });
        }
        alertBox.className = 'alert alert--success'; alertBox.textContent = '¡Clase y Examen publicados!'; alertBox.style.display = 'block';
        document.getElementById('publish-form').reset();
    } catch (error) { 
        alertBox.className = 'alert alert--error'; alertBox.textContent = 'Error al publicar.'; alertBox.style.display = 'block'; 
    } finally {
        btn.disabled = false; btn.textContent = "Publicar Todo";
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
});

// ==========================================
// SUB-MÓDULO: GESTIÓN DE PERSONAL (MÁX. SEGURIDAD)
// ==========================================
async function loadPersonal() {
    const tbody = document.getElementById('personal-tbody');
    const { data } = await supabaseClient.from('personal_institucional').select('*').order('created_at', { ascending: true });
    
    tbody.innerHTML = data.map(row => {
        const rolBadge = row.rol === 'admin' 
            ? '<span class="brand-badge" style="background: var(--primary-soft); color: var(--primary);">Administrador</span>' 
            : '<span class="brand-badge" style="background: var(--success-bg); color: var(--success);">Docente</span>';

        // MAGIA: Protección para el Super Admin Juan Ortiz
        const isSuperAdmin = row.nombre.includes('Juan Ortiz');
        const botonEliminar = isSuperAdmin 
            ? '<span style="color: var(--text-muted); font-size: 0.85rem; font-weight: bold;">🔒 Intocable</span>'
            : `<button onclick="app.deleteStaff('${row.id}', '${escapeHtml(row.nombre)}')" class="btn btn--sm btn--outline" style="color: var(--error); border-color: rgba(239,68,68,0.3); background: var(--error-bg);">🗑️ Eliminar</button>`;

        return `
        <tr>
            <td><strong>${escapeHtml(row.nombre)}</strong></td>
            <td>${rolBadge}</td>
            <td><code>${escapeHtml(row.pin)}</code></td>
            <td style="text-align: right;">${botonEliminar}</td>
        </tr>`;
    }).join('');
}

document.getElementById('personal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-add-staff');
    btn.disabled = true; btn.textContent = 'Creando...';
    
    const nombre = document.getElementById('staff-new-name').value.trim();
    const rol = document.getElementById('staff-new-role').value;
    const pin = document.getElementById('staff-new-pin').value.trim();

    try {
        const { error } = await supabaseClient.from('personal_institucional').insert([{ nombre, rol, pin }]);
        if (error) throw new Error('El PIN ya está en uso.');
        
        document.getElementById('personal-form').reset();
        loadPersonal();
    } catch (err) {
        alert(err.message);
    } finally {
        btn.disabled = false; btn.textContent = 'Añadir';
    }
});

app.deleteStaff = async function(id, nombre) {
    const confirmacion = prompt(`⚠️ ATENCIÓN: Estás a punto de eliminar a:\n${nombre}\n\nEscribe ELIMINAR en mayúsculas para confirmar:`);
    
    if (confirmacion === "ELIMINAR") {
        try {
            await supabaseClient.from('personal_institucional').delete().eq('id', id);
            alert(`✅ ${nombre} eliminado.`);
            loadPersonal();
        } catch (error) {
            alert('❌ Error al eliminar.');
        }
    } else {
        alert('❌ Cancelado.');
    }
};