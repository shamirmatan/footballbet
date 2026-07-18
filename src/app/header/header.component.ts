import {Component} from '@angular/core';
import {Observable} from 'rxjs';
import {ActiveTournamentService} from '../tournament/active-tournament.service';
import {TournamentMeta} from '../tournament/tournament.model';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent {
  tournaments$: Observable<TournamentMeta[]>;
  activeMeta$: Observable<TournamentMeta | null>;
  menuOpen = false;

  constructor(private active: ActiveTournamentService) {
    this.tournaments$ = this.active.list();
    this.activeMeta$ = this.active.activeMeta$();
  }

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  closeMenu(): void {
    this.menuOpen = false;
  }

  statusLabel(status: TournamentMeta['status']): string {
    if (status === 'live') return 'Live';
    if (status === 'upcoming') return 'Upcoming';
    return 'Archived';
  }
}
