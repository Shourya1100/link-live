const express = require("express");
const router = express.Router();
const { sendFriendRequest, acceptFriendRequest, getFriendRequests, getFriends } = require("../controllers/friendController");
const authMiddleware = require("../middleware/authMiddleware");

router.post("/send", authMiddleware, sendFriendRequest);
router.post("/accept", authMiddleware, acceptFriendRequest);
router.get("/requests", authMiddleware, getFriendRequests);
router.get("/friends", authMiddleware, getFriends);

module.exports = router;