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

/* =========================================================================
 * PHẦN MỞ RỘNG (TẠM ẨN): DỮ LIỆU ĐA NGÀNH HÀNG & MULTI-VENDOR CŨ
 * (Giữ lại để dễ dàng mở rộng lại trong tương lai, không xóa)
 * =========================================================================
const sampleUsers_MultiVendor_Old = [
    { email: 'admin@ecommerce.com', password: 'Admin@123', role: 'admin' },
    { email: 'vendor@ecommerce.com', password: 'Vendor@123', role: 'vendor' },
    { email: 'customer@ecommerce.com', password: 'Customer@123', role: 'customer' },
];

const sampleCategories_MultiIndustry_Old = [
    { name: 'Bags', description: 'Túi xách, balo du lịch và thời trang', image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=600&q=80' },
    { name: 'Electronics', description: 'Thiết bị điện tử, tai nghe, bàn phím và phụ kiện công nghệ', image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80' },
    { name: 'Footwear', description: 'Giày thể thao, giày chạy bộ và sneaker', image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80' },
    { name: 'Stationery', description: 'Sổ tay, văn phòng phẩm và dụng cụ bàn làm việc', image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80' },
    { name: 'Clothing', description: 'Thời trang nam nữ, áo thun organic và trang phục thường ngày', image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&q=80' },
];
========================================================================= */

// Danh sách tài khoản: Mô hình 1 shop đơn lẻ (Admin là Chủ Shop)
const sampleUsers = [
    {
        email: 'admin@ecommerce.com',
        password: 'Admin@123',
        role: 'admin', // Chủ shop (toàn quyền quản trị)
    },
    // Tài khoản vendor tạm ẩn trong mô hình shop đơn lẻ:
    // { email: 'vendor@ecommerce.com', password: 'Vendor@123', role: 'vendor' },
    {
        email: 'customer@ecommerce.com',
        password: 'Customer@123',
        role: 'customer',
    },
];

// Danh mục chuyên biệt cho Shop Quần Áo Thời Trang
const sampleCategories = [
    {
        name: 'Áo thun & Polo',
        description: 'Áo thun unisex cotton compact, áo polo trẻ trung thanh lịch',
        image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&q=80',
    },
    {
        name: 'Áo sơ mi',
        description: 'Sơ mi Oxford, sơ mi lụa công sở cao cấp đứng form',
        image: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=600&q=80',
    },
    {
        name: 'Quần Jean & Kaki',
        description: 'Quần jeans wash thời thượng, quần kaki và quần âu ống đứng',
        image: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=600&q=80',
    },
    {
        name: 'Áo khoác & Hoodie',
        description: 'Áo khoác gió bomber, áo hoodie nỉ bông dày dặn ấm áp',
        image: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=600&q=80',
    },
    {
        name: 'Váy & Đầm',
        description: 'Váy đầm nữ dáng xòe, đầm hoa vintage và thiết kế thanh lịch',
        image: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&w=600&q=80',
    },
];

