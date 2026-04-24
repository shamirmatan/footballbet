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
