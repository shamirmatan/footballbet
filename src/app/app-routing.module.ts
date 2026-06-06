import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {HomeComponent} from "./tournament/home/home.component";
import {TeamPickerComponent} from "./team-picker/team-picker.component";

const routes: Routes = [
  {path: '', component: HomeComponent},
  {path: 'pick-teams', component: TeamPickerComponent},
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {
}
