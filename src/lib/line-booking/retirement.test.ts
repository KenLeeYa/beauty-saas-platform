import { afterEach, expect, it } from "vitest";

import { localDemoEnabled } from "./local-demo";
import { prototypeAllowed, requirePrototype } from "./prototype-guard";

const previous = {
  app: process.env.APP_ENV,
  enabled: process.env.LINE_BOOKING_LOCAL_DEMO,
  database: process.env.LINE_BOOKING_DATABASE_URL,
};

afterEach(() => {
  if (previous.app === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = previous.app;
  if (previous.enabled === undefined) delete process.env.LINE_BOOKING_LOCAL_DEMO;
  else process.env.LINE_BOOKING_LOCAL_DEMO = previous.enabled;
  if (previous.database === undefined) delete process.env.LINE_BOOKING_DATABASE_URL;
  else process.env.LINE_BOOKING_DATABASE_URL = previous.database;
});

it("keeps the retired prototype closed even with its former local flags", () => {
  process.env.APP_ENV = "local";
  process.env.LINE_BOOKING_LOCAL_DEMO = "true";
  process.env.LINE_BOOKING_DATABASE_URL = "postgresql://127.0.0.1:56863/legacy";
  expect(localDemoEnabled("127.0.0.1:45140")).toBe(false);
  expect(prototypeAllowed("127.0.0.1:45140")).toBe(false);
});

it("rejects legacy requests while the integrated route remains independent", () => {
  const request = new Request("http://127.0.0.1:45144/api/line-booking/booking", {
    headers: { host: "127.0.0.1:45144" },
  });
  expect(() => requirePrototype(request)).toThrow("prototype unavailable");
});
