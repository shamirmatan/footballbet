import {ITeam} from '../models/Team';
import {IMatch} from '../models/Match';
import {BracketSlotDef, BRACKET_DEFINITIONS, SideDef, Stage} from './bracketDefinitions';

export type {Stage} from './bracketDefinitions';

export interface ResolvedSide {
  api_id: number | null;
  name: string | null;
  logo: string | null;
  resolved: boolean;
}

export interface BracketMatch {
  fifaMatch: number;
  stage: Stage;
  home: ResolvedSide;
  away: ResolvedSide;
  status: string;
  utcDate: string | null;
  scoreHome: number | null;
  scoreAway: number | null;
  penaltyHome: number | null;
  penaltyAway: number | null;
  drawAt90: boolean; // finished level at 90'/120' and settled in ET or on penalties
  decided: boolean; // played to a result, even if the feed still flags it scheduled
  winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
}

export interface BracketStage {
  stage: Stage;
  label: string;
  matches: BracketMatch[];
}

export interface QualifiedThird {
  api_id: number;
  name: string;
  logo: string | null;
  group: string;
  in: boolean;
}

export interface Bracket {
  stages: BracketStage[];
  qualifiedThirds: QualifiedThird[];
}

export interface BracketConfig {
  tournamentSlug: string;
  // Ordered knockout stages for this tournament (excludes THIRD_PLACE, which
  // is never part of the scoring pool). E.g. ['LAST_32', ..., 'FINAL'] for a
  // 48-team World Cup, ['LAST_16', ..., 'FINAL'] for a 24-team Euro.
  knockoutStages: Stage[];
  // How many third-placed group teams advance to the knockout stage.
  thirdPlaceSlots: number;
}

const STAGE_LABELS: Record<Stage, string> = {
  FINAL: 'Final',
  THIRD_PLACE: 'Third-place match',
  SEMI_FINALS: 'Semi-finals',
  QUARTER_FINALS: 'Quarter-finals',
  LAST_16: 'Round of 16',
  LAST_32: 'Round of 32'
};

const placeholder = (name: string): ResolvedSide => ({
  api_id: null,
  name,
  logo: null,
  resolved: false
});

const realSide = (team: ITeam): ResolvedSide => ({
  api_id: team.api_id,
  name: team.name,
  logo: team.logo || null,
  resolved: true
});

const normalizeLetter = (group: string): string =>
  (group || '?').replace(/^Group\s+/i, '').toUpperCase();

const groupsByLetter = (teams: ITeam[]): Map<string, ITeam[]> => {
  const map = new Map<string, ITeam[]>();
  for (const t of teams) {
    const letter = normalizeLetter(t.group);
    const arr = map.get(letter) ?? [];
    arr.push(t);
    map.set(letter, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => (a.position || 99) - (b.position || 99));
  }
  return map;
};

// A group is decided only once every team has played its three matches.
const isGroupComplete = (arr: ITeam[]): boolean =>
  arr.length > 0 && arr.every((t) => t.games >= arr.length - 1);

const teamAtPosition = (arr: ITeam[] | undefined, position: number): ITeam | undefined =>
  arr?.find((t) => t.position === position);

const computeQualifiedThirds = (groups: Map<string, ITeam[]>, thirdPlaceSlots: number): QualifiedThird[] => {
  const thirds: ITeam[] = [];
  for (const arr of groups.values()) {
    const third = teamAtPosition(arr, 3);
    if (third) thirds.push(third);
  }
  thirds.sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.api_id - b.api_id
  );
  return thirds.map((t, i) => ({
    api_id: t.api_id,
    name: t.name,
    logo: t.logo || null,
    group: normalizeLetter(t.group),
    in: i < thirdPlaceSlots
  }));
};

const sideFromFixtureTeam = (team: IMatch['homeTeam']): ResolvedSide =>
  team.api_id != null
    ? {api_id: team.api_id, name: team.name, logo: team.logo, resolved: true}
    : placeholder('TBD');

