import {Component, OnInit} from '@angular/core';
import {TournamentService} from '../tournament.service';
import {GroupStanding, GroupTeam} from '../tournament.model';

@Component({
  selector: 'app-groups',
  templateUrl: './groups.component.html',
  styleUrls: ['./groups.component.css']
})
export class GroupsComponent implements OnInit {
  groups: GroupStanding[] = [];
  loading = true;

  constructor(private tournamentService: TournamentService) {}

  ngOnInit(): void {
    this.tournamentService.getGroups().subscribe({
      next: (groups) => {
        this.groups = groups;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  qualificationClass(position: number): string {
    if (position <= 2) return 'team-row--qualify';
    if (position === 3) return 'team-row--maybe';
    return 'team-row--out';
  }

  trackByApiId(_i: number, team: GroupTeam): number {
    return team.api_id;
  }
}
