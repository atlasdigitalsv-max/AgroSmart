function getSavedTheme() {
    return localStorage.getItem('agrosmart-theme') || 'light';
}

function applyTheme(theme) {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    localStorage.setItem('agrosmart-theme', theme);
}

function toggleTheme() {
    // Hidden as requested, but keeping logic for future internal use if needed
    const current = getSavedTheme();
    applyTheme(current === 'dark' ? 'light' : 'dark');
}

const NAVBAR_TEMPLATE = `
<button id="navbar-toggle" class="navbar-toggle" aria-label="Mostrar menú" aria-expanded="true">✕</button>
<nav class="navbar open">
    <div class="navbar-header-logo">
        <a class="navbar-brand text-decoration-none d-flex align-items-center gap-2" href="dashboard.html">
            <img src="img/logo.png" alt="AgroSmart Logo" style="height: 35px; width: auto; object-fit: contain;">
            <span class="d-none d-md-inline" style="color: var(--text-main); font-weight: 800;">AgroSmart</span>
        </a>
    </div>
    <div id="navbar-menu" class="navbar-menu">
        <a href="dashboard.html" class="btn-secondary text-nowrap" data-page="dashboard">
            <i class="bi bi-house-door me-2"></i> Inicio
        </a>
        <a href="catalog.html" class="btn-secondary text-nowrap" data-page="catalog" style="display: none;">
            <i class="bi bi-book me-2"></i> Catálogo
        </a>
        <a href="crop_create.html" class="btn-secondary text-nowrap" data-page="crop_create" style="display: none;">
            <i class="bi bi-plus-circle me-2"></i> Registrar
        </a>
        <a href="chat_list.html" class="btn-secondary position-relative text-nowrap" data-page="chat" style="display: none;">
            <i class="bi bi-chat-dots me-2"></i> Chat
            <span id="notificationBadge" class="notification-bubble" style="display:none;">0</span>
        </a>
        <a href="calls.html" class="btn-secondary text-nowrap" data-page="calls" id="nav-calls-link" style="display: none;">
            <i class="bi bi-camera-video me-2"></i> Videollamadas
        </a>
        <a href="plan_dashboard.html" class="btn-secondary text-nowrap" id="nav-plan-link" data-page="plan" style="display: none;">
            <i class="bi bi-activity me-2"></i> Mi Plan
        </a>
        <a href="admin_panel.html" class="btn-secondary admin-panel-btn" data-page="admin_panel" id="nav-admin-link" style="display: none;">
            <i class="bi bi-speedometer2 me-2"></i> Administración
        </a>
        <a href="services.html" class="btn-secondary text-nowrap" data-page="services">
            <i class="bi bi-gear-wide-connected me-2"></i> Servicios
        </a>
        <a href="about.html" class="btn-secondary text-nowrap" data-page="about">
            <i class="bi bi-info-circle me-2"></i> Nosotros
        </a>
        <a href="contact.html" class="btn-secondary text-nowrap" data-page="contact" style="display: none;">
            <i class="bi bi-envelope me-2"></i> Contacto
        </a>
        
        <div id="auth-nav-container">
            <!-- Dynamic Login/Logout button -->
        </div>
    </div>
</nav>
`;

