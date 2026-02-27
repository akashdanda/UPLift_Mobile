// Minimal Deno globals for Supabase Edge Functions (TypeScript/IDE only; runtime is Deno).
declare namespace Deno {
  function serve(handler: (req: Request) => Promise<Response> | Response): void;
  const env: {
    get(key: string): string | undefined;
  };
}

// ESM URL imports are resolved at runtime by Deno; declare for TypeScript.
declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export { createClient } from '@supabase/supabase-js';
}
