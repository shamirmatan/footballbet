import {Component, OnDestroy, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {Subscription} from 'rxjs';
import {distinctUntilChanged, filter} from 'rxjs/operators';
import {ActiveTournamentService} from '../active-tournament.service';
import {TournamentService} from '../tournament.service';

// Once the group stage has moved into the knockout rounds (or the whole
// tournament is done), the Groups tab is no longer the main event — dim it.
// Before that (including "not started yet"), it's still fully relevant.
const GROUPS_OVER_STAGES = new Set(['COMPLETED', 'LAST_32', 'LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'THIRD_PLACE', 'FINAL']);

const TAB_COUNT = 4;
// A deliberate horizontal swipe: far enough, and clearly more horizontal
// than vertical, so an ordinary vertical page scroll never triggers it.
const SWIPE_MIN_DISTANCE_PX = 50;
const SWIPE_HORIZONTAL_DOMINANCE = 1.5;

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit, OnDestroy {
  isDraftTab = false;
  groupsOver = false;
  draftLocked = false;
  selectedIndex = 0;
  private paramsSub?: Subscription;
  private slugSub?: Subscription;
  private touchStartX = 0;
  private touchStartY = 0;

  constructor(
    private route: ActivatedRoute,
    private active: ActiveTournamentService,
    private tournamentService: TournamentService
  ) {}

  ngOnInit(): void {
    // paramMap (not snapshot) — Angular reuses this component instance when
    // only the :tournamentSlug param changes, so this is what picks up a
    // switch from e.g. /t/wc26 to /t/euro28 without a full navigation.
    this.paramsSub = this.route.paramMap.subscribe((params) => {
      this.active.setSlug(params.get('tournamentSlug'));
    });

    this.slugSub = this.active.slug$.pipe(
      filter((slug): slug is string => !!slug),
      distinctUntilChanged()
    ).subscribe(() => {
      this.tournamentService.getState().subscribe({
        next: (state) => {
          this.groupsOver = !!state?.stage && GROUPS_OVER_STAGES.has(state.stage);
          this.draftLocked = state?.draftLocked ?? false;
        },
        error: () => {
          this.groupsOver = false;
          this.draftLocked = false;
        }
      });
    });
  }

  ngOnDestroy(): void {
    this.paramsSub?.unsubscribe();
    this.slugSub?.unsubscribe();
  }

  onTouchStart(event: TouchEvent): void {
    const touch = event.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
  }

  onTouchEnd(event: TouchEvent): void {
    // The Playoffs bracket has its own horizontal-scrolling tree — let that
    // native scroll happen instead of also treating the drag as a tab swipe.
    if ((event.target as HTMLElement | null)?.closest('.tree-scroll')) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - this.touchStartX;
    const deltaY = touch.clientY - this.touchStartY;
    if (Math.abs(deltaX) < SWIPE_MIN_DISTANCE_PX) return;
    if (Math.abs(deltaX) < Math.abs(deltaY) * SWIPE_HORIZONTAL_DOMINANCE) return;

    const next = this.selectedIndex + (deltaX < 0 ? 1 : -1);
    this.selectedIndex = Math.max(0, Math.min(TAB_COUNT - 1, next));
  }
}
