import {Injectable} from '@angular/core';
import {BehaviorSubject} from 'rxjs';
import {distinctUntilChanged, filter} from 'rxjs/operators';
import { HttpClient } from "@angular/common/http";
import {environment} from "../../environments/environment";
import {ActiveTournamentService} from '../tournament/active-tournament.service';

@Injectable({providedIn: 'root'})
export class ParticipantsService {
  constructor(private httpClient: HttpClient, private active: ActiveTournamentService) {
    // Re-fetch automatically whenever the selected tournament changes, so
    // every view already subscribed to getParticipantsUpdateListener() picks
    // up the new tournament's roster without having to re-trigger it itself.
    this.active.slug$.pipe(
      filter((slug): slug is string => !!slug),
      distinctUntilChanged()
    ).subscribe(() => this.getParticipants());
  }

  private participants: Participant[] = [];
  // BehaviorSubject (not Subject) so a component that subscribes after the
  // fetch already happened still gets the latest roster immediately.
  private participantsUpdated = new BehaviorSubject<Participant[]>([]);

  getParticipants() {
    const slug = this.active.slug;
    if (!slug) return;
    this.httpClient.get<{ participants: Participant[] }>(`${environment.apiUrl}/tournaments/${slug}/participants`).subscribe(
      (participantsData) => {
        this.participants = participantsData.participants.sort((a, b) => (a.points > b.points) ? -1 : 1);
        this.participants.map((participant, index) => participant.position = index + 1)
        this.participantsUpdated.next([...this.participants]);
      });
  }

  getParticipantsUpdateListener() {
    return this.participantsUpdated.asObservable()
  }

}
