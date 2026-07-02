// Cloudflare virtual module declarations

declare module "cloudflare:email" {
  interface EmailMessageConstructorOptions {
    from: string;
    to: string;
    subject: string;
    text?: string;
    html?: string;
  }

  class EmailMessage {
    constructor(options: EmailMessageConstructorOptions);
    readonly from: string;
    readonly to: string;
    readonly headers: Headers;
    readonly raw: ReadableStream;
    readonly rawSize: number;
    setReject(reason: string): void;
    forward(rcptTo: string, headers?: Headers): Promise<void>;
    reply(message: EmailMessage): Promise<void>;
  }

  export { EmailMessage };
}
