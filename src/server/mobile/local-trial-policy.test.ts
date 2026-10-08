import { describe, expect, it } from "vitest";
import { localTrialOrigin } from "./local-trial-policy";

const config = {
  APP_ENV: "test", UNIFIED_LOCAL_TRIAL: "true",
  DATABASE_URL: "postgresql://127.0.0.1:56863/synthetic",
  UNIFIED_LOCAL_TRIAL_ORIGINS: "http://127.0.0.1:3100,http://192.168.1.102:3100",
};
describe("synthetic trial access", () => {
  it("permits only configured loopback and private LAN origins", () => {
    expect(localTrialOrigin("http://192.168.1.102:3100/path", "192.168.1.102:3100", config))
      .toBe("http://192.168.1.102:3100");
    expect(localTrialOrigin("http://192.168.1.103:3100/path", "192.168.1.103:3100", config)).toBeNull();
  });
  it("rejects production, remote databases and host mismatch", () => {
    const origin = "http://127.0.0.1:3100";
    expect(localTrialOrigin(origin, "127.0.0.1:3100", {...config,APP_ENV:"production"})).toBeNull();
    expect(localTrialOrigin(origin, "127.0.0.1:3100", {...config,DATABASE_URL:"postgresql://db.example/synthetic"})).toBeNull();
    expect(localTrialOrigin(origin, "attacker.example", config)).toBeNull();
  });
  it("rejects public hosts even if mistakenly included in the allowlist", () => {
    expect(localTrialOrigin("http://public.example", "public.example",
      {...config,UNIFIED_LOCAL_TRIAL_ORIGINS:"http://public.example"})).toBeNull();
  });
});
