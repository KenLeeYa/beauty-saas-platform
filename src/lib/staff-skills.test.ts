import {describe, expect, it} from "vitest";
import {hasRequiredSkills} from "./staff-skills";

describe("service skill requirements", () => {
  it("requires every configured skill without broadening existing assignments", () => {
    expect(hasRequiredSkills(["facial", "massage"], ["facial"])).toBe(false);
    expect(hasRequiredSkills(["facial", "massage"], ["facial", "massage", "nails"])).toBe(true);
    expect(hasRequiredSkills(["facial"], [])).toBe(false);
  });
  it("keeps an unconfigured service compatible with existing staff assignments", () => {
    expect(hasRequiredSkills([], [])).toBe(true);
  });
});
