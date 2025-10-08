import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  username: { type: String, required: true },
  reportId: { type: String, required: true },
  overall: { type: Number, required: true },
  service: { type: Number, required: true },
  speed: { type: Number, required: true },
  feedback: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

export default mongoose.models.feedback ||
  mongoose.model("ratings", feedbackSchema);
