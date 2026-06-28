/// <reference types="@cloudflare/vite-plugin/cloudflare-env" />
/// <reference types="@remix-run/cloudflare" />

interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  MEDIA: R2Bucket;
  EMAIL: SendEmail;
  ENVIRONMENT: string;
  ADMIN_SECRET?: string;
}

declare module "@remix-run/cloudflare" {
  interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}
