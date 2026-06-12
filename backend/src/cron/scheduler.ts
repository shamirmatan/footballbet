import cron from 'node-cron';
import Logging from '../library/Logging';
import {runUpdate} from '../controllers/Update';

// Runs runUpdate() every minute. node-cron fires on schedule regardless of how
// long the previous run took, so guard against overlapping executions — a slow
// run must finish before the next one starts.
let updateRunning = false;

const runUpdateGuarded = async (): Promise<void> => {
  if (updateRunning) {
    Logging.warning('Cron: previous update still running, skipping this tick.');
    return;
  }
  updateRunning = true;
  try {
    const report = await runUpdate();
    Logging.info(
      `Cron: done. teams=${report.teamsUpserted} participants=${report.participantsUpdated} matches=${report.matchesProcessed} champion=${report.championId ?? 'none'}`
    );
  } catch (err) {
    Logging.error(err);
  } finally {
    updateRunning = false;
  }
};

export const startCronJobs = (): void => {
  cron.schedule('* * * * *', runUpdateGuarded);
  Logging.info('Cron: scheduled tournament update every minute.');
};
