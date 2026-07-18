export interface MatchSummary {
  home: string;
  away: string;
  homeLogo?: string;
  awayLogo?: string;
  utcDate: string;
  group?: string | null;
  stage: string;
  status: string;
  scoreHome?: number | null;
  scoreAway?: number | null;
}

export type TournamentStatus = 'upcoming' | 'live' | 'archived';

export interface TournamentMeta {
  slug: string;
  name: string;
  shortName: string;
  status: TournamentStatus;
  seasonStart: string;
  seasonEnd: string;
}

export interface TournamentState {
  stage: string;
  currentMatchday: number | null;
  nextMatch: MatchSummary | null;
  liveMatch: MatchSummary | null;
  seasonStart: string;
  seasonEnd: string;
  updatedAt: string;
  draftLocked: boolean;
  tournament: TournamentMeta;
}

export interface GroupTeam {
  api_id: number;
  name: string;
  logo: string;
  group: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  qualifications: number;
  eliminated: boolean;
}

export interface GroupStanding {
  group: string;
  teams: GroupTeam[];
}

export interface MatchTeam {
  api_id: number | null;
  name: string | null;
  logo: string | null;
}

export interface Match {
  api_id: number;
  stage: string;
  group: string | null;
  matchday: number | null;
  status: string;
  utcDate: string;
  homeTeam: MatchTeam;
  awayTeam: MatchTeam;
  scoreHome: number | null;
  scoreAway: number | null;
  penaltyHome: number | null;
  penaltyAway: number | null;
  winner: string | null;
}

export interface BracketSide {
  api_id: number | null;
  name: string | null;
  logo: string | null;
  resolved: boolean;
}

export interface BracketMatch {
  fifaMatch: number;
  stage: string;
  home: BracketSide;
  away: BracketSide;
  status: string;
  utcDate: string | null;
  scoreHome: number | null;
  scoreAway: number | null;
  penaltyHome: number | null;
  penaltyAway: number | null;
  decided: boolean;
  winner: string | null;
}

export interface BracketStage {
  stage: string;
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