interface FixtureOutcome {
  fxWinSide: 'home' | 'away' | null;
  winner: BracketMatch['winner'];
  decided: boolean;
  drawAt90: boolean;
}

// Resolve a fixture's own result, independent of which side we structurally
// expect to be "home"/"away" — shared by the structured (feeder-based) and
// generic bracket builders below.
const resolveFixtureOutcome = (fx: IMatch): FixtureOutcome => {
  let fxWinSide: 'home' | 'away' | null =
    fx.winner === 'HOME_TEAM' ? 'home' : fx.winner === 'AWAY_TEAM' ? 'away' : null;
  // Resilience for a finished knockout tie the feed left without a decisive
  // winner (a penalty/extra-time win recorded as a DRAW): break the tie on
  // the shootout, then on the stored scoreline.
  if (!fxWinSide && fx.status === 'FINISHED') {
    if (fx.penaltyHome != null && fx.penaltyAway != null && fx.penaltyHome !== fx.penaltyAway) {
      fxWinSide = fx.penaltyHome > fx.penaltyAway ? 'home' : 'away';
    } else if (fx.scoreHome != null && fx.scoreAway != null && fx.scoreHome !== fx.scoreAway) {
      fxWinSide = fx.scoreHome > fx.scoreAway ? 'home' : 'away';
    }
  }

  // A tie is decided once finished, or — guarding against a lagging feed that
  // still flags a played match as scheduled — once it has a score and a
  // winner and is not currently in play.
  const decided =
    fx.status === 'FINISHED' ||
    fx.status === 'AWARDED' ||
    (fx.status !== 'IN_PLAY' &&
      fx.status !== 'PAUSED' &&
      fx.scoreHome != null &&
      fx.scoreAway != null &&
      fxWinSide != null);

  const drawAt90 =
    decided &&
    (fx.duration === 'EXTRA_TIME' ||
      fx.duration === 'PENALTY_SHOOTOUT' ||
      (fx.penaltyHome != null && fx.penaltyAway != null));

  const winner: BracketMatch['winner'] =
    fxWinSide === 'home' ? 'HOME_TEAM' : fxWinSide === 'away' ? 'AWAY_TEAM' : fx.winner === 'DRAW' ? 'DRAW' : null;

  return {fxWinSide, winner, decided, drawAt90};
};

// ---- structured bracket (known, published draw sheet) ----

interface FeederResult {
  winner?: ResolvedSide;
  loser?: ResolvedSide;
}

const resolveSide = (
  side: SideDef,
  groups: Map<string, ITeam[]>,
  results: Map<number, FeederResult>
): ResolvedSide => {
  switch (side.type) {
    case 'winner': {
      const arr = groups.get(side.group!);
      const t = isGroupComplete(arr ?? []) ? teamAtPosition(arr, 1) : undefined;
      return t ? realSide(t) : placeholder(`Winner ${side.group}`);
    }
    case 'runnerUp': {
      const arr = groups.get(side.group!);
      const t = isGroupComplete(arr ?? []) ? teamAtPosition(arr, 2) : undefined;
      return t ? realSide(t) : placeholder(`Runner-up ${side.group}`);
    }
    case 'third':
      return placeholder(`Best 3rd (${side.candidates!.join('/')})`);
    case 'matchWinner':
      return results.get(side.match!)?.winner ?? placeholder(`Winner of M${side.match}`);
    case 'matchLoser':
      return results.get(side.match!)?.loser ?? placeholder(`Loser of M${side.match}`);
  }
};

// The resolved deterministic side's team id uniquely identifies its knockout
// fixture (a team plays only one match per round), so we never need to guess
// which fixture is which by date or order.
const findFixture = (
  home: ResolvedSide,
  away: ResolvedSide,
  fixtures: IMatch[]
): IMatch | undefined => {
  const ids = [home.api_id, away.api_id].filter((x): x is number => x != null);
  if (ids.length === 0) return undefined;
  return fixtures.find((fx) => {
    const fxIds = [fx.homeTeam.api_id, fx.awayTeam.api_id].filter(
      (x): x is number => x != null
    );
    return ids.every((id) => fxIds.includes(id));
  });
};

