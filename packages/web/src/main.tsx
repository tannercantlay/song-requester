import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App.tsx";
import GuestPage from "./routes/GuestPage.tsx";
import LoginPage from "./routes/LoginPage.tsx";
import AdminLayout from "./routes/AdminLayout.tsx";
import AdminPage from "./routes/AdminPage.tsx";
import CatalogPage from "./routes/CatalogPage.tsx";
import TeamPage from "./routes/TeamPage.tsx";
import PrintPage from "./routes/PrintPage.tsx";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/e/:token" element={<GuestPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminPage />} />
            <Route path="catalog" element={<CatalogPage />} />
            <Route path="print" element={<PrintPage />} />
            <Route path="team" element={<TeamPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
