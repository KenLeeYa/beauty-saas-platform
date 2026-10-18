import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get("live")
  live(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("ready")
  ready(): { status: "ok"; checks: Record<string, "ok" | "not_configured"> } {
    return {
      status: "ok",
      checks: {
        database: process.env.DATABASE_URL ? "ok" : "not_configured",
        storage: process.env.R2_BUCKET_NAME ? "ok" : "not_configured"
      }
    };
  }
}
