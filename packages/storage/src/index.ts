export type UploadObjectInput = {
  tenantId: string;
  branchId?: string;
  key: string;
  contentType: string;
  body: Uint8Array | ReadableStream;
  metadata?: Record<string, string>;
};

export type SignedUploadInput = {
  tenantId: string;
  branchId?: string;
  key: string;
  contentType: string;
  expiresInSeconds: number;
};

export type StoredObject = {
  key: string;
  bucket: string;
  etag?: string;
  sizeBytes?: number;
};

export interface ObjectStorageProvider {
  upload(input: UploadObjectInput): Promise<StoredObject>;
  delete(key: string): Promise<void>;
  createSignedDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
  createSignedUploadUrl(input: SignedUploadInput): Promise<string>;
}

export function customerPhotoKey(input: { tenantId: string; customerId: string; objectId: string; extension: string }): string {
  const extension = input.extension.replace(/^\./, "");
  return `tenants/${input.tenantId}/customers/${input.customerId}/photos/${input.objectId}.${extension}`;
}

export function assertTenantScopedObjectKey(tenantId: string, key: string): void {
  if (!key.startsWith(`tenants/${tenantId}/`)) {
    throw new Error("Object key is outside the active tenant scope.");
  }
}
