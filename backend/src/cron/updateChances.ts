import mongoose from 'mongoose';
import {config} from '../config/config';
import Logging from '../library/Logging';
import Team from '../models/Team';
import Participant from '../models/Participant';
import Match from '../models/Match';
import {
  SimTeam,
  SimMatch,
  SimParticipant,
  computeChancesAndPaths,
  WinningPath,
  rating,
  RATING_BASE,
  RATING_STEP,
} from '../services/chances';

const RUNS = Number(process.env.CHANCES_RUNS || 20000);

function groupLetter(g: string | null | undefined): string {
  if (!g) return '?';
  const m = g.match(/([A-Z])$/i);
  return m ? m[1].toUpperCase() : g.toUpperCase();
}

// How far a team goes in a scenario, phrased for the narrative.
const STAGE_VERB: Record<number, string> = {
  6: 'go all the way and lift the trophy',
  5: 'reach the final',
  4: 'reach the semi-finals',
  3: 'reach the quarter-finals',
  2: 'reach the round of 16',
  1: 'get through to the round of 32'
};

/** Join names as "A", "A and B", or "A, B and C". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Turn a captured winning scenario into a plain-English sentence. */
function describeWinningPath(path: WinningPath, nameByApiId: Map<number, string>): string {
  const nameOf = (id: number) => nameByApiId.get(id) ?? String(id);

  // Group the participant's teams by how deep they went.
  const byStage = new Map<number, string[]>();
  for (const t of path.teams) {
    const list = byStage.get(t.stageReached) ?? [];
    list.push(nameOf(t.teamId));
    byStage.set(t.stageReached, list);
  }

  const clauses: string[] = [];
  let groupedOut: string[] = [];
  for (const stage of [...byStage.keys()].sort((a, b) => b - a)) {
    const names = byStage.get(stage)!;
    if (stage === 0) groupedOut = names;
    else clauses.push(`${joinNames(names)} ${STAGE_VERB[stage]}`);
  }

  let sentence = clauses.length
    ? `For ${path.lastName} to win, ${clauses.join('; ')}`
    : `For ${path.lastName} to win, his teams have to overperform badly`;
  if (groupedOut.length) {
    sentence += `, while ${joinNames(groupedOut)} bow out in the group stage`;
  }
  sentence += `. That puts him on ~${path.points} pts`;
  sentence +=
    path.margin > 0
      ? `, ${path.margin} clear of the runner-up.`
      : ` and he edges it on a tie-break.`;
  if (path.championId != null && !path.teams.some((t) => t.teamId === path.championId)) {
    sentence += ` (World Cup won by ${nameOf(path.championId)}.)`;
  }
  return sentence;
}

