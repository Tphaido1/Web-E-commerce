/**
 * seedData.js
 * --------------------------------------------------------------------------
 * Script khởi tạo dữ liệu mẫu (Seed Data) cho dự án Web E-Commerce.
 * Bơm 100 sản phẩm mẫu đa dạng ngành hàng, có đầy đủ biến thể (variants),
 * và đồng bộ tương ứng vào bảng Tồn kho (Inventory) để phục vụ quy trình Checkout/Concurrrency.
 *
 * Cách chạy:
 *   cd server
 *   node src/utils/seedData.js
 * --------------------------------------------------------------------------
 */

const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

// Nạp file .env từ thư mục server/
dotenv.config({ path: path.join(__dirname, '../../.env') });

const Product = require('../models/Product.model');
const Inventory = require('../models/Inventory.model');

// Hàm tạo slug thân thiện từ chuỗi tiếng Việt
function generateSlug(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Bỏ dấu tiếng Việt
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// Danh mục và bộ dữ liệu hạt nhân để sinh 100 sản phẩm
const CATEGORIES = [
  {
    name: 'Thời trang & May mặc',
    code: 'FASHION',
    items: [
      { name: 'Áo thun Cotton Compact Basic', basePrice: 199000, colors: ['Đen', 'Trắng', 'Xám'], sizes: ['M', 'L', 'XL'] },
      { name: 'Áo sơ mi Oxford tay dài Casual', basePrice: 350000, colors: ['Trắng', 'Xanh nhạt', 'Hồng nhạt'], sizes: ['S', 'M', 'L', 'XL'] },
      { name: 'Quần Jeans Slim-fit Denim Co giãn', basePrice: 450000, colors: ['Xanh đậm', 'Xanh nhạt', 'Đen'], sizes: ['29', '30', '31', '32'] },
      { name: 'Áo khoác Bomber gió 2 lớp Chống nước', basePrice: 520000, colors: ['Đen', 'Rêu', 'Be'], sizes: ['M', 'L', 'XL'] },
      { name: 'Áo Hoodie nỉ bông Unisex Form rộng', basePrice: 390000, colors: ['Đen', 'Xám tiêu', 'Nâu'], sizes: ['FreeSize', 'L', 'XL'] },
      { name: 'Quần Tây âu co giãn 4 chiều Thanh lịch', basePrice: 420000, colors: ['Đen', 'Xanh than', 'Ghi sáng'], sizes: ['29', '30', '31', '32'] },
      { name: 'Áo Polo thể thao Coolmax Thoáng khí', basePrice: 280000, colors: ['Trắng', 'Navy', 'Đỏ đô'], sizes: ['M', 'L', 'XL'] },
      { name: 'Váy đầm Midi dáng xòe Vintage Công sở', basePrice: 480000, colors: ['Đen', 'Hoa nhí', 'Trắng kem'], sizes: ['S', 'M', 'L'] },
      { name: 'Áo len dệt kim cổ lọ Thu đông Cao cấp', basePrice: 399000, colors: ['Kem', 'Đen', 'Nâu bò'], sizes: ['M', 'L'] },
      { name: 'Quần Short Kaki co giãn Năng động', basePrice: 220000, colors: ['Be', 'Đen', 'Xanh rêu'], sizes: ['29', '30', '31', '32'] },
      { name: 'Chân váy xếp ly dáng dài Hàn Quốc', basePrice: 290000, colors: ['Đen', 'Nâu', 'Xám'], sizes: ['S', 'M', 'L'] },
      { name: 'Bộ đồ thể thao Poly Spandex Chạy bộ', basePrice: 450000, colors: ['Xám chì', 'Đen viền trắng'], sizes: ['M', 'L', 'XL'] },
      { name: 'Áo Blazer Hàn Quốc form Suông Hiện đại', basePrice: 650000, colors: ['Đen', 'Be sáng'], sizes: ['M', 'L'] },
    ],
    images: [
      'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=600&auto=format&fit=crop&q=80',
    ],
  },
  {
    name: 'Điện thoại & Phụ kiện',
    code: 'MOBILE',
    items: [
      { name: 'Củ sạc nhanh GaN 65W 3 cổng Type-C', basePrice: 450000, colors: ['Đen', 'Trắng'], sizes: ['65W Pro', '65W Mini'] },
      { name: 'Cáp sạc nhanh bọc dù Type-C to Lightning', basePrice: 120000, colors: ['Đen', 'Bạc'], sizes: ['1m', '2m'] },
      { name: 'Pin sạc dự phòng Magsafe 10000mAh Không dây', basePrice: 550000, colors: ['Trắng', 'Xám titan', 'Xanh tím'], sizes: ['10.000mAh', '20.000mAh'] },
      { name: 'Ốp lưng từ tính Silicon Chống sốc chuẩn Quân đội', basePrice: 150000, colors: ['Đen nhám', 'Trong suốt', 'Xanh rêu'], sizes: ['iPhone 14/15', 'iPhone 15 Pro Max'] },
      { name: 'Tai nghe Bluetooth TWS Chống ồn chủ động ANC', basePrice: 890000, colors: ['Đen nhám', 'Trắng ngọc'], sizes: ['Bản tiêu chuẩn'] },
      { name: 'Giá đỡ điện thoại xoay 360 độ Hợp kim nhôm', basePrice: 180000, colors: ['Bạc', 'Xám không gian'], sizes: ['Để bàn'] },
      { name: 'Kính cường lực Full viền 9D Chống nhìn trộm', basePrice: 95000, colors: ['Đen'], sizes: ['Màn hình phẳng', 'Màn hình cong'] },
      { name: 'Thẻ nhớ MicroSD Class 10 Tốc độ cao 100MB/s', basePrice: 220000, colors: ['Đỏ/Đen'], sizes: ['64GB', '128GB', '256GB'] },
      { name: 'Bộ tản nhiệt sò lạnh điện thoại Gaming RGB', basePrice: 320000, colors: ['Đen LED'], sizes: ['Hít từ tính', 'Kẹp ngàm'] },
      { name: 'Gậy chụp ảnh Selfie Gimbal chống rung 1 trục', basePrice: 420000, colors: ['Đen'], sizes: ['Kèm Remote Bluetooth'] },
      { name: 'Dây sạc đa năng 3 trong 1 Type-C Micro Lightning', basePrice: 85000, colors: ['Đỏ', 'Đen'], sizes: ['1.2m'] },
      { name: 'Bộ sạc không dây 3 in 1 cho Phone Watch Pods', basePrice: 650000, colors: ['Trắng', 'Đen'], sizes: ['Gấp gọn'] },
      { name: 'Bộ làm sạch thiết bị tai nghe bàn phím đa năng', basePrice: 69000, colors: ['Trắng phối xanh'], sizes: ['Bộ 7 trong 1'] },
    ],
    images: [
      'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=600&auto=format&fit=crop&q=80',
    ],
  },
  {
    name: 'Laptop & Thiết bị số',
    code: 'TECH',
    items: [
      { name: 'Bàn phím cơ Không dây 3 Mode Hotswap RGB', basePrice: 890000, colors: ['Trắng xanh', 'Retro Grey'], sizes: ['Red Switch', 'Brown Switch', 'Blue Switch'] },
      { name: 'Chuột công thái học Không dây Silent Click', basePrice: 380000, colors: ['Đen', 'Trắng', 'Hồng nhạt'], sizes: ['Kết nối Bluetooth/2.4G'] },
      { name: 'Lót chuột cỡ lớn Da PU Chống thấm nước', basePrice: 150000, colors: ['Nâu cổ điển', 'Đen carbon', 'Xanh midnight'], sizes: ['80x40cm', '90x40cm'] },
      { name: 'Hub chuyển đổi USB-C 8 trong 1 4K HDMI PD100W', basePrice: 520000, colors: ['Xám Space'], sizes: ['Tiêu chuẩn'] },
      { name: 'Đế nhôm tản nhiệt Laptop nâng hạ độ cao', basePrice: 280000, colors: ['Bạc ánh kim', 'Xám titan'], sizes: ['Dành cho 13-17 inch'] },
      { name: 'Tai nghe chụp tai Over-Ear Gaming 7.1 Bass sâu', basePrice: 750000, colors: ['Đen RGB', 'Hồng'], sizes: ['Cổng 3.5mm', 'Cổng USB 7.1'] },
      { name: 'Webcam góc rộng Full HD 1080P Kèm Micro kép', basePrice: 490000, colors: ['Đen'], sizes: ['Có nắp che bảo mật'] },
      { name: 'Loa thanh Soundbar để bàn kết nối Bluetooth 5.3', basePrice: 420000, colors: ['Đen bóng', 'Xám kim loại'], sizes: ['Công suất 20W'] },
      { name: 'Ổ cứng SSD di động tốc độ cao NVMe 1050MB/s', basePrice: 1450000, colors: ['Đen nhám', 'Xanh rêu'], sizes: ['500GB', '1TB', '2TB'] },
      { name: 'Đèn LED treo màn hình bảo vệ mắt chống lóa', basePrice: 350000, colors: ['Đen mờ'], sizes: ['Cảm ứng 3 chế độ sáng'] },
      { name: 'Túi đựng phụ kiện công nghệ chống sốc 2 ngăn', basePrice: 160000, colors: ['Xám đậm', 'Xanh navy'], sizes: ['Size M', 'Size L'] },
      { name: 'Micro thu âm cổng USB chống nhiễu Podcasting', basePrice: 620000, colors: ['Đen'], sizes: ['Kèm chân tripod'] },
    ],
    images: [
      'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=600&auto=format&fit=crop&q=80',
    ],
  },
  {
    name: 'Đồng hồ & Trang sức',
    code: 'JEWELRY',
    items: [
      { name: 'Đồng hồ nam dây thép không gỉ Sapphire 3ATM', basePrice: 1200000, colors: ['Mặt đen dây bạc', 'Mặt xanh dây bạc', 'Toàn bộ vàng'], sizes: ['Đường kính 40mm'] },
      { name: 'Vòng tay bạc Ý 925 đính đá Zirconia Tinh xảo', basePrice: 450000, colors: ['Bạc sáng', 'Mạ vàng hồng'], sizes: ['16cm', '18cm'] },
      { name: 'Nhẫn nam Titan phong cách Tối giản Hiện đại', basePrice: 180000, colors: ['Đen mờ', 'Bạc phay xước', 'Vàng kim'], sizes: ['Size 7', 'Size 8', 'Size 9', 'Size 10'] },
      { name: 'Dây chuyền Bạc nữ mặt cỏ 4 lá may mắn', basePrice: 380000, colors: ['Bạc 925', 'Vàng tây 10K'], sizes: ['Dây 45cm'] },
      { name: 'Đồng hồ thông minh theo dõi sức khỏe SpO2 Pin 7 ngày', basePrice: 950000, colors: ['Đen thể thao', 'Vàng hồng dây silicon'], sizes: ['Màn hình 1.75 inch'] },
      { name: 'Bông tai ngọc trai nhân tạo chốt vặn Bạc 925', basePrice: 220000, colors: ['Trắng sữa', 'Ánh hồng'], sizes: ['8mm', '10mm'] },
      { name: 'Lắc chân nữ mảnh đính chuông nhỏ Dễ thương', basePrice: 210000, colors: ['Bạc', 'Vàng hồng'], sizes: ['22cm + nối 3cm'] },
      { name: 'Hộp đựng đồng hồ bọc da cao cấp 6 ngăn lót nhung', basePrice: 320000, colors: ['Đen chỉ đỏ', 'Nâu vân gỗ'], sizes: ['6 ngăn'] },
      { name: 'Đồng hồ nữ mặt vuông phong cách Vintage Cổ điển', basePrice: 680000, colors: ['Dây da nâu', 'Dây da đen'], sizes: ['Mặt 26mm'] },
      { name: 'Kẹp cà vạt mạ vàng cao cấp cho Quý ông', basePrice: 140000, colors: ['Vàng', 'Bạc bóng'], sizes: ['Tiêu chuẩn'] },
      { name: 'Vòng tay trầm hương tự nhiên 108 hạt Phong thủy', basePrice: 750000, colors: ['Nâu mộc'], sizes: ['6mm', '8mm'] },
      { name: 'Kính mát phân cực Polarized chống tia UV400', basePrice: 350000, colors: ['Gọng đen mắt đen', 'Gọng vàng mắt trà'], sizes: ['Form phi công'] },
    ],
    images: [
      'https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&auto=format&fit=crop&q=80',
    ],
  },
  {
    name: 'Giày dép & Sneaker',
    code: 'SHOES',
    items: [
      { name: 'Giày Sneaker Running đế đệm khí Êm chân', basePrice: 650000, colors: ['Trắng phối xám', 'Đen toàn phần', 'Xanh navy'], sizes: ['39', '40', '41', '42', '43'] },
      { name: 'Giày lười nam Da bò dập vân Kháng nước', basePrice: 780000, colors: ['Đen bóng', 'Nâu hạt dẻ'], sizes: ['39', '40', '41', '42'] },
      { name: 'Sandal quai dù đế cao su đúc Chống trơn trượt', basePrice: 250000, colors: ['Đen', 'Rêu lính', 'Xám tro'], sizes: ['38', '39', '40', '41', '42'] },
      { name: 'Giày cao gót nữ mũi nhọn 7cm Da bóng Thanh lịch', basePrice: 490000, colors: ['Đen', 'Kem be', 'Đỏ mận'], sizes: ['35', '36', '37', '38', '39'] },
      { name: 'Giày thể thao tập Gym tập tạ Siêu nhẹ', basePrice: 520000, colors: ['Xám cam', 'Đen đỏ'], sizes: ['40', '41', '42', '43'] },
      { name: 'Dép bánh mì EVA đúc nguyên khối Siêu êm', basePrice: 110000, colors: ['Trắng', 'Đen', 'Vàng bơ', 'Xanh cốm'], sizes: ['36-37', '38-39', '40-41', '42-43'] },
      { name: 'Giày Oxford nam Da thật Buộc dây Công sở', basePrice: 950000, colors: ['Đen sang trọng', 'Nâu tây'], sizes: ['39', '40', '41', '42', '43'] },
      { name: 'Giày Boots da cổ lửng phong cách Military', basePrice: 850000, colors: ['Đen lì', 'Nâu da bò'], sizes: ['40', '41', '42', '43'] },
      { name: 'Giày búp bê nữ đính nơ mềm mại Đi học đi làm', basePrice: 280000, colors: ['Đen', 'Be'], sizes: ['35', '36', '37', '38'] },
      { name: 'Giày Slip-on vải Canvas năng động Trẻ trung', basePrice: 320000, colors: ['Trắng', 'Đen', 'Caro đen trắng'], sizes: ['38', '39', '40', '41', '42'] },
      { name: 'Lót giày thể thao đệm khí EVA trợ lực Giảm chấn', basePrice: 65000, colors: ['Đen phối vàng'], sizes: ['Size cắt 35-40', 'Size cắt 41-45'] },
      { name: 'Bộ chai xịt tạo bọt vệ sinh giày Nano Chuyên dụng', basePrice: 89000, colors: ['Không màu'], sizes: ['Chai 200ml kèm bàn chải'] },
    ],
    images: [
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1607522370275-f14206abe5d3?w=600&auto=format&fit=crop&q=80',
    ],
  },
  {
    name: 'Túi xách & Balo',
    code: 'BAGS',
    items: [
      { name: 'Balo Laptop 15.6 inch Vải Oxford Chống thấm nước', basePrice: 420000, colors: ['Đen', 'Xám ghi', 'Xanh navy'], sizes: ['Tiêu chuẩn', 'Mở rộng ngăn'] },
      { name: 'Túi đeo chéo Canvas phong cách Nhật Bản Đơn giản', basePrice: 190000, colors: ['Trắng ngà', 'Đen', 'Xanh rêu'], sizes: ['Freesize 28x20cm'] },
      { name: 'Ví nam dáng đứng Da bò thật 100% Khắc tên', basePrice: 350000, colors: ['Nâu sáp', 'Đen da sần'], sizes: ['Dáng đứng', 'Dáng ngang'] },
      { name: 'Túi Tote vải dù có khóa kéo Miệng túi Ngăn đựng laptop', basePrice: 160000, colors: ['Đen', 'Be', 'Bạc'], sizes: ['38x34cm'] },
      { name: 'Balo du lịch Phượt chống nước 45L Có ngăn để giày', basePrice: 580000, colors: ['Đen phối rằn ri', 'Xanh lá quân đội'], sizes: ['Dung tích 45L'] },
      { name: 'Túi xách nữ kẹp nách Da vân cá sấu Sang chảnh', basePrice: 320000, colors: ['Trắng kem', 'Đen bóng', 'Nâu tây'], sizes: ['Freesize'] },
      { name: 'Túi bao tử đeo hông Chạy bộ Thể thao Siêu nhẹ', basePrice: 130000, colors: ['Đen phản quang', 'Xám bạc'], sizes: ['Kèm khe cắm tai nghe'] },
      { name: 'Cặp da công sở đựng tài liệu Hợp đồng Laptop 14 inch', basePrice: 690000, colors: ['Nâu cà phê', 'Đen'], sizes: ['Khóa số kim loại'] },
      { name: 'Túi đựng mỹ phẩm du lịch Đa năng Treo tường', basePrice: 120000, colors: ['Hồng pastel', 'Xanh mint', 'Xám'], sizes: ['Gấp gọn chống nước'] },
      { name: 'Balo mini nữ thời trang Da PU đính hạt Cá tính', basePrice: 280000, colors: ['Đen', 'Bạc'], sizes: ['Cao 24cm'] },
      { name: 'Túi giữ nhiệt đựng hộp cơm văn phòng 3 lớp Dày dặn', basePrice: 95000, colors: ['Xám sọc', 'Xanh tam giác'], sizes: ['Dung tích 6L'] },
      { name: 'Vali du lịch Khung nhôm Khóa TSA Chống bể vỡ', basePrice: 1150000, colors: ['Bạc kim loại', 'Đen titan', 'Hồng rose'], sizes: ['Size 20 inch', 'Size 24 inch'] },
    ],
    images: [
      'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=600&auto=format&fit=crop&q=80',
    ],
  },
  {
    name: 'Nhà cửa & Đời sống',
    code: 'HOME',
    items: [
      { name: 'Đèn ngủ Mặt trăng 3D Cảm ứng Đổi màu RGB', basePrice: 190000, colors: ['Ánh sáng vàng ấm', 'Ánh sáng trắng', '16 màu kèm Remote'], sizes: ['Đường kính 15cm', 'Đường kính 18cm'] },
      { name: 'Máy khuếch tán tinh dầu Siêu âm Vân gỗ Tự ngắt', basePrice: 280000, colors: ['Vân gỗ sáng', 'Vân gỗ tối'], sizes: ['Dung tích 500ml kèm remote'] },
      { name: 'Bình giữ nhiệt Inox 316 Có nắp hiển thị Nhiệt độ', basePrice: 220000, colors: ['Đen huyền bí', 'Trắng ngọc', 'Xanh rêu'], sizes: ['500ml', '800ml'] },
      { name: 'Gối công thái học Cao su non Nâng đỡ cổ vai gáy', basePrice: 380000, colors: ['Xám đậm', 'Xanh navy'], sizes: ['Kích thước 50x30cm'] },
      { name: 'Bộ chăn ga gối Cotton Tencel Kháng khuẩn Mềm mát', basePrice: 850000, colors: ['Xanh ngọc', 'Xám tro', 'Hồng san hô'], sizes: ['M5 x 2M', 'M8 x 2M', '2M x 2M2'] },
      { name: 'Đồng hồ LED báo thức Để bàn Báo nhiệt độ Cảm ứng âm thanh', basePrice: 150000, colors: ['Gỗ đen số trắng', 'Gỗ sáng số xanh'], sizes: ['Dáng chữ nhật'] },
      { name: 'Kệ để gia vị nhà bếp Đa năng Thép carbon 3 tầng', basePrice: 320000, colors: ['Đen sơn tĩnh điện'], sizes: ['3 tầng vát', '3 tầng thẳng'] },
      { name: 'Cây lau nhà tự vắt Thông minh Kèm xô 2 ngăn tách nước bẩn', basePrice: 290000, colors: ['Trắng phối xám'], sizes: ['Kèm 2 bông lau', 'Kèm 4 bông lau'] },
      { name: 'Cốc sứ giữ nhiệt Kèm thìa vàng Nắp đậy phong cách Bắc Âu', basePrice: 95000, colors: ['Xanh lục bảo', 'Trắng viền kim', 'Hồng phấn'], sizes: ['Dung tích 400ml'] },
      { name: 'Thùng rác thông minh Cảm ứng hồng ngoại Tự động mở nắp', basePrice: 420000, colors: ['Trắng tuyết', 'Xám bạc'], sizes: ['12 Lít', '16 Lít'] },
      { name: 'Máy hút bụi cầm tay Mini Không dây Lực hút 9000Pa', basePrice: 350000, colors: ['Trắng', 'Đen'], sizes: ['Kèm 4 đầu hút'] },
      { name: 'Đèn bàn học chống cận thị LED Điều chỉnh 5 mức sáng', basePrice: 260000, colors: ['Trắng tinh khiết'], sizes: ['Pin sạc tích điện', 'Cắm điện trực tiếp'] },
      { name: 'Máy làm ấm cốc cà phê Trà giữ nhiệt 55 độ C Tự động', basePrice: 130000, colors: ['Hồng', 'Xanh rêu', 'Trắng'], sizes: ['Kèm cốc sứ', 'Chỉ đế làm ấm'] },
    ],
    images: [
      'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=600&auto=format&fit=crop&q=80',
    ],
  },
  {
    name: 'Thể thao & Dã ngoại',
    code: 'SPORT',
    items: [
      { name: 'Thảm Yoga Định tuyến TPE 2 lớp Chống trơn trượt', basePrice: 260000, colors: ['Xanh tím', 'Hồng xám', 'Xanh rêu'], sizes: ['Dày 6mm', 'Dày 8mm'] },
      { name: 'Bình nước thể thao Tritan 2 Lít Có vạch nhắc nhở Uống nước', basePrice: 140000, colors: ['Gradient Xanh Tím', 'Đen mờ', 'Hồng Pastel'], sizes: ['Dung tích 2000ml'] },
      { name: 'Bộ dây kháng lực ngũ sắc Tập mông đùi Toàn thân', basePrice: 160000, colors: ['Bộ 5 màu đa cấp độ'], sizes: ['Lực kéo 10-50 Lbs'] },
      { name: 'Túi thể thao chống thấm Nước ngăn để giày riêng', basePrice: 240000, colors: ['Đen', 'Xám bạc', 'Hồng'], sizes: ['Dung tích 30L'] },
      { name: 'Lều cắm trại Dã ngoại Tự bung Chống mưa gió 4 người', basePrice: 750000, colors: ['Xanh rêu', 'Cam phối xám'], sizes: ['Kích thước 2.1 x 2.1 x 1.4m'] },
      { name: 'Bàn ghế dã ngoại Gấp gọn Hợp kim nhôm Siêu bền', basePrice: 590000, colors: ['Đen vân cát', 'Nâu be'], sizes: ['1 bàn + 4 ghế'] },
      { name: 'Bó gối thể thao Co giãn 4 chiều Bảo vệ khớp gối', basePrice: 120000, colors: ['Đen viền xanh', 'Đen viền cam'], sizes: ['M', 'L', 'XL'] },
      { name: 'Đèn pin siêu sáng Chống nước Chiếu xa 500m Tích hợp sạc dự phòng', basePrice: 290000, colors: ['Đen nhôm'], sizes: ['Bóng Laser LED'] },
      { name: 'Đệm hơi cắm trại Tự bơm Nằm êm Cách nhiệt đất', basePrice: 380000, colors: ['Xanh navy', 'Xanh rêu'], sizes: ['Dáng đơn 190x65cm'] },
      { name: 'Găng tay tập Gym Nam Nữ Có quấn cổ tay Bảo vệ khớp', basePrice: 95000, colors: ['Đen đỏ', 'Đen xám'], sizes: ['M', 'L', 'XL'] },
      { name: 'Dây nhảy thể lực Thép bọc nhựa Điều chỉnh chiều dài Vòng bi xoay', basePrice: 75000, colors: ['Đen', 'Đỏ'], sizes: ['Dài 3m'] },
      { name: 'Vợt cầu lông Đôi Khung Carbon Siêu nhẹ Căng sẵn 10kg', basePrice: 420000, colors: ['Xanh trắng', 'Đỏ đen'], sizes: ['Trọng lượng 4U (82-84g)'] },
    ],
    images: [
      'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=600&auto=format&fit=crop&q=80',
    ],
  },
];

/**
 * Hàm sinh danh sách đúng 100 sản phẩm mẫu
 */
function build100Products() {
  const products = [];
  let globalIndex = 1;

  // Thu thập toàn bộ items thô từ các danh mục
  const allCategoryItems = [];
  CATEGORIES.forEach((cat) => {
    cat.items.forEach((item) => {
      allCategoryItems.push({
        ...item,
        categoryName: cat.name,
        categoryCode: cat.code,
        images: cat.images,
      });
    });
  });

  // Lặp để tạo chính xác 100 sản phẩm
  for (let i = 0; i < 100; i++) {
    const template = allCategoryItems[i % allCategoryItems.length];
    const itemNumber = globalIndex++;
    const padNum = String(itemNumber).padStart(3, '0');

    // Biến thể phong phú tên để tránh trùng slug tuyệt đối
    const edition = i >= allCategoryItems.length ? `(Phiên bản ${Math.floor(i / allCategoryItems.length) + 1})` : '';
    const productName = `${template.name} ${edition}`.trim();
    const productSlug = `${generateSlug(productName)}-${padNum}`;

    // Tạo variants
    const variants = [];
    const colors = template.colors || ['Tiêu chuẩn'];
    const sizes = template.sizes || ['M'];

    let variantCounter = 1;
    for (const color of colors) {
      for (const size of sizes) {
        // Tối đa 4 biến thể mỗi sản phẩm để tối ưu dữ liệu mẫu
        if (variants.length >= 4) break;

        const colorCode = generateSlug(color).substring(0, 3).toUpperCase();
        const sku = `SKU-${template.categoryCode}-${padNum}-V${variantCounter}-${colorCode}`;

        // Chênh lệch giá nhỏ giữa các biến thể
        const priceOffset = (variantCounter - 1) * 15000;
        const variantPrice = template.basePrice + priceOffset;
        const variantStock = Math.floor(Math.random() * 60) + 20; // 20 đến 80 cái

        variants.push({
          sku,
          color,
          size,
          price: variantPrice,
          stock: variantStock,
        });

        variantCounter++;
      }
      if (variants.length >= 4) break;
    }

    // Nếu không tạo được biến thể nào từ vòng lặp thì tạo biến thể mặc định
    if (variants.length === 0) {
      variants.push({
        sku: `SKU-${template.categoryCode}-${padNum}-STD`,
        color: 'Mặc định',
        size: 'Tiêu chuẩn',
        price: template.basePrice,
        stock: 50,
      });
    }

    const totalStock = variants.reduce((sum, v) => sum + v.stock, 0);
    const hasDiscount = itemNumber % 3 === 0; // 1/3 sản phẩm có giảm giá
    const salePrice = hasDiscount ? Math.round(template.basePrice * 0.85 / 1000) * 1000 : null;

    products.push({
      name: productName,
      slug: productSlug,
      description: `Mô tả chi tiết cho sản phẩm ${productName}. Thiết kế cao cấp, chất liệu bền đẹp, đáp ứng tiêu chuẩn chất lượng cao. Bảo hành chính hãng 12 tháng. Hỗ trợ đổi trả 1-1 trong 7 ngày nếu có lỗi từ nhà sản xuất.`,
      category: template.categoryName,
      price: template.basePrice,
      salePrice: salePrice,
      images: template.images,
      variants,
      stock: totalStock,
      ratingAverage: Number((4.0 + Math.random() * 1.0).toFixed(1)),
      reviewCount: Math.floor(Math.random() * 50) + 5,
      isActive: true,
    });
  }

  return products;
}

/**
 * Thực thi kết nối DB và Bơm dữ liệu
 */
async function seedDatabase() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ecommerce_db';
  console.log('🚀 Bắt đầu quá trình nạp dữ liệu mẫu (Seed Data)...');
  console.log(`🔗 Chuỗi kết nối MongoDB: ${mongoUri}`);

  try {
    await mongoose.connect(mongoUri);
    console.log('✅ Kết nối MongoDB thành công.');

    // 1. Xóa sạch dữ liệu cũ để tránh trùng lặp
    console.log('🧹 Đang dọn dẹp các bộ sưu tập Products & Inventory cũ...');
    const delProd = await Product.deleteMany({});
    const delInv = await Inventory.deleteMany({});
    console.log(`   - Đã dọn dẹp: ${delProd.deletedCount} sản phẩm cũ, ${delInv.deletedCount} bản ghi kho cũ.`);

    // 2. Tạo 100 sản phẩm mẫu
    console.log('📦 Đang sinh cấu trúc 100 sản phẩm mẫu có biến thể...');
    const rawProducts = build100Products();

    // 3. Bơm vào MongoDB (Product)
    console.log('⏳ Đang lưu 100 sản phẩm vào MongoDB...');
    const insertedProducts = await Product.insertMany(rawProducts);
    console.log(`🎉 Bơm thành công ${insertedProducts.length} sản phẩm vào bảng Product.`);

    // 4. Đồng bộ tồn kho sang bảng Inventory cho từng biến thể
    console.log('🔄 Đang đồng bộ hóa dữ liệu sang bảng Inventory để phục vụ Checkout Atomic & Concurrency...');
    const inventoryDocs = [];

    for (const prod of insertedProducts) {
      if (prod.variants && prod.variants.length > 0) {
        for (const variant of prod.variants) {
          inventoryDocs.push({
            product: prod._id,
            sku: variant.sku.toUpperCase().trim(),
            variantId: variant._id ? variant._id.toString() : null,
            stock: variant.stock,
            reservedStock: 0,
            lowStockThreshold: 5,
          });
        }
      } else {
        // Sản phẩm không có biến thể riêng -> dùng SKU chính
        inventoryDocs.push({
          product: prod._id,
          sku: `SKU-${prod.slug.substring(0, 10).toUpperCase()}`,
          variantId: null,
          stock: prod.stock,
          reservedStock: 0,
          lowStockThreshold: 5,
        });
      }
    }

    const insertedInventories = await Inventory.insertMany(inventoryDocs);
    console.log(`🎉 Đã tạo ${insertedInventories.length} bản ghi Tồn kho nguyên tử trong bảng Inventory.`);

    // 5. Thống kê tổng quan
    console.log('\n================ BÁO CÁO KẾT QUẢ SEED DATA ================');
    console.log(`✔️ Tổng số sản phẩm đã tạo: ${insertedProducts.length}`);
    console.log(`✔️ Tổng số bản ghi tồn kho tương ứng: ${insertedInventories.length}`);
    console.log('✔️ Tỷ lệ sản phẩm có giảm giá salePrice: ~33%');
    console.log('✔️ Tất cả SKU đều được đánh số chuẩn, đồng bộ giữa Product & Inventory');
    console.log('===========================================================\n');

    await mongoose.connection.close();
    console.log('👋 Đã đóng kết nối MongoDB an toàn.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi khi thực hiện seed dữ liệu:', error.message);
    if (error.writeErrors && error.writeErrors.length > 0) {
      console.error('   Chi tiết writeError đầu tiên:', error.writeErrors[0].err);
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
}

// Chạy trực tiếp nếu file được gọi bằng node
if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase, build100Products };
