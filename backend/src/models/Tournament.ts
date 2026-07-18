import mongoose, {Document, Schema} from 'mongoose';

export type TournamentStatus = 'upcoming' | 'live' | 'archived';

export interface ITournament {
  slug: string;
  name: string;
  shortName: string;
  // football-data.org competition code (e.g. "WC"). Empty until the admin
  // wires up the next tournament's data source.
  competitionCode: string;
  status: TournamentStatus;
  // Independent per tournament: WC26's draft can stay locked forever while
  // Euro 2026's draft is still open, or vice versa.
  draftLocked: boolean;
  seasonStart: string;
  seasonEnd: string;
  // Display order for the tournament switcher.
  sortOrder: number;
}

export interface ITournamentModel extends ITournament, Document {
}

const TournamentSchema: Schema = new Schema(
  {
    slug: {type: String, required: true, unique: true, index: true},
    name: {type: String, required: true},
    shortName: {type: String, required: true},
    competitionCode: {type: String, default: ''},
    status: {type: String, enum: ['upcoming', 'live', 'archived'], required: true, default: 'upcoming'},
    draftLocked: {type: Boolean, required: true, default: true},
    seasonStart: {type: String, default: ''},
    seasonEnd: {type: String, default: ''},
    sortOrder: {type: Number, required: true, default: 0}
  },
  {
    versionKey: false
  }
);

export default mongoose.model<ITournamentModel>('Tournament', TournamentSchema);
