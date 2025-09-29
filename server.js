import express from "express";
import cors from "cors";
import "dotenv/config";
import cookieParser from "cookie-parser";
import http from "http";
import { Server } from "socket.io";
import "./jobs/reportReminders.js"; // ✅ Import cron job

import connectDB from "./config/mongodb.js";
import authRouter from "./routes/authRoutes.js";
import userRouter from "./routes/userRoutes.js";
import regUserRouter from "./routes/regUserRoutes.js";
import reportRouter from "./routes/reportRoutes.js";
import assignmentRouter from "./routes/assignmentRoutes.js";
import activityLogsRouter from "./routes/activityLogsRoutes.js";
import feedbackRouter from "./routes/feedbackRoutes.js";
import notificationRouter from "./routes/notificationRoutes.js";

const app = express();
const port = process.env.PORT || 4000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins, // Replace with your frontend URL
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// The userSocketMap object to track user IDs and their socket IDs
const userSocketMap = {};

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // A single, unified block to handle connection and join events
  socket.on("join", (userId) => {
    userSocketMap[userId] = socket.id;
    console.log(`User ${userId} joined with socket ID ${socket.id}`);
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected:", socket.id);
    // When a user disconnects, find their ID in the map and remove it
    for (const userId in userSocketMap) {
      if (userSocketMap[userId] === socket.id) {
        delete userSocketMap[userId];
        console.log(`User ${userId} removed from map`);
        break;
      }
    }
  });
});

connectDB();

app.use(express.json());
app.use(cookieParser());

const allowedOrigins = [
  "https://www.ealerto-qcde.com",
  "https://ealerto-qcde.com",
];
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.get("/", (req, res) => res.send("API Working"));
app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/reguser", regUserRouter);
app.use("/api/reports", reportRouter);
app.use("/api/assignments", assignmentRouter);
app.use("/api/activitylogs", activityLogsRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api/notifications", notificationRouter);

server.listen(port, () => console.log(`Server started on PORT:${port}`));

// Export both the io object and the userSocketMap
export { io, userSocketMap };
