import {Request, Response} from 'express';
import Tournament from '../models/Tournament';

export const listTournaments = async (_req: Request, res: Response) => {
  try {
    const tournaments = await Tournament.find()
      .sort({sortOrder: 1})
      .select('slug name shortName status seasonStart seasonEnd')
      .lean();
    res.status(200).json({tournaments});
  } catch (err) {
    res.status(500).json({message: 'Failed to load tournaments'});
  }
};
