import { describe, expect, it } from 'vitest';
import { splitLiveContent } from '../src/lib/live-content';
import { GREETING } from '../src/lib/prompts';
describe('Live append payloads', () => {
  it('keeps the greeting in one short append', () => {
    expect(splitLiveContent(GREETING)).toEqual([GREETING]);
  });
  it('preserves mixed Urdu-English text within a conservative byte limit', () => {
    const text = 'جی بالکل، Clifton میں جمعہ کو demo appointment دستیاب ہے۔ '.repeat(30);
    const chunks = splitLiveContent(text);
    expect(chunks.join('')).toBe(text);
    expect(chunks.every((x) => new TextEncoder().encode(x).length <= 450)).toBe(true);
  });
  it('does not split Unicode codepoints in very long words', () => {
    const text = 'عائشہ'.repeat(300);
    const chunks = splitLiveContent(text);
    expect(chunks.join('')).toBe(text);
    expect(chunks.every((x) => new TextEncoder().encode(x).length <= 450)).toBe(true);
  });
});
