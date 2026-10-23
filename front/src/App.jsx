import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { getSession } from "./api";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import DriverDashboard from "./pages/DriverDashboard.jsx";
import UserDashboard from "./pages/UserDashboard.jsx";

function Protected({ role, children }) {
  const session = getSession();
  if (!session) return <Navigate to="/login" replace />;
  if (session.role !== role) return <Navigate to={`/${session.role}`} replace />;
  return children;
}

function Home() {
  const session = getSession();
  return <Navigate to={session ? `/${session.role}` : "/login"} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/admin" element={<Protected role="admin"><AdminDashboard /></Protected>} />
        <Route path="/driver" element={<Protected role="driver"><DriverDashboard /></Protected>} />
        <Route path="/user" element={<Protected role="user"><UserDashboard /></Protected>} />
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}
