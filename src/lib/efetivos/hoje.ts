/** Data (aaaa-mm-dd) e hora (0-23.99) em Brasília para um instante. */
export function instanteBrasilia(agora: Date = new Date()) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(agora);
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
  return { iso: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) + Number(p.minute) / 60 };
}
