import React, { useCallback, useEffect, useState } from "react";

type NotificationItem = {
  id: number;
  type: string;
  title: string;
  message: string;
  entityType: string;
  entityId: number | null;
  metadata?: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

interface NotificationBellProps {
  account: string | null;
  walletConnected: boolean;
  onNavigateToEntity?: (notification: NotificationItem) => void;
}

const BACKEND_BASE_URL =
  process.env.REACT_APP_BACKEND_URL?.trim() || "http://127.0.0.1:4000";

const formatNotificationTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("ro-RO", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const NotificationBell: React.FC<NotificationBellProps> = ({
  account,
  walletConnected,
  onNavigateToEntity,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!walletConnected || !account) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const query = `recipientAddress=${encodeURIComponent(account)}`;
    try {
      setIsLoading(true);
      const [listResponse, countResponse] = await Promise.all([
        fetch(`${BACKEND_BASE_URL}/notifications?${query}&limit=15`),
        fetch(`${BACKEND_BASE_URL}/notifications/unread-count?${query}`),
      ]);

      if (listResponse.ok) {
        setNotifications((await listResponse.json()) as NotificationItem[]);
      }
      if (countResponse.ok) {
        const payload = (await countResponse.json()) as { count?: number };
        setUnreadCount(Number(payload.count ?? 0));
      }
    } catch (error) {
      console.warn("Unable to load notifications", error);
    } finally {
      setIsLoading(false);
    }
  }, [account, walletConnected]);

  useEffect(() => {
    void loadNotifications();
    if (!walletConnected || !account) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadNotifications();
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [account, loadNotifications, walletConnected]);

  const handleMarkAllRead = async () => {
    if (!account) {
      return;
    }

    await fetch(`${BACKEND_BASE_URL}/notifications/read-all`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipientAddress: account }),
    });
    await loadNotifications();
  };

  const handleNotificationClick = async (notification: NotificationItem) => {
    if (!account) {
      return;
    }

    if (!notification.readAt) {
      await fetch(`${BACKEND_BASE_URL}/notifications/${notification.id}/read`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipientAddress: account }),
      });
    }

    onNavigateToEntity?.(notification);
    setIsOpen(false);
    await loadNotifications();
  };

  if (!walletConnected || !account) {
    return null;
  }

  return (
    <div className="notification-bell">
      <button
        type="button"
        className="notification-bell__button"
        onClick={() => {
          setIsOpen((current) => !current);
          void loadNotifications();
        }}
        aria-label="Notificari"
      >
        <span>Notificari</span>
        {unreadCount > 0 ? (
          <strong className="notification-bell__badge">
            {unreadCount > 9 ? "9+" : unreadCount}
          </strong>
        ) : null}
      </button>

      {isOpen ? (
        <div className="notification-bell__panel">
          <div className="notification-bell__header">
            <div>
              <strong>Notificari</strong>
              <span>{unreadCount} necitite</span>
            </div>
            <button type="button" className="ghost-button" onClick={handleMarkAllRead}>
              Marcheaza citite
            </button>
          </div>

          {isLoading && notifications.length === 0 ? (
            <div className="notification-bell__empty">Se incarca...</div>
          ) : notifications.length === 0 ? (
            <div className="notification-bell__empty">Nu exista notificari.</div>
          ) : (
            <div className="notification-bell__list">
              {notifications.map((notification) => (
                <button
                  type="button"
                  key={notification.id}
                  className={`notification-bell__item ${
                    notification.readAt ? "" : "notification-bell__item--unread"
                  }`}
                  onClick={() => void handleNotificationClick(notification)}
                >
                  <div>
                    <strong>{notification.title}</strong>
                    <p>{notification.message}</p>
                  </div>
                  <small>
                    {notification.entityType}
                    {notification.entityId !== null ? ` #${notification.entityId}` : ""} -{" "}
                    {formatNotificationTime(notification.createdAt)}
                  </small>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default NotificationBell;
