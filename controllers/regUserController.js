import regUserModel from "../models/regUserModel.js";

export const listAllRegUsers = async (req, res) => {
  try {
    const users = await regUserModel.find({}, "username email phone");
    const formatted = users.map((user) => ({
      id: user._id,
      username: user.username,
      email: user.email,
      phone: user.phone,
    }));
    res.json({ success: true, users: formatted });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

export const getOneRegUser = async (req, res) => {
  try {
    const user = await regUserModel.findById(
      req.params.id,
      "username email phone"
    );
    if (!user) return res.json({ success: false, message: "User not found" });

    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

export const createRegUser = async (req, res) => {
  try {
    const { username, email, phone, password } = req.body;
    const user = new regUserModel({ username, email, phone, password });
    await user.save();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

export const updateRegUser = async (req, res) => {
  try {
    const { username, email, phone } = req.body;
    await regUserModel.findByIdAndUpdate(req.params.id, {
      username,
      email,
      phone,
    });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

export const deleteRegUser = async (req, res) => {
  try {
    await regUserModel.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

//for Notifications
export const savePlayerId = async (req, res) => {
  const userId = req.user.id; // from your userAuth middleware
  const { playerId } = req.body;
  if (!playerId)
    return res
      .status(400)
      .json({ success: false, message: "playerId required" });

  try {
    await regUserModel.findByIdAndUpdate(userId, {
      oneSignalPlayerId: playerId,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
