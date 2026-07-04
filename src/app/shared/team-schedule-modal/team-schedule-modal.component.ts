import {Component, HostListener, OnDestroy, OnInit} from '@angular/core';
import {Subscription} from 'rxjs';
import {TournamentService} from '../../tournament/tournament.service';
import {Match} from '../../tournament/tournament.model';
import {SelectedTeam, TeamScheduleService} from '../team-schedule.service';

const STAGE_SHORT: Record<string, string> = {
  GROUP_STAGE: 'Group',
  LAST_32: 'R32',
  LAST_16: 'R16',
  QUARTER_FINALS: 'QF',
  SEMI_FINALS: 'SF',
  THIRD_PLACE: '3rd',
  FINAL: 'Final'
};

/**
 * App-wide popup listing a team's full schedule (past, live, upcoming). Opened
 * from anywhere via TeamScheduleService; rendered once at the app root.
 */
@Component({
  selector: 'app-team-schedule-modal',
  templateUrl: './team-schedule-modal.component.html',
  styleUrls: ['./team-schedule-modal.component.css']
})
export class TeamScheduleModalComponent implements OnInit, OnDestroy {
  selected: SelectedTeam | null = null;
  matchesLoading = false;
  private allMatches: Match[] = [];
  private selectedSub?: Subscription;
  private matchesSub?: Subscription;

  constructor(
    private tournamentService: TournamentService,
    private teamSchedule: TeamScheduleService
  ) {}

  ngOnInit(): void {
    this.selectedSub = this.teamSchedule.selected$.subscribe((team) => {
      this.selected = team;
      if (team) {
        document.body.classList.add('team-modal-open');
        this.loadMatches();
      } else {
        document.body.classList.remove('team-modal-open');
      }
    });
  }

  ngOnDestroy(): void {
    this.selectedSub?.unsubscribe();
    this.matchesSub?.unsubscribe();
    document.body.classList.remove('team-modal-open');
  }

  close(): void {
    this.teamSchedule.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.selected) this.close();
  }

  private loadMatches(): void {
    // Pull the latest matches: instant when the cache is warm, otherwise a fresh
    // fetch that fills the list in place.
    this.matchesLoading = this.allMatches.length === 0;
    this.matchesSub?.unsubscribe();
    this.matchesSub = this.tournamentService.getMatches().subscribe({
      next: (matches) => {
        this.allMatches = matches;
        this.matchesLoading = false;
      },
      error: () => (this.matchesLoading = false)
    });
  }

  /** Logo for the header: the one passed in, else derived from the fixtures. */
  get headerLogo(): string | null {
    if (this.selected?.logo) return this.selected.logo;
    const name = this.selected?.name;
    if (!name) return null;
    for (const m of this.allMatches) {
      if (m.homeTeam.name === name && m.homeTeam.logo) return m.homeTeam.logo;
      if (m.awayTeam.name === name && m.awayTeam.logo) return m.awayTeam.logo;
    }
    return null;
  }

  /** Every match the selected team plays in, oldest first. */
  get selectedMatches(): Match[] {
    const name = this.selected?.name;
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
