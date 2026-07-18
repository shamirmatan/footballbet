import express from 'express';
import http from 'http';
import mongoose from 'mongoose';
import {config} from './config/config';
import Logging from './library/Logging';
import participantRoutes from './routes/Participant';
import teamRoutes from './routes/Team';
import tournamentRoutes from './routes/Tournament';
import tournamentsListRoutes from './routes/Tournaments';
import groupRoutes from './routes/Groups';
import matchRoutes from './routes/Matches';
import bracketRoutes from './routes/Bracket';
import authRoutes from './routes/Auth';
import resolveTournament from './middleware/resolveTournament';
import {seedAdmins} from './config/firebase';
import {startCronJobs} from './cron/scheduler';

const router = express();

/** Connect to Mongo */
mongoose
  .connect(config.mongo.url, {retryWrites: true, w: 'majority'})
  .then(async () => {
    Logging.info('Mongo connected successfully.');
    await seedAdmins();
    StartServer();
    startCronJobs();
  })
  .catch((error) => Logging.error(error));

/** Only Start Server if Mongoose Connects */
const StartServer = () => {
  /** Log the request */
  router.use((req, res, next) => {
    /** Log the req */
    Logging.info(`Incomming - METHOD: [${req.method}] - URL: [${req.url}] - IP: [${req.socket.remoteAddress}]`);

    res.on('finish', () => {
      /** Log the res */
      Logging.info(`Result - METHOD: [${req.method}] - URL: [${req.url}] - IP: [${req.socket.remoteAddress}] - STATUS: [${res.statusCode}]`);
    });

    next();
  });

  router.use(express.urlencoded({extended: true}));
  router.use(express.json());

  /** Rules of our API */
  router.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

    if (req.method == 'OPTIONS') {
      res.header('Access-Control-Allow-Methods', 'PUT, POST, PATCH, DELETE, GET');
      return res.status(200).json({});
    }

    next();
  });

  /** Routes */
  // /api/tournaments (no slug) lists every tournament, for the UI switcher.
  router.use('/api/tournaments', tournamentsListRoutes);

  // Everything under /api/tournaments/:tournamentSlug/... is scoped to one
  // tournament — resolveTournament loads it once and attaches it to the
  // request so downstream controllers can filter by tournamentId.
  const scoped = express.Router({mergeParams: true});
  scoped.use(resolveTournament);
  scoped.use('/participants', participantRoutes);
  scoped.use('/teams', teamRoutes);
  scoped.use('/state', tournamentRoutes);
  scoped.use('/groups', groupRoutes);
  scoped.use('/matches', matchRoutes);
  scoped.use('/bracket', bracketRoutes);
  router.use('/api/tournaments/:tournamentSlug', scoped);

  router.use('/api/auth', authRoutes);

  /** Error handling */
  router.use((req, res) => {
    const error = new Error('Not found');

    Logging.error(error);

    res.status(404).json({
      message: error.message
    });
  });

  http.createServer(router).listen(config.server.port, () => Logging.info(`Server is running on port ${config.server.port}`));
};
