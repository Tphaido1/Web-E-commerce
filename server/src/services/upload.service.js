/**
 * upload.service.js
 * --------------------------------------------------------------------------
 * Dịch vụ tích hợp Cloudinary API để xử lý tải lên (upload), tối ưu hóa và quản lý ảnh.
 * Phục vụ nhu cầu tải ảnh sản phẩm, ảnh đại diện, banner cho Admin và Storefront.
 *
 * Tính năng chính:
 * 1. Upload ảnh trực tiếp từ Buffer (dùng cho Multer memoryStorage).
 * 2. Upload ảnh từ đường dẫn tệp cục bộ (file path).
 * 3. Xóa ảnh đơn lẻ hoặc hàng loạt dựa trên publicId.
 * 4. Tạo URL ảnh tối ưu (Dynamic Transformation: auto WebP, crop, resize).
 * 5. Cơ chế Fallback an toàn khi chưa cấu hình API Key (không làm crash server).
 * --------------------------------------------------------------------------
 */

const cloudinary = require('cloudinary').v2;
const streamifier = require('stream');

class UploadService {
  constructor() {
    this.isConfigured = false;
    this.initCloudinary();
  }

  /**
   * Khởi tạo cấu hình Cloudinary từ biến môi trường
   */
  initCloudinary() {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY || process.env.API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET || process.env.API_SECRET;

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      this.isConfigured = true;
    } else {
      // Cấu hình tạm để không crash khi khởi động, các phương thức sẽ kiểm tra cờ isConfigured
      cloudinary.config({
        cloud_name: cloudName || 'demo_cloud',
        api_key: apiKey || 'demo_key',
        api_secret: apiSecret || 'demo_secret',
        secure: true,
      });
      this.isConfigured = Boolean(cloudName && apiKey && apiSecret);
    }
  }

  /**
   * Tải ảnh lên Cloudinary từ Buffer trong bộ nhớ (Buffer Stream)
   * Phù hợp với Multer MemoryStorage
   * @param {Buffer} buffer - Buffer của tệp ảnh
   * @param {object} options - Các tùy chọn upload (folder, public_id, tags...)
   * @returns {Promise<{ success: boolean, publicId: string, url: string, secureUrl: string, width: number, height: number, format: string }>}
   */
  async uploadFromBuffer(buffer, options = {}) {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw new Error('Dữ liệu tải lên không hợp lệ, yêu cầu một Buffer tệp ảnh');
    }

    const defaultOptions = {
      folder: options.folder || 'ecommerce/products',
      resource_type: 'image',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'avif'],
      transformation: options.transformation || [{ quality: 'auto:good' }, { fetch_format: 'auto' }],
    };

    const uploadOptions = { ...defaultOptions, ...options };

    // Nếu môi trường mock hoặc chưa có Cloudinary Key, trả về dữ liệu mẫu an toàn
    if (!this.isConfigured && process.env.NODE_ENV === 'test') {
      const mockId = `mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      return {
        success: true,
        publicId: `${uploadOptions.folder}/${mockId}`,
        url: `http://res.cloudinary.com/demo/image/upload/${uploadOptions.folder}/${mockId}.webp`,
        secureUrl: `https://res.cloudinary.com/demo/image/upload/${uploadOptions.folder}/${mockId}.webp`,
        width: 800,
        height: 800,
        format: 'webp',
        bytes: buffer.length,
      };
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
        if (error) {
          return reject(new Error(`Lỗi tải ảnh lên Cloudinary: ${error.message}`));
        }
        resolve({
          success: true,
          publicId: result.public_id,
          url: result.url,
          secureUrl: result.secure_url,
          width: result.width,
          height: result.height,
          format: result.format,
          bytes: result.bytes,
        });
      });

      const bufferStream = new streamifier.PassThrough();
      bufferStream.end(buffer);
      bufferStream.pipe(uploadStream);
    });
  }

  /**
   * Tải ảnh lên Cloudinary từ đường dẫn tệp cục bộ (Local File Path)
   * @param {string} filePath - Đường dẫn tệp trên ổ cứng
   * @param {object} options - Các tùy chọn bổ sung
   * @returns {Promise<{ success: boolean, publicId: string, secureUrl: string }>}
   */
  async uploadFromFile(filePath, options = {}) {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Đường dẫn tệp cục bộ không hợp lệ');
    }

    const uploadOptions = {
      folder: options.folder || 'ecommerce/products',
      resource_type: 'image',
      ...options,
    };

    if (!this.isConfigured && process.env.NODE_ENV === 'test') {
      const mockId = `mock_file_${Date.now()}`;
      return {
        success: true,
        publicId: `${uploadOptions.folder}/${mockId}`,
        url: `http://res.cloudinary.com/demo/image/upload/${uploadOptions.folder}/${mockId}.jpg`,
        secureUrl: `https://res.cloudinary.com/demo/image/upload/${uploadOptions.folder}/${mockId}.jpg`,
        width: 1200,
        height: 800,
        format: 'jpg',
      };
    }

    try {
      const result = await cloudinary.uploader.upload(filePath, uploadOptions);
      return {
        success: true,
        publicId: result.public_id,
        url: result.url,
        secureUrl: result.secure_url,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
      };
    } catch (error) {
      throw new Error(`Lỗi upload tệp cục bộ lên Cloudinary: ${error.message}`);
    }
  }

  /**
   * Xóa một ảnh trên Cloudinary bằng publicId
   * @param {string} publicId - Mã định danh công khai của ảnh trên Cloudinary
   * @returns {Promise<{ success: boolean, result: string }>}
   */
  async deleteImage(publicId) {
    if (!publicId) {
      throw new Error('Mã publicId của ảnh là bắt buộc để thực hiện xóa');
    }

    if (!this.isConfigured && process.env.NODE_ENV === 'test') {
      return { success: true, result: 'ok', publicId };
    }

    try {
      const res = await cloudinary.uploader.destroy(publicId);
      return {
        success: res.result === 'ok',
        result: res.result,
        publicId,
      };
    } catch (error) {
      throw new Error(`Lỗi khi xóa ảnh trên Cloudinary (${publicId}): ${error.message}`);
    }
  }

  /**
   * Xóa hàng loạt ảnh dựa trên danh sách publicIds
   * @param {string[]} publicIds - Danh sách các publicId cần xóa
   * @returns {Promise<{ success: boolean, deleted: object }>}
   */
  async deleteMultipleImages(publicIds = []) {
    if (!Array.isArray(publicIds) || publicIds.length === 0) {
      return { success: true, deleted: {} };
    }

    if (!this.isConfigured && process.env.NODE_ENV === 'test') {
      const mockDeleted = {};
      publicIds.forEach((id) => {
        mockDeleted[id] = 'deleted';
      });
      return { success: true, deleted: mockDeleted };
    }

    try {
      const res = await cloudinary.api.delete_resources(publicIds);
      return {
        success: true,
        deleted: res.deleted,
      };
    } catch (error) {
      throw new Error(`Lỗi khi xóa hàng loạt ảnh: ${error.message}`);
    }
  }

  /**
   * Tạo URL ảnh tối ưu tự động (Auto WebP/AVIF, Responsive Resize, Thumbnail Crop)
   * Không tốn bandwidth tải lại ảnh gốc
   * @param {string} publicId - Public ID của ảnh
   * @param {object} transformOptions - { width, height, crop, quality, format }
   * @returns {string} Cloudinary URL đã gắn biến đổi
   */
  getOptimizedUrl(publicId, transformOptions = {}) {
    if (!publicId) return '';

    const defaultTransforms = {
      quality: 'auto',
      fetch_format: 'auto',
      crop: transformOptions.crop || 'limit',
      ...(transformOptions.width && { width: transformOptions.width }),
      ...(transformOptions.height && { height: transformOptions.height }),
    };

    return cloudinary.url(publicId, {
      secure: true,
      transformation: [defaultTransforms],
    });
  }
}

module.exports = new UploadService();
