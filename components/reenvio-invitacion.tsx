"use client";

import { useEffect } from "react";

// Si Supabase no reconoce la dirección pedida en el enlace de invitación, manda al usuario a su "Site URL"
// (por ejemplo, la landing) con la sesión en el fragmento (#...). Aquí se reenvía a /auth/confirmar para completarla.
export function ReenvioInvitacion() {
  useEffect(() => {
    const hash = window.location.hash;
    if (window.location.pathname === "/auth/confirmar") return;
    if (/[#&](access_token|error_code)=/.test(hash)) {
      window.location.replace(`/auth/confirmar${hash}`);
    }
  }, []);
  return null;
}
