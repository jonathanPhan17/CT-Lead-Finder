import type { ContactRow } from '../types';

const HEADERS = [
  'Name',
  'Role',
  'Is PI',
  'Email',
  'Phone',
  'Facility',
  'City',
  'State',
  'Country',
  'NCT ID',
  'Study Title',
  'Status',
  'Phase',
  'Sponsor',
  'Conditions',
];

function esc(val: string): string {
  if (!val) return '';
  if (/[",\n]/.test(val)) return `"${val.replace(/"/g, '""')}"`;
  return val;
}

function toRow(c: ContactRow): string {
  return [
    c.contactName,
    c.contactRole,
    c.isPrincipalInvestigator ? 'Yes' : 'No',
    c.contactEmail,
    c.contactPhone,
    c.facility,
    c.city,
    c.state,
    c.country,
    c.nctId,
    c.studyTitle,
    c.status,
    c.phase,
    c.sponsor,
    c.conditions,
  ]
    .map(esc)
    .join(',');
}

export function toCSV(contacts: ContactRow[]): string {
  return [HEADERS.join(','), ...contacts.map(toRow)].join('\n');
}

export function downloadCSV(contacts: ContactRow[], filename = 'ct-leads.csv'): void {
  const csv = toCSV(contacts);
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

export async function copyToClipboard(contacts: ContactRow[]): Promise<void> {
  await navigator.clipboard.writeText(toCSV(contacts));
}
