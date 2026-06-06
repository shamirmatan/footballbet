import {Component, OnInit} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {MatSnackBar} from '@angular/material/snack-bar';
import {forkJoin} from 'rxjs';
import {environment} from '../../environments/environment';
import {RANK_GROUPS} from './rank-data';

interface TeamFromApi {
  _id: string;
  name: string;
  logo: string;
  group: string;
}

interface ParticipantFromApi {
  _id: string;
  firstName: string;
  lastName: string;
  teams: TeamFromApi[];
}

const TEAM_NAME_ALIASES: Record<string, string[]> = {
  'South Korea': ['Korea Republic', 'Korea, Republic of'],
  'Ivory Coast': ["Côte d'Ivoire", "Cote d'Ivoire"],
  'DR Congo': ['Congo DR', 'Democratic Republic of the Congo', 'Congo, DR'],
  'Czechia': ['Czech Republic'],
  'United States': ['USA', 'United States of America'],
  'Curacao': ['Curaçao'],
  'Cape Verde': ['Cabo Verde', 'Cape Verde Islands'],
  'Türkiye': ['Turkey'],
  'Bosnia & Herz.': ['Bosnia-Herzegovina', 'Bosnia and Herzegovina', 'Bosnia & Herzegovina'],
};

@Component({
  selector: 'app-team-picker',
  templateUrl: './team-picker.component.html',
  styleUrls: ['./team-picker.component.css']
})
export class TeamPickerComponent implements OnInit {
  rankGroups = RANK_GROUPS;
  participants: ParticipantFromApi[] = [];
  assignments: Record<string, string> = {};
  teamMap: Record<string, TeamFromApi> = {};
  participantColors: Record<string, string> = {};
  isLoading = true;
  isSaving = false;
  unmatchedTeams: string[] = [];

  private readonly COLORS = ['#1e88e5', '#e53935', '#43a047', '#fb8c00'];
  private readonly API_URL = environment.apiUrl;
  private readonly STORAGE_KEY = 'team-picker-assignments';

  constructor(private http: HttpClient, private snackBar: MatSnackBar) {}

  ngOnInit() {
    forkJoin({
      participantsRes: this.http.get<{participants: ParticipantFromApi[]}>(`${this.API_URL}/participants`),
      teamsRes: this.http.get<{teams: TeamFromApi[]}>(`${this.API_URL}/teams`)
    }).subscribe({
      next: ({participantsRes, teamsRes}) => {
        this.participants = participantsRes.participants;
        this.participants.forEach((p, i) => {
          this.participantColors[p.lastName] = this.COLORS[i % this.COLORS.length];
        });

        const apiTeams = teamsRes.teams;
        for (const group of this.rankGroups) {
          for (const teamName of group.teams) {
            const found = this.findApiTeam(teamName, apiTeams);
            if (found) {
              this.teamMap[teamName] = found;
            } else {
              this.unmatchedTeams.push(teamName);
            }
          }
        }

        this.loadAssignments();
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.snackBar.open('Error loading data', 'Close', {duration: 5000});
      }
    });
  }

  private findApiTeam(displayName: string, apiTeams: TeamFromApi[]): TeamFromApi | undefined {
    const lower = displayName.toLowerCase();
    const match = apiTeams.find(t => t.name.toLowerCase() === lower);
    if (match) return match;

    const aliases = TEAM_NAME_ALIASES[displayName];
    if (aliases) {
      for (const alias of aliases) {
        const aliasMatch = apiTeams.find(t => t.name.toLowerCase() === alias.toLowerCase());
        if (aliasMatch) return aliasMatch;
      }
    }
    return undefined;
  }

  onAssign(teamName: string, lastName: string) {
    if (lastName) {
      this.assignments[teamName] = lastName;
    } else {
      delete this.assignments[teamName];
    }
    this.saveAssignments();
  }

  private saveAssignments() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.assignments));
  }

  private loadAssignments() {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved) {
      this.assignments = JSON.parse(saved);
    }
  }

  getAssignmentCount(lastName: string, rank: number): number {
    const group = this.rankGroups.find(g => g.rank === rank);
    if (!group) return 0;
    return group.teams.filter(t => this.assignments[t] === lastName).length;
  }

  getTotalCount(lastName: string): number {
    return Object.values(this.assignments).filter(v => v === lastName).length;
  }

  isParticipantDisabledForTeam(lastName: string, rank: number, teamName: string): boolean {
    if (this.assignments[teamName] === lastName) return false;
    return this.getAssignmentCount(lastName, rank) >= 2;
  }

  getAssignedCount(): number {
    return Object.keys(this.assignments).length;
  }

  canSave(): boolean {
    return this.getAssignedCount() === 48;
  }

  getTeamsForParticipant(lastName: string, rank: number): string[] {
    const group = this.rankGroups.find(g => g.rank === rank);
    if (!group) return [];
    return group.teams.filter(t => this.assignments[t] === lastName);
  }

  getTeamsForParticipantAll(lastName: string): string[] {
    return Object.entries(this.assignments)
      .filter(([_, v]) => v === lastName)
      .map(([team]) => team);
  }

  getFullName(lastName: string): string {
    const p = this.participants.find(p => p.lastName === lastName);
    return p ? `${p.firstName} ${p.lastName}` : lastName;
  }

  getAssignmentColor(teamName: string): string {
    const lastName = this.assignments[teamName];
    return lastName ? this.participantColors[lastName] : 'var(--color-border)';
  }

  save() {
    if (!this.canSave()) return;
    this.isSaving = true;

    const participantTeamIds: Record<string, string[]> = {};
    this.participants.forEach(p => participantTeamIds[p.lastName] = []);

    for (const [teamName, lastName] of Object.entries(this.assignments)) {
      const team = this.teamMap[teamName];
      if (team) {
        participantTeamIds[lastName].push(team._id);
      }
    }

    const updates = this.participants.map(p =>
      this.http.patch(`${this.API_URL}/participants/update/${p.lastName}`, {
        teams: participantTeamIds[p.lastName]
      })
    );

    forkJoin(updates).subscribe({
      next: () => {
        this.isSaving = false;
        localStorage.removeItem(this.STORAGE_KEY);
        this.snackBar.open('Teams saved successfully!', 'Close', {duration: 3000});
      },
      error: () => {
        this.isSaving = false;
        this.snackBar.open('Error saving teams. Please try again.', 'Close', {duration: 5000});
      }
    });
  }
}
