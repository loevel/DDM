// Minimal Cloudflare Workers types shim for DDM Wigs project.
// This file intentionally does NOT re-declare Request, Response, fetch, or any
// other DOM global. It only declares what the project actually needs.

// ───── D1 Database ─────────────────────────────────────────────────────────

interface D1Meta {
  duration: number;
  size_after?: number;
  rows_read: number;
  rows_written: number;
  last_row_id?: number;
  changed_db?: boolean;
  changes?: number;
}

interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: D1Meta;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  raw<T extends unknown[] = unknown[]>(): Promise<T[]>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  dump(): Promise<ArrayBuffer>;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1Result>;
}

// ───── KV Namespace ────────────────────────────────────────────────────────

interface KVNamespaceListResult<T, K extends string = string> {
  keys: { name: K; expiration?: number; metadata?: T }[];
  list_complete: boolean;
  cursor?: string;
  cacheStatus: string | null;
}

interface KVNamespacePutOptions {
  expiration?: number;
  expirationTtl?: number;
  metadata?: unknown;
}

interface KVNamespaceGetOptions<Type extends string> {
  type: Type;
  cacheTtl?: number;
}

interface KVNamespaceListOptions {
  limit?: number;
  prefix?: string | null;
  cursor?: string | null;
}

interface KVNamespace {
  get(key: string, options?: Partial<KVNamespaceGetOptions<"text">> | "text"): Promise<string | null>;
  get(key: string, options: KVNamespaceGetOptions<"json"> | "json"): Promise<unknown>;
  get(key: string, options: KVNamespaceGetOptions<"arrayBuffer"> | "arrayBuffer"): Promise<ArrayBuffer | null>;
  get(key: string, options: KVNamespaceGetOptions<"stream"> | "stream"): Promise<ReadableStream | null>;
  getWithMetadata<M = unknown>(key: string, options?: Partial<KVNamespaceGetOptions<"text">> | "text"): Promise<{ value: string | null; metadata: M | null }>;
  put(key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream, options?: KVNamespacePutOptions): Promise<void>;
  delete(key: string): Promise<void>;
  list<M = unknown>(options?: KVNamespaceListOptions): Promise<KVNamespaceListResult<M>>;
}

// ───── R2 Storage ──────────────────────────────────────────────────────────

interface R2HTTPMetadata {
  contentType?: string;
  contentLanguage?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  cacheControl?: string;
  cacheExpiry?: Date;
}

interface R2Conditional {
  etagMatches?: string;
  etagDoesNotMatch?: string;
  uploadedBefore?: Date;
  uploadedAfter?: Date;
  secondsGranularity?: boolean;
}

interface R2Range {
  offset?: number;
  length?: number;
  suffix?: number;
}

interface R2Object {
  key: string;
  version: string;
  size: number;
  etag: string;
  httpEtag: string;
  checksums: { md5?: ArrayBuffer; sha1?: ArrayBuffer; sha256?: ArrayBuffer; sha384?: ArrayBuffer; sha512?: ArrayBuffer };
  uploaded: Date;
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
  range?: R2Range;
  storageClass: string;
  writeHttpMetadata(headers: Headers): void;
}

interface R2ObjectBody extends R2Object {
  get body(): ReadableStream;
  readonly bodyUsed: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T>(): Promise<T>;
  blob(): Promise<Blob>;
}

interface R2PutOptions {
  onlyIf?: R2Conditional | Headers;
  httpMetadata?: R2HTTPMetadata | Headers;
  customMetadata?: Record<string, string>;
  md5?: ArrayBuffer | string;
  sha1?: ArrayBuffer | string;
  sha256?: ArrayBuffer | string;
  sha384?: ArrayBuffer | string;
  sha512?: ArrayBuffer | string;
  storageClass?: string;
}

interface R2MultipartOptions {
  httpMetadata?: R2HTTPMetadata | Headers;
  customMetadata?: Record<string, string>;
  storageClass?: string;
}

interface R2ListOptions {
  limit?: number;
  prefix?: string;
  cursor?: string;
  delimiter?: string;
  startAfter?: string;
  include?: ("httpMetadata" | "customMetadata")[];
}

interface R2Objects {
  objects: R2Object[];
  truncated: boolean;
  cursor?: string;
  delimitedPrefixes: string[];
}

interface R2UploadedPart {
  partNumber: number;
  etag: string;
}

interface R2MultipartUpload {
  readonly key: string;
  readonly uploadId: string;
  uploadPart(partNumber: number, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob): Promise<R2UploadedPart>;
  abort(): Promise<void>;
  complete(uploadedParts: R2UploadedPart[]): Promise<R2Object>;
}

interface R2Bucket {
  head(key: string): Promise<R2Object | null>;
  get(key: string, options?: { onlyIf?: R2Conditional | Headers; range?: R2Range }): Promise<R2ObjectBody | null>;
  put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob, options?: R2PutOptions): Promise<R2Object>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: R2ListOptions): Promise<R2Objects>;
  createMultipartUpload(key: string, options?: R2MultipartOptions): Promise<R2MultipartUpload>;
  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUpload;
}

// ───── Execution Context ───────────────────────────────────────────────────

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// ───── Email ───────────────────────────────────────────────────────────────

interface EmailMessage {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream;
  readonly rawSize: number;
  setReject(reason: string): void;
  forward(rcptTo: string, headers?: Headers): Promise<void>;
  reply(message: ForwardableEmailMessage): Promise<void>;
}

interface ForwardableEmailMessage extends EmailMessage {
  forward(rcptTo: string, headers?: Headers): Promise<void>;
}

interface SendEmail {
  send(message: EmailMessage): Promise<void>;
}

// ───── Scheduled ──────────────────────────────────────────────────────────

interface ScheduledController {
  readonly scheduledTime: number;
  readonly cron: string;
  noRetry(): void;
}

// Legacy alias used in some older workers code
type ScheduledEvent = ScheduledController;

// ───── ExportedHandler ────────────────────────────────────────────────────

type ExportedHandlerFetchHandler<Env = Record<string, unknown>> = (
  request: Request,
  env: Env,
  ctx: ExecutionContext
) => Response | Promise<Response>;

type ExportedHandlerScheduledHandler<Env = Record<string, unknown>> = (
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext
) => void | Promise<void>;

interface ExportedHandler<Env = Record<string, unknown>> {
  fetch?: ExportedHandlerFetchHandler<Env>;
  scheduled?: ExportedHandlerScheduledHandler<Env>;
  [key: string]: unknown;
}
