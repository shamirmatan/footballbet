/**
 * Drives a refresh callback on an adaptive schedule:
 *  - fires immediately on start,
 *  - after each refresh the owner calls `reschedule(isLive)` to book the next
 *    run — `fastMs` when something is live, `slowMs` when nothing is,
 *  - pauses entirely while the tab is hidden and fires once on becoming visible.
 *
 * The owner is responsible for calling `reschedule(...)` when its fetch settles
 * (on both success and error) so the loop keeps going.
 */
export class AdaptivePoller {
  private timeoutId?: ReturnType<typeof setTimeout>;
  private destroyed = false;
  private readonly onVisibility = () => this.handleVisibility();

  constructor(
    private readonly run: () => void,
    private readonly fastMs = 60_000,
    private readonly slowMs = 300_000
  ) {}

  start(): void {
    document.addEventListener('visibilitychange', this.onVisibility);
    this.fire();
  }

  /** Book the next run based on whether anything is currently live. */
  reschedule(isLive: boolean): void {
    if (this.destroyed || !this.isVisible()) return;
    clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(() => this.fire(), isLive ? this.fastMs : this.slowMs);
  }

  destroy(): void {
    this.destroyed = true;
    clearTimeout(this.timeoutId);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private fire(): void {
    if (this.destroyed || !this.isVisible()) return;
    this.run();
  }

  private handleVisibility(): void {
    if (this.destroyed) return;
    if (this.isVisible()) {
      this.fire(); // catch up right away when the tab comes back
    } else {
      clearTimeout(this.timeoutId); // pause while hidden
    }
  }

  private isVisible(): boolean {
    return document.visibilityState === 'visible';
  }
}
