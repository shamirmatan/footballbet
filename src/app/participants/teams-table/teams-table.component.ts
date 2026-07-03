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
      // Still-alive teams on top, then by rank (points, then goal difference).
      if (!!a.eliminated !== !!b.eliminated) return a.eliminated ? 1 : -1;
      if (b.points !== a.points) return b.points - a.points;
      const gdA = (a.totalGoalsFor ?? 0) - (a.totalGoalsAgainst ?? 0);
      const gdB = (b.totalGoalsFor ?? 0) - (b.totalGoalsAgainst ?? 0);
      if (gdB !== gdA) return gdB - gdA;
      return (a.name ?? '').localeCompare(b.name ?? '');
    });
    this.summary = {
      total: this.sortedTeams.length,
      played: this.sortedTeams.reduce((sum, t) => sum + (t.totalGames ?? 0), 0),
      advanced: this.sortedTeams.reduce((sum, t) => sum + (t.qualifications ?? 0), 0),
      eliminated: this.sortedTeams.filter((t) => t.eliminated).length
    };
  }
}
