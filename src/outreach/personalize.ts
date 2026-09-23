import type { Recipient } from '../search/resultsView';

export const TEMPLATE_VARIABLES: readonly { key: string; label: string }[] = [
  { key: 'firstName', label: 'First name' },
  { key: 'fullName', label: 'Full name' },
  { key: 'trialTitle', label: 'Trial title' },
  { key: 'condition', label: 'Condition' },
  { key: 'facility', label: 'Facility' },
  { key: 'nctId', label: 'NCT ID' },
  { key: 'phase', label: 'Phase' },
];

const GENERIC_WORDS =
  /\b(office|research|trials?|clinical|department|dept|center|centre|program|team|coordinators?|study|studies|unit|institute|hospital|clinic|recruitment|info|information|contact|group|services|desk|inbox|site)\b/i;

/** True for names that are really shared inboxes, e.g. "Clinical Trials Office" or "KP OCT". */
export function isGenericContactName(name: string): boolean {
  if (GENERIC_WORDS.test(name)) return true;
  const tokens = name.split(/\s+/).filter(Boolean);
  if (/\d/.test(name)) return true;
  return tokens.length > 0 && tokens.every((t) => t.length <= 4 && t === t.toUpperCase() && /[A-Z]/.test(t));
}

function titleCase(word: string): string {
  if (word !== word.toUpperCase()) return word;
  return word.charAt(0) + word.slice(1).toLowerCase();
}

/** Person's first name for a greeting, or "there" when there is no usable personal name. */
export function greetingName(name: string | null): string {
  if (!name || isGenericContactName(name)) return 'there';
  const withoutCredentials = name.split(',')[0].trim();
  const cleaned = withoutCredentials.replace(/^(dr|prof|professor|mr|mrs|ms|miss)\.?\s+/i, '').trim();
  const first = (cleaned.split(/\s+/)[0] ?? '').replace(/\.$/, '');
  return first.length > 1 ? titleCase(first) : 'there';
}

/**
 * Fills {{variables}}. Trial fields come from the recipient's first listed trial,
 * because one address can be attached to several trials.
 */
export function applyVariables(template: string, r: Recipient): string {
  const trial = r.trials.length > 0 ? r.trials[0] : null;
  const values: Record<string, string> = {
    firstName: greetingName(r.name),
    fullName: r.name && !isGenericContactName(r.name) ? r.name : '',
    trialTitle: trial?.title ?? '',
    condition: trial?.conditions[0] ?? '',
    facility: trial?.facility ?? '',
    nctId: trial?.nctId ?? '',
    phase: trial?.phase ?? '',
  };
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => (Object.hasOwn(values, key) ? values[key] : match));
}
