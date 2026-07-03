import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {Observable} from 'rxjs';
import {map, shareReplay} from 'rxjs/operators';
import {environment} from '../../environments/environment';
import {Bracket, GroupStanding, Match, TournamentState} from './tournament.model';

@Injectable({providedIn: 'root'})
export class TournamentService {
  private matches$?: Observable<Match[]>;

  constructor(private http: HttpClient) {}

  getState(): Observable<TournamentState | null> {
    return this.http.get<TournamentState | null>(`${environment.apiUrl}/tournament`);
  }

  getGroups(): Observable<GroupStanding[]> {
    return this.http
      .get<{groups: GroupStanding[]}>(`${environment.apiUrl}/groups`)
      .pipe(map((r) => r.groups));
  }

  getMatches(): Observable<Match[]> {
    // Cache the response so the many standings panels that prefetch it share a
    // single request, and a team-schedule popup opens instantly with no wait.
    if (!this.matches$) {
      this.matches$ = this.http
        .get<{matches: Match[]}>(`${environment.apiUrl}/matches`)
        .pipe(
          map((r) => r.matches),
          shareReplay({bufferSize: 1, refCount: false})
        );
    }
    return this.matches$;
  }

  getBracket(): Observable<Bracket> {
    return this.http.get<Bracket>(`${environment.apiUrl}/bracket`);
  }
}
