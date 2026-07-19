import {Component, OnInit, OnDestroy, Input} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {ActivatedRoute} from '@angular/router';
import {MatSnackBar} from '@angular/material/snack-bar';
import {forkJoin, Subscription, interval} from 'rxjs';
import {switchMap, filter, take} from 'rxjs/operators';
import {environment} from '../../environments/environment';
import {AuthService} from '../services/auth.service';
import {ActiveTournamentService} from '../tournament/active-tournament.service';

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
  @Input() viewerOnly = false;

  rankGroups: RankGroup[] = [];
  participants: ParticipantFromApi[] = [];
  assignments: Record<string, string> = {};
  teamsByName: Record<string, TeamFromApi> = {};
  participantColors: Record<string, string> = {};
  isLoading = true;
  isSaving = false;
  isAdmin = false;
  draftLocked = false;

  /** Edit controls show only for an admin while the draft is still open. */
  get canEdit(): boolean {
    return this.isAdmin && !this.draftLocked;
  }

  /** Total draftable teams (tiered) for this tournament — 48 for WC26, 24 for Euro28, etc. */
  get totalTeamsCount(): number {
    return Object.keys(this.teamsByName).length;
  }

  /** Even split of the draftable teams across participants (e.g. 12 for WC26's 48/4, 6 for Euro28's 24/4). */
  get teamsPerParticipant(): number {
    return this.participants.length ? this.totalTeamsCount / this.participants.length : 0;
  }

  private readonly COLORS = ['#1e88e5', '#e53935', '#43a047', '#fb8c00'];
  private readonly API_URL = environment.apiUrl;
  private readonly STORAGE_KEY = 'team-picker-assignments';
  private reverseTeamMap: Record<string, string> = {};
  private pollSub: Subscription | null = null;
  private routeSub: Subscription | null = null;
  private saveTimeout: any = null;
  private tournamentSlug: string | null = null;

  private get tournamentUrl(): string {
    return `${this.API_URL}/tournaments/${this.tournamentSlug}`;
  }

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private active: ActiveTournamentService,
    private snackBar: MatSnackBar,
    public authService: AuthService
  ) {}

  ngOnInit() {
    // Shares the ActivatedRoute of whichever routed ancestor rendered this
    // component — HomeComponent when embedded (viewerOnly) in the Draft tab,
    // or this component's own route when linked directly at /pick-teams.
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const slug = params.get('tournamentSlug');
      this.active.setSlug(slug);
      if (slug && slug !== this.tournamentSlug) {
        this.tournamentSlug = slug;
        this.pollSub?.unsubscribe();
        this.loadForTournament();
      }
    });

    this.authService.isAdmin$.subscribe(isAdmin => {
      if (this.isAdmin !== isAdmin) {
        this.isAdmin = isAdmin;
        if (this.canEdit) {
          this.loadAssignments();
        }
      }
    });
  }

  private loadForTournament() {
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
    this.routeSub?.unsubscribe();
    this.pollSub?.unsubscribe();
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
  }

  signIn() {
    this.authService.signIn().subscribe(isAdmin => {
      this.isAdmin = isAdmin;
      if (this.canEdit) this.loadAssignments();
    });
  }

  signOut() {
    this.authService.signOutUser().subscribe(() => {
      this.isAdmin = false;
    });
  }

  displayName(name: string): string {
    return DISPLAY_NAMES[name] || name;
  }

  private loadData() {
    forkJoin({
      participantsRes: this.http.get<{participants: ParticipantFromApi[]}>(`${this.tournamentUrl}/participants`),
      teamsRes: this.http.get<{teams: TeamFromApi[]}>(`${this.tournamentUrl}/teams`),
      tournamentRes: this.http.get<{draftLocked?: boolean}>(`${this.tournamentUrl}/state`)
    }).subscribe({
      next: ({participantsRes, teamsRes, tournamentRes}) => {
        this.draftLocked = tournamentRes?.draftLocked ?? false;
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

        if (this.canEdit) {
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
    const pollInterval = this.canEdit ? 10000 : 500;
    this.pollSub = interval(pollInterval).pipe(
      switchMap(() => this.http.get<{participants: ParticipantFromApi[]}>(`${this.tournamentUrl}/participants`))
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
    if (this.canEdit) {
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
          `${this.tournamentUrl}/participants/update/${p.lastName}`,
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

  /** Even split of one rank's teams across participants (e.g. 2 for WC26's 8-team tiers, 4 participants). */
  getRankCap(rank: number): number {
    const group = this.rankGroups.find(g => g.rank === rank);
    if (!group || !this.participants.length) return 0;
    return group.teams.length / this.participants.length;
  }

  isParticipantDisabledForTeam(lastName: string, rank: number, teamName: string): boolean {
    if (this.assignments[teamName] === lastName) return false;
    return this.getAssignmentCount(lastName, rank) >= this.getRankCap(rank);
  }

  getAssignedCount(): number {
    return Object.keys(this.assignments).length;
  }

  canSave(): boolean {
    return this.getAssignedCount() === this.totalTeamsCount;
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
        `${this.tournamentUrl}/participants/update/${p.lastName}`,
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
