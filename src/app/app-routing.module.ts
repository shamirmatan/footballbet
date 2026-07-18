import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {HomeComponent} from "./tournament/home/home.component";
import {TeamPickerComponent} from "./team-picker/team-picker.component";
import {TournamentRedirectComponent} from "./tournament/tournament-redirect/tournament-redirect.component";

const routes: Routes = [
  {path: '', pathMatch: 'full', component: TournamentRedirectComponent},
  {path: 't/:tournamentSlug', component: HomeComponent},
  {path: 't/:tournamentSlug/pick-teams', component: TeamPickerComponent},
  {path: '**', redirectTo: ''},
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {
}
