export function currentMonthKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`; // YYYY-MM
}

export function monthStartEnd(monthKey: string): { start: string; end: string } {
  const [yyyy, mm] = monthKey.split("-").map(Number);
  const start = new Date(yyyy, mm - 1, 1);
  const end = new Date(yyyy, mm, 1); // 1º dia do próximo mês

  const toISO = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;

  return { start: toISO(start), end: toISO(end) };
}
