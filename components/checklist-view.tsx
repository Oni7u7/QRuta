import { CHECKLIST_ITEMS, CHECK_LABEL, type CheckValor, type Checklist } from "@/lib/config";

const ESTILO: Record<CheckValor, { clase: string; icono: string }> = {
  ok: { clase: "bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-300", icono: "✓" },
  atencion: { clase: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300", icono: "!" },
  falla: { clase: "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300", icono: "✕" },
};

export function ChecklistView({ checklist }: { checklist: Checklist }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {CHECKLIST_ITEMS.map(({ key, label }) => {
        const v = checklist[key];
        const e = ESTILO[v] ?? ESTILO.atencion;
        return (
          <li key={key} className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${e.clase}`}>
            <span className="font-medium">{label}</span>
            <span className="flex items-center gap-1 text-xs font-semibold">
              <span aria-hidden="true">{e.icono}</span>
              {CHECK_LABEL[v] ?? v}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function tieneFallas(checklist: Checklist | null) {
  return !!checklist && Object.values(checklist).includes("falla");
}

export function IntegridadBadge({ datos, stellar }: { datos: boolean; stellar: boolean | null }) {
  if (datos && stellar) {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800 dark:bg-teal-950 dark:text-teal-300">
        <span aria-hidden="true">✓</span>
        <span>
          <strong className="font-semibold">Integridad verificada en Stellar.</strong> Los datos coinciden con el hash anclado en la
          transacción.
        </span>
      </p>
    );
  }
  if (datos && stellar === null) {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
        <span aria-hidden="true">!</span>
        <span>No se pudo consultar Stellar en este momento. Revisa la transacción con el enlace.</span>
      </p>
    );
  }
  return (
    <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
      <span aria-hidden="true">✕</span>
      <span>
        <strong className="font-semibold">Integridad no verificada.</strong> Los datos no coinciden con lo anclado en Stellar.
      </span>
    </p>
  );
}
