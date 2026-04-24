import mongoose, {Document, Schema} from 'mongoose';

export interface IMatchTeam {
  api_id: number | null;
  name: string | null;
  logo: string | null;
}

export interface IMatch {
  api_id: number;
  stage: string;
  group: string | null;
  matchday: number | null;
  status: string;
  utcDate: string;
  homeTeam: IMatchTeam;
  awayTeam: IMatchTeam;
  scoreHome: number | null;
  scoreAway: number | null;
  winner: string | null;
}

export interface IMatchModel extends IMatch, Document {
}

const MatchTeamSchema: Schema = new Schema(
  {
    api_id: {type: Number, default: null},
    name: {type: String, default: null},
    logo: {type: String, default: null}
  },
  {_id: false}
);

const MatchSchema: Schema = new Schema(
  {
    api_id: {type: Number, required: true, unique: true, index: true},
    stage: {type: String, required: true, index: true},
    group: {type: String, default: null},
    matchday: {type: Number, default: null},
    status: {type: String, required: true},
    utcDate: {type: String, required: true, index: true},
    homeTeam: {type: MatchTeamSchema, required: true},
    awayTeam: {type: MatchTeamSchema, required: true},
    scoreHome: {type: Number, default: null},
    scoreAway: {type: Number, default: null},
    winner: {type: String, default: null}
  },
  {
    versionKey: false
  }
);

export default mongoose.model<IMatchModel>('Match', MatchSchema);
