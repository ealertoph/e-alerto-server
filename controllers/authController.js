import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import userModel from "../models/userModel.js";
import transporter from "../config/nodemailer.js";
import ActivityLog from "../models/activityLogsModel.js";
import userAuth from "../middleware/userAuth.js"; // make sure your route uses this
import Counter from "../models/idNumberModel.js"; // for Employee Number
import { GridFSBucket } from "mongodb";
import mongoose from "mongoose";
import { Readable } from "stream";
import fetch from "node-fetch"; // add this at the top if not yet imported
import {
  EMAIL_VERIFY_TEMPLATE,
  PASSWORD_RESET_TEMPLATE,
} from "../config/emailTemplates.js";

// ─── REGISTER ─────────────────────────────────────────────────────────────────
export const register = async (req, res) => {
  const {
    surname,
    firstName,
    middleName = "",
    suffix = "",
    district,
    position,
    email,
    phone,
  } = req.body;

  if (!surname || !firstName || !district || !position || !email || !phone) {
    return res.json({ success: false, message: "Missing Details" });
  }

  try {
    if (await userModel.findOne({ email })) {
      return res.json({ success: false, message: "Email already exists" });
    }
    if (await userModel.findOne({ phone })) {
      return res.json({
        success: false,
        message: "Phone number already exists",
      });
    }

    const now = new Date();
    const YY = String(now.getFullYear()).slice(-2);
    const MM = String(now.getMonth() + 1).padStart(2, "0");

    // Generate Employee Number
    const empKey = `emp-${YY}-${MM}`;
    const empCounter = await Counter.findByIdAndUpdate(
      empKey,
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    const empSeq = String(empCounter.seq).padStart(5, "0");
    const employeeNumber = `QCDE-${YY}-${MM}-${empSeq}`;

    const DEFAULT_PW = "qcd3!23";
    const hashedPassword = await bcrypt.hash(DEFAULT_PW, 10);
    const name = [firstName, middleName, surname, suffix]
      .filter(Boolean)
      .join(" ");

    // ─── Handle Profile Upload ───
    let profilePic = null;
    let originalFileName = null;

    if (req.file) {
      const bucket = new GridFSBucket(mongoose.connection.db, {
        bucketName: "uploads",
      });

      const readable = Readable.from(req.file.buffer);
      const uploadStream = bucket.openUploadStream(req.file.originalname, {
        contentType: req.file.mimetype,
      });

      await new Promise((resolve, reject) => {
        readable
          .pipe(uploadStream)
          .on("error", reject)
          .on("finish", () => {
            profilePic = uploadStream.id;
            originalFileName = req.file.originalname;
            resolve();
          });
      });
    }

    // ─── Create New User ───
    const user = new userModel({
      employeeNumber,
      name,
      surname,
      firstName,
      middleName,
      suffix,
      district,
      position,
      email,
      phone,
      password: hashedPassword,
      profilePic,
      originalFileName,
    });

    await user.save();

    // ─── Log Activity ───
    const actorId = req.body.userId;
    if (actorId) {
      const logKey = `log-${YY}-${MM}`;
      const logCounter = await Counter.findByIdAndUpdate(
        logKey,
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      );
      const logSeq = String(logCounter.seq).padStart(5, "0");
      const logNumber = `Log${YY}-${MM}-${logSeq}`;

      const actor = await userModel.findById(actorId).lean();
      const actorName = actor
        ? `${actor.firstName} ${
            actor.middleName ? actor.middleName + " " : ""
          }${actor.surname}`
        : "Unknown";

      await ActivityLog.create({
        logNumber,
        employeeId: actorId,
        employeeNumber: actor?.employeeNumber || "Unknown",
        employeeName: actorName,
        entityType: "Employee",
        entityId: user._id,
        displayId: employeeNumber,
        action: "Created new employee",
        oldValue: null,
        newValue: {
          employeeNumber,
          name,
          district,
          position,
          email,
          phone,
        },
        ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
      });

      return res.json({
        success: true,
        user: { id: user._id, employeeNumber },
        message: "Employee created successfully.",
      });
    }

    // ─── Fallback: Self-Registration ───
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: true, // must be HTTPS
      sameSite: "none", // allow cross-site cookies
      domain: ".ealert-qcde.com", // only if frontend + backend share this root
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    await transporter.sendMail({
      from: process.env.SENDER_EMAIL,
      to: email,
      subject: "Welcome to QCDE!",
      text: `Your account has been created with Employee No. ${employeeNumber}. Your default password is "${DEFAULT_PW}". Please log in and reset it from your profile.`,
    });

    return res.json({
      success: true,
      user: { id: user._id, employeeNumber },
    });
  } catch (error) {
    console.error("Registration error:", error);
    return res.json({ success: false, message: error.message });
  }
};

export const login = async (req, res) => {
  const { email, password, captcha } = req.body;

  // Require captcha if frontend sent it
  if (captcha) {
    try {
      const verifyURL = `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${captcha}`;
      const captchaRes = await fetch(verifyURL, { method: "POST" });
      const captchaData = await captchaRes.json();

      if (!captchaData.success) {
        return res.status(400).json({
          success: false,
          message: "Captcha verification failed. Please try again.",
        });
      }
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Captcha verification error",
      });
    }
  }

  // Normal login logic
  if (!email || !password) {
    return res.json({
      success: false,
      message: "Email and Password are required",
    });
  }

  try {
    const user = await userModel.findOne({ email });
    if (!user) {
      return res.json({ success: false, message: "Invalid email or password" });
    }

    if (user.status !== "Active") {
      return res.json({
        success: false,
        message: "Account is inactive. Please contact the administrator.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.json({ success: false, message: "Invalid email or password" });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: true, // Safari requires HTTPS
      sameSite: "none", // allow cross-site cookie
      domain: ".ealerto-qcde.com", // 🔑 share cookie across subdomains
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.json({ success: true });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
};

// ─── LOGOUT ──────────────────────────────────────────────────────────────────
export const logout = async (req, res) => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      domain: ".ealerto-qcde.com",
    });
    return res.json({ success: true, message: "Logged Out" });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
};

