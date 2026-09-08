# Maple's World

A Minecraft-style sandbox in the browser. Slot 1 of the hotbar holds a **lamp**. Right-click with it and a rainbow-horned unicorn genie appears with a chat box. Tell it what to build; it builds it, block by block, and can undo when you change your mind.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173 — works with no backend (offline genie, local saves)
```

Controls: WASD move · Space jump · Space×2 fly · LMB break · RMB place · 1–9 / wheel pick · RMB with lamp = genie · Esc closes chat.

## Turn on the real genie + cloud saves

1. Create a Supabase project. Run `supabase/migrations/0001_init.sql` (SQL editor or `supabase db push`).
2. Enable **Anonymous sign-ins** in Authentication → Providers.
3. Secrets for the function:
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase secrets set GENIE_MODEL=claude-sonnet-4-5      # optional; any tool-capable Claude model
   ```
4. Deploy: `npm run deploy:genie -- --project-ref <ref>`
5. `.env`:
   ```
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
6. `npm run build` → deploy `dist/` anywhere static (Vercel, Netlify, Cloudflare Pages).

## Verify

```bash
npm run typecheck
npm run test:smoke    # Playwright: boots, genie builds + undoes, saves survive reload
```

See `ARCHITECTURE.md` for how the pieces fit and why.
