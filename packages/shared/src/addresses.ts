/** Most people need home, work and maybe a relative's house. */
export const MAX_ADDRESSES_PER_USER = 10;

export const ADDRESS_LABEL_PRESETS = ['home', 'work', 'other'] as const;
export type AddressLabelPreset = (typeof ADDRESS_LABEL_PRESETS)[number];

export const ADDRESS_LIMITS = {
  labelMax: 30,
  streetMax: 120,
  landmarkMin: 3,
  landmarkMax: 200,
} as const;

/** One-line summary shown to shops and riders: "Near the chapel, Purok 3, Brgy. Mabini". */
export function addressSummary(a: { landmark: string; street?: string | null }, barangayName: string): string {
  return [a.landmark, a.street, `Brgy. ${barangayName}`]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(', ');
}
