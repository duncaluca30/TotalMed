import React from 'react';
import { AppBar, Toolbar, Typography, Button, Box } from '@mui/material';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import NotificationBell from './NotificationBell';
import LanguageSwitcher from './LanguageSwitcher';

const AppHeader = ({ title }) => {
  const { t } = useTranslation();
  const { logout } = useAuth();

  return (
    <AppBar position="static" sx={{ borderRadius: '14px', mb: 4, backgroundImage: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', boxShadow: '0 8px 24px rgba(79, 70, 229, 0.28)' }}>
      <Toolbar>
        <MedicalServicesIcon sx={{ mr: 2 }} />
        <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold', letterSpacing: '1px' }}>
          {t(title)}
        </Typography>
        <Box sx={{ mr: 1.5, '& .MuiToggleButton-root': { color: 'rgba(255,255,255,0.85)', borderColor: 'rgba(255,255,255,0.4)' }, '& .Mui-selected': { color: '#fff !important', backgroundColor: 'rgba(255,255,255,0.18) !important' } }}>
          <LanguageSwitcher />
        </Box>
        <NotificationBell />
        <Button color="inherit" onClick={logout} sx={{ fontWeight: 'bold' }}>{t('Secure Logout')}</Button>
      </Toolbar>
    </AppBar>
  );
};

export default AppHeader;
