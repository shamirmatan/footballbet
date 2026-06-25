# Playoffs Bracket Resolution — Design

**Date:** 2026-06-25
**Status:** Approved (pending spec review)

## Problem

The Playoffs tab (`app-bracket`) renders knockout fixtures straight from
football-data via `GET /api/matches`. football-data leaves every Round-of-32
fixture as TBD (null `homeTeam`/`awayTeam`) until the whole group stage finishes
and the bracket is drawn. So even after teams have clinched Round-of-32 spots,
the tab shows nothing but `TBD vs TBD` slots.

The 2026 World Cup bracket is **predefined by format** — it is not a live draw.
Each knockout slot maps to a fixed group position (e.g. Match 73 = Runner-up A
vs Runner-up B; Match 79 = Winner A vs best 3rd from C/E/F/H/I). We already
persist enough to resolve most of those slots: `Team.position`, `Team.group`,
`Team.qualifications`, plus match results. The recent advancement fix
(`558109b`) established that advancement/elimination should be derived from
standings + results rather than from not-yet-drawn fixtures; this feature
applies the same principle to the bracket display.

## Goal

Show, in the Playoffs tab, the teams that have advanced — placed into their
real predefined bracket slots — as each group finishes, without waiting on
football-data's draw. Slots that cannot yet be resolved show a descriptive
placeholder.

Non-goals:

- Encoding FIFA's Annex C 495-combination table. The eight third-place slots
  stay as candidate-group placeholders until football-data publishes the draw,
  at which point we display the real teams it provides.
- Predicting or simulating outcomes. We only resolve what is already decided.

## Bracket structure (official 2026)

Source: Wikipedia "2026 FIFA World Cup knockout stage" (match numbers 73–104).

### Round of 32

| Match | Home | Away |
|-------|------|------|
| 73 | Runner-up A | Runner-up B |
| 74 | Winner E | Best 3rd (A/B/C/D/F) |
| 75 | Winner F | Runner-up C |
| 76 | Winner C | Runner-up F |
| 77 | Winner I | Best 3rd (C/D/F/G/H) |
| 78 | Runner-up E | Runner-up I |
| 79 | Winner A | Best 3rd (C/E/F/H/I) |
| 80 | Winner L | Best 3rd (E/H/I/J/K) |
| 81 | Winner D | Best 3rd (B/E/F/I/J) |
| 82 | Winner G | Best 3rd (A/E/H/I/J) |
| 83 | Runner-up K | Runner-up L |
| 84 | Winner H | Runner-up J |
| 85 | Winner B | Best 3rd (E/F/G/I/J) |
| 86 | Winner J | Runner-up H |
| 87 | Winner K | Best 3rd (D/E/I/J/L) |
| 88 | Runner-up D | Runner-up G |

Note: every R32 match has at least one deterministic side (a group Winner or
Runner-up). This is what lets us join to football-data fixtures by team id
instead of guessing match identity by date or order.

### Round of 16

| Match | Home | Away |
|-------|------|------|
| 89 | Winner M74 | Winner M77 |
| 90 | Winner M73 | Winner M75 |
| 91 | Winner M76 | Winner M78 |
| 92 | Winner M79 | Winner M80 |
| 93 | Winner M83 | Winner M84 |
| 94 | Winner M81 | Winner M82 |
| 95 | Winner M86 | Winner M88 |
| 96 | Winner M85 | Winner M87 |

### Quarter-finals

| Match | Home | Away |
|-------|------|------|
| 97 | Winner M89 | Winner M90 |
| 98 | Winner M93 | Winner M94 |
| 99 | Winner M91 | Winner M92 |
| 100 | Winner M95 | Winner M96 |

### Semi-finals

| Match | Home | Away |
|-------|------|------|
| 101 | Winner M97 | Winner M98 |
| 102 | Winner M99 | Winner M100 |

### Final / third place

| Match | Home | Away |
|-------|------|------|
| 103 (third place) | Loser M101 | Loser M102 |
| 104 (final) | Winner M101 | Winner M102 |

## Architecture

Slot resolution lives in the **backend**, as a pure function, consistent with
the advancement logic in `Update.ts` and its `Update.test.ts` coverage. The
frontend bracket component becomes a thin renderer of the resolved structure.

### Components

1. **`backend/src/services/bracket.ts`** — static structure + resolver.

   - `BRACKET: BracketSlotDef[]` — the table above encoded as data. Each entry:
     ```ts
     interface SideDef {
       type: 'winner' | 'runnerUp' | 'third' | 'matchWinner' | 'matchLoser';
       group?: string;          // winner | runnerUp
       candidates?: string[];   // third
       match?: number;          // matchWinner | matchLoser
     }
     interface BracketSlotDef {
       fifaMatch: number;
       stage: Stage;            // LAST_32 .. FINAL / THIRD_PLACE
       home: SideDef;
       away: SideDef;
     }
     ```
   - `buildBracket(teams: ITeam[], matches: IMatch[]): Bracket` — pure; resolves
     every slot and returns the rendered bracket plus `qualifiedThirds`.

