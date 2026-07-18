/**
 * Resets one tournament's data to a clean pre-tournament state: zeroed team
 * stats, all matches set to TIMED with null scores, knockout match team slots
 * cleared (group-stage slots are preserved — the draw is fixed), and
 * participant teams + points wiped.
 *
 * Intended to undo any mock data before the real tournament starts.
 *
 *   npx ts-node scripts/resetTournament.ts --tournament euro26           # dry-run
 *   npx ts-node scripts/resetTournament.ts --tournament euro26 --execute # apply
 */

import mongoose from 'mongoose';
import {config} from '../src/config/config';
import Team from '../src/models/Team';
import Match from '../src/models/Match';
import Participant from '../src/models/Participant';
import TournamentState from '../src/models/TournamentState';
import {resolveTournamentArg} from './lib/resolveTournamentArg';

const execute = process.argv.includes('--execute');

async function main() {
  await mongoose.connect(config.mongo.url, {retryWrites: true, w: 'majority'});
  console.log('Connected.');

  const tournament = await resolveTournamentArg(process.argv);
  const tournamentId = tournament._id;
  console.log(`Tournament: ${tournament.slug} (${tournament.name})`);

  const teams = await Team.find({tournamentId}).lean();
  const matches = await Match.find({tournamentId}).lean();
  const participants = await Participant.find({tournamentId}).lean();

  const groupMatches = matches.filter((m) => m.stage === 'GROUP_STAGE');
  const knockoutMatches = matches.filter((m) => m.stage !== 'GROUP_STAGE');
  const participantsWithTeams = participants.filter(
    (p: any) => Array.isArray(p.teams) && p.teams.length > 0
  );

  console.log('\nWill reset:');
  console.log(`  Teams:        ${teams.length} (zero stats, clear qualifications/eliminated)`);
  console.log(`  Matches:      ${matches.length} (status=TIMED, null scores/duration)`);
  console.log(`    group-stage: ${groupMatches.length} (keep team slots — draw is fixed)`);
  console.log(`    knockout:    ${knockoutMatches.length} (clear team slots — bracket TBD)`);
  console.log(`  Participants: ${participants.length} (clear teams[], points=0)`);
  console.log(`    currently with picks: ${participantsWithTeams.length}`);
  console.log(`  TournamentState: wipe (next cron run repopulates from API)`);

  if (!execute) {
    console.log('\n[dry-run] pass --execute to apply.');
    await mongoose.disconnect();
    return;
  }

  console.log('\nApplying...');
  const teamReset = await Team.updateMany(
    {tournamentId},
    {
      $set: {
        position: 0,
        games: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        totalGames: 0,
        totalWins: 0,
        totalDraws: 0,
        totalLosses: 0,
        totalGoalsFor: 0,
        totalGoalsAgainst: 0,
        points: 0,
        qualifications: 0,
        eliminated: false
      }
    }
  );
  console.log(`  Teams reset:        ${teamReset.modifiedCount}`);

  const groupReset = await Match.updateMany(
    {tournamentId, stage: 'GROUP_STAGE'},
    {
      $set: {
        status: 'TIMED',
        scoreHome: null,
        scoreAway: null,
        winner: null,
        duration: null
      }
    }
  );
  console.log(`  Group matches:      ${groupReset.modifiedCount}`);

  const knockoutReset = await Match.updateMany(
    {tournamentId, stage: {$ne: 'GROUP_STAGE'}},
    {
      $set: {
        status: 'TIMED',
        scoreHome: null,
        scoreAway: null,
        winner: null,
        duration: null,
        homeTeam: {api_id: null, name: null, logo: null},
        awayTeam: {api_id: null, name: null, logo: null}
      }
    }
  );
  console.log(`  Knockout matches:   ${knockoutReset.modifiedCount}`);

  const participantReset = await Participant.updateMany(
    {tournamentId},
    {$set: {teams: [], points: 0}}
  );
  console.log(`  Participants:       ${participantReset.modifiedCount}`);

  const stateWipe = await TournamentState.deleteMany({tournamentId});
  console.log(`  TournamentState:    ${stateWipe.deletedCount} deleted`);

  console.log('\nDone. Start the server to repopulate TournamentState (cron runs every minute):');
  console.log('  npm run build && npm start');

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
