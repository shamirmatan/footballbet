import {Component, OnDestroy, OnInit} from '@angular/core';
import {Subscription} from 'rxjs';
import {ActiveTournamentService} from './tournament/active-tournament.service';

// Tournaments with their own CSS theme (see styles.css). Anything not listed
// here (wc26 included) uses the default :root palette.
const THEME_CLASS_BY_SLUG: Record<string, string> = {
  euro28: 'theme-euro28'
};

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'football-bet';
  private slugSub?: Subscription;
  private appliedThemeClass: string | null = null;

  constructor(private active: ActiveTournamentService) {}

  ngOnInit(): void {
    this.slugSub = this.active.slug$.subscribe((slug) => {
      const nextClass = (slug && THEME_CLASS_BY_SLUG[slug]) || null;
      if (nextClass === this.appliedThemeClass) return;
      if (this.appliedThemeClass) document.body.classList.remove(this.appliedThemeClass);
      if (nextClass) document.body.classList.add(nextClass);
      this.appliedThemeClass = nextClass;
    });
  }

  ngOnDestroy(): void {
    this.slugSub?.unsubscribe();
    if (this.appliedThemeClass) document.body.classList.remove(this.appliedThemeClass);
  }
}
