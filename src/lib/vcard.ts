import { Contact } from '../types';

/**
 * Generates a clean vCard 3.0 (.vcf) string from a list of contacts.
 * Compatible with Android, iOS (iPhone), Google Contacts, and Outlook.
 */
export function generateVCardString(contacts: Contact[]): string {
  return contacts
    .map((c) => {
      const cleanPhone = c.phone.trim();
      const name = c.name.trim() || cleanPhone;
      const notes = c.notes ? c.notes.replace(/\r?\n/g, '\\n') : '';

      return [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${name}`,
        `TEL;TYPE=CELL,VOICE:${cleanPhone}`,
        notes ? `NOTE:${notes}` : '',
        'END:VCARD',
      ]
        .filter(Boolean)
        .join('\r\n');
    })
    .join('\r\n');
}

/**
 * Triggers a browser download for a .vcf file with the provided contacts.
 */
export function downloadVCard(contacts: Contact[], filename = 'contatos_whatsapp.vcf'): void {
  if (contacts.length === 0) return;
  const vcardText = generateVCardString(contacts);
  const blob = new Blob([vcardText], { type: 'text/vcard;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
