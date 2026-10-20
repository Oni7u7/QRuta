// Estado de la unidad con los colores del manual: siempre icono + palabra, nunca solo color.

export type TonoEstado = "vigente" | "por-vencer" | "vencido";

const TONO: Record<TonoEstado, { clase: string; icono: React.ReactNode }> = {
  vigente: {
    clase: "bg-vigente text-blanco",
    icono: <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />,
  },
  "por-vencer": {
    clase: "bg-por-vencer text-grafito",
    icono: (
      <>
        <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
        <path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  vencido: {
    clase: "bg-vencido text-blanco",
    icono: <path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />,
  },
};

export function IconoEstado({ tono, className = "size-5" }: { tono: TonoEstado; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {TONO[tono].icono}
    </svg>
  );
}

// Insignia compacta (listas, chips).
export function EstadoBadge({ tono, children }: { tono: TonoEstado; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONO[tono].clase}`}>
      <IconoEstado tono={tono} className="size-3.5" />
      {children}
    </span>
  );
}

// Banner grande (resultado al escanear).
export function EstadoUnidad({
  tono,
  titulo,
  children,
  antes,
}: {
  tono: TonoEstado;
  titulo: string;
  children?: React.ReactNode;
  antes?: React.ReactNode;
}) {
  return (
    <section aria-live="polite" className={`rounded-2xl p-6 sm:p-8 ${TONO[tono].clase}`}>
      <div className="flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-current">
          <IconoEstado tono={tono} className="size-7" />
        </span>
        <div className="min-w-0">
          {antes}
          <p className="mt-0.5 text-[30px] leading-tight font-extrabold tracking-tight sm:text-[34px]">{titulo}</p>
          {children && <div className="mt-2">{children}</div>}
        </div>
      </div>
    </section>
  );
}
