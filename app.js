/**
 * ============================================================================
 * EDUTOKEN LMS - CORE APPLICATION SCRIPT (app.js)
 * Arquitectura SPA (Single Page Application) - Manejo estricto de errores DB
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

// ==========================================
// MODO OSCURO (DARK MODE TOGGLE)
// ==========================================
app.toggleDarkMode = function() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('edutoken_dark_mode', isDark);
    if(window.renderCharts) window.renderCharts();
};

if(localStorage.getItem('edutoken_dark_mode') === 'true') {
    document.body.classList.add('dark-mode');
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
    const newApodo = prompt('Ingresa cómo quieres que te llamemos en tu portal:', currentName);
    
    if (newApodo !== null && newApodo.trim() !== '') {
        try {
            const { error } = await supabaseClient.from('estudiantes_llaves').update({ apodo: newApodo.trim() }).eq('id', AppState.session.id);
            if (error) throw error;
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
            supabaseClient.from('materias_contenido').select('*').eq('grado', AppState.grado).eq('periodo', AppState.periodo).eq('materia', AppState.materia).order('created_at', { ascending: true }),
            supabaseClient.from('examenes').select('*').eq('grado', AppState.grado).eq('periodo', AppState.periodo).eq('materia', AppState.materia).maybeSingle()
        ]);
        
        const lessonsWrapper = document.getElementById('lessons-wrapper');
        
        if (contentRes.data && contentRes.data.length > 0) {
            let htmlClases = '';
            contentRes.data.forEach((tema, idx) => {
                htmlClases += `
                <section class="lesson-section card" style="border-left: 5px solid var(--primary); position: relative; overflow: hidden; box-shadow: var(--shadow-md); margin-bottom: 1.5rem;">
                    <div style="position: absolute; top: 0; right: 0; background: var(--primary-soft); color: var(--primary); padding: 0.5rem 1rem; border-bottom-left-radius: 8px; font-weight: bold; font-size: 0.85rem;">Clase ${idx + 1}</div>
                    <div class="card__header" style="text-align: left; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-top: 0.5rem;">
                        <h2 class="card__title" style="font-size: 1.4rem;">${escapeHtml(tema.titulo_tema)}</h2>
                        <p class="card__subtitle">${AppState.materia} - Periodo ${AppState.periodo}</p>
                    </div>
                    <div class="lesson-body" style="padding-top: 1rem;">${tema.contenido_html}</div>
                </section>`;
            });
            lessonsWrapper.innerHTML = htmlClases;
        } else {
            lessonsWrapper.innerHTML = '<section class="lesson-section card"><p class="text-muted">El docente aún no ha publicado contenido en esta unidad.</p></section>';
        }

        const examContainer = document.getElementById('exam-container');
        if (examRes.data && examRes.data.preguntas_json && examRes.data.preguntas_json.length > 0) {
            document.querySelector('.exam-section').style.display = 'block';
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
                <button type="submit" class="btn btn--primary" style="font-size: 1.05rem; padding: 1rem;">Calificar Evaluación Final</button>
                <div id="exam-feedback" class="exam-result" style="display:none; margin-top: 1.5rem; padding: 1.5rem; border-radius: 8px; text-align: center; font-weight: bold; font-size: 1.1rem;"></div>
            </form>`;
            examContainer.innerHTML = html;
            document.getElementById('exam-form').addEventListener('submit', handleExamSubmit);
        } else {
            document.querySelector('.exam-section').style.display = 'none';
            examContainer.innerHTML = '';
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
    const isApproved = grade >= 3.0; 
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando calificación...';
    
    try {
        const { error } = await supabaseClient.from('calificaciones').insert([{
            estudiante_token: AppState.session.token,
            nombre_estudiante: AppState.session.nombre_estudiante,
            grado: AppState.grado, 
            periodo: AppState.periodo, 
            materia: AppState.materia,
            nota: grade, 
            respuestas_correctas: correctAnswers, 
            total_preguntas: totalQuestions
        }]);
        
        if (error) throw error;
        
        if (isApproved) {
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#4f46e5', '#f59e0b', '#10b981'] });
        }
        
        const feedback = document.getElementById('exam-feedback');
        feedback.style.display = 'block';
        feedback.className = `exam-result ${isApproved ? 'aprobado' : 'reprobado'}`;
        feedback.style.background = isApproved ? 'var(--success-bg)' : 'var(--error-bg)';
        feedback.style.color = isApproved ? 'var(--success)' : 'var(--error)';
        feedback.style.border = `1px solid ${isApproved ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`;
        feedback.textContent = isApproved 
            ? `¡Aprobado! Tu nota es: ${grade} / 5.0 (${correctAnswers}/${totalQuestions}). Enviada al docente.`
            : `Necesitas mejorar. Tu nota es: ${grade} / 5.0 (${correctAnswers}/${totalQuestions}). Enviada al docente.`;

        e.target.querySelectorAll('input[type="radio"]').forEach(radio => radio.disabled = true);
        submitBtn.textContent = 'Examen Finalizado';
    } catch (err) {
        alert("Hubo un error de conexión al guardar tu nota. Revisa tu internet.");
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
    if (tabId === 'tab-publicar') loadPublishedContent(); 
};

app.copyToClipboard = async function(text, btnElement) {
    try {
        await navigator.clipboard.writeText(text);
        const originalIcon = btnElement.innerHTML;
        btnElement.innerHTML = '✅';
        setTimeout(() => { btnElement.innerHTML = originalIcon; }, 1500);
    } catch (err) {
        console.error("No se pudo copiar", err);
    }
};

// ==========================================
// SUB-MÓDULO: GESTOR DE LLAVES Y FILTROS
// ==========================================
let globalTokens = [];

async function loadRecentTokens() {
    const { data } = await supabaseClient.from('estudiantes_llaves').select('*').order('created_at', { ascending: false }).limit(1000);
    globalTokens = data || [];
    renderFilteredTokens();
}

function renderFilteredTokens() {
    const tbody = document.getElementById('recent-tokens-tbody');
    const query = document.getElementById('search-student').value.toLowerCase().trim();
    const filterGrade = document.getElementById('filter-student-grade').value;
    const filterStatus = document.getElementById('filter-student-status').value;

    const filtered = globalTokens.filter(t => {
        const matchQuery = t.nombre_estudiante.toLowerCase().includes(query) || t.token.toLowerCase().includes(query);
        const matchGrade = filterGrade === "" || t.grado == filterGrade;
        const matchStatus = filterStatus === "" || String(t.estado) === filterStatus;
        return matchQuery && matchGrade && matchStatus;
    });

    document.getElementById('total-students-count').textContent = filtered.length;

    tbody.innerHTML = (filtered.length === 0) 
        ? '<tr><td colspan="4" style="text-align:center; color: var(--text-muted); padding: 2rem;">No se encontraron estudiantes con esos filtros.</td></tr>' 
        : filtered.map(row => {
            const estadoColor = row.estado ? 'var(--success)' : 'var(--error)';
            const nombreHtml = row.apodo ? `${escapeHtml(row.nombre_estudiante)} <i style="color:var(--text-muted); font-size:0.85em;">(${escapeHtml(row.apodo)})</i>` : escapeHtml(row.nombre_estudiante);
            
            return `
            <tr style="opacity: ${row.estado ? '1' : '0.5'}; transition: 0.3s;">
                <td>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <strong style="color: ${estadoColor};"><code>${escapeHtml(row.token)}</code></strong>
                        <button type="button" onclick="app.copyToClipboard('${escapeHtml(row.token)}', this)" style="background: none; border: none; cursor: pointer; font-size: 1.1rem; padding: 0; opacity: 0.7; transition: 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'" title="Copiar Token">📋</button>
                    </div>
                </td>
                <td>${nombreHtml}</td>
                <td><span class="badge-grade">Grado ${row.grado}°</span></td>
                <td style="text-align: right;">
                    <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                        <button onclick="app.toggleToken('${row.id}', ${row.estado})" class="btn btn--sm btn--outline" style="padding: 0.4rem 0.6rem;" title="${row.estado ? 'Desactivar Acceso' : 'Reactivar Acceso'}">${row.estado ? '⏸️' : '▶️'}</button>
                        <button onclick="app.editToken('${row.id}')" class="btn btn--sm btn--outline" style="color: var(--primary); border-color: var(--primary); padding: 0.4rem 0.6rem;" title="Editar Estudiante">✏️</button>
                        <button onclick="app.deleteToken('${row.id}', '${row.token}', '${escapeHtml(row.nombre_estudiante)}')" class="btn btn--sm btn--outline" style="color: var(--error); border-color: rgba(239,68,68,0.3); background: var(--error-bg); padding: 0.4rem 0.6rem;" title="Eliminar Definitivamente">🗑️</button>
                    </div>
                </td>
            </tr>`;
        }).join('');
}

document.getElementById('search-student').addEventListener('input', renderFilteredTokens);
document.getElementById('filter-student-grade').addEventListener('change', renderFilteredTokens);
document.getElementById('filter-student-status').addEventListener('change', renderFilteredTokens);

app.toggleToken = async function(id, currentState) {
    const { error } = await supabaseClient.from('estudiantes_llaves').update({ estado: !currentState }).eq('id', id);
    if(error) alert('Error: ' + error.message);
    loadRecentTokens();
};

app.editToken = function(id) {
    const student = globalTokens.find(t => t.id === id);
    if(!student) return;
    
    document.getElementById('edit-student-id').value = student.id;
    document.getElementById('student-name').value = student.nombre_estudiante;
    document.getElementById('student-grade').value = student.grado;
    
    document.getElementById('admin-form-title').innerHTML = `✏️ Editando: ${student.nombre_estudiante}`;
    const btn = document.getElementById('btn-generate');
    btn.textContent = "Actualizar Info";
    btn.style.background = "var(--success)";
    
    document.getElementById('btn-cancel-student-edit').style.display = "block";
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

document.getElementById('btn-cancel-student-edit').addEventListener('click', resetAdminForm);

function resetAdminForm() {
    document.getElementById('admin-form').reset();
    document.getElementById('edit-student-id').value = "";
    document.getElementById('admin-form-title').innerHTML = `Generador de Llaves`;
    
    const btn = document.getElementById('btn-generate');
    btn.textContent = "Generar";
    btn.style.background = "var(--primary)";
    
    document.getElementById('btn-cancel-student-edit').style.display = "none";
}

document.getElementById('admin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-generate');
    const alertBox = document.getElementById('admin-alert');
    btn.disabled = true; btn.textContent = 'Guardando...';
    
    const id = document.getElementById('edit-student-id').value;
    const isEdit = id !== "";
    const grado = document.getElementById('student-grade').value;
    const nombre = document.getElementById('student-name').value.trim();
    
    try {
        if (isEdit) {
            const { error } = await supabaseClient.from('estudiantes_llaves').update({ nombre_estudiante: nombre, grado: grado }).eq('id', id);
            if (error) throw error;
            alertBox.className = 'alert alert--success';
            alertBox.textContent = `¡Información de ${nombre} actualizada!`;
            alertBox.style.display = 'block';
            resetAdminForm();
        } else {
            const token = `EST-G${grado.padStart(2,'0')}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
            const { error } = await supabaseClient.from('estudiantes_llaves').insert([{ token: token, nombre_estudiante: nombre, grado: grado, estado: true }]);
            if (error) throw error;
            
            let copiado = false;
            try { await navigator.clipboard.writeText(token); copiado = true; } catch (err) {}
            
            alertBox.className = 'alert alert--success';
            alertBox.textContent = copiado ? `¡Llave guardada y COPIADA! Token: ${token}` : `¡Llave guardada! Token: ${token}`;
            alertBox.style.display = 'block';
            document.getElementById('admin-form').reset();
        }
        loadRecentTokens();
    } catch(err) {
        alertBox.className = 'alert alert--error'; alertBox.textContent = 'Error: ' + err.message; alertBox.style.display = 'block';
    } finally {
        btn.disabled = false; btn.textContent = isEdit ? 'Actualizar Info' : 'Generar';
    }
});

app.deleteToken = async function(id, token, nombre) {
    const confirmacion = prompt(`⚠️ Vas a eliminar definitivamente al estudiante ${nombre}.\n\nPara confirmar, debes escribir o pegar su llave exacta:\n${token}`);
    
    if (confirmacion === token) {
        try {
            const { error } = await supabaseClient.from('estudiantes_llaves').delete().eq('id', id);
            if (error) throw error;
            alert(`✅ El estudiante ${nombre} ha sido eliminado.`);
            loadRecentTokens();
        } catch(e) {
            alert('Error DB: ' + e.message);
        }
    } else if (confirmacion !== null) {
        alert('❌ La llave ingresada no coincide. Operación cancelada.');
    }
};

// ==========================================
// SUB-MÓDULO: CALIFICACIONES Y GRÁFICOS
// ==========================================
let currentDataExport = [];
let chartPassFail = null;
let chartDistribution = null;

const gradesSearchInput = document.getElementById('search-grade-student');

document.getElementById('filter-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tbody = document.getElementById('grades-tbody');
    const btn = document.getElementById('btn-search');
    
    btn.disabled = true; btn.textContent = 'Cargando...';
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;"><div class="spinner" style="margin: 0 auto; width: 24px; height: 24px;"></div></td></tr>';
    
    try {
        const { data } = await supabaseClient.from('calificaciones').select('*')
            .eq('grado', document.getElementById('filter-grade').value)
            .eq('periodo', document.getElementById('filter-period').value)
            .eq('materia', document.getElementById('filter-subject').value)
            .order('nota', { ascending: false });

        currentDataExport = data || [];
        
        if (currentDataExport.length > 0) {
            document.getElementById('btn-export').style.display = 'block';
            gradesSearchInput.disabled = false;
            document.getElementById('charts-wrapper').style.display = 'grid';
        } else {
            document.getElementById('btn-export').style.display = 'none';
            gradesSearchInput.disabled = true;
            gradesSearchInput.value = '';
            document.getElementById('charts-wrapper').style.display = 'none';
        }

        renderFilteredGrades();
        
    } finally {
        btn.disabled = false; btn.textContent = 'Cargar Notas';
    }
});

gradesSearchInput.addEventListener('input', renderFilteredGrades);

window.renderCharts = function() {
    renderFilteredGrades(); 
};

function renderFilteredGrades() {
    const tbody = document.getElementById('grades-tbody');
    const query = gradesSearchInput.value.toLowerCase().trim();
    
    const filtered = currentDataExport.filter(r => 
        r.nombre_estudiante.toLowerCase().includes(query) || 
        r.estudiante_token.toLowerCase().includes(query)
    );

    const avgEl = document.getElementById('average-grade-count');
    if (filtered.length > 0) {
        const sum = filtered.reduce((acc, curr) => acc + parseFloat(curr.nota), 0);
        avgEl.textContent = (sum / filtered.length).toFixed(1);
    } else {
        avgEl.textContent = '0.0';
    }

    if (filtered.length > 0) {
        let aprobados = 0; let reprobados = 0;
        let distribucion = [0, 0, 0, 0, 0]; 
        
        filtered.forEach(r => {
            const n = parseFloat(r.nota);
            if(n >= 3.0) aprobados++; else reprobados++;
            
            if(n <= 1.0) distribucion[0]++;
            else if(n <= 2.0) distribucion[1]++;
            else if(n <= 3.0) distribucion[2]++;
            else if(n <= 4.0) distribucion[3]++;
            else distribucion[4]++;
        });

        const isDark = document.body.classList.contains('dark-mode');
        Chart.defaults.color = isDark ? '#94a3b8' : '#64748b';

        if(chartPassFail) chartPassFail.destroy();
        chartPassFail = new Chart(document.getElementById('chart-pass-fail').getContext('2d'), {
            type: 'doughnut',
            data: { labels: ['Aprobados', 'Reprobados'], datasets: [{ data: [aprobados, reprobados], backgroundColor: ['#10b981', '#ef4444'], borderWidth: 0 }] },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });

        if(chartDistribution) chartDistribution.destroy();
        chartDistribution = new Chart(document.getElementById('chart-distribution').getContext('2d'), {
            type: 'bar',
            data: { labels: ['0-1.0', '1.1-2.0', '2.1-3.0', '3.1-4.0', '4.1-5.0'], datasets: [{ label: 'Estudiantes', data: distribucion, backgroundColor: '#4f46e5', borderRadius: 4 }] },
            options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
        });
    }

    tbody.innerHTML = (filtered.length === 0) 
        ? '<tr><td colspan="3" style="text-align:center; color: var(--text-muted); padding: 2rem;">No hay resultados que coincidan.</td></tr>' 
        : filtered.map(row => `
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
}

document.getElementById('btn-export').addEventListener('click', () => {
    if(currentDataExport.length === 0) return;
    
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
// SUB-MÓDULO: PUBLICADOR (MULTI-CLASES)
// ==========================================
let questionCount = 0;
let globalPublishedContent = []; 

function createQuestionBlock(data = null) {
    const qIndex = questionCount++;
    const div = document.createElement('div');
    div.style.cssText = "background: var(--bg-main); padding: 1.5rem; margin-bottom: 1rem; border: 1px solid var(--border-color); border-radius: 8px; position: relative;";
    
    const qText = data ? data.pregunta : '';
    const op0 = data ? data.opciones[0] : '';
    const op1 = data ? data.opciones[1] : '';
    const op2 = data ? data.opciones[2] : '';
    const op3 = data ? data.opciones[3] : '';
    const correct = data ? data.respuesta_correcta : 0;

    div.innerHTML = `
        <button type="button" class="btn-remove-q" style="position: absolute; top: 10px; right: 15px; background: none; border: none; color: var(--error); font-weight: bold; cursor: pointer; font-size: 0.9rem;">✕ Quitar</button>
        <input type="text" class="form-input q-text" placeholder="Escribe la pregunta aquí..." value="${escapeHtml(qText)}" style="margin-bottom: 1rem; font-weight: 600; padding-right: 4rem;" required>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.75rem; margin-bottom:1rem;">
            <input type="text" class="form-input q-opt0" placeholder="Opción A" value="${escapeHtml(op0)}" required>
            <input type="text" class="form-input q-opt1" placeholder="Opción B" value="${escapeHtml(op1)}" required>
            <input type="text" class="form-input q-opt2" placeholder="Opción C" value="${escapeHtml(op2)}" required>
            <input type="text" class="form-input q-opt3" placeholder="Opción D" value="${escapeHtml(op3)}" required>
        </div>
        <select class="form-select q-correct" style="border-color: var(--success); color: var(--success); font-weight: 600;" required>
            <option value="0" ${correct === 0 ? 'selected' : ''}>Respuesta Correcta: Opción A</option>
            <option value="1" ${correct === 1 ? 'selected' : ''}>Respuesta Correcta: Opción B</option>
            <option value="2" ${correct === 2 ? 'selected' : ''}>Respuesta Correcta: Opción C</option>
            <option value="3" ${correct === 3 ? 'selected' : ''}>Respuesta Correcta: Opción D</option>
        </select>`;
        
    div.querySelector('.btn-remove-q').addEventListener('click', () => { div.remove(); });
    document.getElementById('questions-container').appendChild(div);
}

document.getElementById('btn-add-question').addEventListener('click', () => createQuestionBlock());

document.getElementById('publish-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-publish'); 
    const alertBox = document.getElementById('publish-alert');
    btn.disabled = true; btn.textContent = "Guardando...";
    alertBox.style.display = 'none';
    
    const editId = document.getElementById('edit-content-id').value;
    
    const baseData = {
        grado: document.getElementById('pub-grade').value,
        periodo: document.getElementById('pub-period').value,
        materia: document.getElementById('pub-subject').value
    };
    
    const tituloTema = document.getElementById('pub-title').value;
    const contenidoHtml = document.getElementById('pub-html').value;

    const preguntasJson = Array.from(document.querySelectorAll('#questions-container > div')).map(block => ({
        pregunta: block.querySelector('.q-text').value.trim(),
        opciones: [block.querySelector('.q-opt0').value, block.querySelector('.q-opt1').value, block.querySelector('.q-opt2').value, block.querySelector('.q-opt3').value],
        respuesta_correcta: parseInt(block.querySelector('.q-correct').value)
    }));

    try {
        if(editId) {
            const { error: updateError } = await supabaseClient.from('materias_contenido').update({ grado: baseData.grado, periodo: baseData.periodo, materia: baseData.materia, titulo_tema: tituloTema, contenido_html: contenidoHtml }).eq('id', editId);
            if (updateError) throw updateError;
        } else {
            const { error: insertError } = await supabaseClient.from('materias_contenido').insert([{ ...baseData, titulo_tema: tituloTema, contenido_html: contenidoHtml }]);
            if (insertError) throw insertError;
        }

        if(preguntasJson.length > 0) {
            const { error: examError } = await supabaseClient.from('examenes').upsert({ ...baseData, preguntas_json: preguntasJson }, { onConflict: 'grado, periodo, materia' });
            if (examError) throw examError;
        }

        alertBox.className = 'alert alert--success'; 
        alertBox.textContent = '¡Clase guardada exitosamente!'; 
        alertBox.style.display = 'block';
        
        resetPublishForm();
        loadPublishedContent(); 
    } catch (error) { 
        console.error("Detalle de Error de Supabase:", error);
        alertBox.className = 'alert alert--error'; 
        // ¡Magia! Ahora nos mostrará en pantalla qué bloqueó la base de datos.
        alertBox.textContent = 'Error DB: ' + (error.message || 'Desconocido'); 
        alertBox.style.display = 'block'; 
    } finally {
        btn.disabled = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
});

async function loadPublishedContent() {
    const { data, error } = await supabaseClient.from('materias_contenido').select('*').order('created_at', { ascending: false });
    if (error) return;
    
    globalPublishedContent = data || [];
    renderFilteredContent();
}

function renderFilteredContent() {
    const tbody = document.getElementById('published-content-tbody');
    const filterGrade = document.getElementById('filter-manager-grade').value;
    const filterPeriod = document.getElementById('filter-manager-period').value;
    const filterSubject = document.getElementById('filter-manager-subject').value;

    const filteredData = globalPublishedContent.filter(row => {
        const matchGrade = filterGrade === "" || row.grado == filterGrade;
        const matchPeriod = filterPeriod === "" || row.periodo == filterPeriod;
        const matchSubject = filterSubject === "" || row.materia == filterSubject;
        return matchGrade && matchPeriod && matchSubject;
    });

    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--text-muted); padding:2rem;">No hay resultados con estos filtros.</td></tr>';
        return;
    }

    tbody.innerHTML = filteredData.map(row => `
        <tr>
            <td>
                <strong style="color: var(--text-primary); font-size: 1.05rem;">${escapeHtml(row.titulo_tema)}</strong><br>
                <span class="badge-grade" style="margin-top:0.5rem; display:inline-block; font-size: 0.8rem;">${escapeHtml(row.materia)}</span>
            </td>
            <td>Grado ${row.grado}°<br><small style="color: var(--text-muted);">Periodo ${row.periodo}</small></td>
            <td style="font-size: 0.85rem; color: var(--text-muted);">
                ${new Date(row.created_at).toLocaleDateString('es-CO')}
            </td>
            <td style="text-align: right;">
                <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                    <button onclick="app.editContent('${row.id}')" class="btn btn--sm btn--outline" style="color: var(--primary); border-color: var(--primary); padding: 0.4rem 0.6rem;">
                        ✏️ Editar
                    </button>
                    <button onclick="app.deleteContent('${row.id}', '${escapeHtml(row.titulo_tema)}')" class="btn btn--sm btn--outline" style="color: var(--error); border-color: rgba(239,68,68,0.3); background: var(--error-bg); padding: 0.4rem 0.6rem;">
                        🗑️
                    </button>
                </div>
            </td>
        </tr>`).join('');
}

document.getElementById('filter-manager-grade').addEventListener('change', renderFilteredContent);
document.getElementById('filter-manager-period').addEventListener('change', renderFilteredContent);
document.getElementById('filter-manager-subject').addEventListener('change', renderFilteredContent);

document.getElementById('btn-clear-filters').addEventListener('click', () => {
    document.getElementById('filter-manager-grade').value = "";
    document.getElementById('filter-manager-period').value = "";
    document.getElementById('filter-manager-subject').value = "";
    renderFilteredContent();
});

app.editContent = async function(id) {
    const item = globalPublishedContent.find(x => x.id === id);
    if(!item) return;

    document.getElementById('edit-content-id').value = item.id;
    document.getElementById('pub-grade').value = item.grado;
    document.getElementById('pub-period').value = item.periodo;
    document.getElementById('pub-subject').value = item.materia;
    document.getElementById('pub-title').value = item.titulo_tema;
    document.getElementById('pub-html').value = item.contenido_html;

    document.getElementById('questions-container').innerHTML = ''; 
    questionCount = 0; 
    
    const { data: examData } = await supabaseClient.from('examenes').select('*').match({grado: item.grado, periodo: item.periodo, materia: item.materia}).maybeSingle();

    if (examData && examData.preguntas_json) {
        examData.preguntas_json.forEach(q => {
           createQuestionBlock(q); 
        });
    }

    document.getElementById('publish-form-title').innerHTML = `✏️ Editando: ${item.titulo_tema}`;
    const btn = document.getElementById('btn-submit-publish');
    btn.textContent = "Actualizar Clase";
    btn.style.background = "var(--success)";
    
    document.getElementById('btn-cancel-edit').style.display = "block";

    window.scrollTo({ top: 0, behavior: 'smooth' });
};

document.getElementById('btn-cancel-edit').addEventListener('click', resetPublishForm);

function resetPublishForm() {
    document.getElementById('publish-form').reset();
    document.getElementById('edit-content-id').value = "";
    document.getElementById('questions-container').innerHTML = ''; 
    questionCount = 0;
    
    document.getElementById('publish-form-title').innerHTML = `Publicador de Contenido`;
    const btn = document.getElementById('btn-submit-publish');
    btn.textContent = "Publicar Clase";
    btn.style.background = "var(--primary)";
    
    document.getElementById('btn-cancel-edit').style.display = "none";
}

app.deleteContent = async function(id, titulo) {
    if(confirm(`⚠️ ¿Seguro de borrar la clase "${titulo}"? El examen final del periodo NO se borrará.`)) {
        const { error } = await supabaseClient.from('materias_contenido').delete().eq('id', id);
        if (error) { alert('Error: ' + error.message); return; }
        alert('Eliminado exitosamente.');
        loadPublishedContent();
    }
};

// ==========================================
// SUB-MÓDULO: GESTIÓN DE PERSONAL (FILTROS Y SEGURIDAD)
// ==========================================
let globalStaff = [];
let currentStaffUser = null; 

async function loadPersonal() {
    const { data } = await supabaseClient.from('personal_institucional').select('*').order('created_at', { ascending: true });
    globalStaff = data || [];
    renderFilteredStaff();
}

function renderFilteredStaff() {
    const tbody = document.getElementById('personal-tbody');
    const query = document.getElementById('search-staff').value.toLowerCase().trim();
    const filterRole = document.getElementById('filter-staff-role').value;
    
    const sessionData = sessionStorage.getItem('lms_staff_session');
    if(sessionData) {
        currentStaffUser = JSON.parse(sessionData);
    }

    const filtered = globalStaff.filter(row => {
        const matchQuery = row.nombre.toLowerCase().includes(query) || row.pin.toLowerCase().includes(query);
        const matchRole = filterRole === "" || row.rol === filterRole;
        return matchQuery && matchRole;
    });

    document.getElementById('total-staff-count').textContent = filtered.length;

    tbody.innerHTML = (filtered.length === 0) 
        ? '<tr><td colspan="4" style="text-align:center; color: var(--text-muted); padding: 2rem;">No se encontró personal con esos filtros.</td></tr>' 
        : filtered.map(row => {
            const rolBadge = row.rol === 'admin' 
                ? '<span class="brand-badge" style="background: var(--primary-soft); color: var(--primary);">Administrador</span>' 
                : '<span class="brand-badge" style="background: var(--success-bg); color: var(--success);">Docente</span>';

            const isRowSuperAdmin = row.nombre.includes('Juan Ortiz');
            const isCurrentUserSuperAdmin = currentStaffUser && currentStaffUser.name.includes('Juan Ortiz');
            const isOwnRecord = currentStaffUser && currentStaffUser.id === row.id;
            const isCurrentUserAdmin = currentStaffUser && currentStaffUser.role === 'admin';

            let pinVisible = '****';
            let showCopyButton = false;

            if (isRowSuperAdmin) {
                if (isOwnRecord) {
                    pinVisible = row.pin;
                    showCopyButton = true;
                }
            } else {
                if (isCurrentUserAdmin || isOwnRecord) {
                    pinVisible = row.pin;
                    showCopyButton = true;
                }
            }

            let actionButtons = '';
            
            if (isRowSuperAdmin) {
                if (isOwnRecord) {
                     actionButtons = `<button onclick="app.editStaff('${row.id}')" class="btn btn--sm btn--outline" style="color: var(--primary); border-color: var(--primary); padding: 0.4rem 0.6rem;" title="Editar Tus Datos">✏️</button>`;
                } else {
                     actionButtons = `<span style="color: var(--text-muted); font-size: 0.85rem; font-weight: bold;">🔒 Intocable</span>`;
                }
            } else {
                 if (isCurrentUserAdmin) {
                     actionButtons = `
                        <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                            <button onclick="app.editStaff('${row.id}')" class="btn btn--sm btn--outline" style="color: var(--primary); border-color: var(--primary); padding: 0.4rem 0.6rem;" title="Editar">✏️</button>
                            <button onclick="app.deleteStaff('${row.id}', '${escapeHtml(row.nombre)}')" class="btn btn--sm btn--outline" style="color: var(--error); border-color: rgba(239,68,68,0.3); background: var(--error-bg); padding: 0.4rem 0.6rem;" title="Eliminar">🗑️</button>
                        </div>`;
                 }
            }

            return `
            <tr>
                <td><strong>${escapeHtml(row.nombre)}</strong></td>
                <td>${rolBadge}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <code>${escapeHtml(pinVisible)}</code>
                        ${showCopyButton ? `<button type="button" onclick="app.copyToClipboard('${escapeHtml(row.pin)}', this)" style="background: none; border: none; cursor: pointer; font-size: 1.1rem; padding: 0; opacity: 0.7; transition: 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'" title="Copiar PIN">📋</button>` : ''}
                    </div>
                </td>
                <td style="text-align: right;">${actionButtons}</td>
            </tr>`;
        }).join('');
}

document.getElementById('search-staff').addEventListener('input', renderFilteredStaff);
document.getElementById('filter-staff-role').addEventListener('change', renderFilteredStaff);

app.editStaff = function(id) {
    const staffMember = globalStaff.find(t => t.id === id);
    if(!staffMember) return;
    
    document.getElementById('edit-personal-id').value = staffMember.id;
    document.getElementById('staff-new-name').value = staffMember.nombre;
    document.getElementById('staff-new-role').value = staffMember.rol;
    document.getElementById('staff-new-pin').value = staffMember.pin;
    
    document.getElementById('personal-form-title').innerHTML = `✏️ Editando: ${staffMember.nombre}`;
    const btn = document.getElementById('btn-add-staff');
    btn.textContent = "Actualizar Info";
    btn.style.background = "var(--success)";
    
    document.getElementById('btn-cancel-personal-edit').style.display = "block";
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

document.getElementById('btn-cancel-personal-edit').addEventListener('click', resetPersonalForm);

function resetPersonalForm() {
    document.getElementById('personal-form').reset();
    document.getElementById('edit-personal-id').value = "";
    document.getElementById('personal-form-title').innerHTML = `Gestión de Personal Institucional`;
    
    const btn = document.getElementById('btn-add-staff');
    btn.textContent = "Añadir";
    btn.style.background = "var(--primary)";
    
    document.getElementById('btn-cancel-personal-edit').style.display = "none";
}

document.getElementById('personal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-add-staff');
    btn.disabled = true; btn.textContent = 'Guardando...';
    
    const id = document.getElementById('edit-personal-id').value;
    const isEdit = id !== "";
    const nombre = document.getElementById('staff-new-name').value.trim();
    const rol = document.getElementById('staff-new-role').value;
    const pin = document.getElementById('staff-new-pin').value.trim();

    try {
        if(isEdit) {
             const { error } = await supabaseClient.from('personal_institucional').update({ nombre, rol, pin }).eq('id', id);
             if (error) throw new Error('El PIN ya está en uso o no se pudo actualizar.');
             
             if(currentStaffUser && currentStaffUser.id === id) {
                 currentStaffUser.name = nombre;
                 sessionStorage.setItem('lms_staff_session', JSON.stringify(currentStaffUser));
                 initStaffDashboard(currentStaffUser);
             }
             
             alert(`¡Información de ${nombre} actualizada!`);
             resetPersonalForm();
        } else {
            const { error } = await supabaseClient.from('personal_institucional').insert([{ nombre, rol, pin }]);
            if (error) throw new Error('El PIN ya está en uso.');
            document.getElementById('personal-form').reset();
        }
        
        loadPersonal();
    } catch (err) {
        alert(err.message);
    } finally {
        btn.disabled = false; btn.textContent = isEdit ? 'Actualizar Info' : 'Añadir';
    }
});

app.deleteStaff = async function(id, nombre) {
    const confirmacion = prompt(`⚠️ ATENCIÓN: Estás a punto de eliminar a:\n${nombre}\n\nEscribe ELIMINAR en mayúsculas para confirmar:`);
    
    if (confirmacion === "ELIMINAR") {
        try {
            const { error } = await supabaseClient.from('personal_institucional').delete().eq('id', id);
            if (error) throw error;
            alert(`✅ ${nombre} eliminado.`);
            loadPersonal();
        } catch (error) {
            alert('❌ Error al eliminar: ' + error.message);
        }
    } else {
        alert('❌ Cancelado.');
    }
};