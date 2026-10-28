import "server-only";

import { randomUUID } from "node:crypto";

import sharp from "sharp";

import {
  assertCapability,
  type OrganizationContext,
  requireLocation,
} from "../authorization/context";
import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";
import {
  publicMediaUrl,
  publicObjectStorage,
} from "../storage/provider";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type MerchantMediaKind =
  | "ORGANIZATION_LOGO"
  | "ORGANIZATION_COVER"
  | "LOCATION_COVER"
  | "SERVICE_IMAGE"
  | "STAFF_PHOTO";

function objectKey(input: {
  organizationId: string;
  kind: MerchantMediaKind;
  targetId: string;
}): string {
  const folderByKind: Record<MerchantMediaKind, string> = {
    ORGANIZATION_LOGO: "brand/logo",
    ORGANIZATION_COVER: "brand/cover",
    LOCATION_COVER: `locations/${input.targetId}/cover`,
    SERVICE_IMAGE: `services/${input.targetId}`,
    STAFF_PHOTO: `staff/${input.targetId}`,
  };
  return `tenants/${input.organizationId}/${folderByKind[input.kind]}/${randomUUID()}.webp`;
}

async function processImage(file: File): Promise<Uint8Array> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new AppError(
      "BAD_REQUEST",
      "僅支援 JPG、PNG 或 WebP 圖片。",
      400,
    );
  }
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    throw new AppError(
      "BAD_REQUEST",
      "圖片大小必須介於 1 byte 與 4 MB 之間。",
      400,
    );
  }
  try {
    const output = await sharp(Buffer.from(await file.arrayBuffer()), {
      failOn: "error",
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize({
        width: 1_600,
        height: 1_200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 84 })
      .toBuffer();
    return new Uint8Array(output);
  } catch {
    throw new AppError("BAD_REQUEST", "圖片內容無法辨識。", 400);
  }
}

export async function uploadMerchantMedia(input: {
  context: OrganizationContext;
  kind: MerchantMediaKind;
  targetId: string;
  file: File;
  requestId: string;
}): Promise<{ path: string; url: string }> {
  const organizationId = input.context.organization.id;
  const location = requireLocation(input.context);

  if (
    input.kind === "ORGANIZATION_LOGO" ||
    input.kind === "ORGANIZATION_COVER"
  ) {
    assertCapability(input.context, "organization.manage");
    if (input.targetId !== organizationId) {
      throw new AppError("NOT_FOUND", "找不到品牌資料。", 404);
    }
  } else if (input.kind === "LOCATION_COVER") {
    assertCapability(input.context, "location.manage");
    if (input.targetId !== location.id) {
      throw new AppError("NOT_FOUND", "找不到分店。", 404);
    }
  } else if (input.kind === "SERVICE_IMAGE") {
    assertCapability(input.context, "catalog.manage");
    const service = await prisma.services.findFirst({
      where: {
        id: input.targetId,
        organization_id: organizationId,
        location_services: {
          some: {
            location_id: location.id,
            is_active: true,
          },
        },
      },
      select: { id: true },
    });
    if (!service) {
      throw new AppError("NOT_FOUND", "找不到服務。", 404);
    }
  } else {
    assertCapability(input.context, "staff.manage");
    const staff = await prisma.staff_profiles.findFirst({
      where: {
        id: input.targetId,
        organization_id: organizationId,
        staff_location_assignments: {
          some: {
            location_id: location.id,
            is_active: true,
          },
        },
      },
      select: { id: true },
    });
    if (!staff) {
      throw new AppError("NOT_FOUND", "找不到服務人員。", 404);
    }
  }

  const body = await processImage(input.file);
  const key = objectKey({
    organizationId,
    kind: input.kind,
    targetId: input.targetId,
  });
  const stored = await publicObjectStorage.upload({
    tenantId: organizationId,
    branchId: location.id,
    key,
    contentType: "image/webp",
    body,
    metadata: {
      kind: input.kind,
      targetId: input.targetId,
    },
  });

  let previousPath: string | null = null;
  try {
    await prisma.$transaction(async (transaction) => {
      if (input.kind === "ORGANIZATION_LOGO") {
        const before = await transaction.organizations.findUniqueOrThrow({
          where: { id: organizationId },
          select: { brand_logo_path: true },
        });
        previousPath = before.brand_logo_path;
        await transaction.organizations.update({
          where: { id: organizationId },
          data: { brand_logo_path: stored.key },
        });
      } else if (input.kind === "ORGANIZATION_COVER") {
        const before = await transaction.organizations.findUniqueOrThrow({
          where: { id: organizationId },
          select: { brand_cover_image_path: true },
        });
        previousPath = before.brand_cover_image_path;
        await transaction.organizations.update({
          where: { id: organizationId },
          data: { brand_cover_image_path: stored.key },
        });
      } else if (input.kind === "LOCATION_COVER") {
        const before = await transaction.locations.findUniqueOrThrow({
          where: { id: location.id },
          select: { cover_image_path: true },
        });
        previousPath = before.cover_image_path;
        await transaction.locations.update({
          where: { id: location.id },
          data: { cover_image_path: stored.key },
        });
      } else if (input.kind === "SERVICE_IMAGE") {
        const before = await transaction.services.findUniqueOrThrow({
          where: { id: input.targetId },
          select: { image_path: true },
        });
        previousPath = before.image_path;
        await transaction.services.update({
          where: { id: input.targetId },
          data: { image_path: stored.key },
        });
      } else {
        const before = await transaction.staff_profiles.findUniqueOrThrow({
          where: { id: input.targetId },
          select: { photo_path: true },
        });
        previousPath = before.photo_path;
        await transaction.staff_profiles.update({
          where: { id: input.targetId },
          data: { photo_path: stored.key },
        });
      }

      await transaction.audit_logs.create({
        data: {
          organization_id: organizationId,
          location_id: location.id,
          actor_profile_id: input.context.session.profileId,
          action: "PUBLIC_MEDIA_UPLOAD",
          target_type: input.kind,
          target_id: input.targetId,
          outcome: "SUCCESS",
          request_id: input.requestId,
          after_json: {
            path: stored.key,
            contentType: "image/webp",
            sizeBytes: stored.sizeBytes ?? null,
          },
        },
      });
    });
  } catch (error) {
    await publicObjectStorage.delete(stored.key).catch(() => undefined);
    throw error;
  }

  if (previousPath && previousPath !== stored.key) {
    await publicObjectStorage.delete(previousPath).catch(() => undefined);
  }
  return {
    path: stored.key,
    url: publicMediaUrl(stored.key) ?? "",
  };
}
