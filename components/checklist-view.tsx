import { CHECKLIST_ITEMS, CHECK_LABEL, type CheckValor, type Checklist } from "@/lib/config";
import { IconoEstado, type TonoEstado } from "./marca/estado-unidad";

// Cada resultado del checklist usa el color de estado correspondiente, siempre con icono y palabra.
const TONO_CHECK: Record<CheckValor, TonoEstado> = { ok: "vigente", atencion: "por-vencer", falla: "vencido" };
const CLASE_TONO: Record<TonoEstado, string> = {
  vigente: "bg-vigente text-blanco",
  "por-vencer": "bg-por-vencer text-grafito",
  vencido: "bg-vencido text-blanco",
};

export function ChecklistView({ checklist }: { checklist: Checklist }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {CHECKLIST_ITEMS.map(({ key, label }) => {
        const tono = TONO_CHECK[checklist[key]] ?? "por-vencer";
        return (
          <li key={key} className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${CLASE_TONO[tono]}`}>
            <span className="font-semibold">{label}</span>
            <span className="flex items-center gap-1 text-xs font-semibold">
              <IconoEstado tono={tono} className="size-3.5" />
              {CHECK_LABEL[checklist[key]] ?? checklist[key]}
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

// Solo avisa cuando algo no cuadra: si la integridad se verificó bien, no se muestra nada.
export function IntegridadBadge({ datos, stellar }: { datos: boolean; stellar: boolean | null }) {
  if (datos && stellar) return null;
  const [tono, titulo, texto]: [TonoEstado, string, string] =
    datos && stellar === null
      ? ["por-vencer", "No se pudo consultar Stellar.", "Intenta de nuevo en unos segundos o revisa la transacción con el enlace."]
      : ["vencido", "Integridad no verificada.", "Los datos no coinciden con lo anclado en Stellar."];
  return (
    <p className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${CLASE_TONO[tono]}`}>
      <IconoEstado tono={tono} className="mt-0.5 size-4 shrink-0" />
      <span>
        <strong className="font-semibold">{titulo}</strong> {texto}
      </span>
    </p>
  );
}
