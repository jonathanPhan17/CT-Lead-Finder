export interface UsState {
  code: string;
  name: string;
  /** ClinicalTrials.gov records Puerto Rico as a country with no reliable state, every other entry as a US state. */
  recordedAsCountry: boolean;
}

/** Names match the LocationState (or, for Puerto Rico, LocationCountry) values ClinicalTrials.gov stores. */
export const US_STATES: readonly UsState[] = [
  { code: 'AL', name: 'Alabama', recordedAsCountry: false },
  { code: 'AK', name: 'Alaska', recordedAsCountry: false },
  { code: 'AZ', name: 'Arizona', recordedAsCountry: false },
  { code: 'AR', name: 'Arkansas', recordedAsCountry: false },
  { code: 'CA', name: 'California', recordedAsCountry: false },
  { code: 'CO', name: 'Colorado', recordedAsCountry: false },
  { code: 'CT', name: 'Connecticut', recordedAsCountry: false },
  { code: 'DE', name: 'Delaware', recordedAsCountry: false },
  { code: 'DC', name: 'District of Columbia', recordedAsCountry: false },
  { code: 'FL', name: 'Florida', recordedAsCountry: false },
  { code: 'GA', name: 'Georgia', recordedAsCountry: false },
  { code: 'HI', name: 'Hawaii', recordedAsCountry: false },
  { code: 'ID', name: 'Idaho', recordedAsCountry: false },
  { code: 'IL', name: 'Illinois', recordedAsCountry: false },
  { code: 'IN', name: 'Indiana', recordedAsCountry: false },
  { code: 'IA', name: 'Iowa', recordedAsCountry: false },
  { code: 'KS', name: 'Kansas', recordedAsCountry: false },
  { code: 'KY', name: 'Kentucky', recordedAsCountry: false },
  { code: 'LA', name: 'Louisiana', recordedAsCountry: false },
  { code: 'ME', name: 'Maine', recordedAsCountry: false },
  { code: 'MD', name: 'Maryland', recordedAsCountry: false },
  { code: 'MA', name: 'Massachusetts', recordedAsCountry: false },
  { code: 'MI', name: 'Michigan', recordedAsCountry: false },
  { code: 'MN', name: 'Minnesota', recordedAsCountry: false },
  { code: 'MS', name: 'Mississippi', recordedAsCountry: false },
  { code: 'MO', name: 'Missouri', recordedAsCountry: false },
  { code: 'MT', name: 'Montana', recordedAsCountry: false },
  { code: 'NE', name: 'Nebraska', recordedAsCountry: false },
  { code: 'NV', name: 'Nevada', recordedAsCountry: false },
  { code: 'NH', name: 'New Hampshire', recordedAsCountry: false },
  { code: 'NJ', name: 'New Jersey', recordedAsCountry: false },
  { code: 'NM', name: 'New Mexico', recordedAsCountry: false },
  { code: 'NY', name: 'New York', recordedAsCountry: false },
  { code: 'NC', name: 'North Carolina', recordedAsCountry: false },
  { code: 'ND', name: 'North Dakota', recordedAsCountry: false },
  { code: 'OH', name: 'Ohio', recordedAsCountry: false },
  { code: 'OK', name: 'Oklahoma', recordedAsCountry: false },
  { code: 'OR', name: 'Oregon', recordedAsCountry: false },
  { code: 'PA', name: 'Pennsylvania', recordedAsCountry: false },
  { code: 'PR', name: 'Puerto Rico', recordedAsCountry: true },
  { code: 'RI', name: 'Rhode Island', recordedAsCountry: false },
  { code: 'SC', name: 'South Carolina', recordedAsCountry: false },
  { code: 'SD', name: 'South Dakota', recordedAsCountry: false },
  { code: 'TN', name: 'Tennessee', recordedAsCountry: false },
  { code: 'TX', name: 'Texas', recordedAsCountry: false },
  { code: 'UT', name: 'Utah', recordedAsCountry: false },
  { code: 'VT', name: 'Vermont', recordedAsCountry: false },
  { code: 'VA', name: 'Virginia', recordedAsCountry: false },
  { code: 'WA', name: 'Washington', recordedAsCountry: false },
  { code: 'WV', name: 'West Virginia', recordedAsCountry: false },
  { code: 'WI', name: 'Wisconsin', recordedAsCountry: false },
  { code: 'WY', name: 'Wyoming', recordedAsCountry: false },
];

export function findUsState(code: string): UsState | null {
  const upper = code.trim().toUpperCase();
  return US_STATES.find((s) => s.code === upper) ?? null;
}

/** Looks a state up by its full name, ignoring case and surrounding spaces. */
export function findUsStateByName(name: string): UsState | null {
  const key = name.trim().toLowerCase();
  return US_STATES.find((s) => s.name.toLowerCase() === key) ?? null;
}
