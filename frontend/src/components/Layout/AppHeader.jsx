import React from 'react';
import { AppBar, Toolbar, Typography, Button, Box, IconButton, Tooltip } from '@mui/material';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import LogoutIcon from '@mui/icons-material/Logout';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import NotificationBell from './NotificationBell';
import LanguageSwitcher from './LanguageSwitcher';

const AppHeader = ({ title }) => {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const logoutLabel = t('Secure Logout');

  return (
    <AppBar position="static" sx={{ borderRadius: '14px', mb: 4, backgroundImage: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', boxShadow: '0 8px 24px rgba(79, 70, 229, 0.28)' }}>
      <Toolbar sx={{ gap: { xs: 0.5, sm: 1 } }}>
        <MedicalServicesIcon sx={{ mr: { xs: 1, sm: 2 }, flexShrink: 0 }} />
        <Typography
          variant="h6"
          component="div"
          noWrap
          sx={{ flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 'bold', letterSpacing: '1px', fontSize: { xs: '0.95rem', sm: '1.25rem' } }}
        >
          {t(title)}
        </Typography>
        <Box sx={{ ml: { xs: 1, sm: 2 }, mr: { xs: 0.5, sm: 1.5 }, flexShrink: 0, '& .MuiToggleButton-root': { color: 'rgba(255,255,255,0.85)', borderColor: 'rgba(255,255,255,0.4)' }, '& .Mui-selected': { color: '#fff !important', backgroundColor: 'rgba(255,255,255,0.18) !important' } }}>
          <LanguageSwitcher />
        </Box>
        <NotificationBell />
        <Button
          color="inherit"
          onClick={logout}
          sx={{ fontWeight: 'bold', flexShrink: 0, whiteSpace: 'nowrap', display: { xs: 'none', sm: 'inline-flex' } }}
        >
          {logoutLabel}
        </Button>
        <Tooltip title={logoutLabel}>
          <IconButton color="inherit" onClick={logout} sx={{ flexShrink: 0, display: { xs: 'inline-flex', sm: 'none' } }} aria-label={logoutLabel}>
            <LogoutIcon />
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
};

export default AppHeader;
