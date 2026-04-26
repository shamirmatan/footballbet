import {Component, Input, OnInit} from "@angular/core";

interface TeamSummary {
  total: number;
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
  summary: TeamSummary = {total: 0, advanced: 0, eliminated: 0};

  ngOnInit() {
    this.sortedTeams = [...(this.teams ?? [])].sort((a, b) => {
      const groupDiff = (a.group ?? '').localeCompare(b.group ?? '');
      if (groupDiff !== 0) return groupDiff;
      return b.points - a.points;
    });
    this.summary = {
      total: this.sortedTeams.length,
      advanced: this.sortedTeams.reduce((sum, t) => sum + (t.qualifications ?? 0), 0),
      eliminated: this.sortedTeams.filter((t) => t.eliminated).length
    };
  }
}
