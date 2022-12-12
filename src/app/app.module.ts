import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {AppRoutingModule} from './app-routing.module';
import {AppComponent} from './app.component';
import {HeaderComponent} from "./header/header.component";
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {FooterComponent} from "./footer/footer";
import {HttpClientModule} from "@angular/common/http";
import {AngularMaterialModule} from "./angular-material.module";
import {ParticipantsModule} from "./participants/participants.module";

@NgModule({
  declarations: [
    AppComponent,
    HeaderComponent,
    FooterComponent,
  ],
  imports: [
    AppRoutingModule,
    HttpClientModule,
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    AngularMaterialModule,
    ParticipantsModule,
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {
}
