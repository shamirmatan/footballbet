import {fromEvent, NEVER, Observable, timer} from 'rxjs';
import {startWith, switchMap} from 'rxjs/operators';

/**
 * Emits immediately, then every `periodMs`, but only while the tab is visible.
 * While the tab is hidden it pauses (no emissions); when it becomes visible
 * again it emits once right away (to catch up) and resumes the interval.
 */
export function visiblePoll(periodMs: number): Observable<number> {
  return fromEvent(document, 'visibilitychange').pipe(
    startWith(null),
    switchMap(() =>
      document.visibilityState === 'visible' ? timer(0, periodMs) : NEVER
    )
  );
}
