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

import helmet from "helmet";

const app = express();
const port = process.env.PORT || 4000;

// ✅ Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'", "https://www.ealerto-qcde.com"],
        "script-src": [
          "'self'",
          "https://www.ealerto-qcde.com",
          "https://maps.googleapis.com",
          "https://maps.gstatic.com",
          "https://www.google.com/recaptcha",
          "https://www.gstatic.com/recaptcha/",
        ],
        "style-src": [
          "'self'",
          "'unsafe-inline'",
          "https://www.ealerto-qcde.com",
          "https://fonts.googleapis.com",
        ],
        "img-src": [
          "'self'",
          "data:",
          "https:",
          "https://www.ealerto-qcde.com",
          "https://api.ealerto-qcde.com",
          "https://maps.gstatic.com",
        ],
        "font-src": [
          "'self'",
          "https://www.ealerto-qcde.com",
          "https://fonts.gstatic.com",
        ],
        "connect-src": [
          "'self'",
          "https://api.ealerto-qcde.com",
          "https://www.ealerto-qcde.com",
          "https://ealerto-qcde.com",
          "wss://api.ealerto-qcde.com",
          "https://maps.googleapis.com",
          "https://maps.gstatic.com",
        ],
        "frame-src": [
          "'self'",
          "https://www.google.com",
          "https://maps.googleapis.com",
        ],
        "frame-ancestors": ["'self'"],
        "base-uri": ["'self'"],
      },
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginEmbedderPolicy: false, // sometimes needed for React/Vite assets
  })
);

// ✅ Permissions-Policy (modernized)
app.use((req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()"
  );
  next();
});

// ✅ Create server + socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["https://www.ealerto-qcde.com", "https://ealerto-qcde.com"],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// ✅ Map userId → socketId
const userSocketMap = {};

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("join", (userId) => {
    userSocketMap[userId] = socket.id;
    console.log(`User ${userId} joined with socket ID ${socket.id}`);
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected:", socket.id);
    for (const userId in userSocketMap) {
      if (userSocketMap[userId] === socket.id) {
        delete userSocketMap[userId];
        console.log(`User ${userId} removed from map`);
        break;
      }
    }
  });
});

// ✅ DB connection
connectDB();

app.use(express.json());
app.use(cookieParser());

// ✅ CORS setup
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

// ✅ Routes
app.get("/", (req, res) => res.send("API Working"));
app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/reguser", regUserRouter);
app.use("/api/reports", reportRouter);
app.use("/api/assignments", assignmentRouter);
app.use("/api/activitylogs", activityLogsRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api/notifications", notificationRouter);

// ✅ Start server
server.listen(port, () => console.log(`Server started on PORT:${port}`));

// ✅ Export
export { io, userSocketMap };
