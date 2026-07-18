/**
 * Randomly assigns rank 5 & 6 (tier 5 & 6) teams to participants.
 *
 *   npx ts-node scripts/assignRanks56.ts --tournament euro26             # dry-run (random preview)
 *   npx ts-node scripts/assignRanks56.ts --tournament euro26 --execute   # apply to MongoDB
 *   npx ts-node scripts/assignRanks56.ts --tournament euro26 --seed 42    # reproducible randomness
 *
 * Ranks 1–4 are assumed already picked (each participant has 8 teams).
 * This script fills the remaining 4 teams per participant: exactly 2 from
 * tier 5 and 2 from tier 6, chosen at random.
 *
 * Hard constraint: no participant may end up with 3+ teams in the same
 * World Cup group. If a participant already has 2 teams in a group (from
 * any rank), they will not receive a 3rd from that group. The assignment
 * uses randomized backtracking, so it only ever produces a valid draw —
 * equivalent to "pick random, re-draw if the condition is violated".
 *
 * The new team ids are appended to each participant's existing `teams`.
 */

import mongoose from 'mongoose';
import {config} from '../src/config/config';
import Team from '../src/models/Team';
import Participant from '../src/models/Participant';
import {resolveTournamentArg} from './lib/resolveTournamentArg';

const RANKS_TO_FILL = [5, 6];
const PER_RANK_PER_PARTICIPANT = 2;
const MAX_PER_GROUP = 2;

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const seedIdx = args.indexOf('--seed');
const seed = seedIdx >= 0 ? Number(args[seedIdx + 1]) : Date.now();

