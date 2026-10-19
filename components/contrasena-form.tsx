"use client";

import { useActionState } from "react";
import { guardarContrasena, type ContrasenaState } from "@/app/cuenta/contrasena/actions";
import { inputClass } from "./ui";

export function ContrasenaForm() {
  const [state, action, pending] = useActionState<ContrasenaState, FormData>(guardarContrasena, { error: null });

  return (
    <form action={action} className="space-y-5">
      <div>
        <label htmlFor="password" className="text-sm font-medium">
          Contraseña nueva
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={10}
          maxLength={72}
          autoComplete="new-password"
          aria-describedby="password-ayuda"
          className={inputClass}
        />
        <p id="password-ayuda" className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Al menos 10 caracteres.
        </p>
      </div>
      <div>
        <label htmlFor="confirmacion" className="text-sm font-medium">
          Repite la contraseña
        </label>
        <input id="confirmacion" name="confirmacion" type="password" required maxLength={72} autoComplete="new-password" className={inputClass} />
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-teal-600 px-5 font-medium text-white hover:bg-teal-700 disabled:cursor-wait disabled:opacity-70 dark:bg-teal-500 dark:text-zinc-950 dark:hover:bg-teal-400"
      >
        {pending ? "Guardando…" : "Guardar y entrar"}
      </button>
    </form>
  );
}
