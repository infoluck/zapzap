import crypto from 'crypto';

/**
 * Criptografia simétrica (AES-256-GCM) para guardar segredos no banco, como a chave global da Evolution.
 * A chave de criptografia vem de SETTINGS_ENCRYPTION_KEY ou, se ausente, do JWT_SECRET.
 * Atenção: trocar esse segredo torna ilegíveis os valores já gravados (é preciso salvá-los de novo).
 */
function masterKey(): Buffer {
  const secret = process.env.SETTINGS_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Defina JWT_SECRET (ou SETTINGS_ENCRYPTION_KEY) para proteger segredos no banco.');
    }
    return crypto.createHash('sha256').update('zapzap-dev-only-insecure-key').digest();
  }
  return crypto.createHash('sha256').update(`zapzap-settings:${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join(':');
}

export function decryptSecret(payload: string): string {
  const [version, iv, tag, data] = payload.split(':');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Formato de segredo inválido.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}
