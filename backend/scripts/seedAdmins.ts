/**
 * Seeds the admin whitelist.
 *
 *   npx ts-node scripts/seedAdmins.ts              # dry-run
 *   npx ts-node scripts/seedAdmins.ts --execute     # apply
 */

import mongoose from 'mongoose';
import {config} from '../src/config/config';
import AdminUser from '../src/models/AdminUser';

const ADMINS = [
  'matans8890@gmail.com',
];

const execute = process.argv.includes('--execute');

async function main() {
  await mongoose.connect(config.mongo.url, {retryWrites: true, w: 'majority'});
  console.log('Connected.');

  const existing = await AdminUser.find().lean();
  console.log(`\nCurrent admins: ${existing.map(a => a.email).join(', ') || '(none)'}`);
  console.log(`\nAdmins to seed: ${ADMINS.join(', ')}`);

  if (!execute) {
    console.log('\n[dry-run] pass --execute to apply.');
    await mongoose.disconnect();
    return;
  }

  for (const email of ADMINS) {
    const exists = await AdminUser.findOne({email});
    if (exists) {
      console.log(`  Already exists: ${email}`);
    } else {
      await new AdminUser({email}).save();
      console.log(`  Added: ${email}`);
    }
  }

  await mongoose.disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
