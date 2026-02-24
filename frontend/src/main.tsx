import React from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router";
import { AuthProvider } from "./app/auth/AuthContext";
import { OrgProvider } from "./app/org/OrgContext";
import AppLayout from "./app/layouts/AppLayout";
import { LandingPage } from "./app/pages/LandingPage";
import LoginPage from "./app/pages/LoginPage";
import InvitePage from "./app/pages/InvitePage";
import DashboardPage from "./app/pages/DashboardPage";
import DomainsPage from "./app/pages/DomainsPage";
import DomainDetailPage from "./app/pages/DomainDetailPage";
import DnsPage from "./app/pages/DnsPage";
import ClientDetailPage from "./app/pages/ClientDetailPage";
import HistoryPage from "./app/pages/HistoryPage";
import AlertsPage from "./app/pages/AlertsPage";
import PortfolioPage from "./app/pages/PortfolioPage";
import SettingsPage from "./app/pages/SettingsPage";
import ChatPage from "./app/pages/ChatPage";
import ClientsPage from "./app/pages/ClientsPage";
import "./styles/index.css";

const router = createBrowserRouter([
  { path: "/", element: <LandingPage /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/invite", element: <InvitePage /> },
  {
    path: "/app",
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "dashboard", element: <Navigate to="/app" replace /> },
      { path: "domains", element: <DomainsPage /> },
      { path: "domains/:id", element: <DomainDetailPage /> },
      { path: "clients", element: <ClientsPage /> },
      { path: "clients/:id", element: <ClientDetailPage /> },
      { path: "dns", element: <DnsPage /> },
      { path: "history", element: <HistoryPage /> },
      { path: "alerts", element: <AlertsPage /> },
      { path: "portfolio", element: <PortfolioPage /> },
      { path: "chat", element: <ChatPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");
createRoot(rootEl).render(
  <React.StrictMode>
    <AuthProvider>
      <OrgProvider>
        <RouterProvider router={router} />
      </OrgProvider>
    </AuthProvider>
  </React.StrictMode>,
);
