import {Component, ElementRef, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {Subscription} from 'rxjs';
import {distinctUntilChanged, filter, skip} from 'rxjs/operators';
import {ParticipantsService} from '../../participants/participants.service';
import {TournamentService} from '../tournament.service';
import {Bracket, BracketMatch} from '../tournament.model';
import {AdaptivePoller} from '../../shared/adaptive-poller';
import {TeamScheduleService} from '../../shared/team-schedule.service';
import {ActiveTournamentService} from '../active-tournament.service';

/**
 * Presentation-only bracket adjacency (FIFA match numbers).
 * Each later-round match is fed by two earlier matches. Used to order the
 * Round-of-32 column so feeders sit adjacent, and to vertically centre each
 * child between its two feeders for the connector lines.
 */
const FEEDERS: Record<number, [number, number]> = {
  // Round of 16
  89: [74, 77], 90: [73, 75], 91: [76, 78], 92: [79, 80],
  93: [83, 84], 94: [81, 82], 95: [86, 88], 96: [85, 87],
  // Quarter-finals
  97: [89, 90], 98: [93, 94], 99: [91, 92], 100: [95, 96],
  // Semi-finals
  101: [97, 98], 102: [99, 100],
  // Final
  104: [101, 102]
};

const ROOT = 104;

/** Display order, left → right (LAST_32 first). */
const COLUMN_ORDER: string[] = [
  'LAST_32',
  'LAST_16',
  'QUARTER_FINALS',
  'SEMI_FINALS',
  'FINAL'
];

const COLUMN_LABELS: Record<string, string> = {
  LAST_32: 'Round of 32',
  LAST_16: 'Round of 16',
  QUARTER_FINALS: 'Quarter-finals',
  SEMI_FINALS: 'Semi-finals',
  FINAL: 'Final'
};

/** Vertical geometry (px). One R32 "slot" = card height + gap. */
const CARD_HEIGHT = 64;
const SLOT_GAP = 16;
const SLOT_HEIGHT = CARD_HEIGHT + SLOT_GAP; // centre-to-centre spacing of R32 cards
const COLUMN_WIDTH = 220;
const COLUMN_GAP = 56;

export interface BracketCard {
  match: BracketMatch;
  /** Y of the card's vertical centre, in px from the top of the tree area. */
  cy: number;
}

export interface BracketColumn {
  stage: string;
  label: string;
  cards: BracketCard[];
}

export interface Connector {
  /** path "M ... C ..." cubic bezier from a feeder's right edge to the child's left edge. */
  d: string;
}

@Component({
  selector: 'app-bracket',
  templateUrl: './bracket.component.html',
  styleUrls: ['./bracket.component.css']
})
export class BracketComponent implements OnInit, OnDestroy {
  loading = true;
  hasStages = false;

  columns: BracketColumn[] = [];

  connectors: Connector[] = [];
  treeHeight = 0;
  treeWidth = 0;

  readonly cardHeight = CARD_HEIGHT;
  readonly columnWidth = COLUMN_WIDTH;

  private treeScroll?: ElementRef<HTMLElement>;
  private stageFocused = false;
  private visibilityObserver?: IntersectionObserver;

  // Set up an observer once the scrollable tree exists, so we can scroll to the
  // current round the moment the (initially hidden) Playoffs tab becomes visible.
  @ViewChild('treeScroll') set treeScrollRef(ref: ElementRef<HTMLElement> | undefined) {
    this.treeScroll = ref;
    if (!ref || this.visibilityObserver || this.stageFocused) return;
    if (typeof IntersectionObserver === 'undefined') {
      this.focusCurrentStage();
      return;
    }
    this.visibilityObserver = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !this.stageFocused) {
        this.focusCurrentStage();
      }
    });
    this.visibilityObserver.observe(ref.nativeElement);
  }

  private participants: Participant[] = [];
  private participantsSub?: Subscription;
  private slugSub?: Subscription;
  private poller = new AdaptivePoller(() => this.refresh());

  constructor(
    private tournamentService: TournamentService,
    private participantsService: ParticipantsService,
    private teamSchedule: TeamScheduleService,
    private active: ActiveTournamentService
  ) {}

  openTeam(name: string | null | undefined, logo?: string | null): void {
    this.teamSchedule.open(name, logo);
  }

  ngOnInit(): void {
    // Load immediately, then refresh adaptively (fast while a match is live,
    // slow otherwise; paused when the tab is hidden).
    this.poller.start();
    this.participantsSub = this.participantsService
      .getParticipantsUpdateListener()
      .subscribe((p) => (this.participants = p));
    this.participantsService.getParticipants();

    // Nested under HomeComponent, which sets the active tournament from the
    // route before this component's own ngOnInit runs — so poller.start()
    // above already used the right slug. Force an immediate refresh only on
    // a later switch (skip(1) skips that already-covered initial load).
    this.slugSub = this.active.slug$.pipe(
      filter((slug): slug is string => !!slug),
      distinctUntilChanged(),
      skip(1)
    ).subscribe(() => this.refresh());
  }

  ngOnDestroy(): void {
    this.participantsSub?.unsubscribe();
    this.slugSub?.unsubscribe();
    this.poller.destroy();
    this.visibilityObserver?.disconnect();
  }

  private refresh(): void {
    this.tournamentService.getBracket().subscribe({
      next: (bracket) => {
        this.build(bracket);
        this.loading = false;
        const live = (bracket.stages ?? []).some((s) =>
          s.matches.some((m) => m.status === 'IN_PLAY' || m.status === 'PAUSED')
        );
        this.poller.reschedule(live);
      },
      error: () => {
        this.loading = false;
        this.poller.reschedule(false);
      }
    });
  }

  // The current round is the earliest column that still has an unfinished
  // match; earlier rounds are done, so start the view there instead of at R32.
  private currentStageColumnIndex(): number {
    for (let i = 0; i < this.columns.length; i++) {
      const active = this.columns[i].cards.some((c) => !c.match.decided);
      if (active) return i;
    }
    return Math.max(0, this.columns.length - 1); // all done -> the final
  }

  // Scroll the bracket so the current round is in view. Retries briefly while
  // the data/layout settle; runs only once.
  private focusCurrentStage(attempt = 0): void {
    if (this.stageFocused) return;
    const el = this.treeScroll?.nativeElement;
    if (!el || this.columns.length === 0) {
      if (attempt < 20) setTimeout(() => this.focusCurrentStage(attempt + 1), 100);
      return;
    }
    const idx = this.currentStageColumnIndex();
    el.scrollLeft = idx <= 0 ? 0 : Math.max(0, idx * (COLUMN_WIDTH + COLUMN_GAP) - 8);
    this.stageFocused = true;
    this.visibilityObserver?.disconnect();
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

  private build(bracket: Bracket): void {
    const byNumber = new Map<number, BracketMatch>();
    const byStage = new Map<string, BracketMatch[]>();
    for (const stage of bracket.stages ?? []) {
      for (const m of stage.matches) {
        byNumber.set(m.fifaMatch, m);
        const arr = byStage.get(m.stage) ?? [];
        arr.push(m);
        byStage.set(m.stage, arr);
      }
    }

    const hasTree = COLUMN_ORDER.some((s) => byStage.has(s));
    this.hasStages = hasTree;
    if (!hasTree) {
      this.columns = [];
      this.connectors = [];
      return;
    }

    // 1. Leaf order: depth-first walk from the Final so the two feeders of
    //    every match are adjacent in their column.
    const leafOrder: number[] = [];
    const walk = (n: number) => {
      const feeders = FEEDERS[n];
      if (!feeders) {
        leafOrder.push(n);
        return;
      }
      walk(feeders[0]);
      walk(feeders[1]);
    };
    walk(ROOT);

    // 2. y of every match. Leaves get evenly spaced slots; each parent's y is
    //    the average of its two feeders.
    const cy = new Map<number, number>();
    leafOrder.forEach((n, i) => {
      cy.set(n, i * SLOT_HEIGHT + CARD_HEIGHT / 2);
    });
    const resolveCy = (n: number): number => {
      if (cy.has(n)) return cy.get(n)!;
      const feeders = FEEDERS[n];
      const v = (resolveCy(feeders[0]) + resolveCy(feeders[1])) / 2;
      cy.set(n, v);
      return v;
    };
    resolveCy(ROOT);

    this.treeHeight = leafOrder.length * SLOT_HEIGHT - SLOT_GAP;
    this.treeWidth = COLUMN_ORDER.length * COLUMN_WIDTH + (COLUMN_ORDER.length - 1) * COLUMN_GAP;

    // 3. Columns with positioned cards.
    this.columns = COLUMN_ORDER.filter((s) => byStage.has(s)).map((stage) => {
      const matches = byStage.get(stage) ?? [];
      const cards = matches
        .map((match) => ({match, cy: cy.get(match.fifaMatch) ?? CARD_HEIGHT / 2}))
        .sort((a, b) => a.cy - b.cy);
      return {stage, label: COLUMN_LABELS[stage] ?? stage, cards};
    });

    // 4. Connectors: from each feeder's right edge to its child's left edge.
    const colIndex = new Map<string, number>();
    COLUMN_ORDER.forEach((s, i) => colIndex.set(s, i));
    const xLeft = (stage: string) => (colIndex.get(stage) ?? 0) * (COLUMN_WIDTH + COLUMN_GAP);
    const xRight = (stage: string) => xLeft(stage) + COLUMN_WIDTH;

    const stageOf = (n: number): string | null => byNumber.get(n)?.stage ?? null;

    const connectors: Connector[] = [];
    for (const childStr of Object.keys(FEEDERS)) {
      const child = Number(childStr);
      const childStage = stageOf(child);
      if (!childStage || childStage === 'THIRD_PLACE') continue;
      const childX = xLeft(childStage);
      const childY = cy.get(child);
      if (childY == null) continue;
      for (const feeder of FEEDERS[child]) {
        const feederStage = stageOf(feeder);
        if (!feederStage) continue;
        const fx = xRight(feederStage);
        const fy = cy.get(feeder);
        if (fy == null) continue;
        const midX = (fx + childX) / 2;
        connectors.push({
          d: `M ${fx} ${fy} C ${midX} ${fy}, ${midX} ${childY}, ${childX} ${childY}`
        });
      }
    }
    this.connectors = connectors;
  }

  // ---- side / status helpers ----

  loserSide(m: BracketMatch): 'home' | 'away' | null {
    // Only a decided match has a loser; never strike through a side while the
    // match is still live (or otherwise unplayed).
    if (!m.decided) return null;
    if (m.winner === 'HOME_TEAM') return 'away';
    if (m.winner === 'AWAY_TEAM') return 'home';
    return null;
  }

  /** The side that won a penalty shootout, or null if the tie was not on pens. */
  pensWinnerSide(m: BracketMatch): 'home' | 'away' | null {
    if (m.penaltyHome == null || m.penaltyAway == null) return null;
    if (m.winner === 'HOME_TEAM') return 'home';
    if (m.winner === 'AWAY_TEAM') return 'away';
    return null;
  }

  isLive(m: BracketMatch): boolean {
    return m.status === 'IN_PLAY' || m.status === 'PAUSED';
  }

  statusLabel(m: BracketMatch): string {
    if (this.isLive(m)) return 'LIVE';
    if (m.decided) return 'FT';
    if (m.utcDate) return this.formatKickoff(m.utcDate);
    return '';
  }

  private formatKickoff(utcDate: string): string {
    const d = new Date(utcDate);
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  trackByColumn(_i: number, col: BracketColumn): string {
    return col.stage;
  }

  trackByMatch(_i: number, c: BracketCard): number {
    return c.match.fifaMatch;
  }
}
