import React from 'react';
import { AppBar, Toolbar, Typography, Button } from '@mui/material';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import { useAuth } from '../../context/AuthContext';

const AppHeader = ({ title }) => {
  const { logout } = useAuth();

  return (
    <AppBar position="static" sx={{ borderRadius: '14px', mb: 4, backgroundImage: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', boxShadow: '0 8px 24px rgba(79, 70, 229, 0.28)' }}>
      <Toolbar>
        <MedicalServicesIcon sx={{ mr: 2 }} />
        <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold', letterSpacing: '1px' }}>
          {title}
        </Typography>
        <Button color="inherit" onClick={logout} sx={{ fontWeight: 'bold' }}>Secure Logout</Button>
      </Toolbar>
    </AppBar>
  );
};

export default AppHeader;
