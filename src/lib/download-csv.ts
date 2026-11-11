/** Triggers a browser download of a CSV string via a temporary object URL + anchor click. Shared
 * by `tickets/csv-export.ts` and `payments/csv-export.ts` (Task 6 extracted this out of the latter
 * duplicating the former's identical five-line implementation — DRY, per the house rule). This is
 * a real app page, not a sandboxed artifact viewer, so a script-triggered download works normally
 * here. */
export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
