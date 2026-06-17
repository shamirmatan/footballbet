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
  computeChances,
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

  const chances = computeChances(teams, participants, matches, {runs: RUNS, seed});

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
