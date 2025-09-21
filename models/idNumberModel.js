import mongoose from "mongoose";

const counterSchema = new mongoose.Schema({
  _id: String, // e.g. "25-01" for Jan 2025
  seq: { type: Number, default: 0 },
});

export default mongoose.models.Counter ||
  mongoose.model("Counter", counterSchema);
