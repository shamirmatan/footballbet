/**
 * Seeds the `tier` field on every Team document.
 *
 *   npx ts-node scripts/seedTiers.ts --tournament euro26              # dry-run
 *   npx ts-node scripts/seedTiers.ts --tournament euro26 --execute     # apply
 */

import mongoose from 'mongoose';
import {config} from '../src/config/config';
import Team from '../src/models/Team';
import {resolveTournamentArg} from './lib/resolveTournamentArg';

const TIERS: Record<number, string[]> = {
  1: ['Argentina', 'Spain', 'France', 'Brazil', 'England', 'Portugal', 'Germany', 'Netherlands'],
  2: ['Belgium', 'Croatia', 'Morocco', 'Colombia', 'Uruguay', 'Switzerland', 'United States', 'Japan'],
  3: ['Mexico', 'Senegal', 'Ivory Coast', 'Turkey', 'Austria', 'South Korea', 'Norway', 'Canada'],
  4: ['Egypt', 'Sweden', 'Ecuador', 'Czechia', 'Scotland', 'Iran', 'Australia', 'Paraguay'],
  5: ['Tunisia', 'Algeria', 'Ghana', 'Qatar', 'Saudi Arabia', 'Uzbekistan', 'South Africa', 'Bosnia-Herzegovina'],
  6: ['Congo DR', 'Jordan', 'New Zealand', 'Panama', 'Iraq', 'Haiti', 'Curaçao', 'Cape Verde Islands'],
};

const execute = process.argv.includes('--execute');

async function main() {
  await mongoose.connect(config.mongo.url, {retryWrites: true, w: 'majority'});
  console.log('Connected.');

  const tournament = await resolveTournamentArg(process.argv);
  const tournamentId = tournament._id;
  console.log(`Tournament: ${tournament.slug} (${tournament.name})`);

  const teams = await Team.find({tournamentId}).lean();
  const teamByName = new Map(teams.map(t => [t.name.toLowerCase(), t]));

  const updates: {name: string; tier: number}[] = [];
  const missing: string[] = [];

  for (const [tier, names] of Object.entries(TIERS)) {
    for (const name of names) {
      const team = teamByName.get(name.toLowerCase());
      if (team) {
        updates.push({name: team.name, tier: Number(tier)});
      } else {
        missing.push(name);
      }
    }
  }

  console.log(`\nTier assignments (${updates.length} teams):`);
  for (const {name, tier} of updates) {
    console.log(`  Tier ${tier}: ${name}`);
  }

  if (missing.length > 0) {
    console.warn(`\nUnmatched teams (${missing.length}):`);
    missing.forEach(n => console.warn(`  ✗ ${n}`));
  }

  if (!execute) {
    console.log('\n[dry-run] pass --execute to apply.');
    await mongoose.disconnect();
    return;
  }

  console.log('\nApplying...');
  for (const {name, tier} of updates) {
    await Team.updateOne({tournamentId, name}, {$set: {tier}});
  }
  console.log(`Updated ${updates.length} teams.`);

  await mongoose.disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
