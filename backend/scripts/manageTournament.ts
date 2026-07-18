/**
 * Updates a tournament's admin-only fields: status, competitionCode, and/or
 * draftLocked. Use this once Euro 2026's football-data.org competition code
 * is known and its draft is ready to open, or to flip it live when the
 * tournament actually starts.
 *
 *   npx ts-node scripts/manageTournament.ts --tournament euro26 --status live
 *   npx ts-node scripts/manageTournament.ts --tournament euro26 --competition-code EC
 *   npx ts-node scripts/manageTournament.ts --tournament euro26 --draft-locked false
 *
 * Flags can be combined in one call. Nothing is written without --execute.
 */

import mongoose from 'mongoose';
import {config} from '../src/config/config';
import {resolveTournamentArg} from './lib/resolveTournamentArg';

const execute = process.argv.includes('--execute');

const argValue = (flag: string): string | undefined => {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
};

async function main() {
  await mongoose.connect(config.mongo.url, {retryWrites: true, w: 'majority'});
  console.log('Connected.');

  const tournament = await resolveTournamentArg(process.argv);

  const status = argValue('--status');
  const competitionCode = argValue('--competition-code');
  const draftLockedArg = argValue('--draft-locked');

  if (status && !['upcoming', 'live', 'archived'].includes(status)) {
    console.error(`Invalid --status "${status}" (expected upcoming|live|archived).`);
    process.exit(1);
  }

  const patch: Record<string, unknown> = {};
  if (status) patch.status = status;
  if (competitionCode !== undefined) patch.competitionCode = competitionCode;
  if (draftLockedArg !== undefined) patch.draftLocked = draftLockedArg.toLowerCase() !== 'false';

  console.log(`\nTournament "${tournament.slug}" — current:`, {
    status: tournament.status,
    competitionCode: tournament.competitionCode,
    draftLocked: tournament.draftLocked
  });

  if (Object.keys(patch).length === 0) {
    console.log('\nNo flags given (--status / --competition-code / --draft-locked). Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  console.log('Will set:', patch);

  if (!execute) {
    console.log('\n[dry-run] pass --execute to apply.');
    await mongoose.disconnect();
    return;
  }

  tournament.set(patch);
  await tournament.save();
  console.log('\nDone.');

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
