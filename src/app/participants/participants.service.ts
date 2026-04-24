import {Injectable} from '@angular/core';
import {Subject} from 'rxjs';
import { HttpClient } from "@angular/common/http";
import {environment} from "../../environments/environment";

const BACKEND_URL = environment.apiUrl + '/participants'

@Injectable({providedIn: 'root'})
export class ParticipantsService {
  constructor(private httpClient: HttpClient) {
  }

  private participants: Participant[] = [];
  private participantsUpdated = new Subject<Participant[]>()

  getParticipants() {
    this.httpClient.get<{ participants: Participant[] }>(BACKEND_URL).subscribe(
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
