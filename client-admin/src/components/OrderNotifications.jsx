import { BellOutlined } from '@ant-design/icons';
import { Badge, Button, Tooltip, message } from 'antd';
import { io } from 'socket.io-client';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/authService.js';
import { subscribeToLogout, subscribeToSession } from '../services/authSession.js';
import { publishNewOrder } from '../services/orderEvents.js';
import { createNotificationHistory } from '../services/notificationHistory.js';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
  || (import.meta.env.PROD ? '/api/v1' : 'http://localhost:5000/api/v1');
const socketUrl = import.meta.env.VITE_SOCKET_URL
  || new URL(apiBaseUrl, window.location.origin).origin;

function OrderNotifications() {
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const history = useRef(createNotificationHistory());
  const [unreadCount, setUnreadCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const disconnect = () => {
      socketRef.current?.removeAllListeners();
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
    };

    const connectSession = (session) => {
      disconnect();
      if (!session?.accessToken || !['admin', 'vendor'].includes(session.user?.role)) {
        history.current.setSession(null);
        setEnabled(false);
        setUnreadCount(0);
        return;
      }

      setEnabled(true);
      if (history.current.setSession(session.sessionId)) {
        setUnreadCount(0);
      }

      const socket = io(socketUrl, {
        autoConnect: false,
        auth: (callback) => callback({ token: authService.getSession()?.accessToken }),
      });
      socketRef.current = socket;

      socket.on('connect', () => setConnected(true));
      socket.on('disconnect', () => setConnected(false));
      socket.on('connect_error', () => setConnected(false));
      socket.on('new_order', (order) => {
        // Payment confirmation can repeat the order event. Refresh order data but
        // count/toast each order only once for the current authenticated login.
        publishNewOrder(order);
        if (!history.current.accept(order)) return;

        setUnreadCount((count) => count + 1);
        message.info({
          content: `New order ${order.orderCode || ''} from ${order.customerName || 'a customer'}`,
          duration: 6,
        });
      });
      socket.on('order_status_updated', publishNewOrder);
      socket.connect();
    };

    connectSession(authService.getSession());
    const unsubscribe = subscribeToSession(connectSession);
    const unsubscribeLogout = subscribeToLogout(() => {
      disconnect();
      history.current.setSession(null);
      setEnabled(false);
      setUnreadCount(0);
    });

    return () => {
      unsubscribe();
      unsubscribeLogout();
      disconnect();
    };
  }, []);

  if (!enabled) return null;

  return (
    <Tooltip title={connected ? 'Order notifications connected' : 'Order notifications disconnected'}>
      <Badge count={unreadCount} overflowCount={99}>
        <Badge dot status={connected ? 'success' : 'default'}>
          <Button
            type="text"
            icon={<BellOutlined />}
            aria-label={`Order notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
            onClick={() => {
              setUnreadCount(0);
              navigate('/orders');
            }}
          />
        </Badge>
      </Badge>
    </Tooltip>
  );
}

export default OrderNotifications;
