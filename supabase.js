const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

console.log('Đang đọc file .env từ:', path.join(__dirname, '.env'));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// Log để debug
console.log('SUPABASE_URL:', supabaseUrl ? '✓ Đã tìm thấy' : '✗ Không tìm thấy');
console.log('SUPABASE_ANON_KEY:', supabaseAnonKey ? '✓ Đã tìm thấy' : '✗ Không tìm thấy');

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('\n❌ LỖI: Thiếu biến môi trường Supabase!');
    console.error('\n📝 Cách khắc phục:');
    console.error('1. Tạo file .env trong thư mục:', __dirname);
    console.error('2. Thêm nội dung sau vào file .env:');
    console.error('   SUPABASE_URL=https://your-project.supabase.co');
    console.error('   SUPABASE_ANON_KEY=your-anon-key');
    console.error('\n3. Restart server sau khi tạo file .env\n');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
console.log('✅ Kết nối Supabase thành công!');

module.exports = supabase;