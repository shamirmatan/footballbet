/**
 * Populates the DB with a realistic mid-tournament snapshot so every UI state
 * can be exercised: group stage finished, R32/R16 finished, QF in progress
 * (2 done, 1 live, 1 upcoming), SF/Final/3rd still scheduled.
 *
 * Run once: `npx ts-node scripts/mockData.ts`
 * (Uses the same backend/.env credentials.)
 */

import mongoose from 'mongoose';
import {config} from '../src/config/config';
import Team, {ITeam} from '../src/models/Team';
import Match, {IMatch} from '../src/models/Match';
import Participant from '../src/models/Participant';
import TournamentState from '../src/models/TournamentState';

// Deterministic RNG so reruns are reproducible
let seed = 42;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 0xffffffff;
  return seed / 0xffffffff;
};
const randInt = (n: number) => Math.floor(rand() * n);
const pickScore = () => {
  const r = rand();
  if (r < 0.15) return 0;
  if (r < 0.45) return 1;
  if (r < 0.75) return 2;
  if (r < 0.92) return 3;
  return 4;
};

interface TeamAccumulator {
  api_id: number;
  name: string;
  logo: string;
  group: string;
  position: number;
  // Group-stage stats (what football-data's standings API reports)
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  // Total stats across every FINISHED match the team played (group + knockouts)
  totalGames: number;
  totalWins: number;
  totalDraws: number;
  totalLosses: number;
  totalGoalsFor: number;
  totalGoalsAgainst: number;
  // Knockout match points: regulation win = 3 (koWins), tie at 90' settled in
  // ET/pens = 1 for both sides (koDraws). Kept apart from the group-stage W/D/L.
  koWins: number;
  koDraws: number;
  points: number;
  maxStage: string;
  isChampion: boolean;
}

const STAGE_RANK: Record<string, number> = {
  GROUP_STAGE: 0,
  LAST_32: 1,
  LAST_16: 2,
  QUARTER_FINALS: 3,
  SEMI_FINALS: 4,
  THIRD_PLACE: 4,
  FINAL: 5
};

const QUALIFICATION_BONUS: Record<number, number> = {
  0: 0,
  1: 3,
  2: 8,
  3: 13,
  4: 18,
  5: 23,
  6: 33
};

const mkAcc = (t: ITeam): TeamAccumulator => ({
  api_id: t.api_id,
  name: t.name,
  logo: t.logo,
  group: t.group,
  position: 0,
  games: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  goalsFor: 0,
  goalsAgainst: 0,
  totalGames: 0,
  totalWins: 0,
  totalDraws: 0,
  totalLosses: 0,
  totalGoalsFor: 0,
  totalGoalsAgainst: 0,
  koWins: 0,
  koDraws: 0,
  points: 0,
  maxStage: 'GROUP_STAGE',
  isChampion: false
});

const record = (
  acc: TeamAccumulator,
  gf: number,
  ga: number,
  stage: string,
  wentToEt: boolean = false
) => {
  // Group-stage columns (wins/draws/losses/goals*) mirror the football-data
  // /standings API and drive the points formula. Total-* columns mirror
  // every FINISHED match we've ever played and drive the participant
  // teams-table summary. Knockout matches that went to extra time or
  // penalties count as a draw for both sides (the winner still advances
  // via qualifications).
  acc.totalGames += 1;
  acc.totalGoalsFor += gf;
  acc.totalGoalsAgainst += ga;
  if (wentToEt) acc.totalDraws += 1;
  else if (gf > ga) acc.totalWins += 1;
  else if (gf === ga) acc.totalDraws += 1;
  else acc.totalLosses += 1;

  if (stage === 'GROUP_STAGE') {
    acc.games += 1;
    acc.goalsFor += gf;
    acc.goalsAgainst += ga;
    if (gf > ga) acc.wins += 1;
    else if (gf === ga) acc.draws += 1;
    else acc.losses += 1;
  } else {
    // Knockout match points: a tie at 90' (ET/pens) is a draw for both sides,
    // a regulation win banks 3 for the winner.
    if (wentToEt) acc.koDraws += 1;
    else if (gf > ga) acc.koWins += 1;
  }
  if (STAGE_RANK[stage] > STAGE_RANK[acc.maxStage]) acc.maxStage = stage;
};

