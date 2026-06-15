import React from 'react';
import { AppBar, Toolbar, Typography, Button } from '@mui/material';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import { useAuth } from '../../context/AuthContext';

const AppHeader = ({ title }) => {
  const { logout } = useAuth();

  return (
    <AppBar position="static" sx={{ borderRadius: '8px', mb: 4, backgroundColor: '#0984e3', boxShadow: 3 }}>
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
