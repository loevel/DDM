/// <reference path="./types/@cloudflare/workers-types/index.d.ts" />
/// <reference path="./types/cloudflare-virtual-modules.d.ts" />

// export {} makes this file a module so that the `declare module` below
// is treated as a proper module AUGMENTATION (not an ambient replacement).
export {};

declare global {
  interface Env {
    // Bindings
    DB: D1Database;
    CACHE: KVNamespace;
    MEDIA: R2Bucket;
    EMAIL: SendEmail;
    // Config vars
    ENVIRONMENT: string;
    CF_ACCOUNT_ID?: string;
    CF_ACCOUNT_HASH?: string;
    STRIPE_PUBLISHABLE_KEY?: string;
    // Secrets
    ADMIN_SECRET?: string;
    RESEND_API_KEY?: string;
    CF_IMAGES_TOKEN?: string;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    CRON_TOKEN?: string;
    CRON_SECRET?: string;
  }
}

// Augment @remix-run/cloudflare to add our AppLoadContext
declare module "@remix-run/cloudflare" {
  interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}
