// Copies the shared genie contract next to the Edge Function, then deploys it.
// Usage: node scripts/deploy-genie.mjs [--project-ref <ref>]
import { copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

copyFileSync('shared/genie-tools.ts', 'supabase/functions/genie/genie-tools.ts');
copyFileSync('shared/taxonomy.ts', 'supabase/functions/genie/taxonomy.ts');
const ref = process.argv.includes('--project-ref') ? `--project-ref ${process.argv[process.argv.indexOf('--project-ref') + 1]}` : '';
execSync(`npx supabase functions deploy genie ${ref}`, { stdio: 'inherit' });
