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

    initLocalDB() {
        if (!localStorage.getItem(DB_KEY)) {
            const initialData = {
                users: [],
                crops: [],
                messages: [],
                fertilizer_logs: []
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
            const { data, error } = await this.supabase.from('users').select('*').eq('email', email).maybeSingle();
            if (error) console.error("Error fetching user:", error);
            return data;
        }
        return this.getLocalDB().users.find(u => u.email === email);
    }

    async getUserById(id) {
        if (this.supabase) {
            const { data, error } = await this.supabase.from('users').select('*').eq('id', id).single();
            if (error) console.error(error);
            return data;
        }
        return this.getLocalDB().users.find(u => u.id === id);
    }

    async createUser(userObj) {
        const hashedPassword = await this.hashPassword(userObj.password);
        if (this.supabase) {
            const { data, error } = await this.supabase.from('users').insert([{
                ...userObj,
                password: hashedPassword,
                is_superuser: false,
                is_active: true,
                date_joined: new Date().toISOString()
            }]).select().single();
            if (error) throw new Error(error.message);
            return data;
        }
        
        const db = this.getLocalDB();
        if (db.users.find(u => u.email === userObj.email)) throw new Error("User already exists");
        const newUser = { id: Date.now(), ...userObj, password: hashedPassword, is_superuser: false, is_active: true, date_joined: new Date().toISOString() };
        db.users.push(newUser);
        this.saveLocalDB(db);
        return newUser;
    }

    async getAllUsers() {
        if (this.supabase) {
            const { data, error } = await this.supabase.from('users').select('*');
            if (error) console.error(error);
            return data || [];
        }
        return this.getLocalDB().users;
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
            await this.supabase.from('crops').delete().eq('user_id', id); // Cascade manually
            const { error } = await this.supabase.from('users').delete().eq('id', id);
            if (error) console.error(error);
            return;
        }
        const db = this.getLocalDB();
        db.users = db.users.filter(u => u.id !== id);
        db.crops = db.crops.filter(c => c.user_id !== id);
        this.saveLocalDB(db);
    }

    // --- Crops ---
    async getCropsByUser(userId) {
        if (this.supabase) {
            const { data, error } = await this.supabase.from('crops').select('*').eq('user_id', userId);
            if (error) console.error(error);
            return data || [];
        }
        return this.getLocalDB().crops.filter(c => c.user_id === userId);
    }

    async getAllCrops() {
        if (this.supabase) {
            const { data, error } = await this.supabase.from('crops').select('*');
            if (error) console.error(error);
            return data || [];
        }
        return this.getLocalDB().crops;
    }

    async createCrop(cropObj) {
        if (this.supabase) {
            const { data, error } = await this.supabase.from('crops').insert([{
                ...cropObj,
                created_at: new Date().toISOString()
            }]).select().single();
            if (error) throw new Error(error.message);
            return data;
        }
        const db = this.getLocalDB();
        const newCrop = { id: Date.now(), ...cropObj, created_at: new Date().toISOString() };
        db.crops.push(newCrop);
        this.saveLocalDB(db);
        return newCrop;
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
                .or(`and(sender_id.eq.${userId1},receiver_id.eq.${userId2}),and(sender_id.eq.${userId2},receiver_id.eq.${userId1})`)
                .order('timestamp', { ascending: true });
            if (error) console.error(error);
            return data || [];
        }
        return this.getLocalDB().messages.filter(m => 
            (m.sender_id === userId1 && m.receiver_id === userId2) ||
            (m.sender_id === userId2 && m.receiver_id === userId1)
        ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    async sendMessage(messageObj) {
        if (this.supabase) {
            const { data, error } = await this.supabase.from('messages').insert([{
                ...messageObj,
                timestamp: new Date().toISOString(),
                is_read: false
            }]).select().single();
            if (error) throw new Error(error.message);
            return data;
        }
        const db = this.getLocalDB();
        const newMsg = { id: Date.now(), ...messageObj, timestamp: new Date().toISOString(), is_read: false };
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
            console.log("Hash generado (input):", hashedInput);
            console.log("Hash en DB:", user.password);
            
            if (user.password === hashedInput) {
                console.log("¡Login exitoso!");
                sessionStorage.setItem('current_user_id', user.id);
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
            const user = await window.DB.getUserById(parseInt(id, 10));
            if (!user) {
                sessionStorage.removeItem('current_user_id');
                return null;
            }
            return user;
        } catch (e) {
            return null;
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
        if (!user || !user.is_superuser) {
            window.location.href = 'dashboard.html';
            throw new Error("Admin required");
        }
        return user;
    }
};
