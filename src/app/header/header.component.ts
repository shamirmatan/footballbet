import {Component, OnDestroy, OnInit} from '@angular/core';

const KICKOFF = new Date('2026-06-11T16:00:00Z');

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent implements OnInit, OnDestroy {
  countdownLabel = '';
  private timerId?: number;

  ngOnInit(): void {
    this.updateCountdown();
    this.timerId = window.setInterval(() => this.updateCountdown(), 60_000);
  }

  ngOnDestroy(): void {
    if (this.timerId) window.clearInterval(this.timerId);
  }

  private updateCountdown(): void {
    const now = Date.now();
    const diffMs = KICKOFF.getTime() - now;
    if (diffMs <= 0) {
      this.countdownLabel = 'Tournament live';
      return;
    }
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
    if (days >= 1) {
      this.countdownLabel = `Kicks off in ${days} day${days === 1 ? '' : 's'}`;
    } else {
      this.countdownLabel = `Kicks off in ${hours}h`;
    }
  }
}