async function main() {
  await mongoose.connect(config.mongo.url, {retryWrites: true, w: 'majority'});
  Logging.info('Chances: connected to Mongo.');

  const teamDocs = await Team.find().lean();
  const participantDocs = await Participant.find().lean();
  const matchDocs = await Match.find({stage: 'GROUP_STAGE'}).lean();

  // ── Data summary ────────────────────────────────────────────────────────────

  const finishedMatches = matchDocs.filter((m: any) => m.status === 'FINISHED');
  const pendingMatches  = matchDocs.filter((m: any) => m.status !== 'FINISHED');
  const eliminatedTeams = teamDocs.filter((t: any) => t.eliminated);

  Logging.info(
    `Chances: loaded ${teamDocs.length} teams, ` +
    `${participantDocs.length} participants, ` +
    `${matchDocs.length} group-stage matches`
  );
  Logging.info(
    `Chances: matches — ${finishedMatches.length} finished (scores frozen in sim), ` +
    `${pendingMatches.length} not yet played (rolled by Monte Carlo)`
  );
  Logging.info(
    `Chances: ${eliminatedTeams.length} teams already eliminated ` +
    `(capped at their banked qualification level in every sim run)`
  );

  // ── Strength model summary ───────────────────────────────────────────────────

  Logging.info(
    `Chances: strength model — tier 1 = ${RATING_BASE} pts, ` +
    `each tier drops ${RATING_STEP} pts ` +
    `(tier 6 = ${RATING_BASE - 5 * RATING_STEP}). ` +
    `Win probability scales via Elo-style formula; goals drawn from Poisson distribution.`
  );

  // ── Build sim inputs ─────────────────────────────────────────────────────────

  const teams: SimTeam[] = teamDocs.map((t: any) => ({
    api_id: t.api_id,
    group: groupLetter(t.group),
    tier: t.tier || 6,
    achievedQual: t.qualifications || 0,
    eliminated: !!t.eliminated,
  }));

  const matches: SimMatch[] = matchDocs
    .filter((m: any) => m.homeTeam?.api_id && m.awayTeam?.api_id)
    .map((m: any) => ({
      group: groupLetter(m.group),
      status: m.status,
      homeId: m.homeTeam.api_id,
      awayId: m.awayTeam.api_id,
      scoreHome: m.scoreHome ?? null,
      scoreAway: m.scoreAway ?? null,
    }));

  const apiIdByObjId = new Map<string, number>();
  const nameByApiId  = new Map<number, string>();
  for (const t of teamDocs as any[]) {
    apiIdByObjId.set(String(t._id), t.api_id);
    nameByApiId.set(t.api_id, t.name);
  }

  const participants: SimParticipant[] = participantDocs.map((p: any) => ({
    lastName: p.lastName,
    teamIds: (p.teams || [])
      .map((id: any) => apiIdByObjId.get(String(id)))
      .filter((x: any): x is number => typeof x === 'number'),
  }));

  // ── Log each participant's roster going into the sim ────────────────────────

  Logging.info('Chances: participant rosters entering simulation:');
  for (const p of participants) {
    const doc = (participantDocs as any[]).find((d) => d.lastName === p.lastName);
    const teamNames = p.teamIds.map((id) => {
      const teamDoc = (teamDocs as any[]).find((t) => t.api_id === id);
      const tierLabel = teamDoc ? `tier ${teamDoc.tier}` : '?';
      return `${nameByApiId.get(id) ?? id} (${tierLabel})`;
    });
    Logging.info(
      `  ${p.lastName} — current pts: ${doc?.points ?? '?'}, ` +
      `teams: ${teamNames.join(', ')}`
    );
  }

  // ── Run the simulation ───────────────────────────────────────────────────────

  const seed = Date.now();
  Logging.info(
    `Chances: starting Monte Carlo — ${RUNS.toLocaleString()} runs, ` +
    `seed ${seed}. Each run simulates all unplayed group matches and the full ` +
    `knockout bracket, then scores every participant and records the winner.`
  );

  const {chances, paths} = computeChancesAndPaths(teams, participants, matches, {runs: RUNS, seed});

  Logging.info(`Chances: simulation complete. Writing results:`);

  // ── Write results and log each outcome ──────────────────────────────────────

  const results: Array<{name: string; pct: number; pts: number}> = [];

  for (const p of participantDocs as any[]) {
    const pct = chances[p.lastName] ?? 0;
    await Participant.updateOne({_id: p._id}, {$set: {chances: pct}});
    results.push({name: p.lastName, pct, pts: p.points ?? 0});
  }

  // Sort by win chance descending for the summary
  results.sort((a, b) => b.pct - a.pct);

  Logging.info('Chances: final standings (sorted by win probability):');
  for (const {name, pct, pts} of results) {
    const bar = '█'.repeat(Math.round(pct / 5)).padEnd(20, '░');
    Logging.info(`  ${name.padEnd(12)} ${String(pct).padStart(3)}%  ${bar}  (live pts: ${pts})`);
  }

  // ── Log a sample path to victory for each participant ───────────────────────

  Logging.info('Chances: a path to victory for each participant:');
  for (const {name} of results) {
    const path = paths[name];
    if (path) {
      Logging.info(`  ${describeWinningPath(path, nameByApiId)}`);
    } else {
      Logging.info(
        `  For ${name} to win: no winning scenario turned up in ${RUNS.toLocaleString()} ` +
        `runs — realistically out of it.`
      );
    }
  }

  Logging.info(`Chances: done — ${RUNS.toLocaleString()} Monte Carlo runs completed.`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  Logging.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
