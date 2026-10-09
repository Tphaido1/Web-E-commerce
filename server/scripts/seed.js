/**
 * seed.js
 * ------------------------------------------------------------
 * Script khởi tạo dữ liệu mẫu (Seeder) cho hệ thống E-Commerce:
 * 1. Xóa dữ liệu cũ (tuỳ chọn) hoặc làm sạch DB
 * 2. Tạo tài khoản mẫu:
 *    - Admin: admin@ecommerce.com / Admin@123
 *    - Vendor: vendor@ecommerce.com / Vendor@123
 *    - Customer: customer@ecommerce.com / Customer@123
 * 3. Tạo sản phẩm mẫu (Products) đa dạng danh mục kèm hình ảnh
 * 4. Tạo tồn kho (Inventories) theo SKU tương ứng cho từng sản phẩm
 * 5. Tạo mã giảm giá (Coupons): giảm %, giảm tiền cố định
 * ------------------------------------------------------------
 */

const dns = require('dns');
const path = require('path');
const dotenv = require('dotenv');

// Load env từ server/.env
dotenv.config({ path: path.join(__dirname, '../.env') });

if (process.env.MONGO_URI && process.env.MONGO_URI.startsWith('mongodb+srv://')) {
    try {
        dns.setServers(['8.8.8.8', '1.1.1.1']);
    } catch {
        // Bỏ qua nếu môi trường không cho phép cấu hình DNS
    }
}

const mongoose = require('mongoose');
const User = require('../src/models/User.model');
const Product = require('../src/models/Product.model');
const Category = require('../src/models/Category.model');
const Inventory = require('../src/models/Inventory.model');
const Coupon = require('../src/models/Coupon.model');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ecommerce_db';

const sampleUsers = [
    {
        email: 'admin@ecommerce.com',
        password: 'Admin@123',
        role: 'admin',
    },
    {
        email: 'vendor@ecommerce.com',
        password: 'Vendor@123',
        role: 'vendor',
    },
    {
        email: 'customer@ecommerce.com',
        password: 'Customer@123',
        role: 'customer',
    },
];

const sampleProducts = [
    {
        name: 'Canvas Weekender Bag',
        slug: 'canvas-weekender-bag',
        description: 'Túi du lịch vải Canvas cao cấp, chống thấm nước, quai đeo trợ lực êm ái.',
        category: 'Bags',
        price: 1290000,
        salePrice: 1090000,
        images: [
            'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=600&q=80',
        ],
        sku: 'NOVA-CW-001',
        stock: 50,
        ratingAverage: 4.8,
        reviewCount: 15,
        variants: [
            {
                sku: 'NOVA-CW-001-B-M',
                color: 'Black',
                size: 'M',
                price: 1090000,
                stock: 50,
            },
        ],
    },
    {
        name: 'Tai nghe Studio Headphones Pro',
        slug: 'tai-nghe-studio-headphones-pro',
        description: 'Tai nghe chụp tai chống ồn chủ động ANC, âm bass sâu trầm, pin 40 tiếng.',
        category: 'Electronics',
        price: 2490000,
        salePrice: 2190000,
        images: [
            'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80',
        ],
        sku: 'NOVA-SH-002',
        stock: 30,
        ratingAverage: 4.9,
        reviewCount: 42,
        variants: [
            {
                sku: 'NOVA-SH-002-B-OS',
                color: 'Black',
                size: 'One Size',
                price: 2190000,
                stock: 30,
            },
        ],
    },
    {
        name: 'Giày Thể Thao Everyday Runner',
        slug: 'giay-the-thao-everyday-runner',
        description: 'Giày chạy bộ thể thao thoáng khí, đế đệm giảm chấn êm ái cho vận động mỗi ngày.',
        category: 'Footwear',
        price: 980000,
        salePrice: null,
        images: [
            'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80',
        ],
        sku: 'NOVA-ER-003',
        stock: 25,
        ratingAverage: 4.6,
        reviewCount: 8,
        variants: [
            {
                sku: 'NOVA-ER-003-W-42',
                color: 'White',
                size: '42',
                price: 980000,
                stock: 25,
            },
        ],
    },
    {
        name: 'Sổ Tay Field Notes Textured',
        slug: 'so-tay-field-notes-textured',
        description: 'Bộ 3 cuốn sổ tay bìa dập vân cổ điển, giấy kraft chống nhòe mực.',
        category: 'Stationery',
        price: 240000,
        salePrice: 1990000,
        images: [
            'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
        ],
        sku: 'NOVA-FN-004',
        stock: 100,
        ratingAverage: 5.0,
        reviewCount: 19,
        variants: [
            {
                sku: 'NOVA-FN-004-G-A5',
                color: 'Green',
                size: 'A5',
                price: 199000,
                stock: 100,
            },
        ],
    },
    {
        name: 'Bàn Phím Cơ Không Dây RGB',
        slug: 'ban-phim-co-khong-day-rgb',
        description: 'Bàn phím cơ Bluetooth 3 chế độ kết nối, switch Gateron êm mượt, LED RGB rực rỡ.',
        category: 'Electronics',
        price: 1650000,
        salePrice: 1450000,
        images: [
            'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=600&q=80',
        ],
        sku: 'NOVA-KB-005',
        stock: 40,
        ratingAverage: 4.8,
        reviewCount: 31,
        variants: [
            {
                sku: 'NOVA-KB-005-RGB-RED',
                color: 'Grey',
                size: 'Tenkeyless',
                price: 1450000,
                stock: 40,
            },
        ],
    },
    {
        name: 'Áo Thun Cotton Organic Unisex',
        slug: 'ao-thun-cotton-organic-unisex',
        description: 'Áo thun 100% sợi bông hữu cơ, co giãn 4 chiều, thoáng mát, chuẩn form dáng unisex.',
        category: 'Clothing',
        price: 320000,
        salePrice: 280000,
        images: [
            'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&q=80',
        ],
        sku: 'NOVA-TS-006',
        stock: 80,
        ratingAverage: 4.7,
        reviewCount: 22,
        variants: [
            {
                sku: 'NOVA-TS-006-W-L',
                color: 'White',
                size: 'L',
                price: 280000,
                stock: 80,
            },
        ],
    },
];