async function renderNavbar(activePage) {
    const user = (typeof AuthObj !== 'undefined') ? await AuthObj.getCurrentUser() : null;

    // Ejecución silenciosa y automática de limpieza de base de datos a medianoche
    if (window.DB && typeof window.DB.runMidnightChatCleanup === 'function') {
        window.DB.runMidnightChatCleanup();
    }

    // List of pages that don't require login
    const publicPages = ['index.html', 'dashboard.html', 'services.html', 'about.html', 'contact.html', 'catalog.html'];
    const currentPath = window.location.pathname.toLowerCase();
    const fileName = currentPath.split('/').pop() || 'index.html';
    
    // Check if current page is public (Exact match for the file name)
    const isPublicPage = publicPages.includes(fileName);

    // If not public and no user, Redirect to login
    if (!user && !isPublicPage) {
        window.location.replace('index.html');
        return;
    }

    // Dynamic UI adjustments for current page based on auth state
    if (user && currentPath.includes('about.html')) {
        const guideSection = document.getElementById('visitor-guide-section');
        if (guideSection) guideSection.style.display = 'none';
    }

    applyTheme(getSavedTheme());

    const container = document.getElementById('navbar-container') || document.getElementById('main-navbar');
    if (!container) return;

    const isLocalFile = window.location.protocol === 'file:';

    // STRICT LOCAL CHECK: Avoid fetch entirely on file:// to prevent CORS errors in console
    if (isLocalFile) {
        container.innerHTML = NAVBAR_TEMPLATE;
        console.info('AgroSmart: Cargando UI interna (Protocolo local file://)');
    } else {
        try {
            let response;
            try {
                response = await fetch('components/navbar.html');
            } catch (e) {
                response = await fetch('/components/navbar.html');
            }

            if (response && response.ok) {
                container.innerHTML = await response.text();
            } else {
                container.innerHTML = NAVBAR_TEMPLATE;
            }
        } catch (error) {
            container.innerHTML = NAVBAR_TEMPLATE;
        }
    }

    const isAdmin = user && (user.is_superuser || ['global_owner', 'ministry_admin', 'org_admin'].includes(user.role));
    const isSidebarOpen = localStorage.getItem('agrosmart-sidebar-open') !== 'false';

    const sidebar = container.querySelector('.navbar');
    const toggle = document.getElementById('navbar-toggle');
    const menu = container.querySelector('#navbar-menu');
    const adminLink = container.querySelector('#nav-admin-link');
    const authContainer = container.querySelector('#auth-nav-container');

    // highlight active page
    if (activePage) {
        const activeLink = container.querySelector(`[data-page="${activePage}"]`);
        if (activeLink) activeLink.classList.add('active');
    }

    // Navigation items that require login
    const protectedItems = container.querySelectorAll('[data-page="catalog"], [data-page="crop_create"], [data-page="chat"], [data-page="contact"]');
    const callsLink = container.querySelector('#nav-calls-link');
    const planLink = container.querySelector('#nav-plan-link');
    
    // Hide all role-based items by default to prevent flicker
    if (adminLink) adminLink.style.display = 'none';
    if (callsLink) callsLink.style.display = 'none';
    if (planLink) planLink.style.display = 'none';
    protectedItems.forEach(item => item.style.display = 'none');

    if (user) {
        console.log(`AgroSmart UI: Usuario detectado (${user.role}). Actualizando visibilidad...`);
        // Show for logged in users
        protectedItems.forEach(item => {
            item.style.setProperty('display', 'flex', 'important');
        });
        
        // Admin Visibility
        if (adminLink) {
            console.log(`AgroSmart UI: isAdmin=${isAdmin}`);
            adminLink.style.setProperty('display', isAdmin ? 'flex' : 'none', 'important');
        }

        // Plan Dashboard Visibility (Global Owner & Ministry Admin)
        if (planLink) {
            const canViewPlan = ['global_owner', 'ministry_admin'].includes(user.role);
            planLink.style.setProperty('display', canViewPlan ? 'flex' : 'none', 'important');
        }

        // Calls Visibility (Plan-based)
        if (callsLink) {
            const countries = await window.DB.getCountries();
            const country = countries.find(c => String(c.id) === String(user.country_id));
            const plan = country ? (country.plan || 'none') : 'none';
            const hasCallPlan = ['diamante', 'esmeralda'].includes(plan);
            
            callsLink.style.display = (user.role === 'global_owner' || hasCallPlan) ? 'flex' : 'none';
        }
    } else {
        // Hide for guests
        protectedItems.forEach(item => item.style.display = 'none');
        if (adminLink) adminLink.style.display = 'none';
        if (callsLink) callsLink.style.display = 'none';
    }

    // Auth Button
    if (authContainer) {
        authContainer.innerHTML = user ? `
            <a href="#" onclick="AuthObj.logout()" class="btn-secondary nav-logout-btn text-nowrap d-flex align-items-center justify-content-start" title="Cerrar sesión">
                <i class="bi bi-box-arrow-right me-2"></i>
                <span class="d-none d-md-inline">Salir</span>
            </a>` : `
            <a href="index.html" class="btn-secondary text-nowrap d-flex align-items-center justify-content-start">
                <i class="bi bi-box-arrow-in-right me-2"></i>
                <span class="d-none d-md-inline">Entrar</span>
            </a>`;
    }

    await updateNotificationBadge();

    // Welcome Modal Logic
    if (user && sessionStorage.getItem('show_welcome_modal') === 'true') {
        sessionStorage.removeItem('show_welcome_modal');
        let roleName = 'Agricultor';
        if (user.role === 'global_owner') roleName = 'Dueño Global';
        else if (user.role === 'ministry_admin') roleName = 'Administrador Gubernamental';
        else if (user.role === 'org_admin') roleName = 'Administrador de Cooperativa';
        
        // Fetch country plan name
        const countries = await window.DB.getCountries();
        const country = countries.find(c => String(c.id) === String(user.country_id));
        const planName = (country ? (country.plan || 'none') : 'none').toUpperCase();

        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: '¡Bienvenido de nuevo!',
                html: `
                    <p class="mb-2">Has iniciado sesión como: <strong>${roleName}</strong></p>
                    <div class="p-2 bg-light rounded border small">
                        <i class="bi bi-shield-check me-2"></i>Licencia Regional: <strong>Plan ${planName}</strong>
                    </div>
                `,
                icon: 'success',
                timer: 4000,
                showConfirmButton: false,
                backdrop: `rgba(0,0,0,0.4)`
            });
        }
    }

    const setSidebarState = (open) => {
        if (!sidebar) return;
        sidebar.classList.toggle('collapsed', !open);
        sidebar.classList.toggle('open', open);
        menu?.classList.toggle('collapsed', !open);
        
        if (toggle) {
            toggle.textContent = open ? '✕' : '☰';
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
        
        document.body.classList.toggle('sidebar-collapsed', !open);
        // Salvar estado
        localStorage.setItem('agrosmart-sidebar-open', open);
    };

    const updateMenuVisibility = () => {
        if (!menu || !toggle || !sidebar) return;

        const isLarge = window.innerWidth >= 992;
        const savedState = localStorage.getItem('agrosmart-sidebar-open');
        
        // Preferir estado guardado si existe, si no, usar ancho de pantalla
        let shouldBeOpen = savedState !== null ? savedState === 'true' : isLarge;
        
        // Forzar cerrado en móviles si no se especificó lo contrario
        if (!isLarge && savedState === null) shouldBeOpen = false;

        setSidebarState(shouldBeOpen);
    };

    // Variables are already defined above and scoped within renderNavbar

    if (toggle) {
        toggle.addEventListener('click', () => {
            const isCurrentlyCollapsed = sidebar?.classList.contains('collapsed');
            setSidebarState(isCurrentlyCollapsed);
        });
    }

    window.addEventListener('resize', updateMenuVisibility);
    updateMenuVisibility();

    // Close menu when clicking outside (mobile)
    document.addEventListener('click', (e) => {
        if (!menu || !sidebar || !toggle) return;
        if (sidebar.classList.contains('collapsed')) return;
        const target = e.target;
        if (target instanceof Node && !sidebar.contains(target) && !toggle.contains(target)) {
            setSidebarState(false);
        }
    });
}