// Danh sách sản phẩm quần áo thời trang mẫu kèm biến thể Màu & Size
const sampleProducts = [
    {
        name: 'Áo Thun Cotton Compact Unisex Basic',
        slug: 'ao-thun-cotton-compact-unisex-basic',
        description: 'Áo thun 100% sợi bông Cotton Compact cao cấp, bề mặt mịn màng không xù lông, thấm hút mồ hôi tốt và chuẩn form unisex cho cả nam và nữ.',
        category: 'Áo thun & Polo',
        price: 280000,
        salePrice: 220000,
        images: [
            'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&q=80',
            'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=600&q=80',
        ],
        sku: 'CLOTH-TS-001',
        stock: 120,
        ratingAverage: 4.9,
        reviewCount: 38,
        variants: [
            {
                sku: 'CLOTH-TS-001-W-M',
                color: 'Trắng',
                size: 'M',
                price: 220000,
                stock: 40,
            },
            {
                sku: 'CLOTH-TS-001-W-L',
                color: 'Trắng',
                size: 'L',
                price: 220000,
                stock: 40,
            },
            {
                sku: 'CLOTH-TS-001-B-L',
                color: 'Đen',
                size: 'L',
                price: 220000,
                stock: 40,
            },
        ],
    },
    {
        name: 'Áo Sơ Mi Oxford Regular Dài Tay',
        slug: 'ao-so-mi-oxford-regular-dai-tay',
        description: 'Áo sơ mi vải dệt Oxford dày dặn, đứng dáng, cổ bẻ cài khuy button-down lịch lãm phù hợp đi làm công sở lẫn dạo phố.',
        category: 'Áo sơ mi',
        price: 450000,
        salePrice: 390000,
        images: [
            'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=600&q=80',
            'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=600&q=80',
        ],
        sku: 'CLOTH-SM-002',
        stock: 75,
        ratingAverage: 4.8,
        reviewCount: 26,
        variants: [
            {
                sku: 'CLOTH-SM-002-BL-M',
                color: 'Xanh Nhạt',
                size: 'M',
                price: 390000,
                stock: 35,
            },
            {
                sku: 'CLOTH-SM-002-W-L',
                color: 'Trắng',
                size: 'L',
                price: 390000,
                stock: 40,
            },
        ],
    },
    {
        name: 'Quần Jean Nam Regular Fit Co Giãn',
        slug: 'quan-jean-nam-regular-fit-co-gian',
        description: 'Quần jean chất liệu denim 12oz wash tự nhiên, pha sợi spandex co giãn nhẹ tạo cảm giác thoải mái khi ngồi và vận động cả ngày.',
        category: 'Quần Jean & Kaki',
        price: 520000,
        salePrice: 460000,
        images: [
            'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=600&q=80',
            'https://images.unsplash.com/photo-1542272604-780c96856592?auto=format&fit=crop&w=600&q=80',
        ],
        sku: 'CLOTH-JN-003',
        stock: 60,
        ratingAverage: 4.7,
        reviewCount: 19,
        variants: [
            {
                sku: 'CLOTH-JN-003-BL-30',
                color: 'Xanh Denim',
                size: '30',
                price: 460000,
                stock: 30,
            },
            {
                sku: 'CLOTH-JN-003-BL-32',
                color: 'Xanh Denim',
                size: '32',
                price: 460000,
                stock: 30,
            },
        ],
    },
    {
        name: 'Áo Khoác Gió Bomber 2 Lớp Chống Nước',
        slug: 'ao-khoac-gio-bomber-2-lop-chong-nuoc',
        description: 'Áo khoác bomber thời trang đường phố, chất vải trượt nước cản gió tốt, lót trong thoáng khí, khoá kéo kim loại trơn tru bền bỉ.',
        category: 'Áo khoác & Hoodie',
        price: 590000,
        salePrice: 490000,
        images: [
            'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=600&q=80',
            'https://images.unsplash.com/photo-1548883354-7622d03aca27?auto=format&fit=crop&w=600&q=80',
        ],
        sku: 'CLOTH-JK-004',
        stock: 45,
        ratingAverage: 4.9,
        reviewCount: 31,
        variants: [
            {
                sku: 'CLOTH-JK-004-B-L',
                color: 'Đen',
                size: 'L',
                price: 490000,
                stock: 25,
            },
            {
                sku: 'CLOTH-JK-004-G-XL',
                color: 'Xanh Rêu',
                size: 'XL',
                price: 490000,
                stock: 20,
            },
        ],
    },
    {
        name: 'Áo Hoodie Nỉ Bông Oversize Streetwear',
        slug: 'ao-hoodie-ni-bong-oversize-streetwear',
        description: 'Áo hoodie form rộng nỉ lót bông mềm mại giữ ấm hoàn hảo, mũ 2 lớp dày dặn có dây rút, túi kangaroo phía trước tiện dụng.',
        category: 'Áo khoác & Hoodie',
        price: 480000,
        salePrice: 420000,
        images: [
            'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=600&q=80',
        ],
        sku: 'CLOTH-HD-005',
        stock: 50,
        ratingAverage: 4.8,
        reviewCount: 44,
        variants: [
            {
                sku: 'CLOTH-HD-005-GR-M',
                color: 'Xám Tiêu',
                size: 'M',
                price: 420000,
                stock: 25,
            },
            {
                sku: 'CLOTH-HD-005-BE-L',
                color: 'Be',
                size: 'L',
                price: 420000,
                stock: 25,
            },
        ],
    },
    {
        name: 'Áo Polo Pique Cotton Phối Bo Cổ',
        slug: 'ao-polo-pique-cotton-phoi-bo-co',
        description: 'Áo polo dệt mắt chim Pique co giãn 4 chiều mềm mát, cổ áo phối dệt tỉ mỉ, phong cách smart-casual tinh tế cho mọi sự kiện.',
        category: 'Áo thun & Polo',
        price: 360000,
        salePrice: 310000,
        images: [
            'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&w=600&q=80',
        ],
        sku: 'CLOTH-PL-006',
        stock: 70,
        ratingAverage: 4.9,
        reviewCount: 18,
        variants: [
            {
                sku: 'CLOTH-PL-006-NV-M',
                color: 'Xanh Navy',
                size: 'M',
                price: 310000,
                stock: 35,
            },
            {
                sku: 'CLOTH-PL-006-W-L',
                color: 'Trắng',
                size: 'L',
                price: 310000,
                stock: 35,
            },
        ],
    },
    {
        name: 'Quần Tây Âu Nam Dáng Slimfit Co Giãn',
        slug: 'quan-tay-au-nam-dang-slimfit-co-gian',
        description: 'Quần âu may đo chuẩn chỉ, cạp quần êm ái chống gập, vải tuyết mưa cao cấp ít nhăn, giữ nếp ly quần suốt ngày dài.',
        category: 'Quần Jean & Kaki',
        price: 490000,
        salePrice: null,
        images: [
            'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=600&q=80',
        ],
        sku: 'CLOTH-TR-007',
        stock: 40,
        ratingAverage: 4.6,
        reviewCount: 12,
        variants: [
            {
                sku: 'CLOTH-TR-007-B-31',
                color: 'Đen',
                size: '31',
                price: 490000,
                stock: 20,
            },
            {
                sku: 'CLOTH-TR-007-GR-32',
                color: 'Xám Ghi',
                size: '32',
                price: 490000,
                stock: 20,
            },
        ],
    },
    {
        name: 'Đầm Hoa Nhí Cổ Vuông Dáng Dài Vintage',
        slug: 'dam-hoa-nhi-co-vuong-dang-dai-vintage',
        description: 'Đầm thiết kế voan tơ 2 lớp bồng bềnh, họa tiết hoa nhí phong cách Hàn Quốc, tay áo phồng nhẹ nữ tính và thanh thoát.',
        category: 'Váy & Đầm',
        price: 550000,
        salePrice: 470000,
        images: [
            'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&w=600&q=80',
        ],
        sku: 'CLOTH-DR-008',
        stock: 35,
        ratingAverage: 5.0,
        reviewCount: 29,
        variants: [
            {
                sku: 'CLOTH-DR-008-F-S',
                color: 'Hoa Nhí Be',
                size: 'S',
                price: 470000,
                stock: 15,
            },
            {
                sku: 'CLOTH-DR-008-F-M',
                color: 'Hoa Nhí Be',
                size: 'M',
                price: 470000,
                stock: 20,
            },
        ],
    },
];

const sampleCoupons = [
    {
        code: 'FASHION50',
        description: 'Giảm ngay 50.000đ cho đơn hàng quần áo từ 300.000đ',
        discountType: 'fixed',
        discountValue: 50000,
        minOrderValue: 300000,
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        usageLimit: 1000,
        userLimit: 1,
        isActive: true,
    },
    {
        code: 'OUTFIT10',
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
        code: 'VIPSTYLE20',
        description: 'Mã VIP giảm 20% tối đa 200.000đ cho đơn từ 500.000đ',
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
        console.log('Thông tin đăng nhập dùng thử (Mô hình Single Shop):');
        console.log('👉 Admin (Chủ shop): admin@ecommerce.com    | Mật khẩu: Admin@123');
        console.log('👉 Customer:         customer@ecommerce.com | Mật khẩu: Customer@123');
        console.log('💡 Ghi chú: Tài khoản Vendor tạm thời ẩn trong mô hình Shop đơn lẻ');
        console.log('Mã giảm giá có sẵn: FASHION50, OUTFIT10, VIPSTYLE20');
        console.log('=============================================\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Lỗi khi seed dữ liệu:', error);
        process.exit(1);
    }
};

seedDatabase();
