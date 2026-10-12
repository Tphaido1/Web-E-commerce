import api from './api.js';

export const reportService = {
  /**
   * Tải file báo cáo đơn hàng Excel (.xlsx)
   */
  downloadOrdersExcel: async (params = {}) => {
    const response = await api.get('/reports/orders/excel', {
      params,
      responseType: 'blob',
    });

    const blob = new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `Bao_Cao_Don_Hang_NovaFashion_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
  },

  /**
   * Tải hoặc mở hóa đơn bán lẻ PDF
   */
  downloadOrderInvoicePdf: async (orderId, orderCode = '') => {
    const response = await api.get(`/reports/orders/${orderId}/invoice-pdf`, {
      responseType: 'blob',
    });

    const blob = new Blob([response.data], { type: 'application/pdf' });
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `Hoa_Don_${orderCode || orderId}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
  },
};