// Send Verification OTP to the User's Email
export const sendVerifyOtp = async (req, res) => {
  try {
    const { userId } = req.body;

    const user = await userModel.findById(userId);

    if (user.isAccountVerified) {
      return res.json({ success: false, message: "Account Already Verified" });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));

    user.verifyOtp = otp;
    user.verifyOtpExpireAt = Date.now() + 24 * 60 * 60 * 1000;

    await user.save();

    const mailOption = {
      from: process.env.SENDER_EMAIL,
      to: user.email,
      subject: "Account Verification OTP",
      //text: `Your OTP is ${otp}. Verify your account using this OTP.`,
      html: EMAIL_VERIFY_TEMPLATE.replace("{{otp}}", otp).replace(
        "{{email}}",
        user.email
      ),
    };
    await transporter.sendMail(mailOption);

    res.json({ success: true, message: "Verification OTP Sent on Email" });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

// Verify the Email using OTP
export const verifyEmail = async (req, res) => {
  const { userId, otp } = req.body;

  if (!userId || !otp) {
    return res.json({ success: false, message: "Missing Details" });
  }
  try {
    const user = await userModel.findById(userId);

    if (!user) {
      return res.json({ success: false, message: "User not Found" });
    }

    if (user.verifyOtp === "" || user.verifyOtp !== otp) {
      return res.json({ success: false, message: "Invalid OTP" });
    }

    if (user.verifyOtpExpireAt < Date.now()) {
      return res.json({ success: false, message: "OTP Expired" });
    }

    user.isAccountVerified = true;
    user.verifyOtp = "";
    user.verifyOtpExpireAt = 0;

    await user.save();
    return res.json({ success: true, message: "Email Verified Successfully" });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
};

// Check if user is authenticated
export const isAuthenticated = (req, res) => {
  // If this function is reached, the userAuth middleware
  // has already validated the token and the user is authenticated.
  return res
    .status(200)
    .json({ success: true, message: "User is authenticated" });
};

// Send Password Reset OTP
export const sendResetOtp = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.json({ success: false, message: "Email is required" });
  }

  try {
    const user = await userModel.findOne({ email });
    if (!user) {
      return res.json({ success: false, message: "User not Found " });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));

    user.resetOtp = otp;
    user.resetOtpExpireAt = Date.now() + 15 * 60 * 1000;

    await user.save();

    const mailOption = {
      from: process.env.SENDER_EMAIL,
      to: user.email,
      subject: "Password Reset OTP",
      //text: `Your OTP for resetting your password is ${otp}. Use this OTP to proceed with resetting your password.`,
      html: PASSWORD_RESET_TEMPLATE.replace("{{otp}}", otp).replace(
        "{{email}}",
        user.email
      ),
    };

    await transporter.sendMail(mailOption);

    return res.json({ success: true, message: "OTP sent to your email" });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

// Reset User Password
export const resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.json({
      success: false,
      message: "Email, OTP, and new password are required",
    });
  }

  try {
    const user = await userModel.findOne({ email });
    if (!user) {
      return res.json({ success: false, message: "User Not Found" });
    }

    if (user.resetOtp === "" || user.resetOtp !== otp) {
      return res.json({ success: false, message: "Invalid OTP " });
    }

    if (user.resetOtpExpireAt < Date.now()) {
      return res.json({ success: false, message: "OTP Expired" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;
    user.resetOtp = "";
    user.resetOtpExpireAt = 0;

    await user.save();

    return res.json({
      success: true,
      message: "Password has been reset successfully",
    });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
};

// Verify Reset OTP (Forgot Password)
export const verifyResetOtp = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.json({ success: false, message: "Email and OTP are required" });
  }

  try {
    const user = await userModel.findOne({ email });
    if (!user) {
      return res.json({ success: false, message: "User not Found" });
    }

    if (user.resetOtp === "" || user.resetOtp !== otp) {
      return res.json({ success: false, message: "Invalid OTP" });
    }

    if (user.resetOtpExpireAt < Date.now()) {
      return res.json({ success: false, message: "OTP Expired" });
    }

    return res.json({ success: true, message: "OTP Verified" });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
};
