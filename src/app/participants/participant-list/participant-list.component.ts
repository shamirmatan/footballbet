import {Component, ViewChild} from "@angular/core";
import {MatAccordion} from "@angular/material/expansion";
import participantsData from '../../../assets/participants.json'

@Component({
  selector: 'app-participant-list',
  templateUrl: './participant-list.component.html',
  styleUrls: ['./participant-list.component.css']
})
export class ParticipantListComponent {
  @ViewChild(MatAccordion) accordion: MatAccordion;

  participants: Participant[] = participantsData
  sortedParticipants = this.participants.sort((a, b) => (a.position < b.position) ? -1 : 1);
}
