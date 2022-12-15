import mongoose, {Document, Schema} from 'mongoose';
import TeamSchema, {ITeam} from "./Team";

export interface IParticipant {
  firstName: string;
  lastName: string;
  teams: [ITeam];
  points: number
}

export interface IParticipantModel extends IParticipant, Document {
}

const ParticipantSchema: Schema = new Schema(
  {
    firstName: {type: String, required: true},
    lastName: {type: String, required: true},
    points: {type: Number, required: true},
    teams: [{type: Schema.Types.ObjectId, required: true, ref: 'Team'}]
  },
  {
    versionKey: false
  }
);

export default mongoose.model<IParticipantModel>('Participant', ParticipantSchema);
