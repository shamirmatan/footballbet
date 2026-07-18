import {Response} from 'express';
import TournamentState from '../models/TournamentState';
import {TournamentRequest} from '../middleware/resolveTournament';

export const getTournament = async (req: TournamentRequest, res: Response) => {
  try {
    const tournament = req.tournament!;
    const state = await TournamentState.findOne({tournamentId: tournament._id}).lean();
    res.status(200).json({
      ...(state ?? {}),
      draftLocked: tournament.draftLocked,
      tournament: {
        slug: tournament.slug,
        name: tournament.name,
        shortName: tournament.shortName,
        status: tournament.status
      }
    });
  } catch (err) {
    res.status(500).json({message: 'Failed to load tournament state'});
  }
};