interface AppliedFixture {
  home: ResolvedSide;
  away: ResolvedSide;
  scoreHome: number | null;
  scoreAway: number | null;
  penaltyHome: number | null;
  penaltyAway: number | null;
  drawAt90: boolean;
  decided: boolean;
  winner: BracketMatch['winner'];
  status: string;
  utcDate: string;
}

// Re-orient the fixture onto our structural home/away, anchored on whichever
// side we already resolved from standings/feeders.
const applyFixture = (home: ResolvedSide, away: ResolvedSide, fx: IMatch): AppliedFixture => {
  const homeId = home.api_id;
  const awayId = away.api_id;
  let homeIsFxHome: boolean;
  if (homeId != null && homeId === fx.homeTeam.api_id) homeIsFxHome = true;
  else if (homeId != null && homeId === fx.awayTeam.api_id) homeIsFxHome = false;
  else if (awayId != null && awayId === fx.homeTeam.api_id) homeIsFxHome = false;
  else homeIsFxHome = true; // awayId matches fx.awayTeam, or harmless fallback

  const homeFxTeam = homeIsFxHome ? fx.homeTeam : fx.awayTeam;
  const awayFxTeam = homeIsFxHome ? fx.awayTeam : fx.homeTeam;

  const outcome = resolveFixtureOutcome(fx);
  let winner: BracketMatch['winner'] = null;
  if (outcome.fxWinSide) {
    const ourHomeFxSide = homeIsFxHome ? 'home' : 'away';
    winner = outcome.fxWinSide === ourHomeFxSide ? 'HOME_TEAM' : 'AWAY_TEAM';
  } else if (fx.winner === 'DRAW') {
    winner = 'DRAW';
  }

  return {
    home: home.resolved ? home : sideFromFixtureTeam(homeFxTeam),
    away: away.resolved ? away : sideFromFixtureTeam(awayFxTeam),
    scoreHome: homeIsFxHome ? fx.scoreHome : fx.scoreAway,
    scoreAway: homeIsFxHome ? fx.scoreAway : fx.scoreHome,
    penaltyHome: homeIsFxHome ? fx.penaltyHome : fx.penaltyAway,
    penaltyAway: homeIsFxHome ? fx.penaltyAway : fx.penaltyHome,
    drawAt90: outcome.drawAt90,
    decided: outcome.decided,
    winner,
    status: fx.status,
    utcDate: fx.utcDate
  };
};

const buildStructuredBracket = (
  teams: ITeam[],
  matches: IMatch[],
  bracketDefinition: BracketSlotDef[],
  thirdPlaceSlots: number
): Bracket => {
  const groups = groupsByLetter(teams);
  const results = new Map<number, FeederResult>();
  const built = new Map<number, BracketMatch>();

  const fixturesByStage = new Map<Stage, IMatch[]>();
  const stagesInDefinition = new Set(bracketDefinition.map((s) => s.stage));
  for (const m of matches) {
    if (!stagesInDefinition.has(m.stage as Stage)) continue;
    const arr = fixturesByStage.get(m.stage as Stage) ?? [];
    arr.push(m);
    fixturesByStage.set(m.stage as Stage, arr);
  }

  // Ascending fifaMatch so feeder results exist before dependent slots resolve.
  for (const slot of [...bracketDefinition].sort((a, b) => a.fifaMatch - b.fifaMatch)) {
    let home = resolveSide(slot.home, groups, results);
    let away = resolveSide(slot.away, groups, results);

    let status = 'SCHEDULED';
    let utcDate: string | null = null;
    let scoreHome: number | null = null;
    let scoreAway: number | null = null;
    let penaltyHome: number | null = null;
    let penaltyAway: number | null = null;
    let drawAt90 = false;
    let decided = false;
    let winner: BracketMatch['winner'] = null;

    const fx = findFixture(home, away, fixturesByStage.get(slot.stage) ?? []);
    if (fx) {
      const applied = applyFixture(home, away, fx);
      home = applied.home;
      away = applied.away;
      status = applied.status;
      utcDate = applied.utcDate;
      scoreHome = applied.scoreHome;
      scoreAway = applied.scoreAway;
      penaltyHome = applied.penaltyHome;
      penaltyAway = applied.penaltyAway;
      drawAt90 = applied.drawAt90;
      decided = applied.decided;
      winner = applied.winner;
    }

    built.set(slot.fifaMatch, {
      fifaMatch: slot.fifaMatch,
      stage: slot.stage,
      home,
      away,
      status,
      utcDate,
      scoreHome,
      scoreAway,
      penaltyHome,
      penaltyAway,
      drawAt90,
      decided,
      winner
    });

    // Feed the result forward to matchWinner/matchLoser slots.
    if (decided && winner && winner !== 'DRAW' && home.resolved && away.resolved) {
      results.set(slot.fifaMatch, {
        winner: winner === 'HOME_TEAM' ? home : away,
        loser: winner === 'HOME_TEAM' ? away : home
      });
    }
  }

  const stageOrder: Stage[] = ['FINAL', 'THIRD_PLACE', 'SEMI_FINALS', 'QUARTER_FINALS', 'LAST_16', 'LAST_32'];
  const stages: BracketStage[] = stageOrder
    .filter((stage) => bracketDefinition.some((s) => s.stage === stage))
    .map((stage) => ({
      stage,
      label: STAGE_LABELS[stage],
      matches: [...built.values()]
        .filter((m) => m.stage === stage)
        .sort((a, b) => a.fifaMatch - b.fifaMatch)
    }));

  return {stages, qualifiedThirds: computeQualifiedThirds(groups, thirdPlaceSlots)};
};

