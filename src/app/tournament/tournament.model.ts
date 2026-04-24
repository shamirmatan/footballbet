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

export interface TournamentState {
  stage: string;
  currentMatchday: number | null;
  nextMatch: MatchSummary | null;
  liveMatch: MatchSummary | null;
  seasonStart: string;
  seasonEnd: string;
  updatedAt: string;
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
  winner: string | null;
}
