import { useState } from 'react';
import { AdminAuthProvider, useAdminAuth } from '../../context/AdminAuthContext';
import AdminLoginPage from './AdminLoginPage';
import AdminLayout from './AdminLayout';
import AdminDashboard from './AdminDashboard';
import AdminUsers from './AdminUsers';
import AdminOffices from './AdminOffices';
import AdminInvites from './AdminInvites';
import AdminChats from './AdminChats';
import AdminLogs from './AdminLogs';
import AdminSettings from './AdminSettings';
import AdminSystem from './AdminSystem';

function AdminContent() {
  const { isAuthenticated } = useAdminAuth();
  const [page, setPage] = useState('dashboard');

  if (!isAuthenticated) return <AdminLoginPage />;

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <AdminDashboard />;
      case 'users': return <AdminUsers />;
      case 'offices': return <AdminOffices />;
      case 'invites': return <AdminInvites />;
      case 'chats': return <AdminChats />;
      case 'logs': return <AdminLogs />;
      case 'settings': return <AdminSettings />;
      case 'system': return <AdminSystem />;
      default: return <AdminDashboard />;
    }
  };

  return (
    <AdminLayout activePage={page} onNavigate={setPage}>
      {renderPage()}
    </AdminLayout>
  );
}

export default function AdminPanel() {
  return (
    <AdminAuthProvider>
      <AdminContent />
    </AdminAuthProvider>
  );
}