// function ensureThemeFab() REMOVED

async function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if(!badge) return;
    if (typeof AuthObj === 'undefined') return;
    
    const user = await AuthObj.getCurrentUser();
    if (!user) return;


    let unreadCount = 0;
    
    // Fetch all messages for the user to count unread
    // In a real app we'd have a specific endpoint or count method
    // For now we'll use our getMessages with admin (id 1, though we should check all)
    // Actually, getMessages(myId, otherId) is specific.
    // Let's implement a dummy "total unread" in DB class if needed, or just mock it here.
    
    if (window.DB.supabase) {
        const { data, count, error } = await window.DB.supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('receiver_id', user.id)
            .eq('is_read', false);
        if (!error) unreadCount = count;
    } else {
        const db = window.DB.getLocalDB();
        unreadCount = db.messages.filter(m => m.receiver_id === user.id && !m.is_read).length;
    }

    if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

// Actualizar cada 30 segundos para no saturar (Optimizado)
setInterval(updateNotificationBadge, 30000);

// Live Instant-Ban Monitor Loop
// If An Admin drops the ban hammer mid-session, this will execute the logout
async function monitorSessionValidity() {
    const userId = sessionStorage.getItem('current_user_id');
    if (!userId || window.location.pathname.includes('index.html') || window.location.pathname === '/' || window.location.pathname === '') return;
    
    try {
        const liveUser = await window.DB.getUserById(userId);
        
        // If liveUser is null, it could be a transient issue, or the user was actually deleted.
        // We now rely on the backend or manual syncs to handle real deletions rather than aggressively 
        // polling and logging out on every null return to prevent false expulsions.
        if (!liveUser || liveUser._isStub) {
            return;
        }

        if (liveUser.suspension_end && new Date(liveUser.suspension_end) > new Date()) {
            // Unplug session from storage explicitly so they can't nav-back
            sessionStorage.removeItem('current_user_id');
            // Instant redirect to index which will show the appeal popup naturally on their next attempt
            window.location.replace('index.html?reason=banned_mid_session');
        }
    } catch(e) {
        // Failing silently on net loss
    }
}

