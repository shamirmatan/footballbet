import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../environments/environment';
import {TournamentState} from './tournament.model';

@Injectable({providedIn: 'root'})
export class TournamentService {
  constructor(private http: HttpClient) {}

  getState(): Observable<TournamentState | null> {
    return this.http.get<TournamentState | null>(`${environment.apiUrl}/tournament`);
  }
}
