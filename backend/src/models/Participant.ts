import mongoose, {Document, Schema} from 'mongoose';
import TeamSchema, {ITeam} from "./Team";

export interface IParticipant {
  tournamentId: mongoose.Types.ObjectId;
  firstName: string;
  lastName: string;
  teams: [ITeam];
  points: number;
  chances: number;
}

export interface IParticipantModel extends IParticipant, Document {
}

const ParticipantSchema: Schema = new Schema(
  {
    tournamentId: {type: Schema.Types.ObjectId, required: true, ref: 'Tournament', index: true},
    firstName: {type: String, required: true},
    lastName: {type: String, required: true},
    points: {type: Number, required: true},
    chances: {type: Number, required: false, default: 0},
    teams: [{type: Schema.Types.ObjectId, required: true, ref: 'Team'}]
  },
  {
    versionKey: false
  }
);

// A participant's lastName (used as the natural key in routes) is only
// expected to be unique within a single tournament's roster.
ParticipantSchema.index({tournamentId: 1, lastName: 1});

export default mongoose.model<IParticipantModel>('Participant', ParticipantSchema);
