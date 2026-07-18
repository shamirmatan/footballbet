/**
 * One-time migration: introduces the Tournament collection and backfills
 * tournamentId onto every existing Team/Match/Participant/TournamentState
 * document (all of which, pre-migration, implicitly belonged to the single
 * WC26 tournament).
 *
 * Creates two Tournament docs:
 *   - wc26:   status "live" (cron keeps polling football-data.org until the
 *             final is played — flip to "archived" afterwards, e.g. via
 *             `npx ts-node scripts/manageTournament.ts --tournament wc26 --status archived --execute`),
 *             competitionCode "WC", draft locked.
 *   - euro26: status "upcoming", empty competitionCode (set later once
 *             football-data.org exposes it), draft locked, no data yet.
 *
 * Also drops the old single-field unique indexes on Team.api_id and
 * Match.api_id (now unique per-tournament instead) and syncs the new
 * compound indexes.
 *
 * Safe to run more than once — already-migrated documents/tournaments are
 * left untouched.
 *
 *   npx ts-node scripts/migrateToMultiTournament.ts           # dry-run
 *   npx ts-node scripts/migrateToMultiTournament.ts --execute # apply
 */

import mongoose from 'mongoose';
import {config} from '../src/config/config';
import Tournament from '../src/models/Tournament';
import Team from '../src/models/Team';
import Match from '../src/models/Match';
import Participant from '../src/models/Participant';
import TournamentState from '../src/models/TournamentState';

const execute = process.argv.includes('--execute');

const WC26 = {
  slug: 'wc26',
  name: 'FIFA World Cup 2026',
  shortName: 'WC 2026',
  competitionCode: 'WC',
  status: 'live' as const,
  draftLocked: true,
  sortOrder: 1
};

const EURO26 = {
  slug: 'euro26',
  name: 'Euro 2026',
  shortName: 'Euro 2026',
  competitionCode: '',
  status: 'upcoming' as const,
  draftLocked: true,
  sortOrder: 2
};

async function main() {
  await mongoose.connect(config.mongo.url, {retryWrites: true, w: 'majority'});
  console.log('Connected.');

  const unmigratedTeams = await Team.countDocuments({tournamentId: {$exists: false}});
  const unmigratedMatches = await Match.countDocuments({tournamentId: {$exists: false}});
  const unmigratedParticipants = await Participant.countDocuments({tournamentId: {$exists: false}});
  const unmigratedStates = await TournamentState.countDocuments({tournamentId: {$exists: false}});
  const existingState = await TournamentState.findOne({tournamentId: {$exists: false}}).lean();

  const existingWc26 = await Tournament.findOne({slug: WC26.slug}).lean();
  const existingEuro26 = await Tournament.findOne({slug: EURO26.slug}).lean();

  console.log('\nWill migrate:');
  console.log(`  Tournament "wc26":   ${existingWc26 ? 'already exists, left as-is' : 'will be created (live)'}`);
  console.log(`  Tournament "euro26": ${existingEuro26 ? 'already exists, left as-is' : 'will be created (upcoming, empty)'}`);
  console.log(`  Teams to backfill:        ${unmigratedTeams}`);
  console.log(`  Matches to backfill:      ${unmigratedMatches}`);
  console.log(`  Participants to backfill: ${unmigratedParticipants}`);
  console.log(`  TournamentState to backfill: ${unmigratedStates}`);
  if (existingState) {
    console.log(`  Existing season range: ${existingState.seasonStart} - ${existingState.seasonEnd}`);
  }
  console.log('  Will drop legacy unique indexes Team.api_id_1 / Match.api_id_1 and sync compound (tournamentId, api_id) indexes.');

  if (!execute) {
    console.log('\n[dry-run] pass --execute to apply.');
    await mongoose.disconnect();
    return;
  }

  console.log('\nApplying...');

  let wc26 = existingWc26;
  if (!wc26) {
    wc26 = await Tournament.create({
      ...WC26,
      seasonStart: existingState?.seasonStart ?? '',
      seasonEnd: existingState?.seasonEnd ?? ''
    });
    console.log(`  Created tournament "wc26" (${wc26._id}).`);
  }

  if (!existingEuro26) {
    const euro26 = await Tournament.create(EURO26);
    console.log(`  Created tournament "euro26" (${euro26._id}).`);
  }

  const wc26Id = wc26._id;

  const teamResult = await Team.updateMany({tournamentId: {$exists: false}}, {$set: {tournamentId: wc26Id}});
  console.log(`  Teams backfilled:        ${teamResult.modifiedCount}`);

  const matchResult = await Match.updateMany({tournamentId: {$exists: false}}, {$set: {tournamentId: wc26Id}});
  console.log(`  Matches backfilled:      ${matchResult.modifiedCount}`);

  const participantResult = await Participant.updateMany({tournamentId: {$exists: false}}, {$set: {tournamentId: wc26Id}});
  console.log(`  Participants backfilled: ${participantResult.modifiedCount}`);

  const stateResult = await TournamentState.updateMany({tournamentId: {$exists: false}}, {$set: {tournamentId: wc26Id}});
  console.log(`  TournamentState backfilled: ${stateResult.modifiedCount}`);

  for (const [collection, indexName] of [['teams', 'api_id_1'], ['matches', 'api_id_1']] as const) {
    try {
      await mongoose.connection.db.collection(collection).dropIndex(indexName);
      console.log(`  Dropped legacy index ${collection}.${indexName}.`);
    } catch (err: any) {
      console.log(`  Skipped dropping ${collection}.${indexName} (${err.message}).`);
    }
  }

  await Team.syncIndexes();
  await Match.syncIndexes();
  await Participant.syncIndexes();
  await TournamentState.syncIndexes();
  await Tournament.syncIndexes();
  console.log('  Synced indexes.');

  console.log('\nDone. wc26 is live (cron keeps updating it until you archive it); euro26 is upcoming and empty.');
  console.log('Set euro26.competitionCode and flip its status to "live" once its data source is ready.');

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