// Check every 15 seconds if account got suspended (Optimizado)
setInterval(monitorSessionValidity, 15000);

document.addEventListener('DOMContentLoaded', () => {
    applyTheme(getSavedTheme());
    injectSweetAlert();
    monitorSessionValidity(); // Check immediately on load too
});

// --- GLOBAL SWEETALERT VIRTUALIZATION ---
function injectSweetAlert() {
    if (document.getElementById('sweetalert-script')) return;

    const script = document.createElement('script');
    script.id = 'sweetalert-script';
    script.src = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';
    script.onload = () => {
        // Customize default SweetAlert behavior
        const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true,
            didOpen: (toast) => {
                toast.addEventListener('mouseenter', Swal.stopTimer)
                toast.addEventListener('mouseleave', Swal.resumeTimer)
            }
        });
        window.Toast = Toast;
    };
    document.head.appendChild(script);
}

// Global Alert Replacement helper
window.showErrorModal = function(title, text) {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'error',
            title: title || 'Error',
            text: text,
            confirmButtonText: 'Entendido'
        });
    } else {
        alert(`${title}: ${text}`);
    }
};

window.showSuccessModal = function(title, text) {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'success',
            title: title || '¡Éxito!',
            text: text,
            confirmButtonText: 'Aceptar'
        });
    } else {
        alert(`${title}: ${text}`);
    }
};

window.initLayout = async function(activePage = null) {
    // If no activePage is provided, try to detect it from filename
    if (!activePage) {
        const path = window.location.pathname;
        const page = path.split('/').pop().split('.')[0];
        activePage = page || 'dashboard';
    }
    await renderNavbar(activePage);
};

window.confirmActionModal = async function(title, text, confirmText = 'Sí, continuar', cancelText = 'Cancelar') {
    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title: title,
            text: text,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: 'var(--primary-color)',
            cancelButtonColor: 'var(--button-secondary-bg)',
            confirmButtonText: confirmText,
            cancelButtonText: cancelText
        });
        return result.isConfirmed;
    } else {
        return confirm(`${title}\n${text}`);
    }
};
