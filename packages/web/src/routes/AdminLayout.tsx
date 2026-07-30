import { NavLink, Navigate, Outlet } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMe, logout } from "../api/client";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3 py-2 font-mono text-[0.7rem] uppercase tracking-marquee transition ${
    isActive
      ? "bg-sodium text-ink-900"
      : "text-bone-faint hover:bg-ink-600 hover:text-bone"
  }`;

export default function AdminLayout() {
  const queryClient = useQueryClient();
  const meQuery = useQuery({ queryKey: ["me"], queryFn: fetchMe, retry: false });

  const logoutMutation = useMutation({
    mutationFn: logout,
    // onSettled, not onSuccess: if the request fails for any reason the user
    // still asked to leave, and stranding them on the admin page with no
    // feedback is the worst outcome. The cookie is httpOnly so the server is
    // the only thing that can clear it, but landing on /login at least ends
    // the session client-side and shows something happened.
    onSettled: () => {
      queryClient.clear();
      window.location.href = "/login";
    },
  });

  if (meQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-bone-faint">Loading…</p>
      </div>
    );
  }

  if (meQuery.isError) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen">
      <nav className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-500/70 px-4 py-3">
        <div className="flex items-center gap-1">
          <span className="mr-3 font-mono text-[0.7rem] uppercase tracking-marquee text-sodium">
            Setlist
          </span>
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
        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-[0.7rem] text-bone-faint sm:inline">
            {meQuery.data?.email}
          </span>
          <button
            type="button"
            onClick={() => logoutMutation.mutate()}
            className="rounded-full border border-ink-500 px-3 py-2 font-mono text-[0.7rem] uppercase tracking-marquee text-bone-dim transition hover:border-ink-400 hover:text-bone"
          >
            Log out
          </button>
        </div>
      </nav>
      <Outlet />
    </div>
  );
}
