/**
 * One-off: seed the eight Round-of-32 third-place matchups into the LAST_32
 * fixtures so the bracket fills before football-data.org publishes the real
 * draw. Each pairing puts a group winner (already resolved from standings)
 * against the best-third it faces under the official FIFA 2026 allocation table
 * for the current qualifying set (thirds from groups B, D, E, F, I, J, K, L).
 *
 * Safe to re-run: it matches an already-seeded fixture by team id and otherwise
 * fills the next still-TBD LAST_32 slot. The bracket joins fixtures by team id,
 * so which physical fixture holds a pairing does not matter. These values are
 * provisional — once the feed publishes the real draw (non-null team ids) the
 * every-minute sync overwrites them (see mergeTeamRef in controllers/Update.ts,
 * which only preserves a seeded team while the upstream side is still TBD).
 *
 * Run: SEED_MONGO_URL="<prod connection string>" npx ts-node scripts/seedR32ThirdPlace.ts
 * (falls back to config.mongo.url when SEED_MONGO_URL is unset)
 */

import mongoose from 'mongoose';
import {config} from '../src/config/config';
import Match from '../src/models/Match';

const MONGO_URL = process.env.SEED_MONGO_URL || config.mongo.url;

interface TeamRef {
  api_id: number;
  name: string;
  logo: string;
}

interface Pairing {
  home: TeamRef; // group winner (resolved side)
  away: TeamRef; // best third
}

const PAIRINGS: Pairing[] = [
  {home: {api_id: 769, name: 'Mexico', logo: 'https://crests.football-data.org/769.svg'}, away: {api_id: 791, name: 'Ecuador', logo: 'https://crests.football-data.org/791.svg'}},
  {home: {api_id: 788, name: 'Switzerland', logo: 'https://crests.football-data.org/788.svg'}, away: {api_id: 778, name: 'Algeria', logo: 'https://crests.football-data.org/algeria.svg'}},
  {home: {api_id: 771, name: 'United States', logo: 'https://crests.football-data.org/usa.svg'}, away: {api_id: 1060, name: 'Bosnia-Herzegovina', logo: 'https://crests.football-data.org/bosnia.svg'}},
  {home: {api_id: 759, name: 'Germany', logo: 'https://crests.football-data.org/759.svg'}, away: {api_id: 761, name: 'Paraguay', logo: 'https://crests.football-data.org/761.svg'}},
  {home: {api_id: 805, name: 'Belgium', logo: 'https://crests.football-data.org/805.svg'}, away: {api_id: 804, name: 'Senegal', logo: 'https://crests.football-data.org/senegal.svg'}},
  {home: {api_id: 773, name: 'France', logo: 'https://crests.football-data.org/773.svg'}, away: {api_id: 792, name: 'Sweden', logo: 'https://crests.football-data.org/792.svg'}},
  {home: {api_id: 818, name: 'Colombia', logo: 'https://crests.football-data.org/818.svg'}, away: {api_id: 763, name: 'Ghana', logo: 'https://crests.football-data.org/ghana.svg'}},
  {home: {api_id: 770, name: 'England', logo: 'https://crests.football-data.org/770.svg'}, away: {api_id: 1934, name: 'Congo DR', logo: 'https://crests.football-data.org/congo_dr.svg'}}
];

const ids = (p: Pairing): number[] => [p.home.api_id, p.away.api_id];

async function main(): Promise<void> {
  await mongoose.connect(MONGO_URL, {retryWrites: true, w: 'majority'});
  console.log(`Connected to ${mongoose.connection.db?.databaseName}.`);

  const l32 = await Match.find({stage: 'LAST_32'}).sort({utcDate: 1});
  console.log(`Found ${l32.length} LAST_32 fixtures.`);

  const used = new Set<number>();
  let seeded = 0;

  for (const p of PAIRINGS) {
    const pairIds = ids(p);
    // Re-runnable: reuse the fixture that already holds either of these teams.
    let doc = l32.find(
      (m) => !used.has(m.api_id) && [m.homeTeam?.api_id, m.awayTeam?.api_id].some((x) => x != null && pairIds.includes(x))
    );
    // Otherwise take the next still-TBD slot.
    if (!doc) {
      doc = l32.find((m) => !used.has(m.api_id) && m.homeTeam?.api_id == null && m.awayTeam?.api_id == null);
    }
    if (!doc) {
      console.warn(`No free LAST_32 slot for ${p.home.name} vs ${p.away.name} — skipped.`);
      continue;
    }
    used.add(doc.api_id);
    doc.set('homeTeam', p.home);
    doc.set('awayTeam', p.away);
    await doc.save();
    seeded += 1;
    console.log(`Seeded fixture ${doc.api_id} (${doc.utcDate}): ${p.home.name} vs ${p.away.name}`);
  }

  console.log(`Done. ${seeded}/${PAIRINGS.length} pairings written.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
