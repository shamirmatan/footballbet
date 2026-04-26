import {Component, OnInit} from '@angular/core';
import {forkJoin} from 'rxjs';
import {TournamentService} from '../tournament.service';
import {GroupStanding, GroupTeam, Match} from '../tournament.model';

interface GroupMatchday {
  matchday: number;
  matches: Match[];
}

interface GroupView extends GroupStanding {
  fixtures: GroupMatchday[];
}

type GroupTab = 'standings' | 'fixtures';

@Component({
  selector: 'app-groups',
  templateUrl: './groups.component.html',
  styleUrls: ['./groups.component.css']
})
export class GroupsComponent implements OnInit {
  groups: GroupView[] = [];
  loading = true;
  activeTab: Record<string, GroupTab> = {};

  constructor(private tournamentService: TournamentService) {}

  ngOnInit(): void {
    forkJoin({
      groups: this.tournamentService.getGroups(),
      matches: this.tournamentService.getMatches()
    }).subscribe({
      next: ({groups, matches}) => {
        this.groups = groups.map((g) => ({
          ...g,
          fixtures: this.buildFixtures(g.group, matches)
        }));
        for (const g of this.groups) {
          this.activeTab[g.group] = 'standings';
        }
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  private buildFixtures(groupLetter: string, all: Match[]): GroupMatchday[] {
    const code = `GROUP_${groupLetter}`;
    const byMd = new Map<number, Match[]>();
    for (const m of all) {
      if (m.stage !== 'GROUP_STAGE' || m.group !== code || m.matchday == null) continue;
      const arr = byMd.get(m.matchday) ?? [];
      arr.push(m);
      byMd.set(m.matchday, arr);
    }
    return [...byMd.entries()]
      .sort(([a], [b]) => a - b)
      .map(([matchday, matches]) => ({
        matchday,
        matches: matches.sort((a, b) => a.utcDate.localeCompare(b.utcDate))
      }));
  }

  qualificationClass(position: number): string {
    if (position <= 2) return 'team-row--qualify';
    if (position === 3) return 'team-row--maybe';
    return 'team-row--out';
  }

  setTab(groupLetter: string, tab: GroupTab): void {
    this.activeTab[groupLetter] = tab;
  }

  isTab(groupLetter: string, tab: GroupTab): boolean {
    return this.activeTab[groupLetter] === tab;
  }

  formatKickoff(utcDate: string): string {
    const d = new Date(utcDate);
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  matchStatusLabel(m: Match): string {
    if (m.status === 'IN_PLAY' || m.status === 'PAUSED') return 'LIVE';
    if (m.status === 'FINISHED') return 'FT';
    if (m.status === 'POSTPONED') return 'PPD';
    if (m.status === 'CANCELLED') return 'CXL';
    return this.formatKickoff(m.utcDate);
  }

  isLive(m: Match): boolean {
    return m.status === 'IN_PLAY' || m.status === 'PAUSED';
  }

  loser(m: Match): 'home' | 'away' | null {
    if (m.status !== 'FINISHED') return null;
    if (m.winner === 'HOME_TEAM') return 'away';
    if (m.winner === 'AWAY_TEAM') return 'home';
    return null;
  }

  trackByApiId(_i: number, team: GroupTeam): number {
    return team.api_id;
  }

  trackByMatchday(_i: number, md: GroupMatchday): number {
    return md.matchday;
  }

  trackByMatchId(_i: number, m: Match): number {
    return m.api_id;
  }
}