async function main() {
  await mongoose.connect(config.mongo.url, {retryWrites: true, w: 'majority'});
  console.log('Connected.');

  const teams = await Team.find().lean<ITeam[]>();
  const matches = await Match.find().lean<IMatch[]>();
  if (teams.length !== 48) throw new Error(`expected 48 teams, got ${teams.length}`);

  const accs = new Map<number, TeamAccumulator>();
  teams.forEach((t) => accs.set(t.api_id, mkAcc(t)));

  const groupMatches = matches.filter((m) => m.stage === 'GROUP_STAGE');
  const knockoutStages = ['LAST_32', 'LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'THIRD_PLACE', 'FINAL'];
  const knockoutByStage = new Map<string, IMatch[]>();
  for (const s of knockoutStages) {
    knockoutByStage.set(
      s,
      matches.filter((m) => m.stage === s).sort((a, b) => a.utcDate.localeCompare(b.utcDate))
    );
  }

  // === GROUP STAGE ===
  // Play every scheduled group match. Simulate score, update both team stats,
  // write back to Match doc (status FINISHED).
  const matchUpdates: {id: number; patch: Partial<IMatch>}[] = [];

  for (const m of groupMatches) {
    if (!m.homeTeam.api_id || !m.awayTeam.api_id) continue;
    const home = accs.get(m.homeTeam.api_id)!;
    const away = accs.get(m.awayTeam.api_id)!;
    const gf = pickScore();
    const ga = pickScore();
    record(home, gf, ga, 'GROUP_STAGE');
    record(away, ga, gf, 'GROUP_STAGE');
    matchUpdates.push({
      id: m.api_id,
      patch: {
        status: 'FINISHED',
        scoreHome: gf,
        scoreAway: ga,
        winner: gf > ga ? 'HOME_TEAM' : gf < ga ? 'AWAY_TEAM' : 'DRAW',
        duration: 'REGULAR'
      }
    });
  }

  // Determine group positions
  const byGroup = new Map<string, TeamAccumulator[]>();
  for (const a of accs.values()) {
    if (!byGroup.has(a.group)) byGroup.set(a.group, []);
    byGroup.get(a.group)!.push(a);
  }
  for (const list of byGroup.values()) {
    list.sort((x, y) => {
      const xp = x.wins * 3 + x.draws;
      const yp = y.wins * 3 + y.draws;
      if (yp !== xp) return yp - xp;
      const xgd = x.goalsFor - x.goalsAgainst;
      const ygd = y.goalsFor - y.goalsAgainst;
      if (ygd !== xgd) return ygd - xgd;
      if (y.goalsFor !== x.goalsFor) return y.goalsFor - x.goalsFor;
      return x.name.localeCompare(y.name);
    });
    list.forEach((t, i) => (t.position = i + 1));
  }

  // Collect top 2 per group (24 teams)
  const auto: TeamAccumulator[] = [];
  const thirds: TeamAccumulator[] = [];
  for (const list of byGroup.values()) {
    auto.push(list[0], list[1]);
    thirds.push(list[2]);
  }
  thirds.sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    return y.goalsFor - y.goalsAgainst - (x.goalsFor - x.goalsAgainst);
  });
  const bestThirds = thirds.slice(0, 8);
  const advancers = [...auto, ...bestThirds]; // 32 teams -> R32

  console.log(`Group stage done. Advancers: ${advancers.length}`);

  // === Simulate a knockout round ===
  // Returns the winners for the next round.
  const playRound = (
    input: TeamAccumulator[],
    stage: string,
    finished: number // how many matches to mark finished; rest stay scheduled
  ): TeamAccumulator[] => {
    const slots = knockoutByStage.get(stage) ?? [];
    const numMatches = input.length / 2;
    if (slots.length < numMatches) {
      console.warn(`stage ${stage}: need ${numMatches} matches, have ${slots.length}`);
    }
    const winners: TeamAccumulator[] = [];
    for (let i = 0; i < numMatches; i++) {
      const home = input[i * 2];
      const away = input[i * 2 + 1];
      const slot = slots[i];
      if (!slot) break;

      if (i < finished) {
        // Fully played with a winner. ~25% go to extra time / penalties
        // (i.e., tied at 90 min — counts as a draw in W/D/L but the winner
        // still advances).
        let gf = pickScore();
        let ga = pickScore();
        const wentToEt = gf === ga || rand() < 0.25;
        let duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT' = 'REGULAR';
        if (wentToEt) {
          duration = rand() < 0.5 ? 'EXTRA_TIME' : 'PENALTY_SHOOTOUT';
          if (gf === ga) {
            // Nudge one side so the visible final score shows a winner,
            // but the pre-ET tie is implied by duration !== REGULAR.
            if (rand() < 0.5) gf += 1;
            else ga += 1;
          }
        } else if (gf === ga) {
          // Shouldn't happen (wentToEt would be true), but belt & braces.
          if (rand() < 0.5) gf += 1;
          else ga += 1;
        }
        record(home, gf, ga, stage, wentToEt);
        record(away, ga, gf, stage, wentToEt);
        winners.push(gf > ga ? home : away);
        matchUpdates.push({
          id: slot.api_id,
          patch: {
            status: 'FINISHED',
            scoreHome: gf,
            scoreAway: ga,
            winner: gf > ga ? 'HOME_TEAM' : 'AWAY_TEAM',
            duration,
            homeTeam: {api_id: home.api_id, name: home.name, logo: home.logo},
            awayTeam: {api_id: away.api_id, name: away.name, logo: away.logo}
          }
        });
      } else {
        // Not yet played; we still write the team assignments (since in real
        // life football-data only fills them in when the bracket is decided)
        matchUpdates.push({
          id: slot.api_id,
          patch: {
            status: 'TIMED',
            scoreHome: null,
            scoreAway: null,
            winner: null,
            homeTeam: {api_id: home.api_id, name: home.name, logo: home.logo},
            awayTeam: {api_id: away.api_id, name: away.name, logo: away.logo}
          }
        });
      }
    }
    return winners;
  };

  // Shuffle a bit so matchups vary without being completely random
  for (let i = advancers.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [advancers[i], advancers[j]] = [advancers[j], advancers[i]];
  }

  // R32: 32 -> 16 (all finished)
  const r16Teams = playRound(advancers, 'LAST_32', 16);
  // R16: 16 -> 8 (all finished)
  const qfTeams = playRound(r16Teams, 'LAST_16', 8);
  // QF: 8 -> 4 (2 finished, 1 live, 1 upcoming)
  // We handle QF manually to inject a live match.
  const qfSlots = knockoutByStage.get('QUARTER_FINALS') ?? [];
  const sfTeams: TeamAccumulator[] = [];
  for (let i = 0; i < 4; i++) {
    const home = qfTeams[i * 2];
    const away = qfTeams[i * 2 + 1];
    const slot = qfSlots[i];
    if (!slot) break;

    if (i < 2) {
      // FINISHED — same ET/pens logic as playRound
      let gf = pickScore();
      let ga = pickScore();
      const wentToEt = gf === ga || rand() < 0.25;
      let duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT' = 'REGULAR';
      if (wentToEt) {
        duration = rand() < 0.5 ? 'EXTRA_TIME' : 'PENALTY_SHOOTOUT';
        if (gf === ga) {
          if (rand() < 0.5) gf += 1;
          else ga += 1;
        }
      } else if (gf === ga) {
        if (rand() < 0.5) gf += 1;
        else ga += 1;
      }
      record(home, gf, ga, 'QUARTER_FINALS', wentToEt);
      record(away, ga, gf, 'QUARTER_FINALS', wentToEt);
      sfTeams.push(gf > ga ? home : away);
      matchUpdates.push({
        id: slot.api_id,
        patch: {
          status: 'FINISHED',
          scoreHome: gf,
          scoreAway: ga,
          winner: gf > ga ? 'HOME_TEAM' : 'AWAY_TEAM',
          duration,
          homeTeam: {api_id: home.api_id, name: home.name, logo: home.logo},
          awayTeam: {api_id: away.api_id, name: away.name, logo: away.logo}
        }
      });
    } else if (i === 2) {
      // LIVE
      const gf = 1;
      const ga = 1;
      // Book keeping: since the match hasn't finished, we don't commit wins/draws to team stats
      matchUpdates.push({
        id: slot.api_id,
        patch: {
          status: 'IN_PLAY',
          scoreHome: gf,
          scoreAway: ga,
          winner: null,
          homeTeam: {api_id: home.api_id, name: home.name, logo: home.logo},
          awayTeam: {api_id: away.api_id, name: away.name, logo: away.logo}
        }
      });
      // Reaching QF counts toward qualifications already
      if (STAGE_RANK.QUARTER_FINALS > STAGE_RANK[home.maxStage]) home.maxStage = 'QUARTER_FINALS';
      if (STAGE_RANK.QUARTER_FINALS > STAGE_RANK[away.maxStage]) away.maxStage = 'QUARTER_FINALS';
    } else {
      // TIMED (upcoming)
      matchUpdates.push({
        id: slot.api_id,
        patch: {
          status: 'TIMED',
          scoreHome: null,
          scoreAway: null,
          winner: null,
          homeTeam: {api_id: home.api_id, name: home.name, logo: home.logo},
          awayTeam: {api_id: away.api_id, name: away.name, logo: away.logo}
        }
      });
      if (STAGE_RANK.QUARTER_FINALS > STAGE_RANK[home.maxStage]) home.maxStage = 'QUARTER_FINALS';
      if (STAGE_RANK.QUARTER_FINALS > STAGE_RANK[away.maxStage]) away.maxStage = 'QUARTER_FINALS';
    }
  }

  // Leave SF / THIRD_PLACE / FINAL as TIMED with null team slots.
  // (Default pre-tournament state is already that; still clear any residual scores.)
  for (const s of ['SEMI_FINALS', 'THIRD_PLACE', 'FINAL']) {
    const slots = knockoutByStage.get(s) ?? [];
    for (const slot of slots) {
      matchUpdates.push({
        id: slot.api_id,
        patch: {
          status: 'TIMED',
          scoreHome: null,
          scoreAway: null,
          winner: null,
          homeTeam: {api_id: null, name: null, logo: null},
          awayTeam: {api_id: null, name: null, logo: null}
        }
      });
    }
  }

  // === Persist matches ===
  console.log(`Writing ${matchUpdates.length} match updates...`);
  for (const mu of matchUpdates) {
    await Match.updateOne({api_id: mu.id}, {$set: mu.patch});
  }

  // === Persist teams ===
  const eliminatedCutoff = new Set<number>();
  // A team is eliminated if its maxStage != QUARTER_FINALS (i.e., lost earlier)
  // AND maxStage != and it's not in an upcoming/live QF.
  const stillAlive = new Set<number>();
  for (const t of qfTeams.slice(0, 8)) stillAlive.add(t.api_id);
  // Further narrow: only the SF-bound teams + QF live + QF upcoming teams are alive.
  const aliveNow = new Set<number>([...sfTeams.map((t) => t.api_id)]);
  // Also keep teams in QF live/upcoming alive
  for (let i = 2; i < 4; i++) {
    if (qfTeams[i * 2]) aliveNow.add(qfTeams[i * 2].api_id);
    if (qfTeams[i * 2 + 1]) aliveNow.add(qfTeams[i * 2 + 1].api_id);
  }

  console.log(`Writing ${accs.size} team updates...`);
  for (const a of accs.values()) {
    const qualifications = STAGE_RANK[a.maxStage] ?? 0;
    const basePoints = a.wins * 3 + a.draws;
    const koPoints = a.koWins * 3 + a.koDraws;
    const bonus = QUALIFICATION_BONUS[qualifications] ?? 0;
    const eliminated = !aliveNow.has(a.api_id);
    await Team.updateOne(
      {api_id: a.api_id},
      {
        $set: {
          position: a.position,
          games: a.games,
          wins: a.wins,
          draws: a.draws,
          losses: a.losses,
          goalsFor: a.goalsFor,
          goalsAgainst: a.goalsAgainst,
          goalDifference: a.goalsFor - a.goalsAgainst,
          totalGames: a.totalGames,
          totalWins: a.totalWins,
          totalDraws: a.totalDraws,
          totalLosses: a.totalLosses,
          totalGoalsFor: a.totalGoalsFor,
          totalGoalsAgainst: a.totalGoalsAgainst,
          points: basePoints + koPoints + bonus,
          qualifications,
          eliminated
        }
      }
    );
  }

  // === Recompute participant points ===
  console.log('Recomputing participant points...');
  for await (const p of Participant.find().populate('teams')) {
    const teams = (p.teams as unknown) as ITeam[];
    const sum = teams.reduce((acc, t) => acc + (t?.points ?? 0), 0);
    p.set({points: sum});
    await p.save();
  }

  // === Update TournamentState ===
  const liveMatch = await Match.findOne({stage: 'QUARTER_FINALS', status: 'IN_PLAY'}).lean();
  const nextMatch = await Match.findOne({
    stage: 'QUARTER_FINALS',
    status: 'TIMED'
  }).sort({utcDate: 1}).lean();
  await TournamentState.updateOne(
    {},
    {
      $set: {
        stage: 'QUARTER_FINALS',
        liveMatch: liveMatch
          ? {
              home: liveMatch.homeTeam.name ?? 'TBD',
              away: liveMatch.awayTeam.name ?? 'TBD',
              homeLogo: liveMatch.homeTeam.logo ?? undefined,
              awayLogo: liveMatch.awayTeam.logo ?? undefined,
              utcDate: liveMatch.utcDate,
              group: null,
              stage: liveMatch.stage,
              status: liveMatch.status,
              scoreHome: liveMatch.scoreHome,
              scoreAway: liveMatch.scoreAway
            }
          : null,
        nextMatch: nextMatch
          ? {
              home: nextMatch.homeTeam.name ?? 'TBD',
              away: nextMatch.awayTeam.name ?? 'TBD',
              homeLogo: nextMatch.homeTeam.logo ?? undefined,
              awayLogo: nextMatch.awayTeam.logo ?? undefined,
              utcDate: nextMatch.utcDate,
              group: null,
              stage: nextMatch.stage,
              status: nextMatch.status,
              scoreHome: null,
              scoreAway: null
            }
          : null,
        updatedAt: new Date()
      }
    },
    {upsert: true}
  );

  console.log('\nDone. Mid-tournament snapshot ready.');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
