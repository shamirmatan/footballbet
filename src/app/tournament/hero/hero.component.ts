import {Component, OnDestroy, OnInit} from '@angular/core';
import {Subscription} from 'rxjs';
import {ParticipantsService} from '../../participants/participants.service';
import {TournamentService} from '../tournament.service';
import {MatchSummary, TournamentState} from '../tournament.model';

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

  ownerOf(teamName: string): string {
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
