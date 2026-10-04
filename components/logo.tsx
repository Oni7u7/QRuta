import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight" aria-label="QRuta, inicio">
      <svg viewBox="0 0 24 24" className="size-6 text-teal-600 dark:text-teal-400" aria-hidden="true">
        <rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor" />
        <rect x="14" y="2" width="8" height="8" rx="1.5" fill="currentColor" />
        <rect x="2" y="14" width="8" height="8" rx="1.5" fill="currentColor" />
        <path d="M14 18.5l2.5 2.5L22 15.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>QRuta</span>
    </Link>
  );
}
