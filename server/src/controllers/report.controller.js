/**
 * report.controller.js
 * ------------------------------------------------------------
 * Module xuất báo cáo tài chính, doanh thu và đơn hàng cho Single Shop (Nova Fashion):
 * 1. Xuất báo cáo đơn hàng Excel (.xlsx) đa sheet (exceljs)
 * 2. Xuất báo cáo doanh thu tổng hợp Excel (.xlsx)
 * 3. Xuất hóa đơn bán lẻ PDF kèm mã QR tra cứu (pdfkit + qrcode)
 * ------------------------------------------------------------
 */

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const Order = require('../models/Order.model');
const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/apiResponse');

const STATUS_MAP = {
  pending: 'Chờ xác nhận',
  processing: 'Đang xử lý',
  shipping: 'Đang giao hàng',
  delivered: 'Đã giao hàng',
  cancelled: 'Đã hủy',
};

const PAYMENT_STATUS_MAP = {
  unpaid: 'Chưa thanh toán',
  paid: 'Đã thanh toán',
  failed: 'Thất bại',
  refunded: 'Hoàn tiền',
};

/**
 * 1. Xuất danh sách đơn hàng ra file Excel (.xlsx)
 * GET /api/v1/reports/orders/excel
 */
exports.exportOrdersExcel = catchAsync(async (req, res) => {
  const { startDate, endDate, status, paymentStatus } = req.query;

  const query = {};
  if (status) query.status = status;
  if (paymentStatus) query.paymentStatus = paymentStatus;
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  const orders = await Order.find(query)
    .populate('user', 'email')
    .sort({ createdAt: -1 })
    .lean();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Nova Fashion Admin';
  workbook.created = new Date();

  // ==========================================
  // SHEET 1: DANH SÁCH ĐƠN HÀNG CHI TIẾT
  // ==========================================
  const sheetOrders = workbook.addWorksheet('Danh Sách Đơn Hàng', {
    pageSetup: { paperSize: 9, orientation: 'landscape' },
  });

  sheetOrders.columns = [
    { header: 'STT', key: 'stt', width: 6 },
    { header: 'Mã đơn hàng', key: 'orderCode', width: 18 },
    { header: 'Ngày đặt', key: 'createdAt', width: 18 },
    { header: 'Khách hàng', key: 'customerName', width: 22 },
    { header: 'Số điện thoại', key: 'phone', width: 15 },
    { header: 'Địa chỉ giao hàng', key: 'address', width: 35 },
    { header: 'Chi tiết sản phẩm (SKU)', key: 'items', width: 35 },
    { header: 'Số lượng SP', key: 'totalQty', width: 12 },
    { header: 'Hình thức TT', key: 'paymentMethod', width: 14 },
    { header: 'Trạng thái TT', key: 'paymentStatus', width: 16 },
    { header: 'Trạng thái đơn', key: 'status', width: 16 },
    { header: 'Tiền hàng', key: 'totalAmount', width: 15 },
    { header: 'Giảm giá', key: 'discountAmount', width: 14 },
    { header: 'Phí ship', key: 'shippingFee', width: 14 },
    { header: 'Tổng thanh toán', key: 'finalAmount', width: 18 },
  ];

  // Định dạng Header row
  const headerRow = sheetOrders.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF182E28' }, // Tone màu thương hiệu Nova Fashion
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Ghi dữ liệu từng dòng
  orders.forEach((order, index) => {
    const itemsDetail = (order.items || [])
      .map((it) => `${it.name} (${it.sku}) x${it.quantity}`)
      .join('; ');
    const totalQty = (order.items || []).reduce((sum, it) => sum + (it.quantity || 0), 0);

    const fullAddr = [
      order.shippingAddress?.address,
      order.shippingAddress?.ward,
      order.shippingAddress?.district,
      order.shippingAddress?.city,
    ].filter(Boolean).join(', ');

    const row = sheetOrders.addRow({
      stt: index + 1,
      orderCode: order.orderCode,
      createdAt: order.createdAt ? new Date(order.createdAt).toLocaleString('vi-VN') : '',
      customerName: order.shippingAddress?.fullName || 'Khách hàng',
      phone: order.shippingAddress?.phone || '',
      address: fullAddr,
      items: itemsDetail,
      totalQty,
      paymentMethod: order.paymentMethod,
      paymentStatus: PAYMENT_STATUS_MAP[order.paymentStatus] || order.paymentStatus,
      status: STATUS_MAP[order.status] || order.status,
      totalAmount: order.totalAmount || 0,
      discountAmount: order.discountAmount || 0,
      shippingFee: order.shippingFee || 0,
      finalAmount: order.finalAmount || 0,
    });

    // Căn chỉnh và định dạng số
    row.getCell('stt').alignment = { horizontal: 'center' };
    row.getCell('orderCode').alignment = { horizontal: 'center' };
    row.getCell('totalQty').alignment = { horizontal: 'center' };
    row.getCell('paymentMethod').alignment = { horizontal: 'center' };
    row.getCell('paymentStatus').alignment = { horizontal: 'center' };
    row.getCell('status').alignment = { horizontal: 'center' };

    ['totalAmount', 'discountAmount', 'shippingFee', 'finalAmount'].forEach((key) => {
      row.getCell(key).numFmt = '#,##0 "đ"';
      row.getCell(key).alignment = { horizontal: 'right' };
    });
  });

  // ==========================================
  // SHEET 2: TỔNG HỢP DOANH THU & KINH DOANH
  // ==========================================
  const sheetSummary = workbook.addWorksheet('Tổng Hợp Doanh Thu');
  sheetSummary.views = [{ showGridLines: true }];

  // Tiêu đề báo cáo
  sheetSummary.mergeCells('A1:D1');
  const titleCell = sheetSummary.getCell('A1');
  titleCell.value = 'NOVA FASHION - BÁO CÁO TỔNG HỢP KINH DOANH';
  titleCell.font = { bold: true, size: 16, color: { argb: 'FF182E28' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheetSummary.getRow(1).height = 35;

  const totalOrders = orders.length;
  const paidOrders = orders.filter((o) => o.paymentStatus === 'paid');
  const deliveredOrders = orders.filter((o) => o.status === 'delivered');
  const totalRevenue = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + (o.finalAmount || 0), 0);
  const totalRealizedRevenue = paidOrders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + (o.finalAmount || 0), 0);
  const totalDiscount = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + (o.discountAmount || 0), 0);
  const averageOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  sheetSummary.addRow([]);
  sheetSummary.addRow(['CHỈ SỐ TỔNG QUAN', 'GIÁ TRỊ']);
  sheetSummary.getRow(3).font = { bold: true };

  const summaryData = [
    ['Tổng số đơn hàng:', totalOrders],
    ['Đơn hàng đã thanh toán thành công:', paidOrders.length],
    ['Đơn hàng đã giao thành công:', deliveredOrders.length],
    ['Tổng doanh thu kỳ báo cáo:', totalRevenue],
    ['Doanh thu thực nhận (Đã TT):', totalRealizedRevenue],
    ['Tổng giá trị voucher đã áp dụng:', totalDiscount],
    ['Giá trị trung bình đơn hàng (AOV):', averageOrderValue],
  ];

  summaryData.forEach(([label, val]) => {
    const r = sheetSummary.addRow([label, val]);
    if (typeof val === 'number' && val > 1000) {
      r.getCell(2).numFmt = '#,##0 "đ"';
    }
  });

  sheetSummary.getColumn(1).width = 38;
  sheetSummary.getColumn(2).width = 25;

  const filename = `Bao_Cao_Don_Hang_NovaFashion_${Date.now()}.xlsx`;
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  await workbook.xlsx.write(res);
  res.end();
});

