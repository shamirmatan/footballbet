import cron from 'node-cron';
import Logging from '../library/Logging';
import {runUpdate} from '../controllers/Update';
import Tournament from '../models/Tournament';

// Runs runUpdate() every minute for every tournament currently marked 'live'.
// node-cron fires on schedule regardless of how long the previous run took, so
// guard against overlapping executions — a slow run must finish before the
// next tick starts.
let updateRunning = false;

const runUpdateGuarded = async (): Promise<void> => {
  if (updateRunning) {
    Logging.warning('Cron: previous update still running, skipping this tick.');
    return;
  }
  updateRunning = true;
  try {
    // With no tournament marked 'live' (e.g. between tournaments), this is a
    // cheap no-op — no football-data.org calls are made and nothing is written.
    const liveTournaments = await Tournament.find({status: 'live'});
    if (liveTournaments.length === 0) {
      Logging.info('Cron: no live tournament, nothing to update.');
      return;
    }
    for (const tournament of liveTournaments) {
      if (!tournament.competitionCode) {
        Logging.warning(`Cron: tournament "${tournament.slug}" is live but has no competitionCode set, skipping.`);
        continue;
      }
      try {
        const report = await runUpdate(tournament);
        Logging.info(
          `Cron: done (${tournament.slug}). teams=${report.teamsUpserted} participants=${report.participantsUpdated} matches=${report.matchesProcessed} champion=${report.championId ?? 'none'}`
        );
      } catch (err) {
        Logging.error(err);
      }
    }
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
