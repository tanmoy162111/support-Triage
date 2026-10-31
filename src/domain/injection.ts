const PATTERNS: Array<[string, RegExp]> = [
  ['override_instructions', /\b(ignore|disregard|forget)\b[^.\n]{0,30}\b(previous|prior|above|your|all|any)\b[^.\n]{0,30}\b(instructions?|prompts?|rules?)\b/i],
  ['reveal_prompt', /\b(reveal|show|print|repeat)\b[^.\n]{0,30}\b(system prompt|instructions|hidden prompt)\b/i],
  ['fake_role_tag', /<\/?\s*(system|assistant|developer)\s*>/i],
  ['fake_bracket_role', /\[\s*(system|inst)\s*\]/i],
  ['role_override', /\byou are now\b/i],
  ['bypass_review', /\b(send|reply)\b[^.\n]{0,40}\bwithout\b[^.\n]{0,20}\b(review|approval)\b/i],
];

export function detectInjection(text: string): { suspected: boolean; matches: string[] } {
  const matches = PATTERNS.filter(([, re]) => re.test(text)).map(([name]) => name);
  return { suspected: matches.length > 0, matches };
}
