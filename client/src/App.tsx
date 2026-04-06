import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./components/AuthContext";
import { BrandingProvider } from "./components/BrandingContext";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Contacts from "./pages/Contacts";
import Groups from "./pages/Groups";
import GroupDetail from "./pages/GroupDetail";
import GroupMessage from "./pages/GroupMessage";
import VoiceCall from "./pages/VoiceCall";
import Notifications from "./pages/Notifications";
import Settings from "./pages/Settings";
import UserManagement from "./pages/UserManagement";
import ScheduledMessages from "./pages/ScheduledMessages";
import DirectMessage from "./pages/DirectMessage";

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
      <Route path="/forgot-password" element={user ? <Navigate to="/" replace /> : <ForgotPassword />} />
      <Route path="/reset-password" element={user ? <Navigate to="/" replace /> : <ResetPassword />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/groups/:id" element={<GroupDetail />} />
        <Route path="/direct-message" element={<DirectMessage />} />
        <Route path="/group-message" element={<GroupMessage />} />
        <Route path="/scheduled" element={<ScheduledMessages />} />
        <Route path="/voice-call" element={<VoiceCall />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/users" element={<UserManagement />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <BrandingProvider>
          <AppRoutes />
        </BrandingProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
