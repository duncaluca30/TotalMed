import React from 'react';
import { Outlet } from 'react-router-dom';
import AppHeader from '../Layout/AppHeader';

const AdminLayout = () => {
  return (
    <div className="container">
      <AppHeader title="TotalMed Administration" />
      <Outlet />
    </div>
  );
};

export default AdminLayout;
