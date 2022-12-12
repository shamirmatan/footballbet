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
  private MAPPING: any = { 1: "one", 2: "two", 3: "3", 4: "4" }

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
  numToString(number: number) {
    return this.MAPPING[number]
  }
}
