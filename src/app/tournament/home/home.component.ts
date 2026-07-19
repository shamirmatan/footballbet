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

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit, OnDestroy {
  isDraftTab = false;
  groupsOver = false;
  draftLocked = false;
  private paramsSub?: Subscription;
  private slugSub?: Subscription;

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
}