/**
 * 2. Xuất hóa đơn bán lẻ PDF kèm mã QR tra cứu đơn hàng
 * GET /api/v1/reports/orders/:id/invoice-pdf
 */
exports.exportOrderInvoicePdf = catchAsync(async (req, res) => {
  const { id } = req.params;

  const order = await Order.findById(id).lean();
  if (!order) {
    return ApiResponse.error(res, 404, 'Không tìm thấy đơn hàng để xuất hóa đơn');
  }

  // Phân quyền: Admin được xuất mọi đơn, Customer chỉ được xuất đơn của chính mình
  if (req.user.role !== 'admin' && String(order.user) !== String(req.user._id)) {
    return ApiResponse.error(res, 403, 'Bạn không có quyền truy cập hóa đơn này');
  }

  // Khởi tạo PDF document
  const doc = new PDFDocument({ margin: 40, size: 'A4' });

  const filename = `Hoa_Don_${order.orderCode}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

  doc.pipe(res);

  // Tạo QR Code cho tra cứu đơn hàng
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const trackingUrl = `${clientUrl}/track-order?code=${order.orderCode}`;
  let qrBuffer = null;
  try {
    qrBuffer = await QRCode.toBuffer(trackingUrl, { width: 90, margin: 1 });
  } catch {
    qrBuffer = null;
  }

  // --- HEADER THƯƠNG HIỆU ---
  doc.fontSize(20).font('Helvetica-Bold').fillColor('#182e28').text('NOVA FASHION', 40, 40);
  doc.fontSize(9).font('Helvetica').fillColor('#555555')
    .text('Cửa hàng thời trang & may mặc chuẩn form', 40, 65)
    .text('Hotline: 1900 1234 | Email: support@novafashion.vn | Web: novafashion.vn', 40, 78);

  // Nhúng QR Code góc phải
  if (qrBuffer) {
    doc.image(qrBuffer, 465, 35, { width: 85 });
    doc.fontSize(7).fillColor('#888888').text('Quét mã tra cứu đơn', 465, 125, { width: 85, align: 'center' });
  }

  doc.moveTo(40, 140).lineTo(555, 140).strokeColor('#e0e0e0').stroke();

  // --- THÔNG TIN HÓA ĐƠN ---
  doc.fontSize(14).font('Helvetica-Bold').fillColor('#182e28').text('HÓA ĐƠN BÁN HÀNG', 40, 155);

  doc.fontSize(9).font('Helvetica').fillColor('#333333');
  doc.text(`Mã đơn hàng: ${order.orderCode}`, 40, 175);
  doc.text(`Ngày đặt hàng: ${order.createdAt ? new Date(order.createdAt).toLocaleString('vi-VN') : ''}`, 40, 190);
  doc.text(`Hình thức thanh toán: ${order.paymentMethod} (${PAYMENT_STATUS_MAP[order.paymentStatus] || order.paymentStatus})`, 40, 205);
  doc.text(`Trạng thái đơn: ${STATUS_MAP[order.status] || order.status}`, 40, 220);

  // Thông tin người nhận
  const addr = [
    order.shippingAddress?.address,
    order.shippingAddress?.ward,
    order.shippingAddress?.district,
    order.shippingAddress?.city,
  ].filter(Boolean).join(', ');

  doc.font('Helvetica-Bold').text('Người nhận hàng:', 300, 175);
  doc.font('Helvetica')
    .text(`${order.shippingAddress?.fullName || 'Khách hàng'}`, 300, 190)
    .text(`SĐT: ${order.shippingAddress?.phone || '—'}`, 300, 205)
    .text(`Địa chỉ: ${addr}`, 300, 220, { width: 250 });

  doc.moveTo(40, 255).lineTo(555, 255).strokeColor('#e0e0e0').stroke();

  // --- BẢNG SẢN PHẨM ---
  let y = 270;
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#182e28');
  doc.text('STT', 40, y);
  doc.text('Tên sản phẩm & SKU', 75, y);
  doc.text('Đơn giá', 340, y, { width: 65, align: 'right' });
  doc.text('SL', 415, y, { width: 30, align: 'center' });
  doc.text('Thành tiền', 455, y, { width: 95, align: 'right' });

  doc.moveTo(40, y + 15).lineTo(555, y + 15).strokeColor('#182e28').stroke();
  y += 22;

  doc.font('Helvetica').fontSize(9).fillColor('#333333');
  (order.items || []).forEach((item, idx) => {
    const subtotal = item.subtotal || (item.price * item.quantity);
    doc.text(String(idx + 1), 40, y);
    doc.text(`${item.name} (${item.sku})`, 75, y, { width: 255 });
    doc.text(`${Number(item.price || 0).toLocaleString('vi-VN')} đ`, 340, y, { width: 65, align: 'right' });
    doc.text(String(item.quantity || 1), 415, y, { width: 30, align: 'center' });
    doc.text(`${Number(subtotal).toLocaleString('vi-VN')} đ`, 455, y, { width: 95, align: 'right' });
    y += 20;
  });

  doc.moveTo(40, y + 5).lineTo(555, y + 5).strokeColor('#e0e0e0').stroke();
  y += 15;

  // --- TỔNG KẾT THANH TOÁN ---
  const formatVND = (v) => `${Number(v || 0).toLocaleString('vi-VN')} đ`;

  doc.font('Helvetica').fontSize(9).fillColor('#444444');
  doc.text('Tạm tính:', 340, y, { width: 100, align: 'right' });
  doc.text(formatVND(order.totalAmount), 455, y, { width: 95, align: 'right' });
  y += 16;

  if (order.discountAmount > 0) {
    const couponNote = order.coupon?.code ? ` (${order.coupon.code})` : '';
    doc.text(`Giảm giá voucher${couponNote}:`, 300, y, { width: 140, align: 'right' });
    doc.text(`-${formatVND(order.discountAmount)}`, 455, y, { width: 95, align: 'right' });
    y += 16;
  }

  doc.text('Phí vận chuyển:', 340, y, { width: 100, align: 'right' });
  doc.text(formatVND(order.shippingFee), 455, y, { width: 95, align: 'right' });
  y += 20;

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#182e28');
  doc.text('TỔNG THANH TOÁN:', 300, y, { width: 140, align: 'right' });
  doc.text(formatVND(order.finalAmount), 455, y, { width: 95, align: 'right' });

  // --- FOOTER LỜI CẢM ƠN ---
  const pageBottom = doc.page.height - 70;
  doc.moveTo(40, pageBottom).lineTo(555, pageBottom).strokeColor('#eeeeee').stroke();
  doc.font('Helvetica-Oblique').fontSize(8).fillColor('#777777')
    .text('Cảm ơn quý khách đã tin tưởng mua sắm tại Nova Fashion!', 40, pageBottom + 10, { align: 'center' })
    .text('Quý khách vui lòng kiểm tra sản phẩm trước khi thanh toán. Hỗ trợ đổi size miễn phí trong 7 ngày.', 40, pageBottom + 22, { align: 'center' });

  doc.end();
});
