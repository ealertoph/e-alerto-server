import express from "express";
import userAuth from "../middleware/userAuth.js";
import {
  getUserData,
  listAllUsers,
  deleteUser,
  updateUser,
  getOneUser,
  archiveUser,
  unarchiveUser,
  uploadEmployeeProfilePic,
  getProfilePic,
} from "../controllers/userController.js";

const userRouter = express.Router();

userRouter.get("/data", userAuth, getUserData);
userRouter.get("/list-all", userAuth, listAllUsers);
userRouter.delete("/delete/:id", userAuth, deleteUser);
userRouter.put("/update/:id", userAuth, updateUser);
userRouter.get("/get/:id", userAuth, getOneUser);
userRouter.put("/archive/:id", userAuth, archiveUser);
userRouter.put("/unarchive/:id", userAuth, unarchiveUser);
// serve the image blob
userRouter.get("/image/:id", userAuth, getProfilePic);
// upload a new one
userRouter.post("/upload-pic/:id", userAuth, uploadEmployeeProfilePic);

export default userRouter;
