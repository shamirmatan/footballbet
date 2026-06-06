import {Component, OnInit, OnDestroy} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {MatSnackBar} from '@angular/material/snack-bar';
import {forkJoin, Subscription, interval} from 'rxjs';
import {switchMap, filter, take} from 'rxjs/operators';
import {environment} from '../../environments/environment';
import {AuthService} from '../services/auth.service';

interface TeamFromApi {
  _id: string;
  name: string;
  logo: string;
  group: string;
  tier: number;
}

interface ParticipantFromApi {
  _id: string;
  firstName: string;
  lastName: string;
  teams: TeamFromApi[];
}

interface RankGroup {
  rank: number;
  teams: TeamFromApi[];
}

const DISPLAY_NAMES: Record<string, string> = {
  'Bosnia-Herzegovina': 'Bosnia & Herz.',
  'Cape Verde Islands': 'Cape Verde',
};

@Component({
  selector: 'app-team-picker',
  templateUrl: './team-picker.component.html',
  styleUrls: ['./team-picker.component.css']
})
export class TeamPickerComponent implements OnInit, OnDestroy {
  rankGroups: RankGroup[] = [];
  participants: ParticipantFromApi[] = [];
  assignments: Record<string, string> = {};
  teamsByName: Record<string, TeamFromApi> = {};
  participantColors: Record<string, string> = {};
  isLoading = true;
  isSaving = false;
  isAdmin = false;

  private readonly COLORS = ['#1e88e5', '#e53935', '#43a047', '#fb8c00'];
  private readonly API_URL = environment.apiUrl;
  private readonly STORAGE_KEY = 'team-picker-assignments';
  private reverseTeamMap: Record<string, string> = {};
  private pollSub: Subscription | null = null;
  private saveTimeout: any = null;

  constructor(
    private http: HttpClient,
    private snackBar: MatSnackBar,
    public authService: AuthService
  ) {}

  ngOnInit() {
    this.authService.ready$.pipe(
      filter(ready => ready),
      take(1)
    ).subscribe(() => {
      this.authService.isAdmin$.pipe(take(1)).subscribe(isAdmin => {
        this.isAdmin = isAdmin;
        this.loadData();
      });
    });
  }

  ngOnDestroy() {
    this.pollSub?.unsubscribe();
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
  }

  signIn() {
    this.authService.signIn().subscribe(isAdmin => {
      this.isAdmin = isAdmin;
      if (isAdmin) {
        this.loadAssignments();
        this.snackBar.open('Signed in as admin', 'Close', {duration: 3000});
      } else {
        this.snackBar.open('Not authorized as admin', 'Close', {duration: 3000});
      }
    });
  }

  signOut() {
    this.authService.signOutUser().subscribe(() => {
      this.isAdmin = false;
      this.snackBar.open('Signed out', 'Close', {duration: 3000});
    });
  }

  displayName(name: string): string {
    return DISPLAY_NAMES[name] || name;
  }

  private loadData() {
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
        const tierMap = new Map<number, TeamFromApi[]>();
        for (const team of apiTeams) {
          if (!team.tier) continue;
          this.teamsByName[team.name] = team;
          this.reverseTeamMap[team._id] = team.name;
          if (!tierMap.has(team.tier)) tierMap.set(team.tier, []);
          tierMap.get(team.tier)!.push(team);
        }

        this.rankGroups = Array.from(tierMap.entries())
          .sort(([a], [b]) => a - b)
          .map(([rank, teams]) => ({rank, teams}));

        if (this.isAdmin) {
          this.loadAssignments();
        } else {
          this.rebuildAssignmentsFromParticipants(participantsRes.participants);
        }

        this.isLoading = false;
        this.startPolling();
      },
      error: () => {
        this.isLoading = false;
        this.snackBar.open('Error loading data', 'Close', {duration: 5000});
      }
    });
  }

  private startPolling() {
    const pollInterval = this.isAdmin ? 10000 : 500;
    this.pollSub = interval(pollInterval).pipe(
      switchMap(() => this.http.get<{participants: ParticipantFromApi[]}>(`${this.API_URL}/participants`))
    ).subscribe(res => {
      if (!this.isSaving) {
        this.rebuildAssignmentsFromParticipants(res.participants);
      }
    });
  }

  private rebuildAssignmentsFromParticipants(participants: ParticipantFromApi[]) {
    const newAssignments: Record<string, string> = {};
    for (const p of participants) {
      for (const team of p.teams) {
        const teamName = this.reverseTeamMap[team._id];
        if (teamName) {
          newAssignments[teamName] = p.lastName;
        }
      }
    }
    this.assignments = newAssignments;
    if (this.isAdmin) {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.assignments));
    }
  }

  private authHeaders(): {headers: HttpHeaders} {
    const token = this.authService.getToken();
    return {headers: new HttpHeaders({Authorization: `Bearer ${token}`})};
  }

  onAssign(teamName: string, lastName: string) {
    if (lastName) {
      this.assignments[teamName] = lastName;
    } else {
      delete this.assignments[teamName];
    }
    this.saveAssignments();
    this.autoSaveToBackend();
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

  private autoSaveToBackend() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.isSaving = true;

      const participantTeamIds: Record<string, string[]> = {};
      this.participants.forEach(p => participantTeamIds[p.lastName] = []);

      for (const [teamName, lastName] of Object.entries(this.assignments)) {
        const team = this.teamsByName[teamName];
        if (team) {
          participantTeamIds[lastName].push(team._id);
        }
      }

      const updates = this.participants.map(p =>
        this.http.patch(
          `${this.API_URL}/participants/update/${p.lastName}`,
          {teams: participantTeamIds[p.lastName]},
          this.authHeaders()
        )
      );

      forkJoin(updates).subscribe({
        next: () => { this.isSaving = false; },
        error: () => {
          this.isSaving = false;
          this.snackBar.open('Error syncing', 'Close', {duration: 3000});
        }
      });
    }, 500);
  }

  getAssignmentCount(lastName: string, rank: number): number {
    const group = this.rankGroups.find(g => g.rank === rank);
    if (!group) return 0;
    return group.teams.filter(t => this.assignments[t.name] === lastName).length;
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
      const team = this.teamsByName[teamName];
      if (team) {
        participantTeamIds[lastName].push(team._id);
      }
    }

    const updates = this.participants.map(p =>
      this.http.patch(
        `${this.API_URL}/participants/update/${p.lastName}`,
        {teams: participantTeamIds[p.lastName]},
        this.authHeaders()
      )
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
