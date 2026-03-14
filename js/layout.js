function getSavedTheme() {
    return localStorage.getItem('agrosmart-theme') || 'light';
}

function applyTheme(theme) {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    localStorage.setItem('agrosmart-theme', theme);

    const btn = document.getElementById('theme-toggle-fab');
    if (btn) {
        // Sun for light mode, moon for dark mode
        btn.textContent = theme === 'dark' ? '🌙' : '☀️';
        btn.setAttribute('aria-label', theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    }
}

function toggleTheme() {
    const current = getSavedTheme();
    applyTheme(current === 'dark' ? 'light' : 'dark');
}

async function renderNavbar(activePage) {
    if (typeof AuthObj === 'undefined') return;
    const user = await AuthObj.getCurrentUser();

    // Si no es index pero no hay usuario, redirigir
    if (!user && window.location.pathname.indexOf('index.html') === -1 && window.location.pathname !== '/' && window.location.pathname.length > 1) {
        window.location.href = 'index.html';
        return;
    }

    if (!user) return; // No navbar on login screen

    applyTheme(getSavedTheme());

    let adminLinks = '';
    if (user.is_superuser) {
        adminLinks = `
            <a href="admin_panel.html" class="btn-secondary admin-panel-btn">🛠️ Panel Admin</a>
        `;
    }

    const navbarHTML = `
    <nav class="navbar d-flex flex-wrap justify-content-start align-items-start animate-slide-up">
        <div class="d-flex align-items-center gap-2">
            <a class="navbar-brand text-decoration-none d-flex align-items-center gap-2" href="dashboard.html">
                <img src="img/logo.png" alt="AgroSmart Logo" style="height: 35px; width: auto; object-fit: contain;">
                <span class="d-none d-md-inline">AgroSmart</span>
            </a>
            <button id="navbar-toggle" class="navbar-toggle" aria-label="Mostrar menú" aria-expanded="false">
                ☰
            </button>
        </div>
        <div id="navbar-menu" class="navbar-menu collapsed">
            <a href="chat_list.html" class="btn-secondary position-relative text-nowrap">
                💬 Chat
                <span id="notificationBadge" class="notification-bubble" style="display:none;">0</span>
            </a>
            <a href="dashboard.html" class="btn-secondary text-nowrap ${activePage === 'dashboard' ? 'active' : ''}">🏠 Dashboard</a>
            <a href="crop_create.html" class="btn-secondary text-nowrap ${activePage === 'crop_create' ? 'active' : ''}">➕ Registrar</a>
            <a href="calls.html" class="btn-secondary text-nowrap ${activePage === 'calls' ? 'active' : ''}">📞 Llamadas</a>
            ${adminLinks}
            <a href="about.html" class="btn-secondary text-nowrap">ℹ️ Acerca de nosotros</a>
            <a href="contact.html" class="btn-secondary text-nowrap">✉️ Contacto</a>
            <a href="moon_calendar.html" class="btn-secondary text-nowrap">🌙 Luna</a>
            <a href="#" onclick="AuthObj.logout()" class="btn-secondary nav-logout-btn text-nowrap d-flex align-items-center justify-content-start" title="Cerrar sesión">
                <span class="me-1" style="font-size:1.1rem;">🚪</span>
                <span class="d-none d-md-inline">Salir</span>
            </a>
        </div>
    </nav>
    `;

    const container = document.getElementById('navbar-container');
    if (container) {
        container.innerHTML = navbarHTML;
        await updateNotificationBadge();

        // Toggle controlling the visibility of the sidebar
        const toggle = document.getElementById('navbar-toggle');
        const menu = document.getElementById('navbar-menu');
        const sidebar = document.querySelector('.navbar');

        // Create a fixed sidebar toggle button (always visible)
        let sidebarToggle = document.getElementById('sidebar-toggle');
        if (!sidebarToggle) {
            sidebarToggle = document.createElement('button');
            sidebarToggle.id = 'sidebar-toggle';
            sidebarToggle.className = 'sidebar-toggle-btn';
            sidebarToggle.type = 'button';
            sidebarToggle.setAttribute('aria-label', 'Mostrar/ocultar menú');
            sidebarToggle.textContent = '☰';
            document.body.appendChild(sidebarToggle);
        }

        const setSidebarState = (open) => {
            if (!sidebar) return;
            sidebar.classList.toggle('collapsed', !open);
            sidebar.classList.toggle('open', open);
            menu?.classList.toggle('collapsed', !open);
            sidebarToggle.textContent = open ? '✕' : '☰';
            sidebarToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            document.body.classList.toggle('sidebar-collapsed', !open);
        };

        const updateMenuVisibility = () => {
            if (!menu || !toggle || !sidebar) return;

            const isLarge = window.innerWidth >= 992;
            const shouldBeOpen = isLarge;

            setSidebarState(shouldBeOpen);
            toggle.setAttribute('aria-expanded', shouldBeOpen ? 'true' : 'false');
            sidebarToggle.style.display = 'flex';
        };

        sidebarToggle.addEventListener('click', () => {
            const isCurrentlyCollapsed = sidebar?.classList.contains('collapsed');
            setSidebarState(isCurrentlyCollapsed);
        });

        window.addEventListener('resize', updateMenuVisibility);
        updateMenuVisibility();

        // Close menu when clicking outside (mobile)
        document.addEventListener('click', (e) => {
            if (!menu || !sidebarToggle || !sidebar) return;
            if (sidebar.classList.contains('collapsed')) return;
            const target = e.target;
            if (target instanceof Node && !sidebar.contains(target) && !sidebarToggle.contains(target)) {
                setSidebarState(false);
                document.body.classList.add('sidebar-collapsed');
            }
        });
    }

    ensureThemeFab();
}

function ensureThemeFab() {
    if (document.getElementById('theme-toggle-fab')) return;

    const btn = document.createElement('button');
    btn.id = 'theme-toggle-fab';
    btn.type = 'button';
    btn.className = 'theme-toggle-fab';
    btn.title = 'Cambiar tema';
    btn.addEventListener('click', toggleTheme);

    document.body.appendChild(btn);
    applyTheme(getSavedTheme());
}

async function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if(!badge) return;
    
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

// Actualizar cada 10 segundos para no saturar
setInterval(updateNotificationBadge, 10000);

// Ensure theme toggle is available even on pages without a navbar (e.g., login/register)
document.addEventListener('DOMContentLoaded', () => {
    applyTheme(getSavedTheme());
    ensureThemeFab();
});
