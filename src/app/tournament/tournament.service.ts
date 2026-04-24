import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {environment} from '../../environments/environment';
import {GroupStanding, Match, TournamentState} from './tournament.model';

@Injectable({providedIn: 'root'})
export class TournamentService {
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
    return this.http
      .get<{matches: Match[]}>(`${environment.apiUrl}/matches`)
      .pipe(map((r) => r.matches));
  }
}
