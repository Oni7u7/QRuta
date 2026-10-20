"use client";

import { useActionState } from "react";
import { guardarContrasena, type ContrasenaState } from "@/app/cuenta/contrasena/actions";
import { inputClass } from "./ui";

export function ContrasenaForm() {
  const [state, action, pending] = useActionState<ContrasenaState, FormData>(guardarContrasena, { error: null });

  return (
    <form action={action} className="space-y-5">
      <div>
        <label htmlFor="password" className="text-sm font-semibold">
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
        <p id="password-ayuda" className="mt-1 text-xs text-texto-2">
          Al menos 10 caracteres.
        </p>
      </div>
      <div>
        <label htmlFor="confirmacion" className="text-sm font-semibold">
          Repite la contraseña
        </label>
        <input id="confirmacion" name="confirmacion" type="password" required maxLength={72} autoComplete="new-password" className={inputClass} />
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg border border-vencido bg-superficie px-4 py-3 text-sm text-texto-vencido">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn-primario w-full"
      >
        {pending ? "Guardando…" : "Guardar y entrar"}
      </button>
    </form>
  );
}
