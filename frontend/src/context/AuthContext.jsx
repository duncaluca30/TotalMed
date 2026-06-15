import React, { createContext, useContext, useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../services/api';
import { useToast } from '../hooks/useToast';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [role, setRole] = useState(localStorage.getItem('role') || null);
  const [socket, setSocket] = useState(null);
  
  // Shared socket state
  const [authRequest, setAuthRequest] = useState(null);

  const showToast = useToast();

  const login = (newToken, newRole) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('role', newRole);
    setToken(newToken);
    setRole(newRole);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
    setToken(null);
    setRole(null);
    setAuthRequest(null);
    showToast("Logged out safely.", "info");
  };

  useEffect(() => {
    if (token && role === 'PATIENT') {
      const newSocket = io(API_URL);
      setSocket(newSocket);

      newSocket.emit('join-secure-room', token);
      
      newSocket.on('auth-request', (data) => setAuthRequest(data));
      
      newSocket.on('session-replaced', () => {
        logout();
        showToast('You were logged in on another device. This session has ended.', 'warning');
      });

      return () => {
        newSocket.disconnect();
      };
    }
  }, [token, role]);

  return (
    <AuthContext.Provider value={{ token, role, login, logout, socket, authRequest, setAuthRequest }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
