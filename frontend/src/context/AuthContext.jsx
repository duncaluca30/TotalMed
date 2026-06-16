import React, { createContext, useContext, useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { API_URL, fetchWithAuth, clearCsrfToken } from '../services/api';
import { useToast } from '../hooks/useToast';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState(null);
  const [socket, setSocket] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  
  // Shared socket state
  const [authRequest, setAuthRequest] = useState(null);

  const showToast = useToast();

  useEffect(() => {
    // Check session on mount
    fetchWithAuth('/api/auth/me')
      .then(data => {
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
    showToast("Logged out safely.", "info");
  };

  useEffect(() => {
    if (isAuthenticated && role === 'PATIENT') {
      // socket.io uses withCredentials to automatically send the httpOnly cookie
      const newSocket = io(API_URL, { withCredentials: true });
      setSocket(newSocket);

      newSocket.emit('join-secure-room');
      
      newSocket.on('auth-request', (data) => setAuthRequest(data));
      
      newSocket.on('session-replaced', () => {
        logout();
        showToast('You were logged in on another device. This session has ended.', 'warning');
      });

      return () => {
        newSocket.disconnect();
      };
    }
  }, [isAuthenticated, role]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, role, login, logout, socket, authRequest, setAuthRequest, loadingAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
