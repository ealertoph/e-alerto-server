import express from "express";
import {
  listAllFeedback,
  getAverageRatings,
} from "../controllers/feedbackController.js";

const feedbackRouter = express.Router();

feedbackRouter.get("/list-all", listAllFeedback);
feedbackRouter.get("/averages", getAverageRatings);

export default feedbackRouter;
