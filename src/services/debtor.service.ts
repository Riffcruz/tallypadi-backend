import { Types } from 'mongoose';
import { Debtor } from '../models/debtor.model';

export const normName = (s?: string | null) =>
  String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

// simple Levenshtein distance
function levenshtein(a: string, b: string) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function similarity(a: string, b: string) {
  const A = normName(a);
  const B = normName(b);
  const maxLen = Math.max(A.length, B.length);
  if (!maxLen) return 0;
  return 1 - levenshtein(A, B) / maxLen;
}

export type ResolveDebtorResult =
  | { status: 'exact'; debtorId: Types.ObjectId; displayName: string; debtorKey: string }
  | { status: 'suggest'; options: { debtorId: Types.ObjectId; displayName: string; score: number }[] }
  | { status: 'new'; debtorKey: string; displayName: string };

export async function resolveDebtor(shopUserId: any, rawName: string): Promise<ResolveDebtorResult> {
  const debtorKey = normName(rawName);
  const displayName = String(rawName || '').trim();

  if (!debtorKey) return { status: 'new', debtorKey: '', displayName: '' };

  // 1) exact match
  const exact = await Debtor.findOne({ user: shopUserId, debtorKey }).lean();
  if (exact?._id) {
    return { status: 'exact', debtorId: exact._id as any, displayName: exact.displayName, debtorKey: exact.debtorKey };
  }

  // 2) fuzzy suggestions (top 5)
  const candidates = await Debtor.find({ user: shopUserId }).select('_id displayName debtorKey aliases').lean();

  const scored = candidates
    .map((d) => {
      const keys = [d.debtorKey, ...(d.aliases || [])].filter(Boolean);
      let best = 0;
      for (const k of keys) best = Math.max(best, similarity(debtorKey, String(k)));
      return { debtorId: d._id as any, displayName: d.displayName, score: best };
    })
    .filter((x) => x.score >= 0.75)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (scored.length) return { status: 'suggest', options: scored };

  // 3) create new (caller decides to create or ask)
  return { status: 'new', debtorKey, displayName };
}
