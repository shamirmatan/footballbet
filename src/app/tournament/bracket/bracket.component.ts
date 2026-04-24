import {Component, OnInit} from '@angular/core';
import {TournamentService} from '../tournament.service';
import {Match} from '../tournament.model';

interface StageGroup {
  stage: string;
  label: string;
  matches: Match[];
  hasLive: boolean;
  hasUpcoming: boolean;
  allFinished: boolean;
}

const STAGE_ORDER: string[] = [
  'FINAL',
  'THIRD_PLACE',
  'SEMI_FINALS',
  'QUARTER_FINALS',
  'LAST_16',
  'LAST_32'
];

const STAGE_LABELS: Record<string, string> = {
  FINAL: 'Final',
  THIRD_PLACE: 'Third-place match',
  SEMI_FINALS: 'Semi-finals',
  QUARTER_FINALS: 'Quarter-finals',
  LAST_16: 'Round of 16',
  LAST_32: 'Round of 32'
};

@Component({
  selector: 'app-bracket',
  templateUrl: './bracket.component.html',
  styleUrls: ['./bracket.component.css']
})
export class BracketComponent implements OnInit {
  stages: StageGroup[] = [];
  loading = true;
  expanded: Record<string, boolean> = {};

  constructor(private tournamentService: TournamentService) {}

  ngOnInit(): void {
    this.tournamentService.getMatches().subscribe({
      next: (matches) => {
        this.stages = this.buildStages(matches);
        this.initExpanded();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  private buildStages(matches: Match[]): StageGroup[] {
    const byStage = new Map<string, Match[]>();
    for (const m of matches) {
      if (m.stage === 'GROUP_STAGE') continue;
      const arr = byStage.get(m.stage) ?? [];
      arr.push(m);
      byStage.set(m.stage, arr);
    }

    return STAGE_ORDER.filter((s) => byStage.has(s)).map((stage) => {
      const list = (byStage.get(stage) ?? []).sort((a, b) =>
        a.utcDate.localeCompare(b.utcDate)
      );
      return {
        stage,
        label: STAGE_LABELS[stage] ?? stage,
        matches: list,
        hasLive: list.some((m) => m.status === 'IN_PLAY' || m.status === 'PAUSED'),
        hasUpcoming: list.some((m) => m.status === 'TIMED' || m.status === 'SCHEDULED'),
        allFinished: list.every((m) => m.status === 'FINISHED')
      };
    });
  }

  private initExpanded(): void {
    // Expand the stage that has a live match (if any), or the nearest
    // upcoming stage (closest non-finished match), or the most advanced
    // completed stage. Everything else starts collapsed.
    const live = this.stages.find((s) => s.hasLive);
    if (live) {
      this.expanded[live.stage] = true;
      return;
    }
    const upcoming = [...this.stages]
      .reverse()
      .find((s) => s.hasUpcoming);
    if (upcoming) {
      this.expanded[upcoming.stage] = true;
      return;
    }
    const mostAdvancedFinished = this.stages.find((s) => s.allFinished);
    if (mostAdvancedFinished) this.expanded[mostAdvancedFinished.stage] = true;
  }

  toggle(stage: string): void {
    this.expanded[stage] = !this.expanded[stage];
  }

  isExpanded(stage: string): boolean {
    return !!this.expanded[stage];
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

  stageStatusLabel(s: StageGroup): string {
    if (s.hasLive) return 'Live';
    if (s.allFinished) return 'Finished';
    if (s.hasUpcoming) {
      const next = s.matches.find(
        (m) => m.status === 'TIMED' || m.status === 'SCHEDULED'
      );
      if (next) {
        const d = new Date(next.utcDate);
        return `Starts ${d.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric'
        })}`;
      }
    }
    return '';
  }

  matchStatusLabel(m: Match): string {
    if (m.status === 'IN_PLAY' || m.status === 'PAUSED') return 'LIVE';
    if (m.status === 'FINISHED') return 'FT';
    if (m.status === 'POSTPONED') return 'Postponed';
    if (m.status === 'CANCELLED') return 'Cancelled';
    if (m.status === 'AWARDED') return 'Awarded';
    return this.formatKickoff(m.utcDate);
  }

  trackByApiId(_i: number, m: Match): number {
    return m.api_id;
  }

  loser(m: Match): 'home' | 'away' | null {
    if (m.status !== 'FINISHED') return null;
    if (m.winner === 'HOME_TEAM') return 'away';
    if (m.winner === 'AWAY_TEAM') return 'home';
    return null;
  }
}
