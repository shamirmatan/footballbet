import {Component, Input, OnInit} from "@angular/core";

interface TeamSummary {
  total: number;
  played: number;
  advanced: number;
  eliminated: number;
}

@Component({
  selector: 'app-teams-table',
  templateUrl: './teams-table.component.html',
  styleUrls: ['./teams-table.component.css']
})
export class TeamsTableComponent implements OnInit {
  @Input() teams: Team[];
  sortedTeams: Team[] = [];
  summary: TeamSummary = {total: 0, played: 0, advanced: 0, eliminated: 0};

  ngOnInit() {
    this.sortedTeams = [...(this.teams ?? [])].sort((a, b) => {
      const groupDiff = (a.group ?? '').localeCompare(b.group ?? '');
      if (groupDiff !== 0) return groupDiff;
      return b.points - a.points;
    });
    this.summary = {
      total: this.sortedTeams.length,
      played: this.sortedTeams.reduce((sum, t) => sum + (t.totalGames ?? 0), 0),
      advanced: this.sortedTeams.reduce((sum, t) => sum + (t.qualifications ?? 0), 0),
      eliminated: this.sortedTeams.filter((t) => t.eliminated).length
    };
  }
}
