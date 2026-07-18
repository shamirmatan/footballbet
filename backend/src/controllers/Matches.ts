import {Response} from 'express';
import Match from '../models/Match';
import {TournamentRequest} from '../middleware/resolveTournament';

export const getMatches = async (req: TournamentRequest, res: Response) => {
  try {
    const matches = await Match.find({tournamentId: req.tournament!._id}).sort({utcDate: 1}).lean();
    res.status(200).json({matches});
  } catch (err) {
    res.status(500).json({message: 'Failed to load matches'});
  }
};
