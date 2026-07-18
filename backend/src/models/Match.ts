import mongoose, {Document, Schema} from 'mongoose';

export interface IMatchTeam {
  api_id: number | null;
  name: string | null;
  logo: string | null;
}

export interface IMatch {
  tournamentId: mongoose.Types.ObjectId;
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
  // Penalty-shootout tally, when a knockout tie was decided on penalties. The
  // scoreHome/scoreAway columns stay as the 90'/120' result so both can be shown.
  penaltyHome: number | null;
  penaltyAway: number | null;
  winner: string | null;
  duration: string | null;
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
    tournamentId: {type: Schema.Types.ObjectId, required: true, ref: 'Tournament', index: true},
    api_id: {type: Number, required: true},
    stage: {type: String, required: true, index: true},
    group: {type: String, default: null},
    matchday: {type: Number, default: null},
    status: {type: String, required: true},
    utcDate: {type: String, required: true, index: true},
    homeTeam: {type: MatchTeamSchema, required: true},
    awayTeam: {type: MatchTeamSchema, required: true},
    scoreHome: {type: Number, default: null},
    scoreAway: {type: Number, default: null},
    penaltyHome: {type: Number, default: null},
    penaltyAway: {type: Number, default: null},
    winner: {type: String, default: null},
    duration: {type: String, default: null}
  },
  {
    versionKey: false
  }
);

// A match's api_id is only unique within its own tournament.
MatchSchema.index({tournamentId: 1, api_id: 1}, {unique: true});

export default mongoose.model<IMatchModel>('Match', MatchSchema);