// ---- generic bracket (draw sheet not known/published yet) ----

// Without a published draw, we can't show meaningful pre-draw placeholders
// (which group's winner meets which) — just the real stage columns, filled
// in with whatever matches the data source already reports (TBD slots
// before the draw, real teams and results once it happens and plays out).
// The frontend renders this without the feeder connector lines, since the
// pairing structure isn't known.
const buildGenericBracket = (
  teams: ITeam[],
  matches: IMatch[],
  knockoutStages: Stage[],
  thirdPlaceSlots: number
): Bracket => {
  const groups = groupsByLetter(teams);
  const relevant = matches.filter((m) => knockoutStages.includes(m.stage as Stage));

  const stages: BracketStage[] = knockoutStages
    .filter((stage) => relevant.some((m) => m.stage === stage))
    .map((stage, stageIdx) => {
      const stageMatches = relevant
        .filter((m) => m.stage === stage)
        .sort((a, b) => a.utcDate.localeCompare(b.utcDate));
      return {
        stage,
        label: STAGE_LABELS[stage] ?? stage,
        matches: stageMatches.map((fx, i) => {
          const outcome = resolveFixtureOutcome(fx);
          return {
            // Synthetic, stable-within-this-response id — there is no
            // official match-number scheme to anchor on here.
            fifaMatch: stageIdx * 1000 + i,
            stage,
            home: sideFromFixtureTeam(fx.homeTeam),
            away: sideFromFixtureTeam(fx.awayTeam),
            status: fx.status,
            utcDate: fx.utcDate,
            scoreHome: fx.scoreHome,
            scoreAway: fx.scoreAway,
            penaltyHome: fx.penaltyHome,
            penaltyAway: fx.penaltyAway,
            drawAt90: outcome.drawAt90,
            decided: outcome.decided,
            winner: outcome.winner
          };
        })
      };
    });

  return {stages, qualifiedThirds: computeQualifiedThirds(groups, thirdPlaceSlots)};
};

export const buildBracket = (teams: ITeam[], matches: IMatch[], cfg: BracketConfig): Bracket => {
  const bracketDefinition = BRACKET_DEFINITIONS[cfg.tournamentSlug];
  if (bracketDefinition) {
    return buildStructuredBracket(teams, matches, bracketDefinition, cfg.thirdPlaceSlots);
  }
  return buildGenericBracket(teams, matches, cfg.knockoutStages, cfg.thirdPlaceSlots);
};
