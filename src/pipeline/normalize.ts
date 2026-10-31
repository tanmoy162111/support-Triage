export function normalizeEmailBody(raw: string): string {
  const out: string[] = [];
  for (const line of raw.replace(/\r\n/g, '\n').split('\n')) {
    const t = line.trim();
    if (/^On .+wrote:$/i.test(t)) break;
    if (t === '--') break;
    if (line.startsWith('>')) continue;
    out.push(line);
  }
  return out.join('\n').trim();
}
