import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ApiError, login } from "../api/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const loginMutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: () => navigate("/admin"),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-700">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          loginMutation.mutate();
        }}
        className="w-full max-w-sm rounded-xl border border-ink-500 p-6"
      >
        <h1 className="mb-4 text-xl font-semibold text-bone">SetList Admin</h1>
        <div className="flex flex-col gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-lg border border-ink-500 px-3 py-2 text-sm outline-none focus:border-sodium"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-lg border border-ink-500 px-3 py-2 text-sm outline-none focus:border-sodium"
          />
          {loginMutation.isError && (
            <p className="text-sm text-ember">
              {loginMutation.error instanceof ApiError
                ? loginMutation.error.message
                : "Something went wrong"}
            </p>
          )}
          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="mt-1 rounded-full bg-sodium px-4 py-2 text-sm font-medium text-ink-900 disabled:opacity-50"
          >
            {loginMutation.isPending ? "Logging in…" : "Log in"}
          </button>
        </div>
      </form>
    </div>
  );
}