const sampleCoupons = [
    {
        code: 'WELCOME50',
        description: 'Giảm 50.000đ cho đơn hàng đầu tiên từ 300.000đ',
        discountType: 'fixed',
        discountValue: 50000,
        minOrderValue: 300000,
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 năm
        usageLimit: 1000,
        userLimit: 1,
        isActive: true,
    },
    {
        code: 'GIAM10',
        description: 'Giảm 10% tối đa 100.000đ cho mọi đơn hàng từ 200.000đ',
        discountType: 'percentage',
        discountValue: 10,
        maxDiscountAmount: 100000,
        minOrderValue: 200000,
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        usageLimit: 500,
        userLimit: 3,
        isActive: true,
    },
    {
        code: 'FLASHSALE20',
        description: 'Mã Flash Sale giảm 20% tối đa 200.000đ',
        discountType: 'percentage',
        discountValue: 20,
        maxDiscountAmount: 200000,
        minOrderValue: 500000,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        usageLimit: 100,
        userLimit: 1,
        isActive: true,
    },
];

const sampleCategories = [
    {
        name: 'Bags',
        description: 'Túi xách, balo du lịch và thời trang',
        image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=600&q=80',
    },
    {
        name: 'Electronics',
        description: 'Thiết bị điện tử, tai nghe, bàn phím và phụ kiện công nghệ',
        image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80',
    },
    {
        name: 'Footwear',
        description: 'Giày thể thao, giày chạy bộ và sneaker',
        image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80',
    },
    {
        name: 'Stationery',
        description: 'Sổ tay, văn phòng phẩm và dụng cụ bàn làm việc',
        image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
    },
    {
        name: 'Clothing',
        description: 'Thời trang nam nữ, áo thun organic và trang phục thường ngày',
        image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&q=80',
    },
];

const seedDatabase = async () => {
    try {
        console.log('🔄 Đang kết nối tới MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log(`✅ Kết nối MongoDB thành công: ${MONGO_URI}`);

        // 1. Dọn dẹp dữ liệu cũ
        console.log('🧹 Đang làm sạch dữ liệu cũ...');
        await User.deleteMany({});
        await Category.deleteMany({});
        await Product.deleteMany({});
        await Inventory.deleteMany({});
        await Coupon.deleteMany({});

        // 2. Tạo Categories
        console.log('📂 Đang tạo Danh mục mẫu...');
        for (const cat of sampleCategories) {
            await Category.create(cat);
        }
        console.log(`   + Đã tạo ${sampleCategories.length} danh mục (Categories)`);

        // 2. Tạo Users (dùng save từng user để kích hoạt hook pre-save mã hoá mật khẩu)
        console.log('👤 Đang tạo Users mẫu...');
        for (const u of sampleUsers) {
            const user = new User(u);
            await user.save();
        }
        console.log(`   + Đã tạo ${sampleUsers.length} tài khoản (Admin, Vendor, Customer)`);

        // 3. Tạo Products và Inventories tương ứng
        console.log('📦 Đang tạo Sản phẩm và Tồn kho...');
        for (const p of sampleProducts) {
            const { sku, stock, variants, ...productData } = p;

            // Lưu Product
            const newProduct = await Product.create({
                ...productData,
                stock,
                variants,
            });

            // Tạo tồn kho cho SKU chính của sản phẩm
            await Inventory.create({
                product: newProduct._id,
                sku: sku.toUpperCase().trim(),
                stock,
                reservedStock: 0,
                lowStockThreshold: 5,
            });

            // Tạo tồn kho cho từng biến thể (nếu có biến thể khác SKU chính)
            if (Array.isArray(variants)) {
                for (const variant of variants) {
                    if (variant.sku && variant.sku.toUpperCase() !== sku.toUpperCase()) {
                        await Inventory.create({
                            product: newProduct._id,
                            sku: variant.sku.toUpperCase().trim(),
                            stock: variant.stock,
                            reservedStock: 0,
                            lowStockThreshold: 5,
                        });
                    }
                }
            }
        }
        console.log(`   + Đã tạo ${sampleProducts.length} sản phẩm kèm tồn kho (Inventories)`);

        // 4. Tạo Coupons
        console.log('🎟️ Đang tạo Mã giảm giá mẫu...');
        await Coupon.insertMany(sampleCoupons);
        console.log(`   + Đã tạo ${sampleCoupons.length} mã giảm giá`);

        console.log('\n=============================================');
        console.log('🎉 TẠO DATABASE & SEED DỮ LIỆU THÀNH CÔNG!');
        console.log('=============================================');
        console.log('Thông tin đăng nhập dùng thử:');
        console.log('👉 Admin:    admin@ecommerce.com    | Mật khẩu: Admin@123');
        console.log('👉 Vendor:   vendor@ecommerce.com   | Mật khẩu: Vendor@123');
        console.log('👉 Customer: customer@ecommerce.com | Mật khẩu: Customer@123');
        console.log('Mã giảm giá có sẵn: WELCOME50, GIAM10, FLASHSALE20');
        console.log('=============================================\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Lỗi khi seed dữ liệu:', error);
        process.exit(1);
    }
};

seedDatabase();
