import {Request, Response, NextFunction} from 'express';
import Tournament, {ITournamentModel} from '../models/Tournament';

export interface TournamentRequest extends Request {
  tournament?: ITournamentModel;
}

// Loads the Tournament named by the :tournamentSlug route param and attaches
// it to the request so every scoped controller can filter by tournamentId
// without re-resolving the slug itself.
const resolveTournament = async (req: TournamentRequest, res: Response, next: NextFunction) => {
  const slug = req.params.tournamentSlug;

  try {
    const tournament = await Tournament.findOne({slug});
    if (!tournament) {
      return res.status(404).json({message: `Unknown tournament: ${slug}`});
    }
    req.tournament = tournament;
    next();
  } catch (err) {
    res.status(500).json({message: 'Failed to resolve tournament'});
  }
};

export default resolveTournament;
