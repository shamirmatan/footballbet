import {Component, OnDestroy, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {Subscription} from 'rxjs';
import {ActiveTournamentService} from '../active-tournament.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit, OnDestroy {
  isDraftTab = false;
  private paramsSub?: Subscription;

  constructor(private route: ActivatedRoute, private active: ActiveTournamentService) {}

  ngOnInit(): void {
    // paramMap (not snapshot) — Angular reuses this component instance when
    // only the :tournamentSlug param changes, so this is what picks up a
    // switch from e.g. /t/wc26 to /t/euro26 without a full navigation.
    this.paramsSub = this.route.paramMap.subscribe((params) => {
      this.active.setSlug(params.get('tournamentSlug'));
    });
  }

  ngOnDestroy(): void {
    this.paramsSub?.unsubscribe();
  }
}
