import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import ChatPage from './pages/ChatPage';
import AdminPanel from './pages/admin/AdminPanel';

function MessengerContent() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <ChatPage /> : <LoginPage />;
}

function App() {
  const [isAdmin, setIsAdmin] = useState(() => window.location.hash === '#/admin');

  useEffect(() => {
    const onHash = () => setIsAdmin(window.location.hash === '#/admin');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (isAdmin) return <AdminPanel />;

  return (
    <AuthProvider>
      <MessengerContent />
    </AuthProvider>
  );
}

export default App
