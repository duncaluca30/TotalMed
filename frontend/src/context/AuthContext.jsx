import React, { createContext, useContext, useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { useTranslation } from 'react-i18next';
import { API_URL, fetchWithAuth, clearCsrfToken, setCsrfToken } from '../services/api';
import { useToast } from '../hooks/useToast';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState(null);
  const [socket, setSocket] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  
  const [authRequest, setAuthRequest] = useState(null);

  const showToast = useToast();
  const { t } = useTranslation();

  useEffect(() => {

    fetchWithAuth('/api/auth/me')
      .then(data => {

        if (data.csrfToken) setCsrfToken(data.csrfToken);
        setIsAuthenticated(true);
        setRole(data.role);
      })
      .catch(() => {
        setIsAuthenticated(false);
        setRole(null);
      })
      .finally(() => setLoadingAuth(false));
  }, []);

  const login = (newRole) => {
    setIsAuthenticated(true);
    setRole(newRole);
  };

  const logout = async () => {
    try {
      await fetchWithAuth('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error("Logout failed", error);
    }
    
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
    clearCsrfToken();
    setIsAuthenticated(false);
    setRole(null);
    setAuthRequest(null);
    showToast(t('Logged out safely.'), "info");
  };

  useEffect(() => {
    if (!isAuthenticated || (role !== 'PATIENT' && role !== 'DOCTOR')) return;

    const newSocket = io(API_URL, { withCredentials: true });
    setSocket(newSocket);

    if (role === 'PATIENT') {
      newSocket.emit('join-secure-room');

      newSocket.on('auth-request', (data) => setAuthRequest(data));

      newSocket.on('session-replaced', () => {
        logout();
        showToast(t('You were logged in on another device. This session has ended.'), 'warning');
      });
    }

    return () => {
      newSocket.disconnect();
    };
  }, [isAuthenticated, role]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, role, login, logout, socket, authRequest, setAuthRequest, loadingAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
