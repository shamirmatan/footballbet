/**
 * Updates a tournament's admin-only fields: slug, name, shortName, status,
 * competitionCode, draftLocked, groupsCount, thirdPlaceSlots, and/or
 * knockoutStages. Use this to rename a placeholder tournament, wire up its
 * football-data.org competition code once known, open its draft, or flip it
 * live when the tournament actually starts.
 *
 *   npx ts-node scripts/manageTournament.ts --tournament euro26 --rename-slug euro28 --name "UEFA Euro 2028" --short-name "Euro 2028"
 *   npx ts-node scripts/manageTournament.ts --tournament euro28 --status live
 *   npx ts-node scripts/manageTournament.ts --tournament euro28 --competition-code EC
 *   npx ts-node scripts/manageTournament.ts --tournament euro28 --draft-locked false
 *   npx ts-node scripts/manageTournament.ts --tournament euro28 --groups-count 6 --third-place-slots 4 --knockout-stages LAST_16,QUARTER_FINALS,SEMI_FINALS,FINAL
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

  const renameSlug = argValue('--rename-slug');
  const name = argValue('--name');
  const shortName = argValue('--short-name');
  const status = argValue('--status');
  const competitionCode = argValue('--competition-code');
  const draftLockedArg = argValue('--draft-locked');
  const groupsCountArg = argValue('--groups-count');
  const thirdPlaceSlotsArg = argValue('--third-place-slots');
  const knockoutStagesArg = argValue('--knockout-stages');

  if (status && !['upcoming', 'live', 'archived'].includes(status)) {
    console.error(`Invalid --status "${status}" (expected upcoming|live|archived).`);
    process.exit(1);
  }

  const patch: Record<string, unknown> = {};
  if (renameSlug) patch.slug = renameSlug;
  if (name) patch.name = name;
  if (shortName) patch.shortName = shortName;
  if (status) patch.status = status;
  if (competitionCode !== undefined) patch.competitionCode = competitionCode;
  if (draftLockedArg !== undefined) patch.draftLocked = draftLockedArg.toLowerCase() !== 'false';
  if (groupsCountArg !== undefined) patch.groupsCount = Number(groupsCountArg);
  if (thirdPlaceSlotsArg !== undefined) patch.thirdPlaceSlots = Number(thirdPlaceSlotsArg);
  if (knockoutStagesArg !== undefined) patch.knockoutStages = knockoutStagesArg.split(',').map((s) => s.trim());

  console.log(`\nTournament "${tournament.slug}" — current:`, {
    slug: tournament.slug,
    name: tournament.name,
    shortName: tournament.shortName,
    status: tournament.status,
    competitionCode: tournament.competitionCode,
    draftLocked: tournament.draftLocked,
    groupsCount: tournament.groupsCount,
    thirdPlaceSlots: tournament.thirdPlaceSlots,
    knockoutStages: tournament.knockoutStages
  });

  if (Object.keys(patch).length === 0) {
    console.log(
      '\nNo flags given (--rename-slug / --name / --short-name / --status / --competition-code / ' +
      '--draft-locked / --groups-count / --third-place-slots / --knockout-stages). Nothing to do.'
    );
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
