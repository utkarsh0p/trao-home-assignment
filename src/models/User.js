import mongoose from 'mongoose';

/**
 * User: email + password hash. Owns kits.
 * Deliberately minimal — the brief puts email verification, password reset and role
 * hierarchies explicitly out of scope and unscored (prd §3.1).
 */
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
);

// The hash must never leave the process, including via an accidental res.json(user).
userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);
export default User;
