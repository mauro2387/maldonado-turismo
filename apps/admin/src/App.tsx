import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import DashboardLayout from './layouts/DashboardLayout';
import DashboardPage from './pages/DashboardPage';
import PlacesPage from './pages/PlacesPage';
import EventsPage from './pages/EventsPage';
import EventScraperPage from './pages/EventScraperPage';
import NewsPage from './pages/NewsPage';
import TransportPage from './pages/TransportPage';
import AuditLogPage from './pages/AuditLogPage';
import AdminUsersPage from './pages/AdminUsersPage';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="places" element={<PlacesPage />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="events/scraper" element={<EventScraperPage />} />
            <Route path="news" element={<NewsPage />} />
            <Route path="transport" element={<TransportPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="audit-log" element={<AuditLogPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