2. **`backend/src/controllers/Bracket.ts`** — `getBracket`: loads `Team.find()`
   and `Match.find()`, calls `buildBracket`, returns JSON.

3. **`backend/src/routes/Bracket.ts`** + mount `router.use('/api/bracket', …)`
   in `server.ts`.

4. **Frontend** — `tournament.service.ts` gains `getBracket()`;
   `tournament.model.ts` gains the bracket response types; `bracket.component.ts`
   consumes `getBracket()` instead of `getMatches()`;
   `bracket.component.html`/`.css` render placeholder-aware sides and a
   qualified-thirds strip.

### Resolution rules

A group is **complete** when all four of its teams have `games >= 3`.

- **`winner` / `runnerUp`** — resolved to the real team (position 1 / 2 in that
  group) only when the group is complete; otherwise a placeholder side
  (`name: "Winner A"` / `"Runner-up B"`, `resolved: false`).
- **`third`** — always a placeholder (`name: "Best 3rd (C/E/F/H/I)"`,
  `resolved: false`) **unless** the joined football-data fixture already carries
  a real opponent (post-draw), in which case show that team.
- **`matchWinner` / `matchLoser`** — resolve the referenced feeder match; if it
  is FINISHED, take its winner/loser (a resolved real team); otherwise a
  placeholder (`name: "Winner of M73"`, `resolved: false`).
- **Score / status / live / utcDate / winner** — always taken from the joined
  football-data `Match` for that slot. Join strategy: take the slot's resolved
  deterministic side's `api_id` and find the football-data `Match` in the same
  stage whose `homeTeam.api_id`/`awayTeam.api_id` includes it. From that fixture
  read the opponent (fills an unresolved third side with the real drawn team)
  and the score/status. If no deterministic side is resolved yet, or no fixture
  contains it, the match shows placeholders with no score and the football-data
  fixture's scheduled `utcDate`/`status` where a 1:1 stage fixture is available.

### `qualifiedThirds`

All teams currently in `position === 3` of their group, ranked by the official
third-place tiebreaker (points, then goal difference, then goals for; id as a
stable final tiebreak). The top `THIRD_PLACE_SLOTS` (8) are flagged `in: true`.
Before all groups finish this is a "so far" projection; once every group is
complete it is the real set of eight qualified thirds.

## Response shape

`GET /api/bracket`:

```jsonc
{
  "stages": [
    {
      "stage": "LAST_32",
      "label": "Round of 32",
      "matches": [
        {
          "fifaMatch": 79,
          "stage": "LAST_32",
          "home": { "api_id": 1, "name": "Mexico", "logo": "…", "resolved": true },
          "away": { "api_id": null, "name": "Best 3rd (C/E/F/H/I)", "logo": null, "resolved": false },
          "status": "TIMED",
          "utcDate": "2026-06-29T19:00:00Z",
          "scoreHome": null,
          "scoreAway": null,
          "winner": null
        }
      ]
    }
  ],
  "qualifiedThirds": [
    { "api_id": 7, "name": "Poland", "logo": "…", "group": "F", "in": true }
  ]
}
```

Stage order and labels match the existing `bracket.component.ts`
(`FINAL`, `THIRD_PLACE`, `SEMI_FINALS`, `QUARTER_FINALS`, `LAST_16`, `LAST_32`).

## Frontend rendering

- Each side renders `name` (real or placeholder) and `logo` when present.
  Unresolved sides (`resolved: false`) render greyed/italic, reusing existing
  `.match__side` styling with a `--placeholder` modifier.
- Score columns show only when `scoreHome`/`scoreAway` are non-null (unchanged).
- A "Qualified 3rd-place teams" strip renders flag + name chips for
  `qualifiedThirds`, with top-8 (`in: true`) highlighted, shown with the R32
  stage. Empty before any third can be projected.
- The empty-state copy stays for when no knockout structure is available.

## Testing

- **`backend/src/services/bracket.test.ts`** (mirrors `Update.test.ts`):
  - incomplete group → Winner/Runner-up slots stay placeholders;
  - complete group → Winner/Runner-up resolve to position 1/2 teams;
  - third slot stays placeholder pre-draw; shows the real team when the joined
    fixture carries a drawn opponent;
  - `matchWinner` propagation: a FINISHED R32 feeds the resolved winner into its
    R16 slot; unfinished feeder stays a placeholder;
  - score/status pulled from the joined football-data fixture;
  - `qualifiedThirds` ranking and top-8 `in` flag.
- **Frontend** — a light `bracket.component.spec.ts` asserting resolved names
  render, placeholders are greyed, and the thirds strip lists chips.

## Risks / assumptions

- Joining by the deterministic side's team id assumes football-data fixtures,
  once they carry real teams, use the same `api_id`s as our `Team` docs (already
  true elsewhere in the app). Pre-draw fixtures contribute only scheduled
  `utcDate`/`status`.
- `Team.position` reflects football-data's official tiebreakers; we only trust
  Winner/Runner-up once the group is complete, so mid-group position churn does
  not produce wrong resolved teams.
