async function renderNavbar(activePage) {
    if (typeof AuthObj === 'undefined') return;
    const user = await AuthObj.getCurrentUser();
    
    // Si no es index pero no hay usuario, redirigir
    if (!user && window.location.pathname.indexOf('index.html') === -1 && window.location.pathname !== '/' && window.location.pathname.length > 1) {
        window.location.href = 'index.html';
        return;
    }

    if (!user) return; // No navbar on login screen

    let adminLinks = '';
    if (user.is_superuser) {
        adminLinks = `
            <a href="admin_panel.html" class="btn-primary" style="background:var(--primary-color);">🛠️ Panel Admin</a>
        `;
    }

    const navbarHTML = `
    <nav class="navbar d-flex flex-nowrap justify-content-between align-items-center animate-slide-up">
        <a class="navbar-brand text-decoration-none d-flex align-items-center gap-2" href="dashboard.html">
            <img src="img/logo.png" alt="AgroSmart Logo" style="height: 35px; width: auto; object-fit: contain;">
            <span class="d-none d-md-inline">AgroSmart</span>
        </a>
        <div class="nav-buttons-container d-flex align-items-center flex-nowrap gap-2 overflow-x-auto pb-1" style="scrollbar-width: none; -ms-overflow-style: none;">
            <a href="chat_list.html" class="btn-secondary position-relative text-nowrap">
                💬 Chat
                <span id="notificationBadge" class="notification-bubble" style="display:none;">0</span>
            </a>
            
            <a href="dashboard.html" class="btn-secondary text-nowrap ${activePage === 'dashboard' ? 'active' : ''}">🏠 Dashboard</a>
            <a href="crop_create.html" class="btn-secondary text-nowrap ${activePage === 'crop_create' ? 'active' : ''}">➕ Registrar</a>
            <a href="calls.html" class="btn-secondary text-nowrap ${activePage === 'calls' ? 'active' : ''}">📞 Llamadas</a>
            
            ${adminLinks}

            <a href="about.html" class="btn-secondary text-nowrap">ℹ️ Acerca</a>
            <a href="contact.html" class="btn-secondary text-nowrap">✉️ Contacto</a>
            <a href="moon_calendar.html" class="btn-secondary text-nowrap">🌙 Luna</a>
            
            <a href="#" onclick="AuthObj.logout()" class="btn-danger p-2 border-0 rounded-circle text-center text-decoration-none ms-2 d-flex align-items-center justify-content-center flex-shrink-0" style="width:40px;height:40px;" title="Cerrar Sessión">⏻</a>
        </div>
    </nav>
    `;

    const container = document.getElementById('navbar-container');
    if (container) {
        container.innerHTML = navbarHTML;
        await updateNotificationBadge();
    }
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
