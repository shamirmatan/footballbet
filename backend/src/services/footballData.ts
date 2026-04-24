import axios, {AxiosInstance} from 'axios';
import {config} from '../config/config';

export type Stage =
  | 'GROUP_STAGE'
  | 'LAST_32'
  | 'LAST_16'
  | 'QUARTER_FINALS'
  | 'SEMI_FINALS'
  | 'THIRD_PLACE'
  | 'FINAL';

export type MatchStatus =
  | 'SCHEDULED'
  | 'TIMED'
  | 'IN_PLAY'
  | 'PAUSED'
  | 'FINISHED'
  | 'SUSPENDED'
  | 'POSTPONED'
  | 'CANCELLED'
  | 'AWARDED';

export interface FDTeam {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string;
}

export interface FDMatch {
  id: number;
  stage: Stage;
  group: string | null;
  status: MatchStatus;
  utcDate: string;
  homeTeam: Partial<FDTeam> & { id: number | null; name: string | null };
  awayTeam: Partial<FDTeam> & { id: number | null; name: string | null };
  score: {
    winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
    duration: string;
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
  };
}

export interface FDStandingRow {
  position: number;
  team: FDTeam;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export interface FDStandingGroup {
  stage: string;
  group: string;
  table: FDStandingRow[];
}

export interface FDCompetition {
  id: number;
  name: string;
  code: string;
  currentSeason: {
    id: number;
    startDate: string;
    endDate: string;
    currentMatchday: number | null;
    winner: unknown | null;
  };
}

export class FootballDataClient {
  private http: AxiosInstance;
  private competition: string;

  constructor() {
    if (!config.footballData.apiKey) {
      throw new Error('FOOTBALL_DATA_API_KEY is not set');
    }
    this.competition = config.footballData.competition;
    this.http = axios.create({
      baseURL: config.footballData.baseUrl,
      headers: {'X-Auth-Token': config.footballData.apiKey},
      timeout: 15000
    });
  }

  async getTeams(): Promise<FDTeam[]> {
    const {data} = await this.http.get(`/competitions/${this.competition}/teams`);
    return data.teams;
  }

  async getCompetition(): Promise<FDCompetition> {
    const {data} = await this.http.get(`/competitions/${this.competition}`);
    return data;
  }

  async getStandings(): Promise<FDStandingGroup[]> {
    const {data} = await this.http.get(`/competitions/${this.competition}/standings`);
    return data.standings;
  }

  async getMatches(): Promise<FDMatch[]> {
    const {data} = await this.http.get(`/competitions/${this.competition}/matches`);
    return data.matches;
  }
}
