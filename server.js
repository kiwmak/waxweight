const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path'); // THÊM DÒNG NÀY
const os = require('os');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const fs = require('fs');
const multer = require('multer');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const supabase = require('./supabase');
const { requireAuth, requireAdmin, generateToken, JWT_SECRET } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Định nghĩa thư mục tạm cho upload
const TEMP_DIR = path.join(__dirname, 'temp_uploads');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Cấu hình multer
const upload = multer({ 
    dest: TEMP_DIR,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Đảm bảo thư mục backups tồn tại
const BACKUP_DIR = path.join(__dirname, 'backups');
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}
// Middleware
app.use(compression());
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// ==================== HÀM TIỆN ÍCH ====================
function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                ips.push(net.address);
            }
        }
    }
    return ips;
}

// ==================== API: LẤY DANH SÁCH IP ====================
app.get('/api/ips', (req, res) => {
    res.json(getLocalIPs());
});



// ==================== AUTHENTICATION API ====================

// Đăng nhập
app.post('/api/auth/login', async (req, res) => {
    console.log('\n🔑 Login attempt:', req.body.username);
    
    const { username, password, remember } = req.body;
    
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .maybeSingle();
        
        if (error || !user) {
            return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
        }
        
        if (!user.is_active) {
            return res.status(401).json({ error: 'Tài khoản đã bị khóa' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
        }
        
        const token = generateToken(user);
        
        await supabase
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', user.id);
        
        res.json({
            success: true,
            token: token,
            user: {
                id: user.id,
                username: user.username,
                fullName: user.full_name,
                email: user.email,
                role: user.role
            }
        });
        
    } catch (err) {
        console.error('❌ Login error:', err);
        res.status(500).json({ error: 'Lỗi server: ' + err.message });
    }
});

// Đăng xuất
app.post('/api/auth/logout', requireAuth, async (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

// Lấy thông tin user hiện tại
app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({
        user: {
            id: req.user.id,
            username: req.user.username,
            fullName: req.user.full_name,
            email: req.user.email,
            role: req.user.role
        }
    });
});

// ==================== ORDERS API ====================

// Lấy danh sách đơn hàng
app.get('/api/orders', requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('orders')
            .select('id, order_code, created_at')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Orders error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Lấy chi tiết đơn hàng
app.get('/api/orders/:id', requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('orders')
            .select('id, order_code, created_at')
            .eq('id', req.params.id)
            .single();
        
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Tạo đơn hàng mới
app.post('/api/orders', requireAuth, async (req, res) => {
    const { order_code } = req.body;
    
    if (!order_code) {
        return res.status(400).json({ error: 'Thiếu mã đơn hàng' });
    }
    
    try {
        const { data, error } = await supabase
            .from('orders')
            .insert([{ order_code }])
            .select('id, order_code');
        
        if (error) throw error;
        res.json(data[0]);
    } catch (err) {
        console.error('Create order error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Xóa đơn hàng
app.delete('/api/orders/:id', requireAuth, async (req, res) => {
    try {
        const { error } = await supabase
            .from('orders')
            .delete()
            .eq('id', req.params.id);
        
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

///


// ==================== SEARCH API ====================

// Tìm kiếm đơn hàng
app.get('/api/orders/search', requireAuth, async (req, res) => {
    const { keyword } = req.query;
    
    if (!keyword) {
        return res.json([]);
    }
    
    try {
        const { data, error } = await supabase
            .from('orders')
            .select('id, order_code, created_at')
            .ilike('order_code', `%${keyword}%`)
            .order('created_at', { ascending: false })
            .limit(20);
        
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Tìm kiếm nâng cao
app.get('/api/orders/advanced-search', requireAuth, async (req, res) => {
    const { keyword, fromDate, toDate } = req.query;
    
    try {
        let query = supabase
            .from('orders')
            .select('id, order_code, created_at');
        
        if (keyword) {
            query = query.ilike('order_code', `%${keyword}%`);
        }
        
        if (fromDate) {
            query = query.gte('created_at', fromDate);
        }
        if (toDate) {
            query = query.lte('created_at', toDate);
        }
        
        const { data, error } = await query
            .order('created_at', { ascending: false })
            .limit(50);
        
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== PRODUCTS API ====================

// Lấy danh sách sản phẩm của đơn hàng
app.get('/api/orders/:orderId/products', requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('products')
            .select('id, product_code, created_at')
            .eq('order_id', req.params.orderId)
            .order('created_at', { ascending: true });
        
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Thêm sản phẩm mới
app.post('/api/products', requireAuth, async (req, res) => {
    const { order_id, product_code } = req.body;
    
    if (!order_id || !product_code) {
        return res.status(400).json({ error: 'Thiếu thông tin' });
    }
    
    try {
        const { data, error } = await supabase
            .from('products')
            .insert([{ order_id, product_code }])
            .select('id, product_code');
        
        if (error) throw error;
        res.json(data[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Xóa sản phẩm
app.delete('/api/products/:id', requireAuth, async (req, res) => {
    try {
        const { error } = await supabase
            .from('products')
            .delete()
            .eq('id', req.params.id);
        
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== WAX DATA API ====================

// Lấy dữ liệu wax của sản phẩm
app.get('/api/products/:productId/data', requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('wax_data')
            .select('stt, emptyCup, firstPour, secondPour')
            .eq('product_id', req.params.productId)
            .order('stt', { ascending: true });
        
        if (error) throw error;
        res.json({ rows: data || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Lưu dữ liệu wax
app.post('/api/products/:productId/data', requireAuth, async (req, res) => {
    const { data } = req.body;
    const productId = req.params.productId;
    
    try {
        // Xóa dữ liệu cũ
        await supabase
            .from('wax_data')
            .delete()
            .eq('product_id', productId);
        
        // Thêm dữ liệu mới
        if (data && data.length > 0) {
            const rowsToInsert = data.map((item, index) => ({
                product_id: productId,
                stt: index + 1,
                emptyCup: item.emptyCup || '',
                firstPour: item.firstPour || '',
                secondPour: item.secondPour || ''
            }));
            
            const { error } = await supabase
                .from('wax_data')
                .insert(rowsToInsert);
            
            if (error) throw error;
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Save wax data error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== TEST DATABASE API ====================

// Kiểm tra bảng orders
app.get('/api/test/orders', requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('orders')
            .select('count', { count: 'exact', head: true });
        
        if (error) {
            res.json({ 
                exists: false, 
                error: error.message,
                details: error.details
            });
        } else {
            res.json({ 
                exists: true, 
                message: 'Bảng orders tồn tại',
                can_access: true
            });
        }
    } catch (err) {
        res.json({ exists: false, error: err.message });
    }
});

// Kiểm tra bảng products
app.get('/api/test/products', requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('products')
            .select('count', { count: 'exact', head: true });
        
        if (error) {
            res.json({ 
                exists: false, 
                error: error.message,
                details: error.details
            });
        } else {
            res.json({ exists: true, message: 'Bảng products tồn tại' });
        }
    } catch (err) {
        res.json({ exists: false, error: err.message });
    }
});

// Kiểm tra bảng wax_data
app.get('/api/test/wax_data', requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('wax_data')
            .select('count', { count: 'exact', head: true });
        
        if (error) {
            res.json({ 
                exists: false, 
                error: error.message,
                details: error.details
            });
        } else {
            res.json({ exists: true, message: 'Bảng wax_data tồn tại' });
        }
    } catch (err) {
        res.json({ exists: false, error: err.message });
    }
});

// Kiểm tra RLS
app.get('/api/test/rls', requireAuth, async (req, res) => {
    try {
        const testData = {
            order_code: `TEST_RLS_${Date.now()}`
        };
        
        const { data, error } = await supabase
            .from('orders')
            .insert([testData])
            .select();
        
        if (error) {
            if (error.message.includes('row-level security')) {
                res.json({
                    rls_enabled: true,
                    can_insert: false,
                    error: 'RLS đang bật và chưa có policy',
                    solution: 'Vào Supabase → Authentication → Policies → Thêm policy'
                });
            } else {
                res.json({
                    rls_enabled: 'unknown',
                    can_insert: false,
                    error: error.message
                });
            }
        } else {
            await supabase
                .from('orders')
                .delete()
                .eq('id', data[0].id);
            
            res.json({
                rls_enabled: false,
                can_insert: true,
                message: 'Có thể insert dữ liệu'
            });
        }
    } catch (err) {
        res.json({ error: err.message });
    }
});

// Kiểm tra schema
app.get('/api/test/schema', requireAuth, async (req, res) => {
    try {
        const tables = ['orders', 'products', 'wax_data', 'users'];
        const result = {};
        
        for (const table of tables) {
            const { data, error } = await supabase
                .from(table)
                .select('count', { count: 'exact', head: true });
            
            result[table] = {
                exists: !error,
                error: error ? error.message : null
            };
        }
        
        res.json(result);
    } catch (err) {
        res.json({ error: err.message });
    }
});

// ==================== TEST API ====================
app.get('/api/test', (req, res) => {
    res.json({ 
        message: 'Server đang chạy tốt!', 
        time: new Date().toISOString(),
        jwt_secret_loaded: !!JWT_SECRET
    });
});

// ==================== ADMIN API ====================
// ==================== ADMIN API ====================

// Lấy danh sách users (admin only)
// ==================== ADMIN API ====================

// Lấy danh sách users (admin only)
app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
    console.log('📋 Admin fetching users list...');
    
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, username, full_name, email, role, created_at, last_login, is_active')
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('❌ Database error:', error);
            return res.status(500).json({ error: error.message });
        }
        
        console.log(`✅ Found ${users.length} users`);
        
        // Tính thống kê
        const total = users.length;
        const admins = users.filter(u => u.role === 'admin').length;
        const regularUsers = users.filter(u => u.role === 'user').length;
        const activeToday = users.filter(u => {
            if (!u.last_login) return false;
            const lastLogin = new Date(u.last_login);
            const today = new Date();
            return lastLogin.toDateString() === today.toDateString();
        }).length;
        
        res.json({
            users,
            stats: { 
                total, 
                admins, 
                users: regularUsers, 
                activeToday 
            }
        });
        
    } catch (err) {
        console.error('❌ Server error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Lấy chi tiết 1 user
app.get('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('id, username, full_name, email, role, is_active, created_at, last_login')
            .eq('id', req.params.id)
            .single();
        
        if (error) throw error;
        res.json(user);
    } catch (err) {
        console.error('Get user error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Tạo user mới
app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
    console.log('📝 Creating new user:', req.body.username);
    
    const { username, password, fullName, email, role, isActive } = req.body;
    
    // Validation
    if (!username || !password || !fullName || !email) {
        return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin' });
    }
    
    try {
        // Kiểm tra username
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .maybeSingle();
        
        if (existingUser) {
            return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });
        }
        
        // Kiểm tra email
        const { data: existingEmail } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle();
        
        if (existingEmail) {
            return res.status(400).json({ error: 'Email đã được sử dụng' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Tạo user
        const { data: newUser, error } = await supabase
            .from('users')
            .insert([{
                username,
                password: hashedPassword,
                full_name: fullName,
                email,
                role: role || 'user',
                is_active: isActive !== undefined ? isActive : true,
                created_by: req.user.id
            }])
            .select('id, username, full_name, email, role, is_active, created_at')
            .single();
        
        if (error) throw error;
        
        console.log('✅ User created:', newUser.username);
        res.json(newUser);
        
    } catch (err) {
        console.error('❌ Create user error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Cập nhật user
app.put('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
    console.log('📝 Updating user:', req.params.id);
    
    const { fullName, email, role, isActive, password } = req.body;
    const userId = req.params.id;
    
    try {
        const updates = {
            full_name: fullName,
            email,
            role,
            is_active: isActive,
            updated_at: new Date().toISOString()
        };
        
        if (password) {
            updates.password = await bcrypt.hash(password, 10);
        }
        
        const { data: user, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', userId)
            .select('id, username, full_name, email, role, is_active, updated_at')
            .single();
        
        if (error) throw error;
        
        console.log('✅ User updated:', user.username);
        res.json(user);
        
    } catch (err) {
        console.error('❌ Update user error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Xóa user
app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
    const userId = req.params.id;
    
    if (parseInt(userId) === req.user.id) {
        return res.status(400).json({ error: 'Không thể xóa tài khoản của chính mình' });
    }
    
    try {
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', userId);
        
        if (error) throw error;
        
        console.log('✅ User deleted:', userId);
        res.json({ success: true });
        
    } catch (err) {
        console.error('❌ Delete user error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Khóa/Mở khóa user
app.post('/api/admin/users/:id/toggle-status', requireAuth, requireAdmin, async (req, res) => {
    const userId = req.params.id;
    
    if (parseInt(userId) === req.user.id) {
        return res.status(400).json({ error: 'Không thể thay đổi trạng thái tài khoản của chính mình' });
    }
    
    try {
        const { data: user } = await supabase
            .from('users')
            .select('is_active')
            .eq('id', userId)
            .single();
        
        const { error } = await supabase
            .from('users')
            .update({ 
                is_active: !user.is_active,
                updated_at: new Date().toISOString()
            })
            .eq('id', userId);
        
        if (error) throw error;
        
        res.json({ success: true, new_status: !user.is_active });
        
    } catch (err) {
        console.error('❌ Toggle status error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Đặt lại mật khẩu
app.post('/api/admin/users/:id/reset-password', requireAuth, requireAdmin, async (req, res) => {
    const { newPassword } = req.body;
    const userId = req.params.id;
    
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
    }
    
    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        const { error } = await supabase
            .from('users')
            .update({ 
                password: hashedPassword,
                updated_at: new Date().toISOString()
            })
            .eq('id', userId);
        
        if (error) throw error;
        
        res.json({ success: true });
        
    } catch (err) {
        console.error('❌ Reset password error:', err);
        res.status(500).json({ error: err.message });
    }
});
///
// ==================== BACKUP API ====================
// ==================== BACKUP API ====================

// Lấy danh sách backup
app.get('/api/admin/backups', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { data: backups, error } = await supabase
            .from('backups')
            .select('*, created_by_user:created_by(id, username, full_name)')
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.json(backups);
    } catch (err) {
        console.error('Get backups error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Tạo backup
app.post('/api/admin/backup', requireAuth, requireAdmin, async (req, res) => {
    const { description } = req.body;
    try {
        const tables = ['orders', 'products', 'wax_data', 'users'];
        const backupData = {};
        for (const table of tables) {
            const { data, error } = await supabase.from(table).select('*');
            if (error) backupData[table] = { error: error.message };
            else backupData[table] = data;
        }
        const metadata = {
            version: '1.0',
            created_at: new Date().toISOString(),
            created_by: req.user.id,
            created_by_username: req.user.username,
            description: description || ''
        };
        const fullBackup = { metadata, data: backupData };
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `backup_${timestamp}.json`;
        const filePath = path.join(BACKUP_DIR, filename);
        const jsonContent = JSON.stringify(fullBackup, null, 2);
        const fileSize = Buffer.byteLength(jsonContent, 'utf8');
        await fs.promises.writeFile(filePath, jsonContent, 'utf8');
        const { data: backupRecord, error: dbError } = await supabase
            .from('backups')
            .insert([{
                filename,
                filepath: filePath,
                size: fileSize,
                created_by: req.user.id,
                description: description || `Backup by ${req.user.username}`
            }])
            .select()
            .single();
        if (dbError) throw dbError;
        res.json({ success: true, backup: backupRecord });
    } catch (err) {
        console.error('Backup error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Download backup
app.get('/api/admin/backup/:id/download', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { data: backup, error } = await supabase
            .from('backups')
            .select('filename')
            .eq('id', req.params.id)
            .single();
        if (error) throw error;
        const filePath = path.join(BACKUP_DIR, backup.filename);
        await fs.promises.access(filePath);
        res.download(filePath, backup.filename);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Xóa backup
app.delete('/api/admin/backup/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { data: backup, error } = await supabase
            .from('backups')
            .select('filename')
            .eq('id', req.params.id)
            .single();
        if (error) throw error;
        const filePath = path.join(BACKUP_DIR, backup.filename);
        try { await fs.promises.unlink(filePath); } catch(e) {}
        await supabase.from('backups').delete().eq('id', req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Khôi phục từ file backup (upload)
app.post('/api/admin/restore', requireAuth, requireAdmin, upload.single('backupFile'), async (req, res) => {
    const file = req.file;
    const { mode } = req.body; // 'replace' hoặc 'merge'
    if (!file) {
        return res.status(400).json({ error: 'Vui lòng chọn file backup' });
    }

    try {
        const fileContent = await fs.promises.readFile(file.path, 'utf8');
        const backupData = JSON.parse(fileContent);
        if (!backupData.metadata || !backupData.data) {
            throw new Error('File backup không hợp lệ: thiếu metadata hoặc data');
        }

        // Nếu chế độ replace, xóa dữ liệu cũ (trừ users để tránh mất tài khoản)
        if (mode === 'replace') {
            // Xóa theo thứ tự ngược do ràng buộc khóa ngoại
            await supabase.from('wax_data').delete().neq('id', 0);
            await supabase.from('products').delete().neq('id', 0);
            await supabase.from('orders').delete().neq('id', 0);
            // Có thể xóa users nếu muốn đồng bộ, nhưng cẩn thận
            // await supabase.from('users').delete().neq('id', 0);
        }

        // Khôi phục orders
        if (backupData.data.orders && Array.isArray(backupData.data.orders)) {
            for (const order of backupData.data.orders) {
                const { error } = await supabase.from('orders').upsert(order, { onConflict: 'id' });
                if (error) throw new Error(`Lỗi khi khôi phục orders: ${error.message}`);
            }
        }
        // Khôi phục products
        if (backupData.data.products && Array.isArray(backupData.data.products)) {
            for (const product of backupData.data.products) {
                const { error } = await supabase.from('products').upsert(product, { onConflict: 'id' });
                if (error) throw new Error(`Lỗi khi khôi phục products: ${error.message}`);
            }
        }
        // Khôi phục wax_data
        if (backupData.data.wax_data && Array.isArray(backupData.data.wax_data)) {
            for (const wax of backupData.data.wax_data) {
                const { error } = await supabase.from('wax_data').upsert(wax, { onConflict: 'id' });
                if (error) throw new Error(`Lỗi khi khôi phục wax_data: ${error.message}`);
            }
        }
        // Khôi phục users nếu muốn (tùy chọn)
        if (mode === 'replace' && backupData.data.users && Array.isArray(backupData.data.users)) {
            for (const user of backupData.data.users) {
                const { error } = await supabase.from('users').upsert(user, { onConflict: 'id' });
                if (error) throw new Error(`Lỗi khi khôi phục users: ${error.message}`);
            }
        }

        // Ghi log
        await supabase.from('user_activities').insert([{
            user_id: req.user.id,
            action: 'RESTORE_BACKUP',
            details: { filename: file.originalname, mode },
            ip_address: req.ip
        }]);

        // Xóa file tạm
        await fs.promises.unlink(file.path);
        res.json({ success: true, message: 'Khôi phục dữ liệu thành công', mode });
    } catch (err) {
        console.error('Restore error:', err);
        if (file && file.path) {
            try { await fs.promises.unlink(file.path); } catch(e) {}
        }
        res.status(500).json({ error: err.message });
    }
});
// ==================== KHỞI ĐỘNG SERVER ====================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ Server chạy tại http://localhost:${PORT}`);
    console.log(`🔑 JWT_SECRET: ${JWT_SECRET ? 'Đã cấu hình' : 'CHƯA CẤU HÌNH!'}`);
    const ips = getLocalIPs();
    if (ips.length > 0) {
        console.log(`📱 Truy cập từ thiết bị khác trong LAN:`);
        ips.forEach(ip => console.log(`   http://${ip}:${PORT}`));
    }
    console.log('');
});