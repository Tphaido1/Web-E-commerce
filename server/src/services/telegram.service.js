/**
 * telegram.service.js
 * ------------------------------------------------------------
 * Bot Telegram cho cửa hàng. Đặt tại: server/src/services/telegram.service.js
 *
 * TỰ ĐỘNG GỬI:   1) Đơn hàng mới   2) Đơn hàng đã thanh toán
 * LỆNH CHO BOT:  /thang [MM[/YYYY]]   /quy [Q[/YYYY]]   /nam [YYYY]   /help
 *
 *  - Thiếu token/chat id, hoặc NODE_ENV=test -> tự tắt, không gọi mạng.
 *  - Mọi lỗi đều được nuốt -> Telegram lỗi KHÔNG làm hỏng đơn hàng.
 *  - Chỉ nhận lệnh từ đúng TELEGRAM_CHAT_ID (người lạ nhắn bot sẽ bị bỏ qua).
 *  - Dữ liệu người dùng nhập luôn được escape HTML.
 *  - Bot nhận lệnh bằng long polling (không cần URL công khai).
 *    Mỗi token bot chỉ nên có MỘT server chạy polling tại một thời điểm.
 * Yêu cầu: Node >= 18 (có sẵn fetch), không cần cài thêm package.
 * ------------------------------------------------------------
 */

const AiNotifier = require('./ai-notifier.service');

const API = 'https://api.telegram.org';
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const COOLDOWN_MS = 3000;

const HELP = [
  '🤖 <b>Lệnh dashboard</b>',
  '/thang - tháng hiện tại (hoặc /thang 10, /thang 10/2026)',
  '/quy - quý hiện tại (hoặc /quy 3, /quy 3/2026)',
  '/nam - năm hiện tại (hoặc /nam 2025)',
].join('\n');

const COMMANDS = [
  { command: 'thang', description: 'Dashboard theo tháng' },
  { command: 'quy', description: 'Dashboard theo quý' },
  { command: 'nam', description: 'Dashboard theo năm' },
  { command: 'help', description: 'Hướng dẫn' },
];

let botRunning = false;
let lastCommandAt = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const warn = (...args) => console.warn(...args); // eslint-disable-line no-console

class TelegramService {
  static isEnabled() {
    return (
      process.env.NODE_ENV !== 'test' &&
      process.env.TELEGRAM_ENABLED !== 'false' &&
      Boolean(process.env.TELEGRAM_BOT_TOKEN) &&
      Boolean(process.env.TELEGRAM_CHAT_ID)
    );
  }

  static esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  static money(n) {
    return `${Number(n || 0).toLocaleString('vi-VN')}₫`;
  }

