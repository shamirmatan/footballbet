import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {BehaviorSubject, Observable, combineLatest} from 'rxjs';
import {map, shareReplay} from 'rxjs/operators';
import {environment} from '../../environments/environment';
import {TournamentMeta} from './tournament.model';

/**
 * Single source of truth for which tournament is currently selected. The
 * slug is driven by the :tournamentSlug route param (see HomeComponent /
 * TeamPickerComponent); everything else (header switcher, hero, groups,
 * bracket, participants) reacts to slug$ rather than re-deriving it.
 */
@Injectable({providedIn: 'root'})
export class ActiveTournamentService {
  private readonly slugSubject = new BehaviorSubject<string | null>(null);
  readonly slug$ = this.slugSubject.asObservable();

  private tournaments$?: Observable<TournamentMeta[]>;

  constructor(private http: HttpClient) {}

  get slug(): string | null {
    return this.slugSubject.value;
  }

  setSlug(slug: string | null): void {
    if (slug !== this.slugSubject.value) {
      this.slugSubject.next(slug);
    }
  }

  /** The full tournament list, for the switcher. Cached — it rarely changes. */
  list(): Observable<TournamentMeta[]> {
    if (!this.tournaments$) {
      this.tournaments$ = this.http
        .get<{tournaments: TournamentMeta[]}>(`${environment.apiUrl}/tournaments`)
        .pipe(
          map((r) => r.tournaments),
          shareReplay({bufferSize: 1, refCount: false})
        );
    }
    return this.tournaments$;
  }

  /** Metadata for the currently selected tournament, once both are known. */
  activeMeta$(): Observable<TournamentMeta | null> {
    return combineLatest([this.slug$, this.list()]).pipe(
      map(([slug, tournaments]) => tournaments.find((t) => t.slug === slug) ?? null)
    );
  }
}
