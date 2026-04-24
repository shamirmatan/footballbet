import {Request, Response} from 'express';
import Match from '../models/Match';

export const getMatches = async (_req: Request, res: Response) => {
  try {
    const matches = await Match.find().sort({utcDate: 1}).lean();
    res.status(200).json({matches});
  } catch (err) {
    res.status(500).json({message: 'Failed to load matches'});
  }
};