  /** Gọi 1 method của Bot API. KHÔNG throw -> { ok, status, result?, error? } */
  static async api(method, payload, timeoutMs = 5000) {
    try {
      const res = await fetch(`${API}/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) return { ok: false, status: res.status, error: data?.description };
      return { ok: true, status: res.status, result: data.result };
    } catch (err) {
      return { ok: false, status: 0, error: err.message };
    }
  }

  /** Gửi 1 tin nhắn (HTML) tới chat đã cấu hình. KHÔNG throw. */
  static async sendMessage(text) {
    if (!this.isEnabled()) return false;
    const r = await this.api('sendMessage', {
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: String(text).slice(0, 4096), // giới hạn của Telegram
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
    if (!r.ok) warn(`⚠️ [Telegram] sendMessage lỗi ${r.status}: ${r.error || ''}`);
    return r.ok;
  }

  // ------------------------------------------------------------
  // 1) + 2) THÔNG BÁO TỰ ĐỘNG
  // ------------------------------------------------------------

  /** Đơn hàng mới (kèm 1 câu nhận xét của AI nếu bật) */
  static async notifyNewOrder(order) {
    const o = order.toObject ? order.toObject() : order;
    const items = o.items || [];
    const lines = items
      .slice(0, 10)
      .map((i) => `• ${this.esc(i.name)} (${this.esc(i.sku)}) x${i.quantity}`)
      .join('\n');
    const more = items.length > 10 ? `\n… và ${items.length - 10} sản phẩm khác` : '';

    const text = [
      '🛒 <b>ĐƠN HÀNG MỚI</b>',
      `Mã đơn: <code>${this.esc(o.orderCode)}</code>`,
      `Khách: ${this.esc(o.shippingAddress?.fullName)} - ${this.esc(o.shippingAddress?.phone)}`,
      `Thanh toán: ${this.esc(o.paymentMethod)} (${this.esc(o.paymentStatus)})`,
      `Tổng tiền: <b>${this.money(o.finalAmount)}</b>`,
      '',
      lines + more,
    ];
    // Không gửi tên/SĐT cho model, chỉ số liệu tổng hợp
    const note = await AiNotifier.orderNote({
      amount: o.finalAmount,
      itemCount: items.reduce((n, i) => n + (i.quantity || 0), 0),
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      discount: o.discountAmount || 0,
    });
    if (note) text.push('', `🤖 ${this.esc(note)}`);
    return this.sendMessage(text.join('\n'));
  }

  /** Đơn hàng đã thanh toán */
  static notifyPaymentSuccess(order) {
    const o = order.toObject ? order.toObject() : order;
    return this.sendMessage(
      [
        '💳 <b>ĐƠN ĐÃ THANH TOÁN</b>',
        `Mã đơn: <code>${this.esc(o.orderCode)}</code>`,
        `Phương thức: ${this.esc(o.paymentMethod)}`,
        `Số tiền: <b>${this.money(o.finalAmount)}</b>`,
      ].join('\n')
    );
  }

  // ------------------------------------------------------------
  // 3) LỆNH DASHBOARD: /thang  /quy  /nam
  // ------------------------------------------------------------

  /**
   * Đổi lệnh + tham số thành khoảng thời gian theo giờ Việt Nam.
   * @returns {{label, start, end, prevStart}|null} null nếu tham số sai
   */
  static resolvePeriod(kind, arg) {
    const text = (arg || '').trim();
    const now = new Date(Date.now() + VN_OFFSET_MS);
    const curMonth = now.getUTCMonth();
    let year = now.getUTCFullYear();
    let firstMonth; // tháng bắt đầu (0-11)
    let span; // số tháng của kỳ
    let label;

    if (kind === 'nam') {
      if (text) {
        if (!/^\d{4}$/.test(text)) return null;
        year = Number(text);
      }
      firstMonth = 0;
      span = 12;
      label = `Năm ${year}`;
    } else if (kind === 'quy') {
      let quarter = Math.floor(curMonth / 3) + 1;
      if (text) {
        const m = text.match(/^([1-4])(?:[/-](\d{4}))?$/);
        if (!m) return null;
        quarter = Number(m[1]);
        if (m[2]) year = Number(m[2]);
      }
      firstMonth = (quarter - 1) * 3;
      span = 3;
      label = `Quý ${quarter}/${year}`;
    } else {
      let month = curMonth + 1;
      if (text) {
        const m = text.match(/^(\d{1,2})(?:[/-](\d{4}))?$/);
        if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) return null;
        month = Number(m[1]);
        if (m[2]) year = Number(m[2]);
      }
      firstMonth = month - 1;
      span = 1;
      label = `Tháng ${month}/${year}`;
    }
    if (year < 2000 || year > 2100) return null;

    // 00:00 ngày 1 của tháng m theo giờ VN (Date.UTC tự xử lý tháng âm/vượt 12)
    const startOf = (m) => Date.UTC(year, m, 1) - VN_OFFSET_MS;
    return {
      label,
      start: startOf(firstMonth),
      end: startOf(firstMonth + span),
      prevStart: startOf(firstMonth - span),
    };
  }

  /**
   * Số liệu 1 khoảng thời gian, dùng ĐÚNG quy tắc doanh thu của dashboard admin:
   * đơn không hủy và (đã thanh toán, hoặc COD đã giao); tiền hàng sau giảm giá, không tính phí ship.
   */
  static async periodStats(start, end) {
    const Order = require('../models/Order.model');
    const count = (cond) => ({ $sum: { $cond: [cond, 1, 0] } });
    const [r] = await Order.aggregate([
      { $match: { createdAt: { $gte: new Date(start), $lt: new Date(end) } } },
      {
        $set: {
          recognized: {
            $and: [
              { $ne: ['$status', 'cancelled'] },
              {
                $or: [
                  { $eq: ['$paymentStatus', 'paid'] },
                  {
                    $and: [
                      { $eq: ['$paymentMethod', 'COD'] },
                      { $eq: ['$status', 'delivered'] },
                      { $eq: ['$paymentStatus', 'unpaid'] },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        $set: {
          net: {
            $cond: [
              { $gt: ['$totalAmount', 0] },
              {
                $round: [
                  {
                    $multiply: [
                      { $sum: '$items.subtotal' },
                      {
                        $divide: [
                          { $max: [0, { $subtract: ['$totalAmount', { $ifNull: ['$discountAmount', 0] }] }] },
                          '$totalAmount',
                        ],
                      },
                    ],
                  },
                  0,
                ],
              },
              0,
            ],
          },
        },
      },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                orders: { $sum: 1 },
                revenue: { $sum: { $cond: ['$recognized', '$net', 0] } },
                paid: count('$recognized'),
                pending: count({ $eq: ['$status', 'pending'] }),
                delivered: count({ $eq: ['$status', 'delivered'] }),
                cancelled: count({ $eq: ['$status', 'cancelled'] }),
              },
            },
          ],
          top: [
            { $match: { recognized: true } },
            { $unwind: '$items' },
            { $group: { _id: '$items.name', qty: { $sum: '$items.quantity' } } },
            { $sort: { qty: -1 } },
            { $limit: 3 },
          ],
        },
      },
    ]);
    const t = r?.totals?.[0] || {};
    return {
      orders: t.orders || 0,
      revenue: t.revenue || 0,
      paid: t.paid || 0,
      pending: t.pending || 0,
      delivered: t.delivered || 0,
      cancelled: t.cancelled || 0,
      top: (r?.top || []).map((x) => ({ name: String(x._id || '').slice(0, 40), qty: x.qty })),
    };
  }

  static fmtDate(ms) {
    const d = new Date(ms + VN_OFFSET_MS);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  }

  /** Tạo & gửi báo cáo dashboard cho 1 kỳ */
  static async sendDashboard(kind, arg) {
    const period = this.resolvePeriod(kind, arg);
    if (!period) return this.sendMessage(`⚠️ Tham số không hợp lệ.\n\n${HELP}`);
    try {
      const [cur, prev] = await Promise.all([
        this.periodStats(period.start, period.end),
        this.periodStats(period.prevStart, period.start),
      ]);
      const growth = prev.revenue > 0 ? ((cur.revenue - prev.revenue) / prev.revenue) * 100 : null;
      const trend =
        growth === null
          ? `kỳ trước: ${this.money(prev.revenue)}`
          : `${growth >= 0 ? '▲' : '▼'} ${Math.abs(growth).toFixed(1)}% so với kỳ trước`;

      const lines = [
        `📊 <b>DASHBOARD ${this.esc(period.label.toUpperCase())}</b>`,
        `(${this.fmtDate(period.start)} - ${this.fmtDate(period.end - 1)})`,
        '',
        `Đơn hàng: <b>${cur.orders}</b> (đã giao: ${cur.delivered} · chờ xử lý: ${cur.pending} · hủy: ${cur.cancelled})`,
        `Đơn tính doanh thu: <b>${cur.paid}</b>`,
        `Doanh thu: <b>${this.money(cur.revenue)}</b> (${trend})`,
      ];
      if (cur.top.length) {
        lines.push('', '🏆 <b>Bán chạy:</b>');
        cur.top.forEach((p, i) => lines.push(`${i + 1}. ${this.esc(p.name)} - ${p.qty} sp`));
      }
      const comment = await AiNotifier.dashboardComment({
        period: period.label,
        current: cur,
        previous: { orders: prev.orders, revenue: prev.revenue },
        revenueGrowthPercent: growth === null ? null : Math.round(growth * 10) / 10,
      });
      if (comment) lines.push('', `🤖 ${this.esc(comment)}`);
      return this.sendMessage(lines.join('\n'));
    } catch (err) {
      warn('⚠️ [Telegram] Lỗi tạo dashboard:', err.message);
      return this.sendMessage('❌ Không lấy được số liệu, vui lòng thử lại sau.');
    }
  }

  // ------------------------------------------------------------
  // NHẬN LỆNH (long polling)
  // ------------------------------------------------------------

  static async handleUpdate(update) {
    const msg = update.message;
    if (!msg?.text) return null;
    // Chỉ phục vụ đúng chat đã cấu hình, bỏ qua người lạ
    if (String(msg.chat?.id) !== String(process.env.TELEGRAM_CHAT_ID)) return null;

    const m = msg.text.trim().match(/^\/(\w+)(?:@\w+)?(?:\s+(.+))?$/);
    if (!m) return null;
    const cmd = m[1].toLowerCase();

    if (cmd === 'start' || cmd === 'help') return this.sendMessage(HELP);
    if (!['thang', 'quy', 'nam'].includes(cmd)) return null;

    // Chống spam lệnh (mỗi lệnh truy vấn DB và gọi AI)
    const now = Date.now();
    if (now - lastCommandAt < COOLDOWN_MS) return this.sendMessage('⏳ Vui lòng chờ vài giây rồi thử lại.');
    lastCommandAt = now;
    return this.sendDashboard(cmd, m[2]);
  }

  /** Bật bot nhận lệnh. Gọi 1 lần sau khi server listen. KHÔNG throw. */
  static async startBot() {
    if (botRunning || !this.isEnabled() || process.env.TELEGRAM_POLLING === 'false') return;
    botRunning = true;

    await this.api('setMyCommands', { commands: COMMANDS }); // hiện menu lệnh trong Telegram

    // Bỏ qua các tin cũ tồn đọng trước lúc server bật
    let offset = 0;
    const last = await this.api('getUpdates', { offset: -1, timeout: 0 });
    if (last.ok && last.result.length) offset = last.result[last.result.length - 1].update_id + 1;

    // eslint-disable-next-line no-console
    console.log('🤖 [Telegram] Bot đang nhận lệnh /thang /quy /nam');
    (async () => {
      while (botRunning) {
        const r = await this.api('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] }, 35000);
        if (!r.ok) {
          // 409 = có server khác đang polling cùng token
          if (r.status === 409) warn('⚠️ [Telegram] 409: có nơi khác đang chạy bot với cùng token (local/Render?)');
          else warn(`⚠️ [Telegram] getUpdates lỗi ${r.status}: ${r.error || ''}`);
          await sleep(r.status === 409 ? 30000 : 5000);
          continue;
        }
        for (const update of r.result) {
          offset = update.update_id + 1;
          await this.handleUpdate(update).catch((err) => warn('⚠️ [Telegram] Lỗi xử lý lệnh:', err.message));
        }
      }
    })();
  }

  static stopBot() {
    botRunning = false;
  }
}

module.exports = TelegramService;
