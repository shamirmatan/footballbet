import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {ActiveTournamentService} from '../active-tournament.service';
import {TournamentMeta} from '../tournament.model';

// Rank tournaments for the "no slug given" landing page: prefer whichever is
// currently live, otherwise the most recently archived one (it still has
// real data), otherwise the most recently added upcoming one (likely empty).
const STATUS_RANK: Record<TournamentMeta['status'], number> = {live: 0, archived: 1, upcoming: 2};

@Component({
  selector: 'app-tournament-redirect',
  templateUrl: './tournament-redirect.component.html',
  styleUrls: ['./tournament-redirect.component.css']
})
export class TournamentRedirectComponent implements OnInit {
  error = false;

  constructor(private active: ActiveTournamentService, private router: Router) {}

  ngOnInit(): void {
    this.active.list().subscribe({
      next: (tournaments) => {
        if (tournaments.length === 0) {
          this.error = true;
          return;
        }
        const [best] = [...tournaments].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
        this.router.navigate(['/t', best.slug]);
      },
      error: () => {
        this.error = true;
      }
    });
  }
}
