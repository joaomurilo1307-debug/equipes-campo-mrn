// Ícones de traço (24x24), todos herdam a cor do texto.
import type { ReactNode } from "react";

function Svg({ children, tam = 18, className }: { children: ReactNode; tam?: number; className?: string }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}
type P = { tam?: number; className?: string };

export const IcPainel = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7.5" height="9" rx="1.6" />
    <rect x="13.5" y="3" width="7.5" height="5.5" rx="1.6" />
    <rect x="13.5" y="11.5" width="7.5" height="9.5" rx="1.6" />
    <rect x="3" y="15" width="7.5" height="6" rx="1.6" />
  </Svg>
);
export const IcQuadro = (p: P) => (
  <Svg {...p}>
    <path d="M3 5h8M3 12h13M3 19h6" />
    <path d="M14 5h7M19 19h2" />
    <circle cx="12.5" cy="5" r="0.4" />
  </Svg>
);
export const IcCampanha = (p: P) => (
  <Svg {...p}>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </Svg>
);
export const IcEquipe = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    <path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.4c1.9.8 3 2.6 3 5.6" />
  </Svg>
);
export const IcCarro = (p: P) => (
  <Svg {...p}>
    <path d="M4 15v-3l2-5h12l2 5v3" />
    <path d="M3 15h18v3H3zM7 18v1.5M17 18v1.5" />
    <circle cx="7.5" cy="12.5" r="0.6" />
    <circle cx="16.5" cy="12.5" r="0.6" />
  </Svg>
);
export const IcHistorico = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.2 2" />
  </Svg>
);
export const IcUsuarios = (p: P) => (
  <Svg {...p}>
    <path d="M12 3l8 3v5c0 4.6-3.2 8.3-8 10-4.8-1.7-8-5.4-8-10V6z" />
    <path d="M9 12l2.2 2.2L15.5 10" />
  </Svg>
);
export const IcSair = (p: P) => (
  <Svg {...p}>
    <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 16l4-4-4-4M20 12H9" />
  </Svg>
);
export const IcMais = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IcEsq = (p: P) => (
  <Svg {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);
export const IcDir = (p: P) => (
  <Svg {...p}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
);
export const IcBaixo = (p: P) => (
  <Svg {...p}>
    <path d="M5 9l7 7 7-7" />
  </Svg>
);
export const IcBusca = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </Svg>
);
export const IcCalendario = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
);
export const IcFechar = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IcOlho = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </Svg>
);
export const IcAlerta = (p: P) => (
  <Svg {...p}>
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4M12 17.2v.1" />
  </Svg>
);
export const IcCheck = (p: P) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
export const IcPessoa = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.5 20c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5" />
  </Svg>
);
export const IcMapa = (p: P) => (
  <Svg {...p}>
    <path d="M12 21s-6.5-5.4-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.6 12 21 12 21z" />
    <circle cx="12" cy="10.5" r="2.3" />
  </Svg>
);
export const IcImprimir = (p: P) => (
  <Svg {...p}>
    <path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2" />
    <rect x="7" y="14" width="10" height="6" rx="1" />
  </Svg>
);
export const IcFerias = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />
  </Svg>
);
export const IcLixo = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16M9 7V4.5h6V7M6.5 7l.8 12.5h9.4L17.5 7M10 11v5M14 11v5" />
  </Svg>
);
export const IcLapis = (p: P) => (
  <Svg {...p}>
    <path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L8 19z" />
    <path d="M14.5 6.5l3 3" />
  </Svg>
);
export const IcContrato = (p: P) => (
  <Svg {...p}>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4M9 12h6M9 16h6M9 8.5h2" />
  </Svg>
);

export const IcRelatorio = (p: P) => (
  <Svg {...p}>
    <path d="M5 4h14v16H5z" />
    <path d="M8.5 15.5v-3M12 15.5V9M15.5 15.5v-5" />
  </Svg>
);

export const IcVaga = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.4" />
    <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    <path d="M19 6v6M16 9h6" />
  </Svg>
);
export const IcBase = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9.5h18M3 15h18M9.5 4v16" />
  </Svg>
);
export const IcMover = (p: P) => (
  <Svg {...p}>
    <path d="M4 8h14M14 4l4 4-4 4" />
    <path d="M20 16H6M10 12l-4 4 4 4" />
  </Svg>
);
export const IcBaixar = (p: P) => (
  <Svg {...p}>
    <path d="M12 3v12M7 11l5 5 5-5" />
    <path d="M4 20h16" />
  </Svg>
);
export const IcSobe = (p: P) => (
  <Svg {...p}>
    <path d="M12 21V9M7 13l5-5 5 5" />
    <path d="M4 4h16" />
  </Svg>
);
