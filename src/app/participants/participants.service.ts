import {Injectable} from '@angular/core';
import {Subject} from 'rxjs';
import {HttpClient} from "@angular/common/http";

@Injectable({providedIn: 'root'})
export class ParticipantsService {
  constructor(private httpClient: HttpClient) {
  }

  private participants: Participant[] = [];
  private participantsUpdated = new Subject<Participant[]>()

  getParticipants() {
    this.httpClient.get<{ participants: Participant[] }>('http://localhost:3000/api/participants').subscribe(
      (participantsData) => {
        this.participants = participantsData.participants.sort((a, b) => (a.position < b.position) ? -1 : 1);
        this.participantsUpdated.next([...this.participants]);
      });
  }

  getParticipantsUpdateListener() {
    return this.participantsUpdated.asObservable()
  }

}
