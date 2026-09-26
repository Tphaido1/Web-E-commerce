import {
  AppstoreOutlined,
  FolderOpenOutlined,
  DashboardOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ShoppingOutlined,
  StarOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Drawer, Grid, Layout, Menu, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/products', icon: <AppstoreOutlined />, label: 'Products' },
  { key: '/categories', icon: <FolderOpenOutlined />, label: 'Categories' },
  { key: '/orders', icon: <ShoppingOutlined />, label: 'Orders' },
  { key: '/reviews', icon: <StarOutlined />, label: 'Đánh giá (Reviews)' },
];

const pageTitles = {
  '/dashboard': 'Dashboard',
  '/products': 'Products',
  '/categories': 'Categories',
  '/orders': 'Orders',
  '/reviews': 'Đánh giá & Phản hồi',
};

function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = !screens.lg;
  const pageTitle = pageTitles[location.pathname] || (location.pathname.startsWith('/products/') ? 'Products' : 'Dashboard');
  const selectedKey = useMemo(
    () => menuItems.find((item) => location.pathname.startsWith(item.key))?.key || '/dashboard',
    [location.pathname],
  );

  return (
    <Layout className="admin-shell">
      <Sider
        breakpoint="lg"
        collapsedWidth={0}
        collapsible
        onCollapse={(nextCollapsed) => {
          if (isMobile) {
            setMobileOpen(!nextCollapsed);
          } else {
            setCollapsed(nextCollapsed);
          }
        }}
        collapsed={isMobile ? !mobileOpen : collapsed}
        trigger={null}
        className="admin-sider"
      >
        <div className="brand-lockup">
          <div className="brand-mark">N</div>
          <div className="brand-copy">
            <strong>NOVA</strong>
            <span>Commerce admin</span>
          </div>
        </div>
        <div className="sider-label">Workspace</div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          className="admin-menu"
        />
        <div className="sider-footer">
          <span className="status-dot" />
          <span>Workspace ready</span>
        </div>
      </Sider>
      <Drawer
        open={isMobile && mobileOpen}
        placement="left"
        width={200}
        closable={false}
        onClose={() => setMobileOpen(false)}
        className="mobile-sidebar-drawer"
        styles={{ body: { padding: 0 } }}
      >
        <div className="brand-lockup">
          <div className="brand-mark">N</div>
          <div className="brand-copy">
            <strong>NOVA</strong>
            <span>Commerce admin</span>
          </div>
        </div>
        <div className="sider-label">Workspace</div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => {
            navigate(key);
            setMobileOpen(false);
          }}
          className="admin-menu"
        />
      </Drawer>

      <Layout className="admin-main-layout">
        <Header className="admin-header">
          <div className="header-left">
            <Button
              type="text"
              className="collapse-button"
              icon={(isMobile ? !mobileOpen : collapsed) ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => {
                if (isMobile) {
                  setMobileOpen(!mobileOpen);
                } else {
                  setCollapsed(!collapsed);
                }
              }}
              aria-label={(isMobile ? !mobileOpen : collapsed) ? 'Mở sidebar' : 'Thu gọn sidebar'}
            />
            <div>
              <Typography.Text className="breadcrumb-label">Admin workspace /</Typography.Text>
              <Typography.Title level={4} className="page-title">{pageTitle}</Typography.Title>
            </div>
          </div>
          <div className="admin-profile">
            <div className="profile-copy">
              <strong>Admin User</strong>
              <span>Workspace owner</span>
            </div>
            <Avatar className="profile-avatar">AU</Avatar>
          </div>
        </Header>
        <Content className="admin-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

export default AdminLayout;