// Small seeded PRNG (mulberry32) so a run can be reproduced with --seed.
function makeRng(s: number) {
  let a = s >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = makeRng(seed);

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface TeamLite {
  id: string;
  name: string;
  group: string;
  tier: number;
}

interface PState {
  lastName: string;
  firstName: string;
  existingTeamIds: string[];
  // mutable during search:
  groupCount: Record<string, number>;
  rankQuota: Record<number, number>;
  assigned: TeamLite[];
}

/**
 * Randomized backtracking. Assigns every team in `pool` to a participant
 * respecting per-rank quota and the max-per-group constraint. Returns true
 * on success (state mutated in place), false if no valid assignment exists.
 */
function solve(pool: TeamLite[], idx: number, participants: PState[]): boolean {
  if (idx === pool.length) return true;
  const team = pool[idx];
  for (const p of shuffle(participants)) {
    const okQuota = (p.rankQuota[team.tier] ?? 0) > 0;
    const okGroup = (p.groupCount[team.group] ?? 0) < MAX_PER_GROUP;
    if (!okQuota || !okGroup) continue;

    p.rankQuota[team.tier]--;
    p.groupCount[team.group] = (p.groupCount[team.group] ?? 0) + 1;
    p.assigned.push(team);

    if (solve(pool, idx + 1, participants)) return true;

    p.rankQuota[team.tier]++;
    p.groupCount[team.group]--;
    p.assigned.pop();
  }
  return false;
}

async function main() {
  await mongoose.connect(config.mongo.url, {retryWrites: true, w: 'majority'});
  console.log(`Connected. seed=${seed}${seedIdx < 0 ? ' (random; pass --seed to reproduce)' : ''}`);

  const tournament = await resolveTournamentArg(process.argv);
  const tournamentId = tournament._id;
  console.log(`Tournament: ${tournament.slug} (${tournament.name})`);

  const teams = await Team.find({tournamentId}).lean();
  const participantsRaw = await Participant.find({tournamentId}).populate('teams').lean();

  const teamById = new Map<string, any>();
  for (const t of teams) teamById.set(String(t._id), t);

  // --- build participant state from existing (rank 1–4) picks ---
  const participants: PState[] = participantsRaw.map((p: any) => {
    const groupCount: Record<string, number> = {};
    const existingTeamIds: string[] = [];
    for (const t of p.teams) {
      existingTeamIds.push(String(t._id));
      groupCount[t.group] = (groupCount[t.group] ?? 0) + 1;
    }
    const rankQuota: Record<number, number> = {};
    for (const r of RANKS_TO_FILL) rankQuota[r] = PER_RANK_PER_PARTICIPANT;
    return {
      lastName: p.lastName,
      firstName: p.firstName,
      existingTeamIds,
      groupCount,
      rankQuota,
      assigned: [],
    };
  });

  // --- validate preconditions ---
  const errors: string[] = [];
  const pool: TeamLite[] = [];
  const alreadyAssignedTier56 = new Set<string>();
  for (const p of participants) {
    for (const id of p.existingTeamIds) {
      const t = teamById.get(id);
      if (t && RANKS_TO_FILL.includes(t.tier)) alreadyAssignedTier56.add(t.name);
    }
  }

  for (const rank of RANKS_TO_FILL) {
    const rankTeams = teams.filter((t: any) => t.tier === rank);
    const expected = participants.length * PER_RANK_PER_PARTICIPANT;
    if (rankTeams.length !== expected) {
      errors.push(`Rank ${rank}: found ${rankTeams.length} teams, expected ${expected}`);
    }
    for (const t of rankTeams) {
      if (alreadyAssignedTier56.has(t.name)) {
        errors.push(`Rank ${rank}: "${t.name}" already assigned to a participant`);
      }
      pool.push({id: String(t._id), name: t.name, group: t.group, tier: t.tier});
    }
  }

  for (const p of participants) {
    const have = p.existingTeamIds.length;
    if (have !== 8) {
      errors.push(`${p.lastName} has ${have} teams before rank 5/6 (expected 8)`);
    }
    for (const [g, c] of Object.entries(p.groupCount)) {
      if (c > MAX_PER_GROUP) {
        errors.push(`${p.lastName} already has ${c} teams in group ${g} (>2) from ranks 1–4`);
      }
    }
  }

  if (errors.length > 0) {
    console.error('\nPrecondition errors — aborting:');
    errors.forEach((e) => console.error(`  • ${e}`));
    await mongoose.disconnect();
    process.exit(2);
  }

  // --- draw ---
  const ok = solve(shuffle(pool), 0, participants);
  if (!ok) {
    console.error('\nNo valid assignment exists under the max-2-per-group constraint.');
    await mongoose.disconnect();
    process.exit(3);
  }

  // --- report ---
  console.log('\nRandom rank 5 & 6 picks:');
  for (const p of participants) {
    const byRank = RANKS_TO_FILL.map(
      (r) =>
        `R${r}: ${p.assigned
          .filter((t) => t.tier === r)
          .map((t) => `${t.name} [${t.group}]`)
          .join(', ')}`
    );
    console.log(`\n${p.firstName} ${p.lastName}`);
    byRank.forEach((line) => console.log(`  ${line}`));
    const finalGroups = {...p.groupCount};
    const doubled = Object.entries(finalGroups)
      .filter(([, c]) => c === MAX_PER_GROUP)
      .map(([g]) => g);
    console.log(`  groups with 2 (max): ${doubled.length ? doubled.sort().join(', ') : 'none'}`);
  }

  // sanity: every group count <= 2
  const violation = participants.some((p) =>
    Object.values(p.groupCount).some((c) => c > MAX_PER_GROUP)
  );
  if (violation) {
    console.error('\nInternal error: constraint violated. Aborting without writing.');
    await mongoose.disconnect();
    process.exit(4);
  }

  if (!execute) {
    console.log('\n[dry-run] No changes written. Re-run with --execute to apply.');
    console.log(`Reproduce this exact draw with: --seed ${seed} --execute`);
    await mongoose.disconnect();
    return;
  }

  console.log('\nApplying...');
  for (const p of participants) {
    const newIds = p.assigned.map((t) => t.id);
    const finalIds = [...p.existingTeamIds, ...newIds];
    await Participant.updateOne(
      {tournamentId, lastName: p.lastName},
      {$set: {teams: finalIds}}
    );
    console.log(`  ${p.lastName}: +${newIds.length} teams (now ${finalIds.length})`);
  }
  console.log('\nDone. The pick-teams page polls /participants, so it will refresh live.');

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
