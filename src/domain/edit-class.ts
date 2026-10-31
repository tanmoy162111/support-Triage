export type EditClass = 'unchanged' | 'light' | 'rewritten';

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);

function levenshtein(a: string[], b: string[]): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

export function classifyEdit(original: string, final: string): EditClass {
  const a = words(original);
  const b = words(final);
  if (a.join(' ') === b.join(' ')) return 'unchanged';
  if (a.length === 0) return 'rewritten';
  const ratio = levenshtein(a, b) / Math.max(a.length, b.length);
  return ratio <= 0.2 ? 'light' : 'rewritten';
}
