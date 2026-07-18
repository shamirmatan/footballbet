/**
 * Copies the participant roster (first/last names only) from one tournament
 * to another — e.g. carrying the same friend group over from wc26 to
 * euro28. Copied participants start with no teams and 0 points; run
 * assignTeams.ts / assignRanks56.ts against the target tournament once the
 * draft happens there.
 *
 *   npx ts-node scripts/copyParticipants.ts --from wc26 --to euro28           # dry-run
 *   npx ts-node scripts/copyParticipants.ts --from wc26 --to euro28 --execute # apply
 *
 * Skips any participant who already exists (by lastName) in the target
 * tournament, so it's safe to re-run.
 */

import mongoose from 'mongoose';
import {config} from '../src/config/config';
import Tournament from '../src/models/Tournament';
import Participant from '../src/models/Participant';

const execute = process.argv.includes('--execute');

const argValue = (flag: string): string | undefined => {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
};

async function main() {
  await mongoose.connect(config.mongo.url, {retryWrites: true, w: 'majority'});
  console.log('Connected.');

  const fromSlug = argValue('--from');
  const toSlug = argValue('--to');
  if (!fromSlug || !toSlug) {
    console.error('Usage: --from <slug> --to <slug> [--execute]');
    process.exit(1);
  }

  const [from, to] = await Promise.all([
    Tournament.findOne({slug: fromSlug}),
    Tournament.findOne({slug: toSlug})
  ]);
  if (!from) {
    console.error(`No tournament found with slug "${fromSlug}".`);
    process.exit(1);
  }
  if (!to) {
    console.error(`No tournament found with slug "${toSlug}".`);
    process.exit(1);
  }

  const sourceParticipants = await Participant.find({tournamentId: from._id}).lean();
  const existingTarget = await Participant.find({tournamentId: to._id}).lean();
  const existingLastNames = new Set(existingTarget.map((p) => p.lastName));

  const toCopy = sourceParticipants.filter((p) => !existingLastNames.has(p.lastName));
  const skipped = sourceParticipants.filter((p) => existingLastNames.has(p.lastName));

  console.log(`\nFrom "${from.slug}" (${sourceParticipants.length} participants) to "${to.slug}":`);
  console.log(`  Will create: ${toCopy.length}`);
  toCopy.forEach((p) => console.log(`    + ${p.firstName} ${p.lastName}`));
  if (skipped.length) {
    console.log(`  Already present in "${to.slug}", skipped: ${skipped.length}`);
    skipped.forEach((p) => console.log(`    = ${p.firstName} ${p.lastName}`));
  }

  if (toCopy.length === 0) {
    console.log('\nNothing to do.');
    await mongoose.disconnect();
    return;
  }

  if (!execute) {
    console.log('\n[dry-run] pass --execute to apply.');
    await mongoose.disconnect();
    return;
  }

  console.log('\nApplying...');
  for (const p of toCopy) {
    await Participant.create({
      tournamentId: to._id,
      firstName: p.firstName,
      lastName: p.lastName,
      points: 0,
      chances: 0,
      teams: []
    });
    console.log(`  Created ${p.firstName} ${p.lastName} in "${to.slug}".`);
  }

  console.log(`\nDone. ${toCopy.length} participants copied.`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
