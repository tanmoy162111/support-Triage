import type { RetrievedChunk } from './types';

/**
 * Deterministic grounding check. A reply may only contain amounts, percentages, durations, dates and
 * risky commitment phrases that also appear in at least one cited chunk.
 *
 * Commitments are extracted into a CANONICAL form so the same commitment written differently in the
 * chunk and in the reply compares equal:
 * - number words (zero..ninety, hundred) become digits ("fourteen days" == "14 days");
 * - thousands separators and trailing zero decimals are dropped ("1,000" == "1000", "50.00" == "50");
 * - money: `<amount> <usd|eur|gbp>`; the symbols ($, euro sign, pound sign) and the words/codes
 *   (dollars, USD, euros, EUR, pounds, GBP) all normalise to the same currency code ("$50" == "50 dollars" == "USD 50");
 * - percent: `<n>%` ("fifty percent" == "50%" == "50 per cent");
 * - durations: `<n> <minutes|hours|days|weeks|months|years>` with an optional `business`/`working` prefix
 *   ("30-day" == "30 days", "48 hrs" == "48 hours"); ranges such as "3 to 5 days" yield both ends;
 * - dates: `YYYY-MM-DD` (or `--MM-DD` with no year). Month names, ordinal suffixes (15th), "15th of March",
 *   ISO, `m/d/yyyy` (or `d/m/yyyy` when the first part is above 12) and `dd.mm.yyyy` are all supported.
 *   Ambiguous slash dates are read as month/day.
 */

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const NUM_WORD = `(?:${[...Object.keys(ONES), 'hundred'].join('|')})`;
const NUM_WORDS_RE = new RegExp(`\\b${NUM_WORD}(?:[\\s-]+(?:and[\\s-]+)?${NUM_WORD})*\\b`, 'gi');

/** Replaces spelled-out numbers ("twenty-four", "one hundred") with digits. */
function numberWordsToDigits(text: string): string {
  return text.replace(NUM_WORDS_RE, (m) => {
    let total = 0;
    for (const w of m.toLowerCase().split(/[\s-]+/)) {
      if (w === 'and') continue;
      if (w === 'hundred') total = (total || 1) * 100;
      else total += ONES[w];
    }
    return String(total);
  });
}

const NUM = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
const CURRENCY: Record<string, string> = {
  $: 'usd', '€': 'eur', '£': 'gbp', dollar: 'usd', dollars: 'usd', usd: 'usd',
  euro: 'eur', euros: 'eur', eur: 'eur', pound: 'gbp', pounds: 'gbp', gbp: 'gbp',
};
const CUR_WORD = String.raw`(?:us\s)?(?:dollars?|usd|euros?|eur|pounds?|gbp)`;
const MONTHS = String.raw`(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`;
const ORD = String.raw`(?:st|nd|rd|th)?`;

const MONEY_SYMBOL = new RegExp(String.raw`([$€£])\s?(${NUM})`, 'gi');
const MONEY_AFTER = new RegExp(String.raw`\b(${NUM})\s?${CUR_WORD}\b`, 'gi');
const MONEY_BEFORE = new RegExp(String.raw`\b${CUR_WORD}\s?(${NUM})(?![\d,])`, 'gi');
const PERCENT = new RegExp(String.raw`(${NUM})\s?(?:%|per\s?cent\b)`, 'gi');
const DURATION = new RegExp(
  String.raw`\b(?:(\d+)\s?(?:to|or|-|–)\s?)?(\d+)[\s-]?(business\s|working\s)?(minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?)\b`,
  'gi',
);
const DATE_MONTH_FIRST = new RegExp(String.raw`\b${MONTHS}\.?\s(\d{1,2})(?!\d)${ORD}(?:,?\s(\d{4})(?!\d))?`, 'gi');
const DATE_DAY_FIRST = new RegExp(String.raw`\b(\d{1,2})${ORD}\s(?:of\s)?${MONTHS}\b\.?(?:,?\s(\d{4})(?!\d))?`, 'gi');
const DATE_ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const DATE_SLASH = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
const DATE_DOT = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g;

const MONTH_INDEX = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const two = (n: number | string) => String(n).padStart(2, '0');
const amount = (s: string) => String(Number(s.replace(/,/g, '')));
const date = (year: string | undefined, month: number, day: number) => `${year ?? '-'}-${two(month)}-${two(day)}`;

function unitOf(u: string): string {
  const s = u.toLowerCase();
  if (s.startsWith('min')) return 'minutes';
  if (s.startsWith('h')) return 'hours';
  return `${s.replace(/s$/, '')}s`;
}

