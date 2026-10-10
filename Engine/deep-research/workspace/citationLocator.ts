type LocatedFinding = {
  claim?: string;
  sourceIds?: string[];
  evidence?: { sourceId?: string; locator?: string }[];
};

/**
 * Locate an inline report citation only when its nearby paragraph repeats a
 * known finding verbatim and that finding has an explicit locator for the URL.
 * Missing/ambiguous provenance stays unlocated; no position is fabricated.
 */
export function citationLocator(
  content: string | undefined,
  linkOffset: number | undefined,
  sourceId: string,
  findings: readonly LocatedFinding[],
): string | undefined {
  if (!content || !Number.isSafeInteger(linkOffset) ||
      (linkOffset ?? -1) < 0 || linkOffset! > content.length) return;
  const before = content.slice(0, linkOffset);
  let best: { gap: number; locator: string } | null = null;
  let ambiguous = false;
  for (const finding of findings) {
    const claim = finding.claim?.trim();
    if (!claim || claim.length < 12 || !finding.sourceIds?.includes(sourceId)) continue;
    const sourceEvidence = finding.evidence?.filter(
      item => item.sourceId === sourceId && typeof item.locator === "string" && item.locator.trim(),
    ) ?? [];
    const unique = [...new Set(sourceEvidence.map(item => item.locator!.trim()))];
    if (unique.length !== 1) continue;
    const index = before.lastIndexOf(claim);
    if (index < 0) continue;
    const gap = before.length - index - claim.length;
    // Only the local report context is authoritative for this inline link.
    if (gap < 0 || gap > 600) continue;
    if (!best || gap < best.gap) {
      best = { gap, locator: unique[0] };
      ambiguous = false;
    } else if (gap === best.gap && unique[0] !== best.locator) {
      ambiguous = true;
    }
  }
  return best && !ambiguous ? best.locator : undefined;
}
