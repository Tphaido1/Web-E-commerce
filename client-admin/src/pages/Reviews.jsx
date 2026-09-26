import { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Tag,
  Rate,
  Button,
  Space,
  Select,
  Card,
  Typography,
  message,
  Popconfirm,
  Badge,
  Tooltip,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SafetyCertificateOutlined,
  StarOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { reviewService } from '../services/reviewService.js';

const { Title, Text } = Typography;
const { Option } = Select;

function Reviews() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });

  const fetchReviews = useCallback(async (status = statusFilter, page = 1) => {
    setLoading(true);
    try {
      const data = await reviewService.list(status, page, pagination.pageSize);
      setReviews(data.reviews || []);
      setPagination((prev) => ({
        ...prev,
        current: page,
        total: data.pagination?.total || data.reviews?.length || 0,
      }));
    } catch {
      message.error('Không thể tải danh sách đánh giá');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, pagination.pageSize]);

  useEffect(() => {
    fetchReviews(statusFilter, 1);
  }, [statusFilter, fetchReviews]);

  const handleStatusChange = async (id, newStatus) => {
    try {
      await reviewService.updateStatus(id, newStatus);
      message.success(
        newStatus === 'approved'
          ? 'Đã duyệt hiển thị đánh giá'
          : 'Đã ẩn đánh giá khỏi giao diện người dùng'
      );
      fetchReviews(statusFilter, pagination.current);
    } catch {
      message.error('Thao tác cập nhật trạng thái thất bại');
    }
  };

  const columns = [
    {
      title: 'Sản phẩm',
      dataIndex: 'product',
      key: 'product',
      render: (product) => (
        <div>
          <Text strong>{product?.name || 'Sản phẩm không xác định'}</Text>
        </div>
      ),
    },
    {
      title: 'Người đánh giá',
      dataIndex: 'user',
      key: 'user',
      render: (user, record) => (
        <div>
          <div>{user?.email || 'Khách vãng lai'}</div>
          {record.isVerifiedPurchase ? (
            <Tooltip title="Đã mua hàng thực tế và hoàn tất đơn">
              <Tag color="success" icon={<SafetyCertificateOutlined />}>
                Đã mua hàng
              </Tag>
            </Tooltip>
          ) : (
            <Tag color="default">Chưa mua hàng</Tag>
          )}
        </div>
      ),
    },
    {
      title: 'Đánh giá',
      dataIndex: 'rating',
      key: 'rating',
      width: 160,
      render: (rating) => (
        <div>
          <Rate disabled defaultValue={rating} style={{ fontSize: 14 }} />
          <Text type="secondary" style={{ marginLeft: 6 }}>
            ({rating}/5)
          </Text>
        </div>
      ),
    },
    {
      title: 'Nội dung nhận xét',
      dataIndex: 'comment',
      key: 'comment',
      ellipsis: true,
      render: (text) => <Text>{text}</Text>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status) => {
        let color = 'default';
        let text = 'Chờ duyệt';
        if (status === 'approved') {
          color = 'green';
          text = 'Đã duyệt';
        } else if (status === 'rejected') {
          color = 'red';
          text = 'Đã từ chối / Ẩn';
        }
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: 'Thời gian',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
      render: (date) => (date ? new Date(date).toLocaleDateString('vi-VN') : '—'),
    },
    {
      title: 'Thao tác kiểm duyệt',
      key: 'action',
      width: 180,
      render: (_, record) => {
        const id = record._id || record.id;
        return (
          <Space orientation="horizontal" size="small">
            {record.status !== 'approved' && (
              <Button
                type="primary"
                size="small"
                icon={<CheckCircleOutlined />}
                onClick={() => handleStatusChange(id, 'approved')}
              >
                Duyệt
              </Button>
            )}
            {record.status !== 'rejected' && (
              <Popconfirm
                title="Ẩn đánh giá này?"
                description="Đánh giá bị ẩn sẽ không hiển thị trên trang sản phẩm."
                onConfirm={() => handleStatusChange(id, 'rejected')}
                okText="Đồng ý"
                cancelText="Hủy"
              >
                <Button danger size="small" icon={<CloseCircleOutlined />}>
                  Ẩn
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div className="reviews-page">
      <Card>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <Title level={4} style={{ margin: 0 }}>
              <StarOutlined style={{ color: '#faad14', marginRight: 8 }} />
              Kiểm duyệt Đánh giá & Phản hồi (Reviews Moderation)
            </Title>
            <Text type="secondary">
              Quản lý, kiểm duyệt phản hồi từ khách hàng, phân biệt đơn mua thực tế (Verified
              Purchase) và ngăn chặn spam.
            </Text>
          </div>

          <Space>
            <Select
              value={statusFilter}
              onChange={(value) => setStatusFilter(value)}
              style={{ width: 170 }}
              placeholder="Lọc theo trạng thái"
            >
              <Option value="">Tất cả trạng thái</Option>
              <Option value="pending">
                <Badge status="warning" text="Chờ duyệt" />
              </Option>
              <Option value="approved">
                <Badge status="success" text="Đã duyệt hiển thị" />
              </Option>
              <Option value="rejected">
                <Badge status="error" text="Đã ẩn / Từ chối" />
              </Option>
            </Select>

            <Button
              icon={<ReloadOutlined />}
              onClick={() => fetchReviews(statusFilter, pagination.current)}
            >
              Làm mới
            </Button>
          </Space>
        </div>

        <Table
          columns={columns}
          dataSource={reviews}
          rowKey={(r) => r._id || r.id}
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            onChange: (page) => fetchReviews(statusFilter, page),
          }}
        />
      </Card>
    </div>
  );
}

export default Reviews;
