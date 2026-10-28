export type AllocationLineInput = { staffProfileId: string;
  shareBps?: number; fixedMinor?: number };
export type AllocationLine = { staffProfileId: string; shareBps: number | null;
  quotedMinor: number };

export function allocateProviderPool(pool: number, method: "PERCENT" | "FIXED",
  lines: AllocationLineInput[]): AllocationLine[] {
  const invalid = (message: string): never => { throw Error(message); };
  if (!Number.isSafeInteger(pool) || pool < 0 || lines.length < 2 ||
      new Set(lines.map(line => line.staffProfileId)).size !== lines.length)
    invalid("Invalid provider allocation");
  if (method === "PERCENT") {
    if (lines.some(line => !Number.isInteger(line.shareBps) ||
      line.shareBps! < 0 || line.shareBps! > 10000 || line.fixedMinor !== undefined) ||
      lines.reduce((sum,line) => sum+line.shareBps!,0) !== 10000)
      invalid("Provider shares must total 100%");
    let remaining = pool;
    return lines.map((line,index) => {
      const quotedMinor = index === lines.length-1 ? remaining :
        Math.floor(pool*line.shareBps!/10000);
      remaining -= quotedMinor;
      return { staffProfileId: line.staffProfileId, shareBps: line.shareBps!, quotedMinor };
    });
  }
  if (lines.some(line => !Number.isSafeInteger(line.fixedMinor) ||
    line.fixedMinor! < 0 || line.shareBps !== undefined) ||
    lines.reduce((sum,line) => sum+line.fixedMinor!,0) > pool)
    invalid("Fixed allocations exceed commission pool");
  return lines.map(line => ({ staffProfileId: line.staffProfileId,
    shareBps: null, quotedMinor: line.fixedMinor! }));
}
