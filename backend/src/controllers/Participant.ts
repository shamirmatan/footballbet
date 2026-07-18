import {Response} from 'express';
import mongoose from 'mongoose';
import Participant from '../models/Participant';
import {TournamentRequest} from '../middleware/resolveTournament';

const createParticipant = (req: TournamentRequest, res: Response) => {
  const {firstName, lastName} = req.body;

  const participant = new Participant({
    _id: new mongoose.Types.ObjectId(),
    tournamentId: req.tournament!._id,
    firstName,
    lastName,
    points: 0,
    teams: []
  });

  return participant
    .save()
    .then((participant) => res.status(201).json({participant}))
    .catch((error) => res.status(500).json({error}));
};

const readParticipant = (req: TournamentRequest, res: Response) => {
  const lastName = req.params.participantLastName
  const participantLastName = lastName.charAt(0).toUpperCase() + lastName.slice(1);

  return Participant.findOne({lastName: participantLastName, tournamentId: req.tournament!._id})
    .populate('teams')
    .then((participant) => (participant ? res.status(200).json({participant}) : res.status(404).json({message: 'not found'})))
    .catch((error) => res.status(500).json({error}));
};

const readAll = (req: TournamentRequest, res: Response) => {
  return Participant.find({tournamentId: req.tournament!._id})
    .populate('teams')
    .then((participants) => res.status(200).json({participants: participants}))
    .catch((error) => res.status(500).json({error}));
};

const updateParticipant = (req: TournamentRequest, res: Response) => {
  const tournament = req.tournament!;
  if (tournament.draftLocked) {
    return res.status(423).json({message: 'Draft is locked. Team assignments can no longer be changed.'});
  }

  const lastName = req.params.participantLastName
  const participantLastName = lastName.charAt(0).toUpperCase() + lastName.slice(1);

  return Participant.findOne({lastName: participantLastName, tournamentId: tournament._id})
    .populate('teams')
    .then((participant) => {
      if (participant) {
        participant.set(req.body);
        return participant
          .save()
          .then((participant) => res.status(201).json({participant}))
          .catch((error) => res.status(500).json({error}));
      } else {
        return res.status(404).json({message: 'not found'});
      }
    })
    .catch((error) => res.status(500).json({error}));
};
export default {createParticipant, readParticipant, readAll, updateParticipant};
