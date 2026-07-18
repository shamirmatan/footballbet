import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {Observable} from 'rxjs';
import {map, shareReplay} from 'rxjs/operators';
import {environment} from '../../environments/environment';
import {Bracket, GroupStanding, Match, TournamentState} from './tournament.model';
import {ActiveTournamentService} from './active-tournament.service';

@Injectable({providedIn: 'root'})
export class TournamentService {
  // Short-lived matches cache: bursts of prefetches share one request, but the
  // data still refreshes roughly in step with the backend's per-minute update.
  private static readonly MATCHES_TTL_MS = 60_000;
  private matches$?: Observable<Match[]>;
  private matchesFetchedAt = 0;

  constructor(private http: HttpClient, private active: ActiveTournamentService) {
    // The cached matches response belongs to whichever tournament was active
    // when it was fetched — drop it the moment the tournament switches.
    this.active.slug$.subscribe(() => {
      this.matches$ = undefined;
    });
  }

  private scopedUrl(path: string): string {
    const slug = this.active.slug;
    if (!slug) {
      throw new Error('No active tournament selected');
    }
    return `${environment.apiUrl}/tournaments/${slug}/${path}`;
  }

  getState(): Observable<TournamentState | null> {
    return this.http.get<TournamentState | null>(this.scopedUrl('state'));
  }

  getGroups(): Observable<GroupStanding[]> {
    return this.http
      .get<{groups: GroupStanding[]}>(this.scopedUrl('groups'))
      .pipe(map((r) => r.groups));
  }

  getMatches(): Observable<Match[]> {
    // Cache the response so the many standings panels that prefetch it share a
    // single request and a team-schedule popup opens instantly with no wait —
    // but let it go stale after a short TTL so it refreshes on the next request.
    const now = Date.now();
    if (!this.matches$ || now - this.matchesFetchedAt > TournamentService.MATCHES_TTL_MS) {
      this.matchesFetchedAt = now;
      this.matches$ = this.http
        .get<{matches: Match[]}>(this.scopedUrl('matches'))
        .pipe(
          map((r) => r.matches),
          shareReplay({bufferSize: 1, refCount: false})
        );
    }
    return this.matches$;
  }

  getBracket(): Observable<Bracket> {
    return this.http.get<Bracket>(this.scopedUrl('bracket'));
  }
}
