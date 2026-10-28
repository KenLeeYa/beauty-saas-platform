import {afterEach, expect, it, vi} from "vitest";
vi.mock("../env",()=>({getServerEnv:()=>({NEXT_PUBLIC_SUPABASE_URL:"https://storage.example.test"})}));
import {publicMediaUrl} from "./provider";

afterEach(()=>vi.unstubAllEnvs());
it("only resolves the bundled fictional pictures in explicit local trial mode",()=>{
  const key="tenants/11111111-1111-4111-8111-111111111111/demo/demo-salon.png";
  vi.stubEnv("APP_ENV","production");vi.stubEnv("UNIFIED_LOCAL_TRIAL","true");
  expect(publicMediaUrl(key)).toBe(`https://storage.example.test/storage/v1/object/public/beauty-public/${key}`);
  vi.stubEnv("APP_ENV","test");vi.stubEnv("UNIFIED_LOCAL_TRIAL","false");
  expect(publicMediaUrl(key)).toContain("https://storage.example.test/");
  vi.stubEnv("UNIFIED_LOCAL_TRIAL","true");
  expect(publicMediaUrl(key)).toBe("/images/demo-salon.png");
  expect(publicMediaUrl(key.replace("11111111-1111-4111-8111-111111111111","d1000000-0000-4000-8000-000000000001"))).toBe("/images/demo-salon.png");
  expect(publicMediaUrl(key.replace("11111111-1111-4111-8111-111111111111","another-tenant"))).toContain("https://storage.example.test/");
  expect(publicMediaUrl("../../demo-salon.png")).toContain("https://storage.example.test/");
  expect(publicMediaUrl(null)).toBeNull();
});
