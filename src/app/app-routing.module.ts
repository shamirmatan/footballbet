import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {ParticipantListComponent} from "./participants/participant-list/participant-list.component";

const routes: Routes = [
  {path: '', component: ParticipantListComponent},
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {
}
