import {Component, Input} from "@angular/core";

@Component({
  selector: 'app-teams-table',
  templateUrl: './teams-table.component.html',
  styleUrls: ['./teams-table.component.css']
})
export class TeamsTableComponent {
  displayedColumns: string[] = ['name', 'games', 'wins', 'draws', 'losses', 'qualifications', 'points'];
  @Input() teams: Team[];
}
