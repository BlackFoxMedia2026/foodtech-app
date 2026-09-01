export type ParsedTableLabel = { prefix: string; num: number };

export function parseTableLabel(label: string): ParsedTableLabel | null {
  const match = label.match(/^(\D*)(\d+)$/);
  if (!match) return null;
  return { prefix: match[1], num: Number(match[2]) };
}

export function compareTableLabels(a: string, b: string): number {
  const pa = parseTableLabel(a);
  const pb = parseTableLabel(b);
  if (pa && pb) {
    if (pa.prefix !== pb.prefix) return pa.prefix.localeCompare(pb.prefix);
    return pa.num - pb.num;
  }
  if (pa && !pb) return -1;
  if (!pa && pb) return 1;
  return a.localeCompare(b);
}

function compressRuns(nums: number[]): Array<[number, number]> {
  const sorted = [...nums].sort((a, b) => a - b);
  const runs: Array<[number, number]> = [];
  for (const n of sorted) {
    const last = runs[runs.length - 1];
    if (last && n === last[1] + 1) {
      last[1] = n;
    } else {
      runs.push([n, n]);
    }
  }
  return runs;
}

export function formatTableSelectionLabel(labels: string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return `Tavolo ${labels[0]}`;

  const byPrefix = new Map<string, number[]>();
  const unparsed: string[] = [];
  for (const label of labels) {
    const parsed = parseTableLabel(label);
    if (!parsed) {
      unparsed.push(label);
      continue;
    }
    const list = byPrefix.get(parsed.prefix) ?? [];
    list.push(parsed.num);
    byPrefix.set(parsed.prefix, list);
  }

  const parts: string[] = [];
  for (const [prefix, nums] of Array.from(byPrefix.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const [start, end] of compressRuns(nums)) {
      parts.push(start === end ? `${prefix}${start}` : `${prefix}${start}–${prefix}${end}`);
    }
  }
  parts.push(...unparsed.sort());

  return `Tavoli ${parts.join(", ")}`;
}
