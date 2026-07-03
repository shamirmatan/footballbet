import {Component, HostListener, Input, OnDestroy, OnInit} from "@angular/core";
import {Subscription} from "rxjs";
import {TournamentService} from "../../tournament/tournament.service";
import {Match} from "../../tournament/tournament.model";

interface TeamSummary {
  total: number;
  played: number;
  advanced: number;
  eliminated: number;
}

// An eliminated team's qualifications is the deepest round it reached, i.e. the
// round it went out in. 0 = group stage, 1 = R32, ... 5 = final (runner-up).
const ELIMINATION_ROUND: Record<number, string> = {
  0: 'Group',
  1: 'R32',
  2: 'R16',
  3: 'QF',
  4: 'SF',
  5: 'Final'
};

const STAGE_SHORT: Record<string, string> = {
  GROUP_STAGE: 'Group',
  LAST_32: 'R32',
  LAST_16: 'R16',
  QUARTER_FINALS: 'QF',
  SEMI_FINALS: 'SF',
  THIRD_PLACE: '3rd',
  FINAL: 'Final'
};

@Component({
  selector: 'app-teams-table',
  templateUrl: './teams-table.component.html',
  styleUrls: ['./teams-table.component.css']
})
export class TeamsTableComponent implements OnInit, OnDestroy {
  @Input() teams: Team[];
  sortedTeams: Team[] = [];
  summary: TeamSummary = {total: 0, played: 0, advanced: 0, eliminated: 0};

  selectedTeam: Team | null = null;
  matchesLoading = false;
  private allMatches: Match[] = [];
  private matchesSub?: Subscription;

  constructor(private tournamentService: TournamentService) {}

  /** Short label of the round an eliminated team went out in, e.g. "R16". */
  eliminationRound(team: Team): string {
    if (!team.eliminated) return '';
    return ELIMINATION_ROUND[team.qualifications] ?? '';
  }

  ngOnInit() {
    this.sortedTeams = [...(this.teams ?? [])].sort((a, b) => {
      // Still-alive teams on top, then by rank (points, then goal difference).
      if (!!a.eliminated !== !!b.eliminated) return a.eliminated ? 1 : -1;
      if (b.points !== a.points) return b.points - a.points;
      const gdA = (a.totalGoalsFor ?? 0) - (a.totalGoalsAgainst ?? 0);
      const gdB = (b.totalGoalsFor ?? 0) - (b.totalGoalsAgainst ?? 0);
      if (gdB !== gdA) return gdB - gdA;
      return (a.name ?? '').localeCompare(b.name ?? '');
    });
    this.summary = {
      total: this.sortedTeams.length,
      played: this.sortedTeams.reduce((sum, t) => sum + (t.totalGames ?? 0), 0),
      advanced: this.sortedTeams.reduce((sum, t) => sum + (t.qualifications ?? 0), 0),
      eliminated: this.sortedTeams.filter((t) => t.eliminated).length
    };
  }

  ngOnDestroy() {
    this.matchesSub?.unsubscribe();
  }

  // ---- team match modal ----

  openTeam(team: Team) {
    this.selectedTeam = team;
    // Fetch matches lazily the first time a team is opened.
    if (this.allMatches.length === 0 && !this.matchesLoading) {
      this.matchesLoading = true;
      this.matchesSub = this.tournamentService.getMatches().subscribe({
        next: (matches) => {
          this.allMatches = matches;
          this.matchesLoading = false;
        },
        error: () => (this.matchesLoading = false)
      });
    }
  }

  closeTeam() {
    this.selectedTeam = null;
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.selectedTeam) this.closeTeam();
  }

  /** Every match the selected team plays in, oldest first. */
  get selectedTeamMatches(): Match[] {
    const name = this.selectedTeam?.name;
    if (!name) return [];
    return this.allMatches
      .filter((m) => m.homeTeam.name === name || m.awayTeam.name === name)
      .sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  }

  stageLabel(m: Match): string {
    return STAGE_SHORT[m.stage] ?? m.stage;
  }

  isLiveMatch(m: Match): boolean {
    return m.status === 'IN_PLAY' || m.status === 'PAUSED';
  }

  hasScore(m: Match): boolean {
    return (
      m.status === 'FINISHED' ||
      m.status === 'AWARDED' ||
      m.status === 'IN_PLAY' ||
      m.status === 'PAUSED' ||
      m.status === 'SUSPENDED'
    );
  }

  matchStatusLabel(m: Match): string {
    switch (m.status) {
      case 'FINISHED':
      case 'AWARDED': return 'FT';
      case 'IN_PLAY': return 'LIVE';
      case 'PAUSED': return 'HT';
      case 'SUSPENDED': return 'SUSP';
      case 'POSTPONED': return 'PPD';
      case 'CANCELLED': return 'CXL';
      default: return this.formatKickoff(m.utcDate);
    }
  }

  /** The side that won a penalty shootout, or null if the tie was not on pens. */
  pensWinnerSide(m: Match): 'home' | 'away' | null {
    if (m.penaltyHome == null || m.penaltyAway == null) return null;
    if (m.winner === 'HOME_TEAM') return 'home';
    if (m.winner === 'AWAY_TEAM') return 'away';
    return null;
  }

  private formatKickoff(utcDate: string): string {
    const d = new Date(utcDate);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }
}
