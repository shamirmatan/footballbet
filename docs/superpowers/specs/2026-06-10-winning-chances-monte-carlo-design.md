# Winning Chances (Monte Carlo) — Design

**Date:** 2026-06-10
**Status:** Approved (pending spec review)

## Goal

Show, next to each participant in the **Standings** tab, their live probability
(0–100%) of finishing the pool in 1st place. The number is recalculated once a
day by a GitHub Actions cron and evolves as the tournament unfolds: as a
participant's teams bank points the chance rises; as teams are eliminated the
field's uncertainty shrinks and the leader's chance trends toward 100%.

## Core principle

The chance is **anchored on points already banked**. The existing 30-minute
`cron-update` already turns live results into `team.points` and
`participant.points`. The daily chances calculation builds on those locked-in
points and projects only the points still up for grabs from each participant's
surviving teams.

Concretely: in every simulation run, matches that are already `FINISHED` are
frozen at their real outcomes (so banked points are identical in every run);
only unplayed matches are rolled. A participant's simulated final total is
therefore `banked points + simulated future points`, and the chance is the
fraction of runs in which that total is the highest of the four participants.

## Scope

In scope:
- A Monte Carlo simulation of the remainder of the tournament.
- One new `Participant.chances` field (0–100).
- A daily GitHub Actions workflow that recomputes and writes `chances`.
- A small "chance" chip in the Standings tab participant card.

Out of scope (YAGNI):
- Historical/trend storage of chances over time, sparklines, charts.
- External strength data (Elo feeds, betting odds). Strength comes from the
  draft tier only.
- Any change to the existing scoring or 30-minute update pipeline.

## The simulation model

### Inputs (all read from MongoDB)

- `Team`: `tier` (1–6), `group`, `api_id`, `points`, plus live result fields.
- `Participant`: `teams` (12 refs) and current `points`.
- `Match`: every fixture with `stage`, `status`, scores, `group`, team ids.

No external API call — the simulation reads only what the 30-minute cron has
already persisted. This keeps the daily job decoupled and fast.

### Team strength

Each team is assigned a fixed rating derived from its tier (tier 1 highest →
tier 6 lowest, with constant gaps). This rating drives **unplayed** matches
only. Live form needs no separate modelling because finished matches are frozen
at their real scores.

Rating: `rating(tier) = BASE - (tier - 1) * STEP` (e.g. `BASE = 1900`,
`STEP = 70`, giving 1900…1550 across tiers 1–6). Exact constants are an
implementation detail to be tuned for sensible spreads; they live as named
constants in the simulation module.

### Match outcome model

A single unplayed match between teams A and B is rolled with a Poisson goals
model:

- Expected goals for each side derive from the rating difference around a
  baseline (~1.4 goals/side), via a logistic transform of `(ratingA - ratingB)`.
- Sample each side's goals from its Poisson; the sampled scoreline gives the
  result.
- **Group match:** points are `W·3 / D·1 / L·0` as today.
- **Knockout match:** a tie after 90' is resolved by a rating-weighted coin
  flip for advancement; for **points** it counts as a draw (`D·1`), matching the
  existing scoring (`aggregateTotalsFromMatches` treats ET/penalties as a draw,
  advancement handled separately via the qualifications bonus).

### One simulation run

1. **Freeze** all `FINISHED` matches at their real outcomes. Only matches with a
   non-finished status are rolled.
2. **Group stage:** roll the remaining group fixtures, build each group's final
   table (points, then goal difference, then goals for as a clean tiebreak —
   note this approximates FIFA's full tiebreaker chain, acceptable for the
   model), and determine qualifiers using the **real 2026 rule**: top 2 of each
   of the 12 groups (24) plus the **8 best third-placed teams** (32 total).
3. **Knockout — Option A (approximate bracket):** seed the 32 qualifiers into a
   standard single-elimination bracket (group winners vs runners-up/thirds, by
   simulated group finish and rating). This does **not** replicate FIFA's exact
   slot/best-thirds table; the group stage — where most differentiation happens
   — is simulated exactly, and only the KO pairing is approximated. Roll each
   round to a champion.
4. **Score every team** with the real point formula:
   `points = wins·3 + draws + QUALIFICATION_BONUS[stageReached]`, where the
   bonus ladder is `R32:3, R16:8, QF:13, SF:18, Final:23, Champion:33` (same
   values as `Update.ts`). Sum per participant on top of banked points.
