import { describe, expect, it } from 'vitest';
import { formatPhMobile, normalizePhMobile } from '../src';

describe('normalizePhMobile', () => {
  it.each([
    ['09171234567', '+639171234567'],
    ['9171234567', '+639171234567'],
    ['639171234567', '+639171234567'],
    ['+639171234567', '+639171234567'],
    ['+63 917 123 4567', '+639171234567'],
    ['0917-123-4567', '+639171234567'],
    ['(0917) 123 4567', '+639171234567'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePhMobile(input)).toBe(expected);
  });

  it.each(['', '0917123456', '091712345678', '0817 123 4567', '+1 415 555 0100', 'abc'])(
    'rejects %s',
    (input) => {
      expect(normalizePhMobile(input)).toBeNull();
    },
  );
});

describe('formatPhMobile', () => {
  it('formats for local display', () => {
    expect(formatPhMobile('+639171234567')).toBe('0917 123 4567');
  });
  it('returns unknown input unchanged', () => {
    expect(formatPhMobile('12345')).toBe('12345');
  });
});
