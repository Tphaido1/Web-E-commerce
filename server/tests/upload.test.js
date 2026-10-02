const uploadService = require('../src/services/upload.service');

describe('UploadService (Cloudinary Integration Tests)', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
  });

  describe('1. Validation checks', () => {
    test('Ném lỗi nếu tải lên buffer không hợp lệ', async () => {
      await expect(uploadService.uploadFromBuffer(null)).rejects.toThrow(
        'Dữ liệu tải lên không hợp lệ, yêu cầu một Buffer tệp ảnh'
      );
      await expect(uploadService.uploadFromBuffer('not a buffer')).rejects.toThrow(
        'Dữ liệu tải lên không hợp lệ, yêu cầu một Buffer tệp ảnh'
      );
    });

    test('Ném lỗi nếu filePath rỗng hoặc không đúng định dạng', async () => {
      await expect(uploadService.uploadFromFile(null)).rejects.toThrow('Đường dẫn tệp cục bộ không hợp lệ');
      await expect(uploadService.uploadFromFile(12345)).rejects.toThrow('Đường dẫn tệp cục bộ không hợp lệ');
    });

    test('Ném lỗi nếu deleteImage không nhận publicId', async () => {
      await expect(uploadService.deleteImage('')).rejects.toThrow(
        'Mã publicId của ảnh là bắt buộc để thực hiện xóa'
      );
    });
  });

  describe('2. Upload Buffer functionality', () => {
    test('Upload thành công từ Buffer với folder chỉ định', async () => {
      const sampleBuffer = Buffer.from('fake-image-bytes-content-for-testing');
      const result = await uploadService.uploadFromBuffer(sampleBuffer, {
        folder: 'ecommerce/products',
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.publicId).toContain('ecommerce/products');
      expect(result.secureUrl).toBeDefined();
      expect(result.format).toBe('webp');
    });
  });

  describe('3. Upload Local File functionality', () => {
    test('Upload thành công từ file path', async () => {
      const result = await uploadService.uploadFromFile('temp/sample-image.jpg', {
        folder: 'ecommerce/banners',
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.publicId).toContain('ecommerce/banners');
      expect(result.secureUrl).toBeDefined();
    });
  });

  describe('4. Deletion functionality', () => {
    test('Xóa ảnh đơn lẻ thành công', async () => {
      const result = await uploadService.deleteImage('ecommerce/products/mock_123');
      expect(result.success).toBe(true);
      expect(result.publicId).toBe('ecommerce/products/mock_123');
    });

    test('Xóa danh sách nhiều ảnh thành công', async () => {
      const ids = ['ecommerce/products/img1', 'ecommerce/products/img2'];
      const result = await uploadService.deleteMultipleImages(ids);

      expect(result.success).toBe(true);
      expect(result.deleted).toBeDefined();
      expect(result.deleted['ecommerce/products/img1']).toBe('deleted');
      expect(result.deleted['ecommerce/products/img2']).toBe('deleted');
    });

    test('Xóa danh sách rỗng trả về đối tượng deleted rỗng an toàn', async () => {
      const result = await uploadService.deleteMultipleImages([]);
      expect(result.success).toBe(true);
      expect(result.deleted).toEqual({});
    });
  });

  describe('5. Optimized URL Generation', () => {
    test('Sinh URL tối ưu responsive auto WebP', () => {
      const url = uploadService.getOptimizedUrl('ecommerce/products/sample_product_1', {
        width: 600,
        height: 600,
        crop: 'fill',
      });

      expect(url).toBeDefined();
      expect(url).toContain('cloudinary.com');
      expect(url).toContain('sample_product_1');
    });

    test('Trả về chuỗi rỗng nếu publicId rỗng', () => {
      const url = uploadService.getOptimizedUrl('');
      expect(url).toBe('');
    });
  });
});
