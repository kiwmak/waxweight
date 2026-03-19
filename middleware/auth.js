const jwt = require('jsonwebtoken');
const supabase = require('../supabase');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); // Import từ thư mục gốc

// QUAN TRỌNG: Chỉ lấy JWT_SECRET từ process.env, không có giá trị mặc định
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error('\n❌ LỖI: JWT_SECRET chưa được cấu hình trong file .env');
    console.error('📝 Vui lòng thêm dòng sau vào file .env:');
    console.error('JWT_SECRET=your-secret-key-here\n');
    process.exit(1);
}

console.log('✅ JWT_SECRET loaded in auth.js');

// Middleware kiểm tra đăng nhập
const requireAuth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
        
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized - No token provided' });
        }

        // Verify token với cùng JWT_SECRET
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', decoded.id)
            .single();

        if (error || !user) {
            return res.status(401).json({ error: 'Unauthorized - User not found' });
        }

        if (!user.is_active) {
            return res.status(401).json({ error: 'Account disabled' });
        }

        req.user = user;
        next();
    } catch (err) {
        console.error('Auth error:', err.message);
        res.status(401).json({ error: 'Unauthorized - Invalid token' });
    }
};

// Middleware kiểm tra quyền admin
const requireAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Forbidden - Admin only' });
    }
};

// Tạo JWT token
const generateToken = (user) => {
    return jwt.sign(
        { 
            id: user.id, 
            username: user.username,
            role: user.role 
        }, 
        JWT_SECRET, 
        { expiresIn: '7d' }
    );
};

module.exports = {
    requireAuth,
    requireAdmin,
    generateToken,
    JWT_SECRET
};