import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import { api } from "../../services/api";
import { relativeTime } from "../../lib/format";
import { Spinner } from "../ui";

const POLL_MS = 30000;

export function useNotifications() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const refreshCount = useCallback(async () => {
    try {
      const res = await api.get("/notifications/unread-count");
      setUnread(res.data?.unread ?? 0);
    } catch {
      // Keep the last known count; the next poll retries.
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/notifications?limit=30");
      setItems(res.data ?? []);
      setUnread(res.unread ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCount();
    const timer = setInterval(refreshCount, POLL_MS);
    const onFocus = () => refreshCount();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshCount]);

  const markRead = useCallback(async (id) => {
    setItems((prev) => prev.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)));
    setUnread((u) => Math.max(0, u - 1));
    await api.post(`/notifications/${id}/read`).catch(() => undefined);
  }, []);

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    setUnread(0);
    await api.post("/notifications/read-all").catch(() => undefined);
  }, []);

  return { items, unread, loading, loadList, markRead, markAllRead };
}

export function NotificationBell({ state, placement }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const { items, unread, loading, loadList, markRead, markAllRead } = state;

  useEffect(() => {
    if (!open) return undefined;
    loadList();
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, loadList]);

  const openItem = (n) => {
    if (!n.readAt) markRead(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <div className={`notif notif-${placement}`} ref={rootRef}>
      <button
        type="button"
        className="btn btn-ghost btn-icon notif-button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
      >
        <Bell />
        {unread > 0 && <span className="notif-count num">{unread > 99 ? "99+" : unread}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-head">
            <strong>Notifications</strong>
            {unread > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={markAllRead}>
                <CheckCheck />
                Mark all read
              </button>
            )}
          </div>
          <div className="notif-body">
            {loading && items.length === 0 ? (
              <div className="notif-empty">
                <Spinner />
              </div>
            ) : items.length === 0 ? (
              <div className="notif-empty">
                <BellOff aria-hidden="true" />
                <span>You're all caught up.</span>
              </div>
            ) : (
              <ul>
                {items.map((n) => (
                  <li key={n.id}>
                    <button type="button" className={`notif-item ${n.readAt ? "" : "is-unread"}`} onClick={() => openItem(n)}>
                      <span className="notif-dot" aria-hidden="true" />
                      <span className="notif-text">
                        <strong>{n.title}</strong>
                        {n.body && <span>{n.body}</span>}
                        <small>{relativeTime(n.createdAt)}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
