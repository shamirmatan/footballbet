import {Component, OnDestroy, OnInit, ViewChild} from "@angular/core";
import {MatAccordion} from "@angular/material/expansion";
import {ParticipantsService} from "../participants.service";
import {Subscription} from "rxjs";

@Component({
  selector: 'app-participant-list',
  templateUrl: './participant-list.component.html',
  styleUrls: ['./participant-list.component.css']
})
export class ParticipantListComponent implements OnInit, OnDestroy {
  @ViewChild(MatAccordion) accordion: MatAccordion;

  constructor(public participantsService: ParticipantsService) {
  }
  isLoading: boolean;
  participants: Participant[] = []
  private participantsSub: Subscription;

  ngOnInit() {
    this.isLoading = true;
    this.participantsService.getParticipants();
    this.participantsSub = this.participantsService.getParticipantsUpdateListener()
      .subscribe((participants: Participant[]) => {
        this.participants = participants;
        this.isLoading = false;
      });
  }
  ngOnDestroy() {
    this.participantsSub.unsubscribe()
  }

  rankClass(position: number): string {
    if (position === 1) return 'rank-badge--gold';
    if (position === 2) return 'rank-badge--silver';
    if (position === 3) return 'rank-badge--bronze';
    return 'rank-badge--navy';
  }
}
