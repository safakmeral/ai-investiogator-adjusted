// Deno global type stub — VS Code TypeScript sunucusunun
// Deno namespace'ini tanıması için minimal tanımlama.
// Gerçek çalışma zamanı Deno'dur; bu dosya yalnızca IDE içindir.

declare namespace Deno {
  interface Env {
    get(key: string): string | undefined;
  }
  const env: Env;

  function serve(handler: (req: Request) => Response | Promise<Response>): void;
}
