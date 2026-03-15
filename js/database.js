// Database Implementation with Supabase Cloud & Local Fallback

const DB_KEY = 'agrosmart_db';

class Database {
    constructor() {
        this.supabase = null;
        const config = window.CONFIG || (typeof CONFIG !== 'undefined' ? CONFIG : null);
        if (!config) {
            console.error("CONFIG not found. Check if config.js is loaded.");
            this.initLocalDB();
            return;
        }
        if (typeof supabase !== 'undefined' && config.SUPABASE_URL && config.SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
            this.supabase = supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
            console.log("Supabase Client Initialized");
        }
        // No initDB needed for Supabase as it's remote, but keep localStorage for local dev/fallback
        this.initLocalDB();
    }

    async runMidnightChatCleanup() {
        const lastClearDateStr = localStorage.getItem('last_chat_cleanup');
        const todayStr = new Date().toISOString().split('T')[0];

        if (lastClearDateStr !== todayStr) {
            console.log("🌟 Medianoche detectada: Ejecutando borrado total de historiales de chat para liberar caché.");
            if (this.supabase) {
                try {
                    // Requires the SQL table to not have hard blocks on delete without where if possible, 
                    // or simulate a neq trick to delete all.
                    const { error } = await this.supabase.from('messages').delete().neq('id', 0);
                    if (error) console.error("Error limpiando chats en Supabase:", error);
                } catch(e) {
                    console.warn("Fallo borrado de Supabase:", e);
                }
            } 
            
            // Local fallback cleanup
            const db = this.getLocalDB();
            if (db) {
                db.messages = [];
                this.saveLocalDB(db);
            }

            localStorage.setItem('last_chat_cleanup', todayStr);
        }
    }

    initLocalDB() {
        if (!localStorage.getItem(DB_KEY)) {
            const initialData = {
                users: [],
                crops: [],
                messages: [],
                fertilizer_logs: [],
                chat_groups: [],
                chat_group_members: []
            };
            this.saveLocalDB(initialData);
        }
    }

    getLocalDB() {
        return JSON.parse(localStorage.getItem(DB_KEY));
    }

    saveLocalDB(data) {
        localStorage.setItem(DB_KEY, JSON.stringify(data));
    }

