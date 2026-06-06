import mongoose, {Document, Schema} from 'mongoose';

export interface IAdminUser {
  email: string;
}

export interface IAdminUserModel extends IAdminUser, Document {}

const AdminUserSchema: Schema = new Schema(
  {
    email: {type: String, required: true, unique: true}
  },
  {
    versionKey: false
  }
);

export default mongoose.model<IAdminUserModel>('AdminUser', AdminUserSchema);