5. Record the **winner** (max total). On an exact tie, split the win equally
   among the tied leaders (each gets `1/k`).

### Output

Run `N` simulations (default `N = 20000`). Each participant's
`chances = 100 * winsAccumulated / N`, rounded to a whole number for display
storage (stored as a number; UI shows integer %). The four values sum to ~100
(small rounding drift is acceptable).

## Architecture

```
backend/
  src/
    services/
      chances.ts          # pure simulation: strength, match roll, group sim,
                          # knockout sim, scoring, aggregation. No I/O.
    cron/
      updateChances.ts    # entry: connect Mongo, load data, run sims, write
                          # Participant.chances, disconnect.
    models/
      Participant.ts      # + chances field
  package.json            # + "cron:chances" script
.github/workflows/
  chances-daily.yml       # daily 04:00 UTC + workflow_dispatch
src/app/
  participants/
    participant.model.ts          # + chances
    participant-list/*.html,css   # render the chance chip
  participants.service.ts         # passes chances through (already maps points)
```

### Module boundaries

- `services/chances.ts` — **pure**. Given plain team/participant/match data,
  returns `{ lastName -> chancePercent }`. No Mongo, no Date.now, deterministic
  given a seeded RNG. Independently unit-testable: feed a finished tournament
  and assert the actual winner gets 100%; feed an all-unplayed tournament and
  assert the percentages sum to ~100 and order by squad strength.
- `cron/updateChances.ts` — thin I/O shell: load → call `chances.ts` → persist.
- Frontend changes are display-only.

## Data model change

`Participant` gains:

```ts
chances: { type: Number, required: false, default: 0 }  // 0–100
```

`computePoints`/`recomputeParticipantPoints` in `Update.ts` are untouched. The
chances job is the only writer of `chances`.

## The daily cron

`.github/workflows/chances-daily.yml`, mirroring `cron-update.yml`:

- Triggers: `schedule: '0 4 * * *'` and `workflow_dispatch`.
- **04:00 UTC = 07:00 Israel during the tournament.** GitHub cron is UTC with no
  DST; the WC (2026-06-11 → 2026-07-19) runs while Israel is on IDT (UTC+3), so
  04:00 UTC lands at 07:00 local for the whole event.
- Steps: checkout → setup-node 20 (cache backend) → `npm ci` → `npm run build`
  → `npm run cron:chances`.
- Secrets needed: `MONGO_USERNAME`, `MONGO_PASSWORD` only (no football-data —
  the job reads results already persisted by `cron-update`).

## The UI

Standings tab → `participant-list.component.html`. Each card header today shows
identity on the left and a points chip on the right. Add a **secondary chance
chip** immediately left of the points chip:

```
┌────────────────────────────────────────────────┐
│ ②  🧑 Or Gabay              63% win   │ 41 pts │
└────────────────────────────────────────────────┘
```

- Visually lighter than the points chip (muted color, smaller weight) so points
  remain the primary figure.
- Renders `participant.chances + '%'` with a tiny "win" label.
- Hidden (or shown as `—`) when `chances` is 0/undefined before the first run,
  to avoid a misleading "0%" on every card.
- No bars or charts.

`participant.model.ts` gains `chances: number`; `participants.service.ts`
already returns the raw participant objects, so `chances` flows through with no
logic change (sorting stays by `points`).

## Testing

- **Unit (services/chances.ts):**
  - Finished tournament fixture → the real winner gets 100%, others 0%.
  - All-unplayed fixture → percentages sum to ~100 (±1 for rounding) and rank in
    squad-strength order.
  - A participant whose only alive teams are eliminated mid-run cannot gain
    future bonus (banked points only).
  - Determinism: same seed → same output.
- **Manual:** run `npm run cron:chances` against the live DB pre-tournament;
  confirm four roughly-balanced percentages written and rendered in Standings.

## Risks / notes

- Approximate KO bracket (Option A) trades exact FIFA slotting for simplicity;
  accepted per "keep it clean".
- Strength constants (`BASE`, `STEP`, goal baseline) need a quick sanity tune so
  pre-tournament chances look reasonable; they are named constants for easy
  adjustment.
- `N = 20000` is comfortably within GitHub Actions time limits for a daily job;
  can be lowered if runtime is a concern.
```
