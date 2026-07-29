import { NavLink, Navigate, Outlet } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMe, logout } from "../api/client";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3 py-1 text-sm font-medium ${isActive ? "bg-purple-600 text-white" : "text-slate-500 hover:bg-slate-100"}`;

export default function AdminLayout() {
  const queryClient = useQueryClient();
  const meQuery = useQuery({ queryKey: ["me"], queryFn: fetchMe, retry: false });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear();
      window.location.href = "/login";
    },
  });

  if (meQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    );
  }

  if (meQuery.isError) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-white">
      <nav className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex gap-2">
          <NavLink to="/admin" end className={navLinkClass}>
            Queue
          </NavLink>
          <NavLink to="/admin/catalog" className={navLinkClass}>
            Catalog
          </NavLink>
          <NavLink to="/admin/print" className={navLinkClass}>
            Print
          </NavLink>
          <NavLink to="/admin/team" className={navLinkClass}>
            Team
          </NavLink>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <span>{meQuery.data?.email}</span>
          <button
            type="button"
            onClick={() => logoutMutation.mutate()}
            className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600"
          >
            Log out
          </button>
        </div>
      </nav>
      <Outlet />
    </div>
  );
}
