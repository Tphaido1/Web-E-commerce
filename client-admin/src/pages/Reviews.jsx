import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  Popconfirm,
  Rate,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  StarOutlined,
} from '@ant-design/icons';
import { authService } from '../services/authService.js';
import { reviewService } from '../services/reviewService.js';

const statusLabels = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt hiển thị',
  rejected: 'Đã ẩn / Từ chối',
};

const getErrorMessage = (error) => (
  error.response?.data?.message || error.message || 'Không thể hoàn tất yêu cầu đánh giá.'
);

function Reviews() {
  const role = authService.getSession()?.user?.role;
  const canModerate = role === 'admin';
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState();
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [reload, setReload] = useState(0);
  const [updatingReviewId, setUpdatingReviewId] = useState(null);
  const [updateError, setUpdateError] = useState('');

  const loadReviews = useCallback(async (signal) => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await reviewService.list(
        statusFilter || '',
        pagination.current,
        pagination.pageSize,
        { signal },
      );
      setReviews(data.reviews);
      setPagination((current) => ({
        ...current,
        current: data.pagination.page,
        pageSize: data.pagination.limit,
        total: data.pagination.total,
      }));
    } catch (error) {
      if (!signal.aborted) setLoadError(getErrorMessage(error));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [statusFilter, pagination.current, pagination.pageSize]);

  useEffect(() => {
    const controller = new AbortController();
    loadReviews(controller.signal);
    return () => controller.abort();
  }, [loadReviews, reload]);

  const changeStatus = async (review, status) => {
    if (updatingReviewId) return;
    setUpdatingReviewId(review._id);
    setUpdateError('');
    try {
      await reviewService.updateStatus(review._id, status);
      message.success(
        status === 'approved'
          ? 'Đã duyệt hiển thị đánh giá'
          : 'Đã ẩn đánh giá khỏi giao diện người dùng',
      );
      setReload((current) => current + 1);
    } catch (error) {
      setUpdateError(getErrorMessage(error));
    } finally {
      setUpdatingReviewId(null);
    }
  };

  const columns = useMemo(() => [
    {
      title: 'Sản phẩm',
      dataIndex: 'product',
      key: 'product',
      render: (product) => (
        <div>
          <Typography.Text strong>{product?.name || 'Sản phẩm không xác định'}</Typography.Text>
        </div>
      ),
    },
    {
      title: 'Người đánh giá',
      dataIndex: 'user',
      key: 'user',
      render: (user, review) => (
        <div>
          <div>{user?.email || 'Khách vãng lai'}</div>
          {review.isVerifiedPurchase ? (
            <Tooltip title="Đã mua hàng thực tế và hoàn tất đơn">
              <Tag color="success" icon={<SafetyCertificateOutlined />}>Đã mua hàng</Tag>
            </Tooltip>
          ) : <Tag>Chưa mua hàng</Tag>}
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
          <Rate disabled value={rating} style={{ fontSize: 14 }} />
          <Typography.Text type="secondary" style={{ marginLeft: 6 }}>({rating}/5)</Typography.Text>
        </div>
      ),
    },
    {
      title: 'Nội dung nhận xét',
      dataIndex: 'comment',
      key: 'comment',
      ellipsis: true,
      render: (comment) => <Typography.Text>{comment}</Typography.Text>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (status) => {
        const color = status === 'approved' ? 'green' : status === 'rejected' ? 'red' : 'gold';
        return <Tag color={color}>{statusLabels[status] || status}</Tag>;
      },
    },
    {
      title: 'Thời gian',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
      render: (date) => (date ? new Date(date).toLocaleDateString('vi-VN') : '—'),
    },
    ...(canModerate
      ? [{
        title: 'Thao tác kiểm duyệt',
        key: 'action',
        width: 190,
        render: (_, review) => (
          <Space size="small">
            {review.status !== 'approved' && (
              <Popconfirm
                title="Duyệt đánh giá này?"
                onConfirm={() => changeStatus(review, 'approved')}
                okText="Duyệt"
                cancelText="Hủy"
                disabled={Boolean(updatingReviewId)}
              >
                <Button
                  type="primary"
                  size="small"
                  icon={<CheckCircleOutlined />}
                  loading={updatingReviewId === review._id}
                  disabled={Boolean(updatingReviewId)}
                >
                  Duyệt
                </Button>
              </Popconfirm>
            )}
            {review.status !== 'rejected' && (
              <Popconfirm
                title="Ẩn đánh giá này?"
                description="Đánh giá bị ẩn sẽ không hiển thị trên trang sản phẩm."
                onConfirm={() => changeStatus(review, 'rejected')}
                okText="Đồng ý"
                cancelText="Hủy"
                disabled={Boolean(updatingReviewId)}
              >
                <Button
                  danger
                  size="small"
                  icon={<CloseCircleOutlined />}
                  loading={updatingReviewId === review._id}
                  disabled={Boolean(updatingReviewId)}
                >
                  Ẩn
                </Button>
              </Popconfirm>
            )}
          </Space>
        ),
      }]
      : []),
  ], [canModerate, updatingReviewId]);

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
            <Typography.Title level={4} style={{ margin: 0 }}>
              <StarOutlined style={{ color: '#faad14', marginRight: 8 }} />
              Kiểm duyệt Đánh giá & Phản hồi (Reviews Moderation)
            </Typography.Title>
            <Typography.Text type="secondary">
              Quản lý phản hồi từ khách hàng, bao gồm trạng thái đã mua hàng thực tế.
              {canModerate ? '' : ' Bạn có quyền xem nhưng không có quyền kiểm duyệt.'}
            </Typography.Text>
          </div>
          <Space>
            <Select
              allowClear
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value);
                setPagination((current) => ({ ...current, current: 1 }));
              }}
              style={{ width: 190 }}
              placeholder="Lọc theo trạng thái"
              options={[
                { value: 'pending', label: <Badge status="warning" text="Chờ duyệt" /> },
                { value: 'approved', label: <Badge status="success" text="Đã duyệt hiển thị" /> },
                { value: 'rejected', label: <Badge status="error" text="Đã ẩn / Từ chối" /> },
              ]}
            />
            <Button
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={() => setReload((current) => current + 1)}
            >
              Làm mới
            </Button>
          </Space>
        </div>

        {loadError && (
          <Alert
            type="error"
            showIcon
            message={loadError}
            action={<Button size="small" onClick={() => setReload((current) => current + 1)}>Thử lại</Button>}
            style={{ marginBottom: 16 }}
          />
        )}
        {updateError && (
          <Alert
            type="error"
            showIcon
            message={updateError}
            closable
            onClose={() => setUpdateError('')}
            style={{ marginBottom: 16 }}
          />
        )}
        <Table
          columns={columns}
          dataSource={reviews}
          rowKey="_id"
          loading={loading}
          locale={{
            emptyText: loadError
              ? <Empty description="Không thể tải danh sách đánh giá." />
              : <Empty description="Không có đánh giá phù hợp." />,
          }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            onChange: (current, pageSize) => setPagination((value) => ({ ...value, current, pageSize })),
          }}
        />
      </Card>
    </div>
  );
}

export default Reviews;
