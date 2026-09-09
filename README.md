# Maple's World

A Minecraft-style sandbox in the browser. Slot 1 of the hotbar holds a **lamp**. Right-click with it and a rainbow-horned unicorn genie appears with a chat box. Tell it what to build; it builds it, block by block, and can undo when you change your mind.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173 — works with no backend (offline genie, local saves)
```

Controls: WASD move · Space jump · Space×2 fly · LMB break · RMB place · 1–9 / wheel pick · RMB with lamp = genie · Esc closes chat.

**Life.** The world is alive with real species across the five kingdoms — *Vulpes vulpes*, *Amanita muscaria*, *Paramecium caudatum*… Aim at anything living to learn its name; hold **goggles** (slot 2) to name everything around you. The **microscope** (slot 3, right-click on water, soil, leaves or wood) opens the small world; **shrink dust** (slot 4) drops you into it at your feet. **J** opens the Field Journal. **Q** brings you back to size. Ask the genie "what lives here?" or "bring me a fox".

**Animal Protector Guild.** Press **G**. The Guild gives quests drawn from the world around you: feed a hungry rabbit (plant *Trifolium repens* from the **seed pouch**, slot 6, and wait for it to grow), shelter a sheep (roof + three walls; it walks in by itself), free a fox from a rockfall (open a side), dig a pond so frogs move in. Helped animals become friends and follow you. Every animal has a real favourite food — cultivate it nearby and they will come.

**Chemistry.** Break a block and its atoms fall out — Si, O, Fe, Au — labelled with their symbols. Walk over them to collect. **L** (or the **flask**, slot 5) opens the Lab: a periodic table that fills in as you find elements, and recipes with real formulas (H₂O, NaCl, SiO₂, Fe₂O₃…) that turn atoms into blocks. Ask the genie for "three atoms of sodium".

## Turn on the real genie + cloud saves

1. Create a Supabase project. Run the files in `supabase/migrations/` in order (SQL editor or `supabase db push`).
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
