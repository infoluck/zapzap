import { Contact, MessageTemplate, AntiBanSettings } from '../types';

/**
 * Resolves Spintax formatted as {Option A|Option B|Option C}
 * Supports nested spintax.
 */
export function resolveSpintax(text: string): string {
  // Only blocks containing "|" are spintax. Plain tags such as {nome} or {perfil}
  // are parked behind placeholders so they survive until resolveVariables runs.
  const parked: string[] = [];
  const spintaxRegex = /\{([^{}]*)\}/;
  let result = text;
  let matches = spintaxRegex.exec(result);

  while (matches) {
    let replacement: string;
    if (matches[1].includes('|')) {
      const options = matches[1].split('|');
      replacement = options[Math.floor(Math.random() * options.length)];
    } else {
      parked.push(matches[0]);
      replacement = `${parked.length - 1}`;
    }
    result = result.replace(matches[0], () => replacement);
    matches = spintaxRegex.exec(result);
  }

  return result.replace(/(\d+)/g, (_, i) => parked[Number(i)]);
}

/**
 * Resolves dynamic contextual variables like {nome}, {primeiro_nome}, {saudacao}, etc.
 */
export function resolveVariables(text: string, contact: Contact, profileName?: string): string {
  const hour = new Date().getHours();
  let saudacao = 'Olá';
  if (hour >= 5 && hour < 12) saudacao = 'Bom dia';
  else if (hour >= 12 && hour < 18) saudacao = 'Boa tarde';
  else saudacao = 'Boa noite';

  const firstName = contact.name.trim().split(' ')[0] || contact.name;
  const todayDate = new Date().toLocaleDateString('pt-BR');
  const randomProtocol = Math.floor(100000 + Math.random() * 900000).toString();

  let resolved = text
    .replace(/\{nome\}/gi, contact.name)
    .replace(/\{primeiro_nome\}/gi, firstName)
    .replace(/\{primeironome\}/gi, firstName)
    .replace(/\{telefone\}/gi, contact.phone)
    .replace(/\{perfil\}/gi, profileName || 'Geral')
    .replace(/\{saudacao\}/gi, saudacao)
    .replace(/\{data\}/gi, todayDate)
    .replace(/\{protocolo\}/gi, `#${randomProtocol}`);

  return resolved;
}

/**
 * Injects invisible zero-width unicode characters (\u200B, \u200C) into whitespace
 * This ensures every message generates a unique cryptographic hash and payload signature
 * for WhatsApp anti-spam detection algorithms without altering the visual appearance to the user.
 */
export function injectZeroWidthNoise(text: string): string {
  const zeroWidthChars = ['\u200B', '\u200C', '\u200D', '\uFEFF'];
  const words = text.split(' ');

  const modified = words.map((word) => {
    // 35% chance to append a zero-width character to a word
    if (Math.random() < 0.35) {
      const char = zeroWidthChars[Math.floor(Math.random() * zeroWidthChars.length)];
      return word + char;
    }
    return word;
  });

  return modified.join(' ');
}

/**
 * Generates a fully obfuscated and personalized message for a specific contact
 * using selected templates and anti-ban settings.
 */
export function generateMergedMessage(
  templates: MessageTemplate[],
  contact: Contact,
  profileName?: string,
  settings?: Partial<AntiBanSettings>,
  contactIndex = 0
): { message: string; templateTitle: string; appliedTechniques: string[] } {
  if (!templates || templates.length === 0) {
    return {
      message: `Olá ${contact.name}!`,
      templateTitle: 'Padrão',
      appliedTechniques: ['Saudação simples'],
    };
  }

  const appliedTechniques: string[] = [];

  // 1. Template selection / rotation
  let chosenTemplate: MessageTemplate;
  if (settings?.enableMessageSpinning && templates.length > 1) {
    // Rotate through templates or pick randomly based on contact index
    const index = contactIndex % templates.length;
    chosenTemplate = templates[index];
    appliedTechniques.push(`Rotação de template (${chosenTemplate.title})`);
  } else {
    chosenTemplate = templates[0];
    appliedTechniques.push(`Template: ${chosenTemplate.title}`);
  }

  let text = chosenTemplate.content;

  // 2. Resolve Spintax
  if (settings?.enableSpintax !== false && text.includes('{') && text.includes('|')) {
    text = resolveSpintax(text);
    appliedTechniques.push('Spintax dinâmico processado');
  }

  // 3. Resolve Contact Variables
  text = resolveVariables(text, contact, profileName);
  appliedTechniques.push('Variáveis personalizadas injetadas');

  // 4. Inject Invisible Zero-Width Hash Obfuscation
  if (settings?.enableZeroWidthNoise) {
    text = injectZeroWidthNoise(text);
    appliedTechniques.push('Ofuscação de hash invisível (Anti-Algoritmo)');
  }

  return {
    message: text,
    templateTitle: chosenTemplate.title,
    appliedTechniques,
  };
}

/**
 * Generates random delay in seconds between min and max
 */
export function getRandomDelay(minSeconds: number, maxSeconds: number): number {
  const min = Math.max(2, minSeconds);
  const max = Math.max(min, maxSeconds);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
