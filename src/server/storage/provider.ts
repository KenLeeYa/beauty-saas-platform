import "server-only";

import { createClient } from "@supabase/supabase-js";

import {
  assertTenantScopedObjectKey,
  type ObjectStorageProvider,
  type SignedUploadInput,
  type StoredObject,
  type UploadObjectInput,
} from "../../../packages/storage/src/index";
import { getServerEnv } from "../env";

export const PUBLIC_MEDIA_BUCKET = "beauty-public";

function storageClient() {
  const env = getServerEnv();
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

async function toBytes(
  body: Uint8Array | ReadableStream,
): Promise<Uint8Array> {
  if (body instanceof Uint8Array) {
    return body;
  }
  return new Uint8Array(await new Response(body).arrayBuffer());
}

class SupabasePublicStorageProvider implements ObjectStorageProvider {
  async upload(input: UploadObjectInput): Promise<StoredObject> {
    assertTenantScopedObjectKey(input.tenantId, input.key);
    const body = await toBytes(input.body);
    const { data, error } = await storageClient()
      .storage.from(PUBLIC_MEDIA_BUCKET)
      .upload(input.key, body, {
        contentType: input.contentType,
        cacheControl: "31536000",
        upsert: false,
        metadata: input.metadata,
      });
    if (error) {
      throw new Error(`OBJECT_UPLOAD_FAILED:${error.message}`);
    }
    return {
      key: data.path,
      bucket: PUBLIC_MEDIA_BUCKET,
      sizeBytes: body.byteLength,
    };
  }

  async delete(key: string): Promise<void> {
    if (!key.startsWith("tenants/")) {
      throw new Error("Object key is outside the tenant namespace.");
    }
    const { error } = await storageClient()
      .storage.from(PUBLIC_MEDIA_BUCKET)
      .remove([key]);
    if (error) {
      throw new Error(`OBJECT_DELETE_FAILED:${error.message}`);
    }
  }

  async createSignedDownloadUrl(
    key: string,
    expiresInSeconds: number,
  ): Promise<string> {
    const { data, error } = await storageClient()
      .storage.from(PUBLIC_MEDIA_BUCKET)
      .createSignedUrl(key, expiresInSeconds);
    if (error) {
      throw new Error(`OBJECT_SIGN_FAILED:${error.message}`);
    }
    return data.signedUrl;
  }

  async createSignedUploadUrl(input: SignedUploadInput): Promise<string> {
    assertTenantScopedObjectKey(input.tenantId, input.key);
    const { data, error } = await storageClient()
      .storage.from(PUBLIC_MEDIA_BUCKET)
      .createSignedUploadUrl(input.key);
    if (error) {
      throw new Error(`OBJECT_SIGN_FAILED:${error.message}`);
    }
    return data.signedUrl;
  }
}

export const publicObjectStorage: ObjectStorageProvider =
  new SupabasePublicStorageProvider();

export function publicMediaUrl(path: string | null): string | null {
  if (!path) {
    return null;
  }
  // Bundled fictional fixtures are available only in the explicit local trial.
  if (process.env.APP_ENV === "test" && process.env.UNIFIED_LOCAL_TRIAL === "true") {
    const fixture = /^tenants\/(?:11111111-1111-4111-8111-111111111111|d1000000-0000-4000-8000-000000000001)\/demo\/(demo-salon|demo-beautician|demo-beautician-senior)\.png$/.exec(path);
    if (fixture) return `/images/${fixture[1]}.png`;
  }
  const baseUrl = getServerEnv().NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${baseUrl}/storage/v1/object/public/${PUBLIC_MEDIA_BUCKET}/${encodedPath}`;
}
