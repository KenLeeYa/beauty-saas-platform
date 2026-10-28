import {spawnSync} from "node:child_process";
import {expect, it} from "vitest";

it.each([
  {APP_ENV:"production"},
  {UNIFIED_LOCAL_TRIAL:"false"},
  {DATABASE_URL:"postgresql://fixture:fixture@example.invalid:56863/beauty_msi_20261009"},
  {DATABASE_URL:"postgresql://fixture:fixture@127.0.0.1:5432/beauty_msi_20261009"},
  {DATABASE_URL:"postgresql://fixture:fixture@127.0.0.1:56863/another_database"},
])("rejects showcase writes outside the exact synthetic target: %j", overrides => {
  const result=spawnSync(process.execPath,["scripts/local-showcase.mjs","--apply"],{
    encoding:"utf8",
    env:{...process.env,APP_ENV:"test",UNIFIED_LOCAL_TRIAL:"true",
      DATABASE_URL:"postgresql://fixture:fixture@127.0.0.1:56863/beauty_msi_20261009",...overrides},
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Showcase data is restricted to the retained MSI synthetic database.");
  expect(result.stdout).toBe("");
  const isolated=spawnSync(process.execPath,["scripts/isolated-showcase.mjs","--apply"],{
    encoding:"utf8",env:{...process.env,APP_ENV:"test",UNIFIED_LOCAL_TRIAL:"true",
      DATABASE_URL:"postgresql://fixture:fixture@127.0.0.1:56863/beauty_msi_20261009",...overrides},
  });
  expect(isolated.status).toBe(1);
  expect(isolated.stderr).toContain("Showcase data is restricted to the retained MSI synthetic database.");
});
