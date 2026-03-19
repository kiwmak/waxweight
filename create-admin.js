const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function createAdmin() {
    console.log('🔧 Bắt đầu tạo tài khoản admin...\n');
    
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
        console.error('❌ Thiếu SUPABASE_URL hoặc SUPABASE_ANON_KEY trong file .env');
        console.log('\n📝 Vui lòng tạo file .env với nội dung:');
        console.log('SUPABASE_URL=https://your-project.supabase.co');
        console.log('SUPABASE_ANON_KEY=your-anon-key');
        return;
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    try {
        // Kiểm tra bảng users
        const { error: tableError } = await supabase
            .from('users')
            .select('count')
            .limit(1);
        
        if (tableError) {
            console.error('❌ Bảng users chưa được tạo!');
            console.log('\n📝 Vui lòng chạy SQL sau trong Supabase SQL Editor:');
            console.log(`
-- Tạo bảng users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    email VARCHAR(100) UNIQUE,
    role VARCHAR(20) DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tạo bảng user_activities
CREATE TABLE user_activities (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    details JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
            `);
            return;
        }
        
        // Mật khẩu mặc định
        const plainPassword = '123456';
        const hashedPassword = await bcrypt.hash(plainPassword, 10);
        
        // Xóa admin cũ nếu có
        await supabase
            .from('users')
            .delete()
            .eq('username', 'admin');
        
        // Tạo admin mới
        const { data, error } = await supabase
            .from('users')
            .insert([{
                username: 'admin',
                password: hashedPassword,
                full_name: 'Administrator',
                email: 'admin@system.com',
                role: 'admin',
                is_active: true
            }])
            .select();
        
        if (error) {
            console.error('❌ Lỗi tạo admin:', error.message);
            return;
        }
        
        console.log('✅ Tạo tài khoản admin thành công!');
        console.log('\n📋 Thông tin đăng nhập:');
        console.log('   Username: admin');
        console.log('   Password: 123456');
        console.log('   Role: admin');
        
        // Kiểm tra lại
        const { data: check } = await supabase
            .from('users')
            .select('username, role, is_active')
            .eq('username', 'admin');
        
        if (check && check.length > 0) {
            console.log('\n✅ Kiểm tra: Tài khoản đã sẵn sàng!');
        }
        
    } catch (err) {
        console.error('❌ Lỗi:', err.message);
    }
}

createAdmin();