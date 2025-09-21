import Feedback from "../models/feedbackModel.js";

export const listAllFeedback = async (req, res) => {
  try {
    const all = await Feedback.find().sort({ timestamp: -1 }).lean();
    return res.json({ success: true, feedbacks: all });
  } catch (err) {
    console.error("Error fetching feedback:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getAverageRatings = async (req, res) => {
  try {
    const result = await Feedback.aggregate([
      {
        $group: {
          _id: null,
          avgOverall: { $avg: "$overall" },
          avgService: { $avg: "$service" },
          avgSpeed: { $avg: "$speed" },
          count: { $sum: 1 }, // ✅ count number of feedback documents
        },
      },
    ]);

    const {
      avgOverall = 0,
      avgService = 0,
      avgSpeed = 0,
      count = 0,
    } = result[0] || {};

    res.json({
      success: true,
      averages: {
        avgOverall,
        avgService,
        avgSpeed,
        count, // ✅ pass count to frontend
      },
    });
  } catch (err) {
    console.error("Error getting average ratings:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
