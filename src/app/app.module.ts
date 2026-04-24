import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {AppRoutingModule} from './app-routing.module';
import {AppComponent} from './app.component';
import {HeaderComponent} from "./header/header.component";
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {FooterComponent} from "./footer/footer";
import {HeroComponent} from "./tournament/hero/hero.component";
import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import {AngularMaterialModule} from "./angular-material.module";
import {ParticipantsModule} from "./participants/participants.module";

@NgModule({ declarations: [
        AppComponent,
        HeaderComponent,
        FooterComponent,
        HeroComponent,
    ],
    bootstrap: [AppComponent], imports: [AppRoutingModule,
        BrowserModule,
        AppRoutingModule,
        BrowserAnimationsModule,
        AngularMaterialModule,
        ParticipantsModule], providers: [provideHttpClient(withInterceptorsFromDi())] })
export class AppModule {
}
