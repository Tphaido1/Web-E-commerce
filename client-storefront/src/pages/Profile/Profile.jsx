import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../../components/Header/Header.jsx';
import Footer from '../../components/Footer/Footer.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useWishlist } from '../../context/WishlistContext.jsx';
import { getProfile, updateProfile, changePassword } from '../../services/userService.js';
import { updateAuthUser } from '../../services/authSession.js';
import './Profile.css';

function Profile() {
  const toast = useToast();
  const { wishlistCount } = useWishlist();

  const [loading, setLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Profile form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    role: 'customer',
  });

  // Password form state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    getProfile()
      .then((user) => {
        if (!isMounted) return;
        setFormData({
          name: user.name || '',
          email: user.email || '',
          phone: user.phone || '',
          address: user.address || '',
          role: user.role || 'customer',
        });
      })
      .catch((err) => {
        toast.error(err.response?.data?.message || err.message || 'Không thể tải thông tin hồ sơ');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData((prev) => ({ ...prev, [name]: value }));
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    try {
      const updatedUser = await updateProfile({
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        address: formData.address.trim(),
      });
      updateAuthUser(updatedUser);
      toast.success('Cập nhật thông tin cá nhân thành công!');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Không thể cập nhật thông tin');
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!passwordData.currentPassword) {
      toast.error('Vui lòng nhập mật khẩu hiện tại');
      return;
    }
    if (passwordData.newPassword.length < 6) {
      toast.error('Mật khẩu mới phải có ít nhất 6 ký tự');
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('Mật khẩu xác nhận không trùng khớp');
      return;
    }

    setPasswordSaving(true);
    try {
      await changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      toast.success('Đổi mật khẩu thành công!');
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Không thể đổi mật khẩu');
    } finally {
      setPasswordSaving(false);
    }
  };

  const displayName = formData.name || formData.email.split('@')[0] || 'Khách hàng';
  const avatarLetter = (formData.name || formData.email || 'N').charAt(0).toUpperCase();

  return (
    <div className="profile-page">
      <Header />

      <main className="profile-main">
        <div className="profile-hero">
          <div className="profile-container">
            <nav className="profile-breadcrumb" aria-label="Breadcrumb">
              <Link to="/">Trang chủ</Link>
              <span className="breadcrumb-separator">/</span>
              <span className="breadcrumb-current">Hồ sơ cá nhân</span>
            </nav>
            <div className="profile-hero-content">
              <div className="profile-avatar-circle">{avatarLetter}</div>
              <div>
                <h1 className="profile-heading">Chào mừng, {displayName}!</h1>
                <p className="profile-subheading">
                  Quản lý thông tin cá nhân, mật khẩu bảo mật và danh sách trang phục yêu thích của bạn.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="profile-container">
          <div className="profile-layout">
            {/* Sidebar điều hướng */}
            <aside className="profile-sidebar">
              <div className="profile-nav-card">
                <div className="profile-nav-header">
                  <span className="nav-title">TÀI KHOẢN CỦA TÔI</span>
                </div>
                <nav className="profile-nav-links">
                  <Link to="/profile" className="profile-nav-item active">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span>Thông tin cá nhân</span>
                  </Link>
                  <Link to="/wishlist" className="profile-nav-item">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                    <span>Sản phẩm yêu thích</span>
                    {wishlistCount > 0 && <span className="nav-badge">{wishlistCount}</span>}
                  </Link>
                  <Link to="/my-orders" className="profile-nav-item">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                    <span>Đơn hàng của tôi</span>
                  </Link>
                </nav>
              </div>
            </aside>

            {/* Khung nội dung chính */}
            <section className="profile-content">
              {loading ? (
                <div className="profile-loading">
                  <div className="profile-spinner" />
                  <p>Đang tải thông tin hồ sơ...</p>
                </div>
              ) : (
                <>
                  {/* Form thông tin cá nhân */}
                  <div className="profile-card">
                    <div className="profile-card-header">
                      <h2>Thông tin cá nhân</h2>
                      <p>Cập nhật thông tin liên hệ và địa chỉ nhận hàng giao tận nơi</p>
                    </div>
                    <form onSubmit={handleProfileSubmit} className="profile-form">
                      <div className="form-group-grid">
                        <div className="form-field">
                          <label htmlFor="name">Họ và tên</label>
                          <input
                            type="text"
                            id="name"
                            name="name"
                            value={formData.name}
                            onChange={handleProfileChange}
                            placeholder="Ví dụ: Nguyễn Văn A"
                            required
                          />
                        </div>

                        <div className="form-field">
                          <label htmlFor="email">Địa chỉ Email</label>
                          <input
                            type="email"
                            id="email"
                            name="email"
                            value={formData.email}
                            disabled
                            className="input-disabled"
                          />
                          <span className="field-hint">Email đăng nhập không thể thay đổi</span>
                        </div>

                        <div className="form-field">
                          <label htmlFor="phone">Số điện thoại</label>
                          <input
                            type="tel"
                            id="phone"
                            name="phone"
                            value={formData.phone}
                            onChange={handleProfileChange}
                            placeholder="Ví dụ: 0912345678"
                          />
                        </div>

                        <div className="form-field full-width">
                          <label htmlFor="address">Địa chỉ nhận hàng mặc định</label>
                          <textarea
                            id="address"
                            name="address"
                            rows="3"
                            value={formData.address}
                            onChange={handleProfileChange}
                            placeholder="Số nhà, tên đường, phường/xã, quận/huyện, tỉnh/thành phố..."
                          />
                        </div>
                      </div>

                      <div className="form-actions">
                        <button type="submit" className="save-btn" disabled={profileSaving}>
                          {profileSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Form đổi mật khẩu */}
                  <div className="profile-card">
                    <div className="profile-card-header">
                      <h2>Đổi mật khẩu bảo mật</h2>
                      <p>Đảm bảo sử dụng mật khẩu mạnh để bảo vệ tài khoản của bạn</p>
                    </div>
                    <form onSubmit={handlePasswordSubmit} className="profile-form">
                      <div className="form-group-grid">
                        <div className="form-field full-width">
                          <label htmlFor="currentPassword">Mật khẩu hiện tại</label>
                          <input
                            type="password"
                            id="currentPassword"
                            name="currentPassword"
                            value={passwordData.currentPassword}
                            onChange={handlePasswordChange}
                            placeholder="Nhập mật khẩu hiện tại"
                            required
                          />
                        </div>

                        <div className="form-field">
                          <label htmlFor="newPassword">Mật khẩu mới</label>
                          <input
                            type="password"
                            id="newPassword"
                            name="newPassword"
                            value={passwordData.newPassword}
                            onChange={handlePasswordChange}
                            placeholder="Tối thiểu 6 ký tự"
                            required
                          />
                        </div>

                        <div className="form-field">
                          <label htmlFor="confirmPassword">Xác nhận mật khẩu mới</label>
                          <input
                            type="password"
                            id="confirmPassword"
                            name="confirmPassword"
                            value={passwordData.confirmPassword}
                            onChange={handlePasswordChange}
                            placeholder="Nhập lại mật khẩu mới"
                            required
                          />
                        </div>
                      </div>

                      <div className="form-actions">
                        <button type="submit" className="save-btn secondary" disabled={passwordSaving}>
                          {passwordSaving ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                        </button>
                      </div>
                    </form>
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default Profile;
