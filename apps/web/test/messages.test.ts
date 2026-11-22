import { describe, expect, it } from 'vitest';
import en from '../messages/en.json';
import fil from '../messages/fil.json';

function keys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

/** ICU placeholders like {town} or {count, plural, ...} must match across languages. */
function placeholders(s: string): string[] {
  return [...s.matchAll(/\{(\w+)\s*[,}]/g)].map((m) => m[1]!).sort();
}

describe('translations', () => {
  it('English and Filipino have exactly the same keys', () => {
    expect(keys(fil).sort()).toEqual(keys(en).sort());
  });

  it('every message uses the same placeholders in both languages', () => {
    const get = (o: unknown, path: string) => path.split('.').reduce((a: any, k) => a?.[k], o) as string; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const k of keys(en)) {
      expect(placeholders(get(fil, k)), k).toEqual(placeholders(get(en, k)));
    }
  });

  it('no message is empty', () => {
    const get = (o: unknown, path: string) => path.split('.').reduce((a: any, k) => a?.[k], o) as string; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const k of keys(en)) {
      expect(get(en, k).trim(), `en ${k}`).not.toBe('');
      expect(get(fil, k).trim(), `fil ${k}`).not.toBe('');
    }
  });
});
