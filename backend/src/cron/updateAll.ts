import mongoose from 'mongoose';
import {config} from '../config/config';
import Logging from '../library/Logging';
import {runUpdate} from '../controllers/Update';

async function main() {
  await mongoose.connect(config.mongo.url, {retryWrites: true, w: 'majority'});
  Logging.info('Cron: connected to Mongo.');

  const report = await runUpdate();
  Logging.info(
    `Cron: done. teams=${report.teamsUpserted} participants=${report.participantsUpdated} matches=${report.matchesProcessed} champion=${report.championId ?? 'none'}`
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  Logging.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