    async hashPassword(password) {
        const msgUint8 = new TextEncoder().encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // --- Users ---
    async getUserByEmail(email) {
        if (this.supabase) {
            try {
                const { data, error } = await this.supabase.from('users').select('*').eq('email', email).maybeSingle();
                if (!error && data) return data;
                if (error && error.code !== 'PGRST116') throw error; // Re-throw real errors to trigger fallback
            } catch(e) {
                console.warn("[Offline/Error] Fallback to local DB for getUserByEmail", e);
            }
        }
        return this.getLocalDB().users.find(u => u.email === email);
    }

    async getUserById(id) {
        if (!id) return null;
        if (this.supabase) {
            try {
                const { data, error } = await this.supabase.from('users').select('*').eq('id', id).maybeSingle();
                if (error) {
                    console.error("[Supabase] Error en getUserById:", error);
                    throw error; // Forzamos el catch para el fallback a LocalDB
                }
                if (data) return data;
            } catch(e) {
                console.warn("[Offline/Error] Reintentando búsqueda en base local para usuario:", id);
            }
        }
        
        const localUser = this.getLocalDB().users.find(u => String(u.id) === String(id));
        if (localUser) return localUser;
        
        return null;
    }

    async createUser(userObj) {
        const hashedPassword = await this.hashPassword(userObj.password);
        const baseUser = {
            ...userObj,
            password: hashedPassword,
            is_superuser: userObj.is_superuser || false,
            is_active: true,
            role: userObj.role || 'farmer',
            country_id: userObj.country_id || null,
            org_id: userObj.org_id || null,
            date_joined: new Date().toISOString(),
            suspension_end: null,
            suspension_reason: null,
            suspended_by: null
        };

        if (this.supabase) {
            try {
                // Limit enforcement for Farmers
                if (baseUser.role === 'farmer' && baseUser.country_id) {
                    const countries = await this.getCountries();
                    const country = countries.find(c => String(c.id) === String(baseUser.country_id));
                    const plan = country ? (country.plan || 'none') : 'none';
                    
                    if (plan !== 'esmeralda') {
                        const limits = { 'none': 50, 'bronce': 1000, 'platinium': 2500, 'diamante': 5000 };
                        const limit = limits[plan] || 50;
                        
                        const { count, error: countErr } = await this.supabase
                            .from('users')
                            .select('*', { count: 'exact', head: true })
                            .eq('country_id', baseUser.country_id)
                            .eq('role', 'farmer');
                        
                        if (!countErr && count >= limit) {
                            throw new Error(`Límite de agricultores alcanzado para el plan ${plan.toUpperCase()} de este país (${limit}).`);
                        }
                    }
                }

                const { data, error } = await this.supabase.from('users').insert([baseUser]).select().single();
                if (error) throw new Error(error.message);
                return data;
            } catch(e) {
                if (!e.message?.includes('Failed to fetch') && !e.message?.includes('Límite')) throw e;
                if (e.message?.includes('Límite')) throw e;
                console.warn("[Offline] Fallback to local DB for createUser");
            }
        }
        
        const db = this.getLocalDB();
        if (db.users.find(u => u.email === userObj.email)) throw new Error("User already exists");
        const newUser = { id: Date.now(), ...baseUser };
        db.users.push(newUser);
        this.saveLocalDB(db);
        return newUser;
    }

    async suspendUser(userId, hours, reason, adminId) {
        const endDate = hours === 999999 ? new Date(2100, 0, 1) : new Date(Date.now() + (hours * 60 * 60 * 1000));
        const endIso = endDate.toISOString();

        if (this.supabase) {
            try {
                const { error } = await this.supabase.from('users').update({
                    suspension_end: endIso,
                    suspension_reason: reason,
                    suspended_by: adminId
                }).eq('id', userId);
                if (error) throw new Error(error.message);
                return;
            } catch(e) {
                if (!e.message?.includes('Failed to fetch')) throw e;
                console.warn("[Offline] Fallback to local DB for suspendUser");
            }
        }

        const db = this.getLocalDB();
        db.users = db.users.map(u => u.id === userId ? { ...u, suspension_end: endIso, suspension_reason: reason, suspended_by: adminId } : u);
        this.saveLocalDB(db);
    }

    async removeSuspension(userId) {
        if (this.supabase) {
            try {
                const { error } = await this.supabase.from('users').update({
                    suspension_end: null,
                    suspension_reason: null,
                    suspended_by: null
                }).eq('id', userId);
                if (error) throw new Error(error.message);
                return;
            } catch(e) {
                if (!e.message?.includes('Failed to fetch')) throw e;
                console.warn("[Offline] Fallback to local DB for removeSuspension");
            }
        }

        const db = this.getLocalDB();
        db.users = db.users.map(u => u.id === userId ? { ...u, suspension_end: null, suspension_reason: null, suspended_by: null } : u);
        this.saveLocalDB(db);
    }

    async setAdminStatus(userId, isSuperUser, role = 'farmer', plan = null) {
        if (this.supabase) {
            try {
                const updateData = { is_superuser: isSuperUser, role: role };
                if (plan) updateData.plan = plan;
                
                const { error } = await this.supabase.from('users').update(updateData).eq('id', userId);
                if (error) throw new Error(error.message);
                return;
            } catch(e) {
                if (!e.message?.includes('Failed to fetch')) throw e;
                console.warn("[Offline] Fallback to local DB for setAdminStatus");
            }
        }

        const db = this.getLocalDB();
        db.users = db.users.map(u => u.id === userId ? { ...u, is_superuser: isSuperUser, role: role, plan: plan || u.plan } : u);
        this.saveLocalDB(db);
    }

    async updateUserPlan(userId, plan) {
        if (this.supabase) {
            try {
                const { error } = await this.supabase.from('users').update({ plan: plan }).eq('id', userId);
                if (error) throw new Error(error.message);
                return;
            } catch(e) {
                if (!e.message?.includes('Failed to fetch')) throw e;
                console.warn("[Offline] Fallback to local DB for updateUserPlan");
            }
        }

        const db = this.getLocalDB();
        db.users = db.users.map(u => u.id === userId ? { ...u, plan: plan } : u);
        this.saveLocalDB(db);
    }

    async updateUserAffiliation(userId, countryId, orgId) {
        // Handle "none" selection as null for database
        const processedOrgId = orgId === 'none' ? null : orgId;

        if (this.supabase) {
            try {
                const { error } = await this.supabase.from('users').update({ 
                    country_id: countryId, 
                    org_id: processedOrgId 
                }).eq('id', userId);
                if (error) throw new Error(error.message);
                return;
            } catch(e) {
                if (!e.message?.includes('Failed to fetch')) throw e;
                console.warn("[Offline] Fallback to local DB for updateUserAffiliation");
            }
        }

        const db = this.getLocalDB();
        db.users = db.users.map(u => u.id === userId ? { ...u, country_id: countryId, org_id: processedOrgId } : u);
        this.saveLocalDB(db);
    }

    async getAllUsers(currentUser = null) {
        if (this.supabase) {
            let query = this.supabase.from('users').select('*');
            if (currentUser) {
                if (currentUser.role === 'global_owner') {
                    // All users, no filters
                } else if (currentUser.role === 'ministry_admin') {
                    // Users from their country OR all Global Owners (Creators)
                    query = query.or(`country_id.eq.${currentUser.country_id},role.eq.global_owner`);
                } else if (currentUser.role === 'org_admin') {
                    // Only Ministry Admins of their country OR other Org Admins of their country OR their own Farmers
                    // Note: Cannot see global_owners or independent farmers
                    query = query.eq('country_id', currentUser.country_id)
                                 .or(`role.eq.ministry_admin,role.eq.org_admin,and(role.eq.farmer,org_id.eq.${currentUser.org_id})`);
                } else if (currentUser.role === 'farmer') {
                    // Only see Government Admins of their country OR all Global Owners
                    query = query.or(`and(role.eq.ministry_admin,country_id.eq.${currentUser.country_id}),role.eq.global_owner`);
                } else {
                    return [currentUser];
                }
            }
            const { data, error } = await query;
            if (error) console.error(error);
            return data || [];
        }

        const db = this.getLocalDB();
        if (!currentUser || currentUser.role === 'global_owner') return db.users;

        if (currentUser.role === 'ministry_admin') {
            return db.users.filter(u => u.country_id === currentUser.country_id || u.role === 'global_owner');
        }
        
        if (currentUser.role === 'org_admin') {
            return db.users.filter(u => 
                u.country_id === currentUser.country_id && 
                (u.role === 'ministry_admin' || u.role === 'org_admin' || (u.role === 'farmer' && u.org_id === currentUser.org_id))
            );
        }

        if (currentUser.role === 'farmer') {
            return db.users.filter(u => (u.country_id === currentUser.country_id && u.role === 'ministry_admin') || u.role === 'global_owner');
        }

        return db.users.filter(u => u.id === currentUser.id);
    }

    async updateUserPassword(userId, newPassword) {
        const hashedPassword = await this.hashPassword(newPassword);
        if (this.supabase) {
            const { error } = await this.supabase.from('users').update({ password: hashedPassword }).eq('id', userId);
            if (error) console.error(error);
            return;
        }
        const db = this.getLocalDB();
        db.users = db.users.map(u => u.id === userId ? { ...u, password: hashedPassword } : u);
        this.saveLocalDB(db);
    }

    async deleteUser(id) {
        if (this.supabase) {
            await this.supabase.from('crops').delete().eq('user_id', id);
            const { error } = await this.supabase.from('users').delete().eq('id', id);
            if (error) console.error(error);
            return;
        }
        const db = this.getLocalDB();
        db.users = db.users.filter(u => u.id !== id);
        db.crops = db.crops.filter(c => c.user_id !== id);
        this.saveLocalDB(db);
    }

    async getCropsByUser(userId) {
        if (this.supabase) {
            const { data, error } = await this.supabase.from('crops').select('*').eq('user_id', userId);
            if (error) console.error(error);
            return data || [];
        }
        return this.getLocalDB().crops.filter(c => c.user_id === userId);
    }

    async getCountries() {
        if (this.supabase) {
            const { data, error } = await this.supabase.from('countries').select('*').neq('code', 'CORP');
            if (error) console.error(error);
            return data || [];
        }
        return [
            { id: 1, name: 'El Salvador', code: 'SV', plan: 'esmeralda' },
            { id: 10, name: 'Guatemala', code: 'GT', plan: 'none' },
            { id: 11, name: 'Honduras', code: 'HN', plan: 'none' },
            { id: 12, name: 'Nicaragua', code: 'NI', plan: 'none' },
            { id: 13, name: 'Costa Rica', code: 'CR', plan: 'none' },
            { id: 14, name: 'Panamá', code: 'PA', plan: 'none' },
            { id: 15, name: 'Belice', code: 'BZ', plan: 'none' }
        ];
    }

    async setCountryPlan(countryId, plan) {
        if (this.supabase) {
            const { error } = await this.supabase.from('countries').update({ plan }).eq('id', countryId);
            if (error) throw error;
            return true;
        }
        // Local fallback
        return true;
    }

    async getCooperativasByCountry(countryId) {
        if (this.supabase) {
            const { data, error } = await this.supabase.from('organizations').select('*').eq('country_id', countryId);
            if (error) console.error(error);
            return data || [];
        }
        return [{ id: 1, country_id: 1, name: 'Cooperativa Agrícola SV' }];
    }

    async createCooperativa(name, countryId) {
        if (this.supabase) {
            // Limit enforcement
            const countries = await this.getCountries();
            const country = countries.find(c => String(c.id) === String(countryId));
            const plan = country ? (country.plan || 'none') : 'none';
            
            if (plan !== 'esmeralda') {
                const limits = { 'none': 1, 'bronce': 3, 'platinium': 10, 'diamante': 25 };
                const limit = limits[plan] || 1;
                
                const { count, error: countErr } = await this.supabase
                    .from('organizations')
                    .select('*', { count: 'exact', head: true })
                    .eq('country_id', countryId);
                
                if (!countErr && count >= limit) {
                    throw new Error(`Límite de cooperativas alcanzado para el plan ${plan.toUpperCase()} de este país (${limit}).`);
                }
            }

            const { data, error } = await this.supabase.from('organizations').insert([{ name, country_id: countryId }]).select();
            if (error) throw error;
            return data[0];
        }
        const db = this.getLocalDB();
        const newOrg = { id: Date.now(), country_id: countryId, name };
        db.organizations.push(newOrg);
        this.saveLocalDB(db);
        return newOrg;
    }

    async updateCooperativa(id, name) {
        if (this.supabase) {
            const { data, error } = await this.supabase.from('organizations').update({ name }).eq('id', id).select();
            if (error) throw error;
            return data[0];
        }
        const db = this.getLocalDB();
        const org = db.organizations.find(o => o.id === parseInt(id));
        if (org) org.name = name;
        this.saveLocalDB(db);
        return org;
    }

    async deleteCooperativa(id) {
        if (this.supabase) {
            const { error } = await this.supabase.from('organizations').delete().eq('id', id);
            if (error) throw error;
            return true;
        }
        const db = this.getLocalDB();
        db.organizations = db.organizations.filter(o => o.id !== parseInt(id));
        this.saveLocalDB(db);
        return true;
    }

    async getAllCrops(currentUser = null) {
        if (this.supabase) {
            let query = this.supabase.from('crops').select('*');
            
            if (currentUser) {
                if (currentUser.role === 'global_owner') {
                    // Sees everything
                } else if (currentUser.role === 'ministry_admin') {
                    // Filter crops by users in the same country
                    const { data: userIds } = await this.supabase.from('users').select('id').eq('country_id', currentUser.country_id);
                    const ids = (userIds || []).map(u => u.id);
                    query = query.in('user_id', ids);
                } else if (currentUser.role === 'org_admin') {
                    // Filter by organization
                    query = query.eq('org_id', currentUser.org_id);
                } else {
                    // Standard farmer
                    // Fix: PostgREST requires 'is.null' not 'eq.null' inside OR blocks.
                    // If org_id is null, we only want their own crops. If they have an org_id, we want their crops OR crops belonging to their org.
                    if (currentUser.org_id) {
                        query = query.or(`user_id.eq.${currentUser.id},org_id.eq.${currentUser.org_id}`);
                    } else {
                        query = query.eq('user_id', currentUser.id);
                    }
                }
            }

            try {
                const { data, error } = await query;
                if (error) throw error;
                return data || [];
            } catch (err) {
                console.warn("[Offline/Error] Fallback to local DB for getAllCrops", err);
                // Fallthrough to local DB
            }
        }

        const db = this.getLocalDB();
        if (!currentUser) return db.crops;

        if (currentUser.role === 'global_owner') return db.crops;
        
        if (currentUser.role === 'ministry_admin') {
            const countryUserIds = db.users.filter(u => u.country_id === currentUser.country_id).map(u => u.id);
            return db.crops.filter(c => countryUserIds.includes(c.user_id));
        }

        if (currentUser.role === 'org_admin') {
            return db.crops.filter(c => c.org_id === currentUser.org_id);
        }

        // Farmer: own crops OR crops belonging to their organization
        return db.crops.filter(c => 
            c.user_id === currentUser.id || 
            (currentUser.org_id && c.org_id === currentUser.org_id)
        );
    }

    async createCrop(cropObj) {
        let createdCrop;
        // Inject org_id if user belongs to an organization
        const currentUser = await window.AuthObj.getCurrentUser();
        const baseCrop = {
            ...cropObj,
            org_id: currentUser ? currentUser.org_id : null,
            created_at: new Date().toISOString()
        };

        if (this.supabase) {
            const { data, error } = await this.supabase.from('crops').insert([baseCrop]).select().single();
            if (error) throw new Error(error.message);
            createdCrop = data;
        } else {
            const db = this.getLocalDB();
            createdCrop = { id: Date.now(), ...baseCrop };
            db.crops.push(createdCrop);
            this.saveLocalDB(db);
        }

        // --- Automatic Fertilizer Logs Logic ---
        await this.generateFertilizerLogs(createdCrop);

        return createdCrop;
    }

    async generateFertilizerLogs(cropObj) {
        const catalog = window.CROP_CATALOG || {};
        
        // Helper to normalize strings (remove accents/special chars)
        const normalize = (s) => (s || "").toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();

        const normalizedName = normalize(cropObj.name);
        console.log("Normalizando búsqueda:", cropObj.name, "=>", normalizedName);
        let catalogEntry = null;

        // Search in catalog using normalized keys
        const catalogKeys = Object.keys(catalog);
        console.log("Teclas del catálogo disponibles:", catalogKeys.length);
        
        const matchKey = catalogKeys.find(k => normalize(k) === normalizedName) || 
                         catalogKeys.find(k => normalizedName.includes(normalize(k)) || normalize(k).includes(normalizedName));
        
        console.log("Resultado del match:", matchKey);
        
        if (matchKey) catalogEntry = catalog[matchKey];

        if (catalogEntry && catalogEntry.fertilizer_plan) {
            const sowingDate = new Date(cropObj.sowing_date);
            const logEntries = catalogEntry.fertilizer_plan.map(plan => {
                const scheduledDate = new Date(sowingDate);
                scheduledDate.setDate(scheduledDate.getDate() + plan.day);
                
                return {
                    crop_id: cropObj.id,
                    // REMOVED user_id to match actual schema from screenshot
                    tip: `${plan.product} (${plan.dose})`,
                    scheduled_date: scheduledDate.toISOString().split('T')[0],
                    status: 'pendiente'
                };
            });

            if (this.supabase) {
                const { error: logErr } = await this.supabase.from('fertilizer_logs').insert(logEntries);
                if (logErr) {
                    console.error("Error creating automatic logs:", logErr);
                    throw new Error(logErr.message);
                }
            } else {
                const db = this.getLocalDB();
                if (!db.fertilizer_logs) db.fertilizer_logs = [];
                logEntries.forEach(log => {
                    log.id = Date.now() + Math.random();
                    db.fertilizer_logs.push(log);
                });
                this.saveLocalDB(db);
            }
            return true;
        }
        return false;
    }

    async deleteCrop(id) {
        if (this.supabase) {
            const { error } = await this.supabase.from('crops').delete().eq('id', id);
            if (error) console.error(error);
            return;
        }
        const db = this.getLocalDB();
        db.crops = db.crops.filter(c => c.id !== id);
        this.saveLocalDB(db);
    }

    // --- Chat Messages ---
    async getMessages(userId1, userId2) {
        if (this.supabase) {
            const { data, error } = await this.supabase
                .from('messages')
                .select('*')
                .is('group_id', null)
                .or(`and(sender_id.eq.${userId1},receiver_id.eq.${userId2}),and(sender_id.eq.${userId2},receiver_id.eq.${userId1})`)
                .order('timestamp', { ascending: true });
            if (error) console.error(error);
            return data || [];
        }
        return this.getLocalDB().messages.filter(m => 
            !m.group_id &&
            ((m.sender_id === userId1 && m.receiver_id === userId2) ||
            (m.sender_id === userId2 && m.receiver_id === userId1))
        ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    // --- Chat Groups ---
    async createGroup(name, creatorId, userIds) {
        if (this.supabase) {
            // Create Group Document
            const { data: group, error: groupErr } = await this.supabase.from('chat_groups').insert([{
                name: name,
                created_by: creatorId,
                created_at: new Date().toISOString()
            }]).select().single();
            if (groupErr) throw new Error(groupErr.message);

            // Insert matching members
            const memberInserts = userIds.map(uid => ({ group_id: group.id, user_id: uid }));
            memberInserts.push({ group_id: group.id, user_id: creatorId }); // Always include creator
            const { error: memErr } = await this.supabase.from('chat_group_members').insert(memberInserts);
            if (memErr) throw new Error(memErr.message);

            return group;
        }

        const db = this.getLocalDB();
        const newGroup = { id: Date.now(), name, created_by: creatorId, created_at: new Date().toISOString() };
        db.chat_groups.push(newGroup);
        db.chat_group_members.push({ group_id: newGroup.id, user_id: creatorId });
        userIds.forEach(uid => db.chat_group_members.push({ group_id: newGroup.id, user_id: uid }));
        this.saveLocalDB(db);
        return newGroup;
    }

    async getUserGroups(userId) {
        if (this.supabase) {
            // Join query via Supabase relations
            const { data, error } = await this.supabase
                .from('chat_group_members')
                .select('group_id, chat_groups(*)')
                .eq('user_id', userId);
            if (error) console.error(error);
            return data ? data.map(d => d.chat_groups) : [];
        }

        const db = this.getLocalDB();
        const myGroupIds = db.chat_group_members.filter(cm => cm.user_id === userId).map(cm => cm.group_id);
        return db.chat_groups.filter(g => myGroupIds.includes(g.id));
    }

    async getGroupMessages(groupId) {
        if (this.supabase) {
            const { data, error } = await this.supabase
                .from('messages')
                .select('*')
                .eq('group_id', groupId)
                .order('timestamp', { ascending: true });
            if (error) console.error(error);
            return data || [];
        }
        return this.getLocalDB().messages.filter(m => m.group_id === parseInt(groupId))
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    async sendMessage(messageObj) {
        // Automatically inject group_id parameter handling implicitly in payload
        const payload = {
            ...messageObj,
            timestamp: new Date().toISOString(),
            is_read: false
        };

        if (this.supabase) {
            const { data, error } = await this.supabase.from('messages').insert([payload]).select().single();
            if (error) throw new Error(error.message);
            return data;
        }
        const db = this.getLocalDB();
        const newMsg = { id: Date.now(), ...payload };
        db.messages.push(newMsg);
        this.saveLocalDB(db);
        return newMsg;
    }

    async markAsRead(senderId, receiverId) {
        if (this.supabase) {
            const { error } = await this.supabase.from('messages')
                .update({ is_read: true })
                .eq('sender_id', senderId)
                .eq('receiver_id', receiverId);
            if (error) console.error(error);
            return;
        }
        const db = this.getLocalDB();
        db.messages = db.messages.map(m => (m.sender_id === senderId && m.receiver_id === receiverId) ? { ...m, is_read: true } : m);
        this.saveLocalDB(db);
    }
}

// Instantiate global database
const windowDB = new Database();
window.DB = windowDB;

// Helper Auth Methods
window.AuthObj = {
    login: async function(email, password) {
        console.log("Intentando login para:", email);
        const user = await window.DB.getUserByEmail(email);
        if (user) {
            console.log("Usuario encontrado en DB. Verificando password...");
            const hashedInput = await window.DB.hashPassword(password);
            
            if (user.password === hashedInput) {
                // Check if user is currently suspended
                if (user.suspension_end && new Date(user.suspension_end) > new Date()) {
                    const suspensionEnd = new Date(user.suspension_end);
                    const isPermanent = suspensionEnd.getFullYear() === 2100;
                    const blockText = isPermanent 
                        ? `<p class="mb-3 fw-bold text-danger fs-5">Tu cuenta ha sido bloqueada PERMANENTEMENTE.</p>`
                        : `<p class="mb-3 text-muted">Tu cuenta ha sido bloqueada hasta ${suspensionEnd.toLocaleDateString()}.</p>`;

                    const SwalConfig = {
                        icon: 'error',
                        title: 'Cuenta Suspendida', 
                        html: `
                            ${blockText}
                            <div class="p-3 bg-light rounded text-start mb-3 border">
                                <strong>Motivo:</strong><br>
                                ${user.suspension_reason || 'Infracción a las políticas'}
                            </div>
                            ${!isPermanent ? '<p class="small text-muted mb-0">¿Deseas enviar una carta de apelación al administrador?</p>' : ''}
                        `,
                        showCancelButton: true,
                        cancelButtonText: 'Cerrar',
                        confirmButtonColor: 'var(--primary-color)'
                    };

                    if (!isPermanent) {
                        SwalConfig.input = 'textarea';
                        SwalConfig.inputPlaceholder = 'Escribe aquí tu justificación o carta de perdón...';
                        SwalConfig.inputAttributes = { rows: 4 };
                        SwalConfig.confirmButtonText = 'Enviar Apelación';
                    } else {
                        SwalConfig.showConfirmButton = false;
                        SwalConfig.cancelButtonText = 'Aceptar y Salir';
                        SwalConfig.cancelButtonColor = '#dc3545';
                    }

                    const { isConfirmed, value } = await Swal.fire(SwalConfig);

                    if (!isPermanent && isConfirmed && value && user.suspended_by) {
                        try {
                            await window.DB.sendMessage({
                                sender_id: user.id,
                                receiver_id: user.suspended_by,
                                text: `[CARTA DE APELACIÓN]\n${value}`
                            });
                            window.showSuccessModal('Apelación Enviada', 'El administrador revisará tu caso pronto.');
                        } catch (err) {
                            window.showErrorModal('Error', 'No se pudo enviar la apelación: ' + err.message);
                        }
                    }

                    return false;
                }

                console.log("¡Login exitoso!");
                sessionStorage.setItem('current_user_id', user.id);
                sessionStorage.setItem('show_welcome_modal', 'true');
                return true;
            } else {
                console.warn("Mismatch de contraseñas.");
            }
        } else {
            console.error("Usuario no encontrado en la base de datos.");
        }
        return false;
    },
    logout: function() {
        sessionStorage.removeItem('current_user_id');
        window.location.href = 'index.html';
    },
    getCurrentUser: async function() {
        const id = sessionStorage.getItem('current_user_id');
        if (!id) return null;
        try {
            const user = await window.DB.getUserById(id);
            if (!user) {
                console.warn(`[AuthObj] El usuario con ID ${id} no respondió. Manteniendo sesión con perfil temporal.`);
                // YA NO ELIMINAMOS LA SESIÓN AQUÍ. 
                // Devolvemos un stub para que la página sea usable mientras Supabase reconecta.
                return { id: id, role: 'farmer', is_superuser: false, _isStub: true };
            }
            console.log(`[AuthObj] Sesión activa: ${user.email} (${user.role})`);
            return user;
        } catch (e) {
            console.warn("[AuthObj] Error recuperando sesión, usando perfil temporal de seguridad:", e);
            return { id: id, role: 'farmer', is_superuser: false, _isStub: true };
        }
    },
    requireAuth: async function() {
        const user = await this.getCurrentUser();
        if (!user) {
            window.location.href = 'index.html';
            throw new Error("Auth required");
        }
        return user;
    },
    requireAdmin: async function() {
        const user = await this.getCurrentUser();
        const isAdminRole = ['global_owner', 'ministry_admin', 'org_admin'].includes(user?.role);
        if (!user || (!user.is_superuser && !isAdminRole)) {
            window.location.href = 'dashboard.html';
            throw new Error("Admin required");
        }
        return user;
    }
};
