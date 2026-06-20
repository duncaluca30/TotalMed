import React, { useEffect, useState } from 'react';
import { IconButton, Badge, Menu, MenuItem, Typography, Box, Button, Divider } from '@mui/material';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import { fetchWithAuth } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const NotificationBell = () => {
  const { socket } = useAuth();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const load = async () => {
    try {
      const data = await fetchWithAuth('/api/notifications');
      const list = data.notifications || [];
      setItems(list);
      setUnread(list.filter((n) => !n.read).length);
    } catch { /* silent — the bell is non-critical */ }
  };

  useEffect(() => { load(); }, []);

  // Patients have a live socket; prepend pushed notifications in real time.
  useEffect(() => {
    if (!socket) return;
    const onNote = (note) => {
      setItems((prev) => [note, ...prev].slice(0, 30));
      setUnread((u) => u + 1);
    };
    socket.on('notification', onNote);
    return () => socket.off('notification', onNote);
  }, [socket]);

  const handleOpen = (e) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const markRead = async (note) => {
    if (note.read) return;
    try {
      await fetchWithAuth(`/api/notifications/${note.id}/read`, { method: 'POST' });
      setItems((prev) => prev.map((n) => (n.id === note.id ? { ...n, read: true } : n)));
      setUnread((u) => Math.max(0, u - 1));
    } catch { /* ignore */ }
  };

  const markAllRead = async () => {
    try {
      await fetchWithAuth('/api/notifications/read-all', { method: 'POST' });
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch { /* ignore */ }
  };

  return (
    <>
      <IconButton color="inherit" onClick={handleOpen} sx={{ mr: 1 }} aria-label="notifications">
        <Badge badgeContent={unread} color="error">
          <NotificationsNoneIcon />
        </Badge>
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        slotProps={{ paper: { sx: { width: 360, maxHeight: 440 } } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1 }}>
          <Typography sx={{ fontWeight: 700 }}>Notifications</Typography>
          {unread > 0 && (
            <Button size="small" onClick={markAllRead} sx={{ textTransform: 'none' }}>Mark all read</Button>
          )}
        </Box>
        <Divider />
        {items.length === 0 ? (
          <MenuItem disabled>
            <Typography sx={{ color: 'text.secondary', fontStyle: 'italic' }}>No notifications yet.</Typography>
          </MenuItem>
        ) : (
          items.map((n) => (
            <MenuItem
              key={n.id}
              onClick={() => markRead(n)}
              sx={{
                whiteSpace: 'normal', alignItems: 'flex-start', py: 1.2,
                backgroundColor: n.read ? 'transparent' : 'rgba(91, 79, 230, 0.08)',
              }}
            >
              <Box>
                <Typography sx={{ fontWeight: n.read ? 500 : 700, fontSize: '0.9rem' }}>{n.title}</Typography>
                <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>{n.body}</Typography>
                <Typography sx={{ fontSize: '0.72rem', color: 'text.disabled', mt: 0.3 }}>
                  {new Date(n.createdAt).toLocaleString()}
                </Typography>
              </Box>
            </MenuItem>
          ))
        )}
      </Menu>
    </>
  );
};

export default NotificationBell;
