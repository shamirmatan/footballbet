import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {AppRoutingModule} from './app-routing.module';
import {AppComponent} from './app.component';
import {HeaderComponent} from "./header/header.component";
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {FooterComponent} from "./footer/footer";
import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import {AngularMaterialModule} from "./angular-material.module";
import {ParticipantsModule} from "./participants/participants.module";
import {HeroComponent} from "./tournament/hero/hero.component";
import {HomeComponent} from "./tournament/home/home.component";
import {GroupsComponent} from "./tournament/groups/groups.component";
import {BracketComponent} from "./tournament/bracket/bracket.component";
import {TeamPickerComponent} from "./team-picker/team-picker.component";
import {TeamScheduleModalComponent} from "./shared/team-schedule-modal/team-schedule-modal.component";
import {TournamentRedirectComponent} from "./tournament/tournament-redirect/tournament-redirect.component";

@NgModule({ declarations: [
        AppComponent,
        HeaderComponent,
        FooterComponent,
        HeroComponent,
        HomeComponent,
        GroupsComponent,
        BracketComponent,
        TeamPickerComponent,
        TeamScheduleModalComponent,
        TournamentRedirectComponent,
    ],
    bootstrap: [AppComponent], imports: [AppRoutingModule,
        BrowserModule,
        AppRoutingModule,
        BrowserAnimationsModule,
        AngularMaterialModule,
        ParticipantsModule], providers: [provideHttpClient(withInterceptorsFromDi())] })
export class AppModule {
}
