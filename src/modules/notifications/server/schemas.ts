import { z } from "zod";

export const retryNotificationSchema = z
  .object({
    deliveryId: z.uuid(),
  })
  .strict();
