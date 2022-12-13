import mongoose, {Document, Schema} from 'mongoose';

export interface ITeam {
  name: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  qualifications: number
}

export interface ITeamModel extends ITeam, Document {
}

const TeamSchema: Schema = new Schema(
  {
    name: {type: String, required: true},
    api_id: {type: Number, required: true},
    games: {type: Number, required: true},
    wins: {type: Number, required: true},
    losses: {type: Number, required: true},
    draws: {type: Number, required: true},
    points: {type: Number, required: true},
    qualifications: {type: Number, required: true},
  },
  {
    versionKey: false
  }
);

export default mongoose.model<ITeamModel>('Team', TeamSchema);
