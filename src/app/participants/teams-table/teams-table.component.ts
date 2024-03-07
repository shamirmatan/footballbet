import {Component, Input, OnInit} from "@angular/core";

@Component({
  selector: 'app-teams-table',
  templateUrl: './teams-table.component.html',
  styleUrls: ['./teams-table.component.css']
})
export class TeamsTableComponent implements OnInit {
  displayedColumns: string[] = ['logo','name', 'games', 'wins', 'draws', 'losses', 'qualifications', 'points'];
  @Input() teams: Team[];

  ngOnInit() {
    this.teams = this.teams.sort((a, b) => b.points - a.points);
  }
}
