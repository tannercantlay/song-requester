import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, createAdminUser, deleteAdminUser, fetchAdmins, fetchMe } from "../api/client";

export default function TeamPage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const meQuery = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const adminsQuery = useQuery({ queryKey: ["admins"], queryFn: fetchAdmins });

  const addMutation = useMutation({
    mutationFn: () => createAdminUser(email, password),
    onSuccess: () => {
      setEmail("");
      setPassword("");
      queryClient.invalidateQueries({ queryKey: ["admins"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteAdminUser(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admins"] }),
  });

  return (
    <div className="mx-auto max-w-lg px-4 pb-12 pt-6">
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">Team</h1>
      <p className="mb-4 text-sm text-slate-500">
        Give a co-host their own login so you can both work the admin queue during an event.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (email && password) addMutation.mutate();
        }}
        className="mb-6 flex flex-col gap-2 rounded-lg border border-slate-200 p-4"
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Co-host's email"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Temporary password (8+ characters)"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        {addMutation.isError && (
          <p className="text-sm text-red-600">
            {addMutation.error instanceof ApiError ? addMutation.error.message : "Something went wrong"}
          </p>
        )}
        <button
          type="submit"
          disabled={addMutation.isPending}
          className="self-start rounded-full bg-purple-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Add admin
        </button>
      </form>

      <ul className="space-y-2">
        {adminsQuery.data?.map((admin) => (
          <li
            key={admin.id}
            className="flex items-center justify-between rounded-lg border border-slate-200 p-3"
          >
            <span className="text-sm text-slate-900">
              {admin.email}
              {admin.id === meQuery.data?.id && <span className="ml-2 text-xs text-slate-400">(you)</span>}
            </span>
            {admin.id !== meQuery.data?.id && (
              <button
                type="button"
                onClick={() => removeMutation.mutate(admin.id)}
                disabled={removeMutation.isPending}
                className="text-sm text-red-500 hover:underline"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {removeMutation.isError && (
        <p className="mt-2 text-sm text-red-600">
          {removeMutation.error instanceof ApiError ? removeMutation.error.message : "Couldn't remove admin"}
        </p>
      )}
    </div>
  );
}
