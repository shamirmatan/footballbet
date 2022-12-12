import {NgModule} from "@angular/core";
import {TeamsTableComponent} from "./teams-table/teams-table.component";
import {ParticipantListComponent} from "./participant-list/participant-list.component";
import {AngularMaterialModule} from "../angular-material.module";
import {CommonModule} from "@angular/common";
import {RouterModule} from "@angular/router";

@NgModule({
    declarations: [
      ParticipantListComponent,
      TeamsTableComponent,
    ],
    imports: [
      AngularMaterialModule,
      RouterModule,
      CommonModule,
    ]
  }
)
export class ParticipantsModule {
}
