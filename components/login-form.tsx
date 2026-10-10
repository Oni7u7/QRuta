"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/login/actions";
import { inputClass } from "./ui";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, { error: null });

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className="text-sm font-medium">
          Correo
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className={inputClass} />
      </div>
      <div>
        <label htmlFor="password" className="text-sm font-medium">
          Contraseña
        </label>
        <input id="password" name="password" type="password" required autoComplete="current-password" className={inputClass} />
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-5 font-medium text-white hover:bg-teal-700 disabled:cursor-wait disabled:opacity-70 dark:bg-teal-500 dark:text-zinc-950 dark:hover:bg-teal-400"
      >
        {pending ? "Entrando…" : "Iniciar sesión"}
      </button>
    </form>
  );
}
