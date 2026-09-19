import { Share } from 'react-native';

/**
 * Export CSV por módulo (respaldo) — paridad con downloadCSV de la web.
 * Sin dependencias nuevas: comparte el CSV como texto vía el share sheet
 * nativo (WhatsApp, correo, guardar en Archivos, etc.).
 */
export function toCSV(rows: Record<string, any>[], headers?: { key: string; label: string }[]): string {
  if (!rows.length) return '';
  const cols = headers || Object.keys(rows[0]).map((k) => ({ key: k, label: k }));
  const esc = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map((c) => esc(c.label)).join(',')];
  for (const r of rows) lines.push(cols.map((c) => esc(r[c.key])).join(','));
  return lines.join('\n');
}

export async function shareCSV(
  filename: string,
  rows: Record<string, any>[],
  headers?: { key: string; label: string }[],
): Promise<void> {
  const csv = toCSV(rows, headers);
  if (!csv) return;
  try {
    await Share.share({
      message: `📎 ${filename} (${new Date().toISOString().slice(0, 10)})\n\n${csv}`,
      title: `${filename}.csv`,
    });
  } catch {
    // Usuario canceló el share sheet — no es fatal
  }
}