/** Runs `re` over `work`, collects canonical tokens and blanks the matched spans so later passes cannot re-match them. */
function pass(work: string, re: RegExp, found: Set<string>, tokens: (m: RegExpMatchArray) => string[]): string {
  return work.replace(re, (...args) => {
    const m = args.slice(0, -2) as unknown as RegExpMatchArray;
    for (const t of tokens(m)) found.add(t);
    return ' '.repeat(String(args[0]).length);
  });
}

export function extractCommitments(text: string): string[] {
  const found = new Set<string>();
  let work = numberWordsToDigits(text).toLowerCase();

  work = pass(work, DATE_ISO, found, (m) => [date(m[1], Number(m[2]), Number(m[3]))]);
  work = pass(work, DATE_MONTH_FIRST, found, (m) => [date(m[3], MONTH_INDEX.indexOf(m[1].slice(0, 3)) + 1, Number(m[2]))]);
  work = pass(work, DATE_DAY_FIRST, found, (m) => [date(m[3], MONTH_INDEX.indexOf(m[2].slice(0, 3)) + 1, Number(m[1]))]);
  work = pass(work, DATE_SLASH, found, (m) => {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a > 12 ? [date(m[3], b, a)] : [date(m[3], a, b)];
  });
  work = pass(work, DATE_DOT, found, (m) => [date(m[3], Number(m[2]), Number(m[1]))]);
  work = pass(work, MONEY_SYMBOL, found, (m) => [`${amount(m[2])} ${CURRENCY[m[1]]}`]);
  work = pass(work, MONEY_AFTER, found, (m) => [`${amount(m[1])} ${currencyOfWord(m[0])}`]);
  work = pass(work, MONEY_BEFORE, found, (m) => [`${amount(m[1])} ${currencyOfWord(m[0])}`]);
  work = pass(work, PERCENT, found, (m) => [`${amount(m[1])}%`]);
  pass(work, DURATION, found, (m) => {
    const qualifier = m[3] ? `${m[3].trim()} ` : '';
    const out = [`${Number(m[2])} ${qualifier}${unitOf(m[4])}`];
    if (m[1]) out.push(`${Number(m[1])} ${qualifier}${unitOf(m[4])}`);
    return out;
  });
  return [...found];
}

function currencyOfWord(matched: string): string {
  const w = /(dollars?|usd|euros?|eur|pounds?|gbp)/i.exec(matched)![1].toLowerCase();
  return CURRENCY[w];
}

/** Risky commitment phrases: if a reply uses one, a cited chunk must use it too. */
const RISKY_PHRASES: Array<{ label: string; re: RegExp }> = [
  { label: 'full refund', re: /\bfull\s+refund/i },
  { label: 'refund in full', re: /\brefund(?:ed|s|ing)?\b[^.!?]{0,60}\bin\s+full\b/i },
  { label: 'free of charge', re: /\bfree\s+of\s+charge\b/i },
  { label: 'for free', re: /\bfor\s+free\b/i },
  { label: 'complimentary', re: /\bcomplimentary\b/i },
  // "credit card" is ordinary help-center vocabulary, not an account-credit commitment.
  { label: 'credit', re: /\bcredit(?!\s*cards?\b)/i },
  { label: 'waive', re: /\bwaiv(?:e|es|ed|er|ing)\b/i },
  { label: 'guarantee', re: /\bguarante/i },
  { label: 'compensat', re: /\bcompensat/i },
];

export interface ValidateInput {
  reply: string;
  citedChunkIds: string[];
  retrieved: RetrievedChunk[];
}
export interface ValidateResult {
  ok: boolean;
  problems: string[];
}

export function validateDraft({ reply, citedChunkIds, retrieved }: ValidateInput): ValidateResult {
  const problems: string[] = [];
  if (reply.trim().length === 0) problems.push('empty_reply');
  if (citedChunkIds.length === 0) problems.push('no_citation');

  const byId = new Map(retrieved.map((c) => [c.id, c]));
  const cited: RetrievedChunk[] = [];
  for (const id of citedChunkIds) {
    const c = byId.get(id);
    if (c) cited.push(c);
    else problems.push(`unknown_citation:${id}`);
  }

  if (cited.length > 0) {
    const allowed = new Set(cited.flatMap((c) => extractCommitments(c.text)));
    for (const commitment of extractCommitments(reply)) {
      if (!allowed.has(commitment)) problems.push(`ungrounded_commitment:${commitment}`);
    }
    for (const { label, re } of RISKY_PHRASES) {
      if (re.test(reply) && !cited.some((c) => re.test(c.text))) problems.push(`ungrounded_commitment_phrase:${label}`);
    }
  }
  return { ok: problems.length === 0, problems };
}
