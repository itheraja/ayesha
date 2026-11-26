/** Keep each append far below Live's 500-token limit, including Urdu text.
 * A conservative UTF-8 byte ceiling avoids relying on an undocumented model tokenizer.
 * Whitespace and Unicode code points are preserved when messages are reassembled.
 */
export function splitLiveContent(text: string, maxBytes = 450): string[] {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let current = '';
  for (const word of text.match(/\S+\s*|\s+/gu) ?? []) {
    if (encoder.encode(current + word).length <= maxBytes) {
      current += word;
      continue;
    }
    if (current) {
      chunks.push(current);
      current = '';
    }
    for (const char of word) {
      if (encoder.encode(current + char).length > maxBytes) {
        chunks.push(current);
        current = '';
      }
      current += char;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
