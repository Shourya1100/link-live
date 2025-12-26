import React, { useEffect, useState, useRef } from "react";
import Peer from "simple-peer";
import axios from "axios";
import socket from "./socket";
import "./App.css";
import Register from './components/Register';
import Login from './components/Login';
import YouTube from 'react-youtube';

function App() {
  const [stream, setStream] = useState(null);
  const [myId, setMyId] = useState("");
  const [incomingCall, setIncomingCall] = useState(null);
  const [callActive, setCallActive] = useState(false);
  const [callInitiated, setCallInitiated] = useState(false);
  const [usersOnline, setUsersOnline] = useState([]);
  const [messages, setMessages] = useState({});
  const [newMessage, setNewMessage] = useState("");
  const [username, setUsername] = useState(localStorage.getItem("username") || "");
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem("token"));
  const [showRegister, setShowRegister] = useState(false);
  const [friendRequests, setFriendRequests] = useState([]);
  const [friends, setFriends] = useState([]);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [watchTogether, setWatchTogether] = useState(null);
  const [friendRequestInput, setFriendRequestInput] = useState("");
  const [watchMode, setWatchMode] = useState("youtube");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [localVideoFile, setLocalVideoFile] = useState(null);

  const userVideoRef = useRef();
  const partnerVideoRef = useRef();
  const peerRef = useRef();
  const youtubePlayerRef = useRef();
  const localVideoRef = useRef();

  const logout = () => {
    localStorage.clear();
    setIsLoggedIn(false);
    setUsername("");
    socket.disconnect();
  };

  useEffect(() => {
    if (!isLoggedIn || !username) return;

    socket.connect();
    socket.auth = { token: localStorage.getItem("token") };

    socket.on("connect", () => {
      console.log("Socket connected, registering user:", username);
      socket.emit("register-user", { username });
    });

    if (!stream) {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })
        .then((currentStream) => {
          if (currentStream.getTracks().length === 0) {
            throw new Error("No media tracks available in stream");
          }
          setStream(currentStream);
          if (userVideoRef.current) {
            userVideoRef.current.srcObject = currentStream;
          }
          console.log("Stream initialized, tracks:", currentStream.getTracks());
        })
        .catch((err) => {
          alert("Please allow camera and microphone access.");
          setStream(null);
          console.error("Stream error:", err);
        });
    }

    socket.on("your-id", (id) => {
      setMyId(id);
      socket.id = id;
      console.log("Received myId:", id);
    });

    socket.on("users-online", (userList) => {
      setUsersOnline(userList.filter((user) => user.id !== socket.id));
      console.log("Users online updated:", userList);
    });

    socket.on("friend-request", (data) => {
      setFriendRequests((prev) => [...prev, data]);
    });

    socket.on("friend-request-accepted", () => {
      fetchFriends();
    });

    socket.on("incoming-call", (data) => {
      console.log("Received incoming-call:", data);
      if (!callActive && !callInitiated) {
        setIncomingCall(data);
      } else {
        socket.emit("reject-call", { to: data.from });
        console.log("Rejected call due to active call or initiated call");
      }
    });

    socket.on("call-accepted", (data) => {
      console.log("Call accepted, signaling data:", data);
      if (peerRef.current) {
        peerRef.current.signal(data.signalData);
        setCallInitiated(false);
        setCallActive(true);
        console.log("callActive set to true, video container should appear");
      }
    });

    socket.on("call-rejected", () => {
      alert("Call was rejected");
      if (peerRef.current) {
        peerRef.current.destroy();
      }
      setCallInitiated(false);
      setCallActive(false);
      console.log("Call rejected, reset call states");
    });

    socket.on("receive-message", (data) => {
      setMessages((prev) => ({
        ...prev,
        [data.from]: [...(prev[data.from] || []), { from: data.from, text: data.text, createdAt: data.createdAt }],
      }));
    });

    socket.on("watch-together", (data) => {
      setWatchTogether(data);
      setWatchMode(data.mode);
      if (data.mode === "youtube" && youtubePlayerRef.current) {
        youtubePlayerRef.current.seekTo(data.timestamp);
        if (data.isPlaying) {
          youtubePlayerRef.current.playVideo();
        } else {
          youtubePlayerRef.current.pauseVideo();
        }
      } else if (data.mode === "local" && localVideoRef.current) {
        localVideoRef.current.currentTime = data.timestamp;
        if (data.isPlaying) {
          localVideoRef.current.play();
        } else {
          localVideoRef.current.pause();
        }
      }
    });

    socket.on("call-error", (data) => {
      alert(data.message);
      setCallInitiated(false);
      setCallActive(false);
      console.log("Call error:", data.message);
    });

    socket.on("connect_error", (err) => console.error("Socket connection error:", err));

    fetchFriendRequests();
    fetchFriends();

    return () => {
      socket.off("your-id");
      socket.off("users-online");
      socket.off("friend-request");
      socket.off("friend-request-accepted");
      socket.off("incoming-call");
      socket.off("call-accepted");
      socket.off("call-rejected");
      socket.off("receive-message");
      socket.off("watch-together");
      socket.off("call-error");
      socket.off("connect_error");

      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stream, callActive, callInitiated, isLoggedIn, username]);

  const fetchFriendRequests = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/friends/requests", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      setFriendRequests(res.data);
    } catch (err) {
      console.error("Error fetching friend requests:", err);
    }
  };

  const fetchFriends = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/friends/friends", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      setFriends(res.data);
    } catch (err) {
      console.error("Error fetching friends:", err);
    }
  };

  const sendFriendRequest = async () => {
    if (!friendRequestInput.trim()) return;
    try {
      const res = await axios.post(
        "http://localhost:5000/api/friends/send",
        { recipientUsername: friendRequestInput },
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      socket.emit("send-friend-request", {
        recipientUsername: friendRequestInput,
        requestId: res.data.friendRequest._id,
      });
      alert("Friend request sent");
      setFriendRequestInput("");
    } catch (err) {
      alert(err.response?.data?.message || "Error sending friend request");
    }
  };

  const acceptFriendRequest = async (requestId, requesterUsername) => {
    try {
      await axios.post(
        "http://localhost:5000/api/friends/accept",
        { requestId },
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      socket.emit("accept-friend-request", { requesterUsername });
      setFriendRequests((prev) => prev.filter((req) => req._id !== req._id));
      fetchFriends();
      alert("Friend request accepted");
    } catch (err) {
      alert(err.response?.data?.message || "Error accepting friend request");
    }
  };

  const initializePeer = (friendId, isInitiator) => {
    try {
      console.log("Initializing Peer, initiator:", isInitiator, "stream tracks:", stream ? stream.getTracks() : "No stream");
      if (!stream || stream.getTracks().length === 0) {
        throw new Error("Invalid stream: No media tracks available");
      }

      const peer = new Peer({
        initiator: isInitiator,
        trickle: true,
        stream,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            {
              urls: 'turn:turn.anyrtc.io:19403',
              username: 'webrtc',
              credential: 'webrtc',
            },
          ],
        },
      });

      peer.on("signal", (signalData) => {
        console.log("Peer signal event:", signalData);
        if (isInitiator) {
          console.log("Emitting call-user to:", friendId);
          socket.emit("call-user", {
            userToCall: friendId,
            signalData,
            from: myId,
            name: username,
          });
        } else {
          console.log("Emitting accept-call to:", incomingCall.from);
          socket.emit("accept-call", { signalData, to: incomingCall.from });
        }
      });

      peer.on("stream", (currentStream) => {
        console.log("Received remote stream, tracks:", currentStream.getTracks());
        if (partnerVideoRef.current) {
          partnerVideoRef.current.srcObject = currentStream;
        }
      });

      peer.on("connect", () => {
        console.log("Peer connection established");
      });

      peer.on("iceStateChange", (state) => {
        console.log("ICE connection state:", state);
      });

      peer.on("close", () => {
        console.log("Peer connection closed");
        endCall();
      });

      peer.on("error", (err) => {
        console.error("Peer error:", err);
        alert("Failed to establish video call: " + err.message);
        endCall();
      });

      return peer;
    } catch (err) {
      console.error("Error initializing Peer:", err);
      throw err;
    }
  };

  const startCall = (friendId) => {
    console.log("startCall called with friendId:", friendId, "myId:", myId, "stream:", !!stream);
    if (callActive || callInitiated) {
      alert("A call is already active or in progress");
      return;
    }
    if (!stream || stream.getTracks().length === 0) {
      alert("Camera/microphone not available. Please check permissions.");
      return;
    }
    if (!myId) {
      alert("Socket ID not initialized. Please reconnect.");
      return;
    }

    try {
      peerRef.current = initializePeer(friendId, true);

      // Timeout to detect signal failure
      setTimeout(() => {
        if (peerRef.current && !peerRef.current.destroyed && callInitiated && !callActive) {
          console.error("No signal data received within 5 seconds");
          alert("Failed to initiate call: No signaling data received");
          endCall();
        } else if (!peerRef.current) {
          console.error("Peer initialization failed, peerRef is null");
          alert("Failed to initiate call: Peer initialization failed");
          endCall();
        }
      }, 5000);

      setCallInitiated(true);
      console.log("callInitiated set to true, calling UI should appear");
    } catch (err) {
      console.error("Error in startCall:", err);
      alert("Failed to start video call: " + err.message);
      peerRef.current = null;
      setCallInitiated(false);
    }
  };

  const acceptCall = () => {
    if (!incomingCall) {
      alert("No incoming call to accept");
      return;
    }
    if (callActive || callInitiated) {
      alert("A call is already active or in progress");
      return;
    }
    if (!stream || stream.getTracks().length === 0) {
      alert("Camera/microphone not available. Please check permissions.");
      return;
    }

    try {
      peerRef.current = initializePeer(null, false);
      peerRef.current.signal(incomingCall.signalData);
      setIncomingCall(null);
      setCallActive(true);
      console.log("callActive set to true, video container should appear");
    } catch (err) {
      console.error("Error in acceptCall:", err);
      alert("Failed to accept video call: " + err.message);
      peerRef.current = null;
      setIncomingCall(null);
      setCallActive(false);
    }
  };

  const rejectCall = () => {
    if (incomingCall) {
      console.log("Rejecting call from:", incomingCall.from);
      socket.emit("reject-call", { to: incomingCall.from });
      setIncomingCall(null);
    }
  };

  const cancelCall = () => {
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    setCallInitiated(false);
    console.log("Call cancelled, callInitiated set to false");
  };

  const endCall = () => {
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    setCallActive(false);
    setCallInitiated(false);
    if (partnerVideoRef.current) {
      partnerVideoRef.current.srcObject = null;
    }
    setIncomingCall(null);
    setWatchTogether(null);
    setLocalVideoFile(null);
    setYoutubeUrl("");
    console.log("Call ended, call states reset");
  };

  const sendMessage = (recipientSocketId, recipientUsername) => {
    if (newMessage.trim() === "" || !recipientSocketId) return;

    const recipientMongoId = friends.find(
      (f) =>
        f.requester.username === recipientUsername ||
        f.recipient.username === recipientUsername
    )?.recipient._id ||
    friends.find(
      (f) =>
        f.requester.username === recipientUsername ||
        f.recipient.username === recipientUsername
    )?.requester._id;

    socket.emit("send-message", {
      to: recipientSocketId,
      recipientId: recipientMongoId,
      text: newMessage,
    });

    setMessages((prev) => ({
      ...prev,
      [recipientUsername]: [...(prev[recipientUsername] || []), { from: "Me", text: newMessage, createdAt: new Date() }],
    }));
    setNewMessage("");
  };

  const startWatchTogether = (friendId) => {
    if (watchMode === "youtube" && !youtubeUrl.trim()) {
      alert("Please enter a valid YouTube URL");
      return;
    }
    if (watchMode === "local" && !localVideoFile) {
      alert("Please select a video file");
      return;
    }

    const videoData = watchMode === "youtube"
      ? { mode: "youtube", videoUrl: youtubeUrl, timestamp: 0, isPlaying: true }
      : { mode: "local", videoUrl: URL.createObjectURL(localVideoFile), timestamp: 0, isPlaying: true };

    setWatchTogether(videoData);
    socket.emit("watch-together", {
      to: friendId,
      ...videoData,
    });

    if (watchMode === "local" && localVideoRef.current) {
      localVideoRef.current.src = videoData.videoUrl;
      localVideoRef.current.play();
    }
  };

  const handleLocalVideoChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith("video/")) {
      setLocalVideoFile(file);
    } else {
      alert("Please select a valid video file");
    }
  };

  const onYouTubePlayerReady = (event) => {
    youtubePlayerRef.current = event.target;
  };

  const onYouTubePlayerStateChange = (event) => {
    if (!watchTogether || watchMode !== "youtube") return;
    const friendId = usersOnline.find((u) => u.username === selectedFriend)?.id;
    if (event.data === YouTube.PlayerState.PLAYING) {
      socket.emit("watch-together", {
        to: friendId,
        mode: "youtube",
        videoUrl: watchTogether.videoUrl,
        timestamp: youtubePlayerRef.current.getCurrentTime(),
        isPlaying: true,
      });
    } else if (event.data === YouTube.PlayerState.PAUSED) {
      socket.emit("watch-together", {
        to: friendId,
        mode: "youtube",
        videoUrl: watchTogether.videoUrl,
        timestamp: youtubePlayerRef.current.getCurrentTime(),
        isPlaying: false,
      });
    }
  };

  const onLocalVideoTimeUpdate = () => {
    if (!watchTogether || watchMode !== "local" || !localVideoRef.current) return;
    const friendId = usersOnline.find((u) => u.username === selectedFriend)?.id;
    socket.emit("watch-together", {
      to: friendId,
      mode: "local",
      videoUrl: watchTogether.videoUrl,
      timestamp: localVideoRef.current.currentTime,
      isPlaying: !localVideoRef.current.paused,
    });
  };

  if (!isLoggedIn) {
    return (
      <div className="auth-container">
        {showRegister ? (
          <>
            <Register onRegisterSuccess={() => setShowRegister(false)} />
            <p className="toggle-link">
              Already have an account?{" "}
              <button onClick={() => setShowRegister(false)}>Login</button>
            </p>
          </>
        ) : (
          <>
            <Login
              onLoginSuccess={(name) => {
                setUsername(name);
                setIsLoggedIn(true);
              }}
            />
            <p className="toggle-link">
              Don't have an account?{" "}
              <button onClick={() => setShowRegister(true)}>Register</button>
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="app-container">
      <h1>Welcome, {username}</h1>
      <button onClick={logout}>Logout</button>

      <div className="friend-management">
        <h3>Friend Requests ({friendRequests.length})</h3>
        <ul>
          {friendRequests.map((req) => (
            <li key={req._id}>
              {req.requester.username} wants to be friends
              <button onClick={() => acceptFriendRequest(req._id, req.requester.username)}>
                Accept
              </button>
            </li>
          ))}
        </ul>
        <h3>Add Friend</h3>
        <div className="friend-request-input">
          <input
            type="text"
            placeholder="Enter username"
            value={friendRequestInput}
            onChange={(e) => setFriendRequestInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === "Enter" && friendRequestInput) {
                sendFriendRequest();
              }
            }}
          />
          <button onClick={sendFriendRequest} disabled={!friendRequestInput.trim()}>
            Send Request
          </button>
        </div>
      </div>

      <div className="friends-list">
        <h3>Friends ({friends.length})</h3>
        <ul>
          {friends.map((friend) => {
            const friendUsername =
              friend.requester.username === username
                ? friend.recipient.username
                : friend.requester.username;
            return (
              <li
                key={friend._id}
                onClick={() => setSelectedFriend(friendUsername)}
                className={selectedFriend === friendUsername ? "selected" : ""}
              >
                {friendUsername}
              </li>
            );
          })}
        </ul>
      </div>

      {selectedFriend && (
        <div className="chat-container">
          <h3>Chat with {selectedFriend}</h3>
          <div className="chat-messages">
            {(messages[selectedFriend] || []).map((msg, index) => (
              <div key={index} className="chat-message">
                <strong>{msg.from === "Me" ? "You" : msg.from}: </strong>
                {msg.text}
              </div>
            ))}
          </div>
          <div className="chat-input">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message..."
            />
            <button
              onClick={() =>
                sendMessage(
                  usersOnline.find((u) => u.username === selectedFriend)?.id,
                  selectedFriend
                )
              }
              disabled={!newMessage.trim() || !usersOnline.find((u) => u.username === selectedFriend)}
            >
              Send
            </button>
          </div>
          <div className="chat-controls">
            <button
              onClick={() => {
                console.log("Video Call clicked, selectedFriend:", selectedFriend, "usersOnline:", usersOnline);
                const selectedFriendId = usersOnline.find((u) => u.username === selectedFriend)?.id;
                if (!selectedFriendId) {
                  alert("Friend is not online");
                  return;
                }
                startCall(selectedFriendId);
              }}
              disabled={callActive || callInitiated || !usersOnline.find((u) => u.username === selectedFriend)}
            >
              Video Call
            </button>
            {callActive && (
              <div className="watch-together-controls">
                <h4>Watch Together</h4>
                <div className="watch-mode-selector">
                  <label>
                    <input
                      type="radio"
                      value="youtube"
                      checked={watchMode === "youtube"}
                      onChange={() => setWatchMode("youtube")}
                    />
                    YouTube
                  </label>
                  <label>
                    <input
                      type="radio"
                      value="local"
                      checked={watchMode === "local"}
                      onChange={() => setWatchMode("local")}
                    />
                    Local Video
                  </label>
                </div>
                {watchMode === "youtube" ? (
                  <div className="youtube-input">
                    <input
                      type="text"
                      placeholder="Enter YouTube URL"
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                    />
                    <button
                      onClick={() => {
                        const selectedFriendId = usersOnline.find((u) => u.username === selectedFriend)?.id;
                        if (!selectedFriendId) {
                          alert("Friend is not online");
                          return;
                        }
                        startWatchTogether(selectedFriendId);
                      }}
                      disabled={!youtubeUrl.trim()}
                    >
                      Start YouTube
                    </button>
                  </div>
                ) : (
                  <div className="local-video-input">
                    <input
                      type="file"
                      accept="video/*"
                      onChange={handleLocalVideoChange}
                    />
                    <button
                      onClick={() => {
                        const selectedFriendId = usersOnline.find((u) => u.username === selectedFriend)?.id;
                        if (!selectedFriendId) {
                          alert("Friend is not online");
                          return;
                        }
                        startWatchTogether(selectedFriendId);
                      }}
                      disabled={!localVideoFile}
                    >
                      Start Local Video
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {callInitiated && !callActive && (
        <div className="calling-container">
          <p>Calling {selectedFriend}...</p>
          <button onClick={cancelCall}>Cancel Call</button>
        </div>
      )}

      {callActive && (
        <div className="video-container">
          <div className="video-box">
            <video ref={userVideoRef} autoPlay muted playsInline />
          </div>
          <div className="video-box">
            <video ref={partnerVideoRef} autoPlay playsInline />
          </div>
          {watchTogether && (
            <div className="watch-together">
              {watchMode === "youtube" ? (
                <YouTube
                  videoId={watchTogether.videoUrl.split("v=")[1]?.split("&")[0]}
                  opts={{
                    height: "200",
                    width: "300",
                    playerVars: { autoplay: 1 },
                  }}
                  onReady={onYouTubePlayerReady}
                  onStateChange={onYouTubePlayerStateChange}
                />
              ) : (
                <video
                  ref={localVideoRef}
                  src={watchTogether.videoUrl}
                  controls
                  onTimeUpdate={onLocalVideoTimeUpdate}
                  style={{ width: "300px", height: "200px" }}
                />
              )}
            </div>
          )}
          <button onClick={endCall} className="end-call">
            End Call
          </button>
        </div>
      )}

      {incomingCall && !callActive && !callInitiated && (
        <div className="incoming-call">
          <p>
            Incoming call from {incomingCall.name} ({incomingCall.from})
          </p>
          <button onClick={acceptCall}>Accept</button>
          <button onClick={rejectCall}>Reject</button>
        </div>
      )}
    </div>
  );
}

export default App;