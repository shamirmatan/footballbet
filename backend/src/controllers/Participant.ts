import {Request, Response} from 'express';
import mongoose from 'mongoose';
import Participant from '../models/Participant';
import {config} from '../config/config';

const createParticipant = (req: Request, res: Response) => {
  const {firstName, lastName} = req.body;

  const participant = new Participant({
    _id: new mongoose.Types.ObjectId(),
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

const readParticipant = (req: Request, res: Response) => {
  const lastName = req.params.participantLastName
  const participantLastName = lastName.charAt(0).toUpperCase() + lastName.slice(1);

  return Participant.findOne({lastName: participantLastName})
    .populate('teams')
    .then((participant) => (participant ? res.status(200).json({participant}) : res.status(404).json({message: 'not found'})))
    .catch((error) => res.status(500).json({error}));
};

const readAll = (req: Request, res: Response) => {
  return Participant.find()
    .populate('teams')
    .then((participants) => res.status(200).json({participants: participants}))
    .catch((error) => res.status(500).json({error}));
};

const updateParticipant = (req: Request, res: Response) => {
  if (config.draftLocked) {
    return res.status(423).json({message: 'Draft is locked. Team assignments can no longer be changed.'});
  }

  const lastName = req.params.participantLastName
  const participantLastName = lastName.charAt(0).toUpperCase() + lastName.slice(1);

  return Participant.findOne({lastName: participantLastName})
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
