import { expect, it, vi } from "vitest";
import { requestId } from "./request-id";

it("creates distinct v4 request identifiers without secure-context randomUUID", () => {
  vi.stubGlobal("crypto", { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });
  try {
    const first = requestId();
    expect(first).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    expect(requestId()).not.toBe(first);
  } finally { vi.unstubAllGlobals(); }
});
