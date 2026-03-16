const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const os = require('os');
require('dotenv').config();

const supabase = require('./supabase');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Hàm lấy IP cục bộ
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

// API: LẤY DANH SÁCH IP
app.get('/api/ips', (req, res) => {
    res.json(getLocalIPs());
});

// ==================== ORDERS API ====================
app.get('/api/orders', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('orders')
            .select('id, order_code, created_at')
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/orders/:id', async (req, res) => {
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

app.post('/api/orders', async (req, res) => {
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
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/orders/:id', async (req, res) => {
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
// ==================== SEARCH API ====================
// API: TÌM KIẾM ĐƠN HÀNG
app.get('/api/orders/search', async (req, res) => {
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

// API: TÌM KIẾM NÂNG CAO (theo ngày)
app.get('/api/orders/advanced-search', async (req, res) => {
    const { keyword, fromDate, toDate } = req.query;
    
    try {
        let query = supabase
            .from('orders')
            .select('id, order_code, created_at');
        
        // Tìm theo từ khóa
        if (keyword) {
            query = query.ilike('order_code', `%${keyword}%`);
        }
        
        // Lọc theo ngày
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
app.get('/api/orders/:orderId/products', async (req, res) => {
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

app.post('/api/products', async (req, res) => {
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

app.delete('/api/products/:id', async (req, res) => {
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
app.get('/api/products/:productId/data', async (req, res) => {
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

app.post('/api/products/:productId/data', async (req, res) => {
    const { data } = req.body;
    const productId = req.params.productId;
    
    try {
        // Xóa dữ liệu cũ
        await supabase.from('wax_data').delete().eq('product_id', productId);
        
        // Insert dữ liệu mới
        if (data && data.length) {
            const rowsToInsert = data.map((item, index) => ({
                product_id: productId,
                stt: index + 1,
                emptyCup: item.emptyCup || '',
                firstPour: item.firstPour || '',
                secondPour: item.secondPour || ''
            }));
            
            const { error } = await supabase.from('wax_data').insert(rowsToInsert);
            if (error) throw error;
        }
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Khởi động server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server chạy tại http://localhost:${PORT}`);
    const ips = getLocalIPs();
    if (ips.length > 0) {
        console.log(`📱 Truy cập từ thiết bị khác trong LAN:`);
        ips.forEach(ip => console.log(`   http://${ip}:${PORT}`));
    }
});