import express from "express";
import {
  listAllRegUsers,
  getOneRegUser,
  createRegUser,
  updateRegUser,
  deleteRegUser,
  savePlayerId,
} from "../controllers/regUserController.js";
import userAuth from "../middleware/userAuth.js";

const regUserRouter = express.Router();

regUserRouter.get("/list-all", listAllRegUsers);
regUserRouter.get("/get/:id", getOneRegUser);
regUserRouter.post("/create", createRegUser);
regUserRouter.put("/update/:id", updateRegUser);
regUserRouter.delete("/delete/:id", deleteRegUser);
regUserRouter.post("/player-id", userAuth, savePlayerId);

export default regUserRouter;
