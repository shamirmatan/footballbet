import {Injectable} from '@angular/core';
import {BehaviorSubject} from 'rxjs';

export interface SelectedTeam {
  name: string;
  logo?: string | null;
}

/** Holds which team's schedule popup is currently open (app-wide). */
@Injectable({providedIn: 'root'})
export class TeamScheduleService {
  private readonly selectedSubject = new BehaviorSubject<SelectedTeam | null>(null);
  readonly selected$ = this.selectedSubject.asObservable();

  open(name: string | null | undefined, logo?: string | null): void {
    if (!name) return;
    this.selectedSubject.next({name, logo: logo ?? null});
  }

  close(): void {
    this.selectedSubject.next(null);
  }
}
