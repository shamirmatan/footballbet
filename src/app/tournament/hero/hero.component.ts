import {Component, OnDestroy, OnInit} from '@angular/core';
import {Subscription} from 'rxjs';
import {ParticipantsService} from '../../participants/participants.service';
import {TournamentService} from '../tournament.service';
import {Match, MatchSummary, TournamentState} from '../tournament.model';

const STAGE_LABELS: Record<string, string> = {
  GROUP_STAGE: 'Group Stage',
  LAST_32: 'Round of 32',
  LAST_16: 'Round of 16',
  QUARTER_FINALS: 'Quarter-finals',
  SEMI_FINALS: 'Semi-finals',
  THIRD_PLACE: 'Third-place Match',
  FINAL: 'Final',
  NOT_STARTED: 'Countdown to Kickoff',
  COMPLETED: 'Tournament Complete'
};

const GROUP_SHORT: Record<string, string> = {
  LAST_32: 'R32',
  LAST_16: 'R16',
  QUARTER_FINALS: 'QF',
  SEMI_FINALS: 'SF',
  THIRD_PLACE: '3rd',
  FINAL: 'Final'
};

const TOMORROW_MORNING_CUTOFF_HOUR = 7;

@Component({
  selector: 'app-hero',
  templateUrl: './hero.component.html',
  styleUrls: ['./hero.component.css']
})
export class HeroComponent implements OnInit, OnDestroy {
  state: TournamentState | null = null;
  loading = true;
  daysToKickoff = 0;
  hoursToKickoff = 0;
  allMatches: Match[] = [];
  private participants: Participant[] = [];
  private participantsSub?: Subscription;
  private timer?: number;

  constructor(
    private tournamentService: TournamentService,
    private participantsService: ParticipantsService
  ) {}

  ngOnInit(): void {
    this.tournamentService.getState().subscribe({
      next: (state) => {
        this.state = state;
        this.loading = false;
        this.recomputeCountdown();
      },
      error: () => {
        this.loading = false;
      }
    });
    this.tournamentService.getMatches().subscribe((matches) => {
      this.allMatches = matches;
    });
    this.participantsSub = this.participantsService
      .getParticipantsUpdateListener()
      .subscribe((p) => (this.participants = p));
    this.participantsService.getParticipants();
    this.timer = window.setInterval(() => this.recomputeCountdown(), 60_000);
  }

  ngOnDestroy(): void {
    if (this.timer) window.clearInterval(this.timer);
    this.participantsSub?.unsubscribe();
  }

  get stageLabel(): string {
    if (!this.state) return '';
    return STAGE_LABELS[this.state.stage] ?? this.state.stage;
  }

  get seasonRange(): string {
    if (!this.state) return '';
    return `${this.formatDate(this.state.seasonStart)} – ${this.formatDate(this.state.seasonEnd)} · USA · Canada · Mexico`;
  }

  get featuredMatch(): MatchSummary | null {
    return this.state?.liveMatch ?? this.state?.nextMatch ?? null;
  }

  get isLive(): boolean {
    return !!this.state?.liveMatch;
  }

  get isPreTournament(): boolean {
    return this.state?.stage === 'NOT_STARTED';
  }

  get isCompleted(): boolean {
    return this.state?.stage === 'COMPLETED';
  }

  get todayMatches(): Match[] {
    const key = this.dateKey(new Date());
    return this.allMatches
      .filter((m) => this.dateKey(this.toLocal(m.utcDate)) === key)
      .sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  }

  get tomorrowMorningMatches(): Match[] {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const key = this.dateKey(tomorrow);
    return this.allMatches
      .filter((m) => {
        const local = this.toLocal(m.utcDate);
        return this.dateKey(local) === key && local.getHours() < TOMORROW_MORNING_CUTOFF_HOUR;
      })
      .sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  }

  get showDailySchedule(): boolean {
    return (
      !this.isPreTournament &&
      !this.isCompleted &&
      (this.todayMatches.length > 0 || this.tomorrowMorningMatches.length > 0)
    );
  }

  matchStatusLabel(m: Match): string {
    switch (m.status) {
      case 'FINISHED': return 'FT';
      case 'IN_PLAY': return 'LIVE';
      case 'PAUSED': return 'HT';
      case 'POSTPONED': return 'PPD';
      case 'CANCELLED': return 'CXL';
      default: {
        const local = this.toLocal(m.utcDate);
        const h = String(local.getHours()).padStart(2, '0');
        const min = String(local.getMinutes()).padStart(2, '0');
        return `${h}:${min}`;
      }
    }
  }

  isLiveMatch(m: Match): boolean {
    return m.status === 'IN_PLAY' || m.status === 'PAUSED';
  }

  hasScore(m: Match): boolean {
    return m.status === 'FINISHED' || m.status === 'IN_PLAY' || m.status === 'PAUSED';
  }

  isLoser(m: Match, side: 'home' | 'away'): boolean {
    if (m.status !== 'FINISHED' || m.scoreHome == null || m.scoreAway == null) return false;
    return side === 'home' ? m.scoreHome < m.scoreAway : m.scoreAway < m.scoreHome;
  }

  matchGroupLabel(m: Match): string {
    if (m.group) return `Grp ${m.group}`;
    return GROUP_SHORT[m.stage] ?? m.stage;
  }

  ownerOf(teamName: string | null): string {
    if (!teamName) return '';
    const p = this.participants.find((participant) =>
      participant.teams.some((t) => t.name === teamName)
    );
    if (!p) return '';
    const initial = p.lastName ? `${p.lastName.charAt(0).toUpperCase()}.` : '';
    return `${p.firstName} ${initial}`.trim();
  }

  formatKickoff(utcDate: string): string {
    const d = new Date(utcDate);
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  private toLocal(utcDate: string): Date {
    return new Date(utcDate);
  }

  private dateKey(d: Date): string {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }

  private recomputeCountdown(): void {
    if (!this.state?.nextMatch) {
      this.daysToKickoff = 0;
      this.hoursToKickoff = 0;
      return;
    }
    const diffMs = new Date(this.state.nextMatch.utcDate).getTime() - Date.now();
    if (diffMs <= 0) {
      this.daysToKickoff = 0;
      this.hoursToKickoff = 0;
      return;
    }
    this.daysToKickoff = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    this.hoursToKickoff = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
  }

  private formatDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
  }
}
