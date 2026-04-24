/**
 * Assigns teams to each participant from a config file. Use after a reset
 * (scripts/resetTournament.ts) when the real picks have been made.
 *
 *   npx ts-node scripts/assignTeams.ts                 # dry-run
 *   npx ts-node scripts/assignTeams.ts --execute       # apply
 *   npx ts-node scripts/assignTeams.ts --config my.json
 *
 * Config file (JSON). Keys are participant lastNames; values are lists of
 * team names (must match Team.name exactly — run the script once dry to
 * see what names exist and catch typos):
 *
 *   {
 *     "Shamir":  ["Argentina", "France", ...12 total...],
 *     "Ganor":   [...],
 *     "Katz":    [...],
 *     "Gabay":   [...]
 *   }
 *
 * Validation:
 *   - Every team name referenced must exist in the Team collection
 *   - Every team must appear exactly once across all participants
 *   - Each participant must get exactly 12 teams
 */

import * as fs from 'fs';
import * as path from 'path';
import mongoose from 'mongoose';
import {config} from '../src/config/config';
import Team from '../src/models/Team';
import Participant from '../src/models/Participant';

const DEFAULT_CONFIG = 'scripts/assignments.json';
const TEAMS_PER_PARTICIPANT = 12;

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const configIdx = args.indexOf('--config');
const configPath = configIdx >= 0 ? args[configIdx + 1] : DEFAULT_CONFIG;

interface Assignments {
  [lastName: string]: string[];
}

async function main() {
  const absConfig = path.resolve(configPath);
  if (!fs.existsSync(absConfig)) {
    console.error(`Config not found: ${absConfig}`);
    console.error(`Create one (see scripts/assignments.example.json) or pass --config PATH.`);
    process.exit(1);
  }
  const raw = fs.readFileSync(absConfig, 'utf-8');
  const assignments: Assignments = JSON.parse(raw);

  await mongoose.connect(config.mongo.url, {retryWrites: true, w: 'majority'});
  console.log(`Connected. Config: ${absConfig}`);

  const teams = await Team.find().lean();
  const participants = await Participant.find().lean();
  const teamByName = new Map<string, any>();
  for (const t of teams) teamByName.set(t.name.toLowerCase(), t);

  // --- validate ---
  const errors: string[] = [];
  const assignedTeamNames: string[] = [];

  for (const [lastName, list] of Object.entries(assignments)) {
    const p = participants.find((x: any) => x.lastName === lastName);
    if (!p) {
      errors.push(`No participant with lastName="${lastName}"`);
      continue;
    }
    if (list.length !== TEAMS_PER_PARTICIPANT) {
      errors.push(`"${lastName}" has ${list.length} teams, expected ${TEAMS_PER_PARTICIPANT}`);
    }
    for (const teamName of list) {
      if (!teamByName.has(teamName.toLowerCase())) {
        errors.push(`"${lastName}": unknown team "${teamName}"`);
      } else {
        assignedTeamNames.push(teamName.toLowerCase());
      }
    }
  }

  const dupes = assignedTeamNames.filter((n, i) => assignedTeamNames.indexOf(n) !== i);
  if (dupes.length > 0) {
    errors.push(`Teams assigned more than once: ${[...new Set(dupes)].join(', ')}`);
  }

  const missingParticipants = participants
    .map((p: any) => p.lastName)
    .filter((ln) => !(ln in assignments));
  if (missingParticipants.length > 0) {
    errors.push(`Participants without any assignment: ${missingParticipants.join(', ')}`);
  }

  // --- report ---
  console.log('\nAssignments preview:');
  for (const [lastName, list] of Object.entries(assignments)) {
    const p = participants.find((x: any) => x.lastName === lastName);
    console.log(`\n${p?.firstName ?? '?'} ${lastName} (${list.length}):`);
    for (const name of list) {
      const t = teamByName.get(name.toLowerCase());
      console.log(`  ${t ? '✓' : '✗'} ${name}${t ? ` [Group ${t.group}]` : ' — UNKNOWN TEAM'}`);
    }
  }

  if (errors.length > 0) {
    console.error('\nValidation errors:');
    errors.forEach((e) => console.error(`  • ${e}`));
    await mongoose.disconnect();
    process.exit(2);
  }

  console.log('\nValidation passed.');

  if (!execute) {
    console.log('[dry-run] pass --execute to apply.');
    await mongoose.disconnect();
    return;
  }

  console.log('\nApplying...');
  for (const [lastName, list] of Object.entries(assignments)) {
    const p = participants.find((x: any) => x.lastName === lastName);
    if (!p) continue;
    const teamIds = list
      .map((n) => teamByName.get(n.toLowerCase())?._id)
      .filter(Boolean);
    await Participant.updateOne(
      {_id: p._id},
      {$set: {teams: teamIds, points: 0}}
    );
    console.log(`  ${lastName}: ${teamIds.length} teams assigned`);
  }

  console.log('\nDone. Run the cron to recompute participant points from team stats:');
  console.log('  npm run build && npm run cron:update');

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
