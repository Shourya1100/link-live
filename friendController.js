const Friend = require("../models/Friend");
const User = require("../models/User");

exports.sendFriendRequest = async (req, res) => {
  try {
    const { recipientUsername } = req.body;
    const requester = req.user.id;

    const recipient = await User.findOne({ username: recipientUsername });
    if (!recipient) return res.status(404).json({ message: "User not found" });

    const existingRequest = await Friend.findOne({
      $or: [
        { requester, recipient: recipient._id },
        { requester: recipient._id, recipient: requester },
      ],
    });
    if (existingRequest)
      return res.status(400).json({ message: "Friend request already exists" });

    const friendRequest = await Friend.create({
      requester,
      recipient: recipient._id,
      status: "pending",
    });

    res.status(201).json({ message: "Friend request sent", friendRequest });
  } catch (err) {
    console.error("Error sending friend request:", err);
    res.status(500).json({ message: "Error sending friend request", error: err.message });
  }
};

exports.acceptFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.body;
    const userId = req.user.id;

    const friendRequest = await Friend.findOne({
      _id: requestId,
      recipient: userId,
      status: "pending",
    });
    if (!friendRequest)
      return res.status(404).json({ message: "Friend request not found or already processed" });

    friendRequest.status = "accepted";
    await friendRequest.save();

    res.status(200).json({ message: "Friend request accepted" });
  } catch (err) {
    console.error("Error accepting friend request:", err);
    res.status(500).json({ message: "Error accepting friend request", error: err.message });
  }
};

exports.getFriendRequests = async (req, res) => {
  try {
    const userId = req.user.id;
    const requests = await Friend.find({ recipient: userId, status: "pending" })
      .populate("requester", "username");
    res.status(200).json(requests);
  } catch (err) {
    console.error("Error fetching friend requests:", err);
    res.status(500).json({ message: "Error fetching friend requests", error: err.message });
  }
};

exports.getFriends = async (req, res) => {
  try {
    const userId = req.user.id;
    const friends = await Friend.find({
      $or: [{ requester: userId }, { recipient: userId }],
      status: "accepted",
    })
      .populate("requester", "username")
      .populate("recipient", "username");
    res.status(200).json(friends);
  } catch (err) {
    console.error("Error fetching friends:", err);
    res.status(500).json({ message: "Error fetching friends", error: err.message });
  }
};