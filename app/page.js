"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import io from "socket.io-client";
import dynamic from "next/dynamic";

// Dynamically import EmojiPicker (client-only)
const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

export default function ChatPage() {
  const router = useRouter();

  // Current logged-in user info
  const [user, setUser] = useState({
    username: "",
    avatar: "",
    displayName: "",
  });

  // All registered users from the server
  const [allUsers, setAllUsers] = useState([]);

  // List of usernames who are online
  const [onlineUsers, setOnlineUsers] = useState([]);

  // All private messages keyed by username
  // privateMessages["alice"] = [ { from, message, attachment, timestamp }, ... ]
  const [privateMessages, setPrivateMessages] = useState({});

  // The currently selected user in the chat
  const [activeChatUser, setActiveChatUser] = useState(null);

  // Track unread messages
  const [unreadCounts, setUnreadCounts] = useState({});

  // For sending new messages
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState(null);

  // Show/hide the emoji picker
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Keep a reference to the socket
  const socketRef = useRef(null);

  // ---------------------------
  //  HOOK: on component mount
  // ---------------------------
  useEffect(() => {
    // 1) Authentication check
    const token = localStorage.getItem("token");
    const storedUsername = localStorage.getItem("username");
    const storedAvatar =
      localStorage.getItem("avatar") || "/default-avatar.png";
    const storedDisplayName =
      localStorage.getItem("displayName") || storedUsername;

    if (!token || !storedUsername) {
      router.push("/login");
      return;
    }
    setUser({
      username: storedUsername,
      avatar: storedAvatar,
      displayName: storedDisplayName,
    });

    // 2) Fetch all registered users
    fetch("/api/users")
      .then((res) => res.json())
      .then((data) => setAllUsers(data))
      .catch((err) => console.error("Error fetching users:", err));

    // 3) Connect to Socket.IO
    if (!socketRef.current) {
      socketRef.current = io();
      socketRef.current.emit("join", {
        username: storedUsername,
        avatar: storedAvatar,
      });
    }

    // 4) Listen for online users
    socketRef.current.on("onlineUsers", (users) => {
      setOnlineUsers(users);
    });

    // 5) Listen for incoming private messages
    socketRef.current.on("privateMessage", (data) => {
      const { from, message, attachment } = data;

      // If the message is from someone else and
      // we are NOT actively viewing that user's chat,
      // increment unread count
      if (from !== user.username && from !== activeChatUser) {
        setUnreadCounts((prev) => ({
          ...prev,
          [from]: (prev[from] || 0) + 1,
        }));
      }

      // Update the privateMessages state
      setPrivateMessages((prev) => {
        const msgs = prev[from] || [];
        return {
          ...prev,
          [from]: [
            ...msgs,
            { from, message, attachment, timestamp: Date.now() },
          ],
        };
      });
    });

    // 6) Listen for profile updates from any user
    socketRef.current.on("profileUpdated", () => {
      // Re-fetch the user list so changes are visible (avatar or displayName)
      fetch("/api/users")
        .then((res) => res.json())
        .then((data) => setAllUsers(data))
        .catch((err) => console.error("Error fetching users:", err));
    });

    // Cleanup on unmount
    return () => {
      socketRef.current.disconnect();
      socketRef.current = null;
    };
  }, [router, activeChatUser]);

  // ----------------------------------
  //  HELPER: Return displayName or username
  // ----------------------------------
  function getDisplayName(u) {
    return u.displayName || u.username;
  }

  // ----------------------------------
  //  LOAD chat history for user
  // ----------------------------------
  async function loadChatHistory(otherUser) {
    if (!otherUser) return;
    try {
      const res = await fetch(
        `/api/messages?user1=${user.username}&user2=${otherUser}`
      );
      const data = await res.json();
      setPrivateMessages((prev) => ({
        ...prev,
        [otherUser]: data,
      }));
    } catch (error) {
      console.error("Error fetching chat history:", error);
    }
  }

  // ----------------------------------
  //  SELECT user from sidebar
  // ----------------------------------
  const handleSelectUser = async (username) => {
    // Reset unread count for this user
    setUnreadCounts((prev) => ({
      ...prev,
      [username]: 0,
    }));
    setActiveChatUser(username);
    await loadChatHistory(username);
  };

  // ----------------------------------
  //  SEND a private message
  // ----------------------------------
  const sendPrivateMessage = async (e) => {
    e.preventDefault();
    if (!message.trim() || !activeChatUser) return;

    let attachmentUrl = "";
    if (attachment) {
      // Upload the file to /api/upload-attachment
      const formData = new FormData();
      formData.append("attachment", attachment);
      const res = await fetch("/api/upload-attachment", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      attachmentUrl = data.fileUrl;
      setAttachment(null);
    }

    // Update local messages immediately
    setPrivateMessages((prev) => {
      const msgs = prev[activeChatUser] || [];
      return {
        ...prev,
        [activeChatUser]: [
          ...msgs,
          {
            from: user.username,
            message,
            attachment: attachmentUrl,
            timestamp: Date.now(),
          },
        ],
      };
    });

    // Emit message to server
    socketRef.current.emit("privateMessage", {
      from: user.username,
      to: activeChatUser,
      message,
      attachment: attachmentUrl,
    });

    // Clear input
    setMessage("");
  };

  // ----------------------------------
  //  EMOJI PICKER callback
  // ----------------------------------
  const onEmojiClick = (emojiData) => {
    setMessage((prev) => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  // ----------------------------------
  //  LOGOUT
  // ----------------------------------
  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("avatar");
    localStorage.removeItem("displayName");
    router.push("/login");
  };

  // ----------------------------------
  //  Which user are we chatting with?
  // ----------------------------------
  const activeUserObj = allUsers.find((u) => u.username === activeChatUser);
  const chatHeader = activeUserObj
    ? getDisplayName(activeUserObj)
    : activeChatUser;

  // ----------------------------------
  //  Build the list of displayable users
  // ----------------------------------
  const displayedUsers = allUsers
    .filter((u) => u.username !== user.username)
    .map((u) => ({
      ...u,
      online: onlineUsers.includes(u.username),
    }));

  // ----------------------------------
  //  MESSAGES for the active user
  // ----------------------------------
  const activeMessages = privateMessages[activeChatUser] || [];

  // ----------------------------------
  //  RENDER
  // ----------------------------------
  return (
    <div style={styles.container} className="chatContainer">
      {/* HEADER */}
      <header style={styles.header} className="chatHeader">
        <h1 style={styles.title}>Futuristic Chat</h1>
        <button style={styles.logoutButton} onClick={handleLogout}>
          Logout
        </button>
      </header>

      {/* MAIN AREA: SIDEBAR + CHAT */}
      <div style={styles.mainArea} className="chatMainArea">
        {/* SIDEBAR */}
        <div style={styles.sidebar} className="chatSidebar">
          <h2>All Users</h2>
          {displayedUsers.length === 0 ? (
            <div>No registered users</div>
          ) : (
            displayedUsers.map((u) => {
              const unread = unreadCounts[u.username] || 0;
              return (
                <div
                  key={u.username}
                  style={{
                    ...styles.userItem,
                    backgroundColor:
                      u.username === activeChatUser ? "#e0e0e0" : "transparent",
                    borderLeft: u.online
                      ? "4px solid #4CAF50"
                      : "4px solid transparent",
                  }}
                  className="chatUserItem"
                  onClick={() => handleSelectUser(u.username)}
                >
                  <img
                    src={u.avatar || "/default-avatar.png"}
                    alt="avatar"
                    style={{
                      width: "30px",
                      height: "30px",
                      borderRadius: "50%",
                      marginRight: "8px",
                    }}
                  />
                  {getDisplayName(u)}
                  {unread > 0 && (
                    <span style={styles.unreadBadge}>{unread}</span>
                  )}
                </div>
              );
            })
          )}

          {/* CURRENT USER'S PROFILE at bottom */}
          <div style={styles.myProfile} className="chatMyProfile">
            <img
              src={user.avatar || "/default-avatar.png"}
              alt="My avatar"
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                marginRight: "8px",
              }}
            />
            <div>
              <div>{getDisplayName(user)}</div>
              <div>
                <a
                  href="/update-profile"
                  style={{ fontSize: "0.8rem", color: "#4CAF50" }}
                >
                  Update Profile
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* CHAT AREA */}
        <div style={styles.chatArea} className="chatChatArea">
          {!activeChatUser ? (
            <div style={styles.placeholder} className="chatPlaceholder">
              <h2>Select a user from the sidebar to start a chat</h2>
            </div>
          ) : (
            <>
              <h2>Chat with {chatHeader}</h2>
              <div style={styles.privateChatBox} className="chatPrivateChatBox">
                {activeMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      marginBottom: "0.5rem",
                      alignItems:
                        msg.from === user.username ? "flex-end" : "flex-start",
                    }}
                  >
                    <div
                      style={styles.messageBubble}
                      className="chatMessageBubble"
                    >
                      <strong>{msg.from}</strong>: {msg.message}
                    </div>
                    {msg.attachment && (
                      <img
                        src={msg.attachment}
                        alt="attachment"
                        style={{
                          maxWidth: "200px",
                          marginTop: "4px",
                          borderRadius: "4px",
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* FORM to send a new message */}
              <form
                onSubmit={sendPrivateMessage}
                style={styles.form}
                className="chatForm"
              >
                <button
                  type="button"
                  style={styles.emojiButton}
                  className="chatEmojiButton"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                >
                  😊
                </button>
                <input
                  style={styles.input}
                  className="chatInput"
                  type="text"
                  placeholder={`Message ${chatHeader}...`}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setAttachment(e.target.files[0])}
                  style={{ marginRight: "0.5rem" }}
                />
                <button
                  style={styles.sendButton}
                  className="chatSendButton"
                  type="submit"
                >
                  Send
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* EMOJI PICKER */}
      {showEmojiPicker && (
        <div style={styles.emojiPicker} className="chatEmojiPicker">
          <EmojiPicker onEmojiClick={onEmojiClick} />
        </div>
      )}

      {/* MEDIA QUERIES for RESPONSIVENESS */}
      <style jsx global>{`
        @media (max-width: 768px) {
          .chatMainArea {
            flex-direction: column !important;
          }
          .chatSidebar {
            width: 100% !important;
            border-right: none !important;
            border-bottom: 2px solid #4caf50 !important;
          }
          .chatChatArea {
            width: 100% !important;
            order: 2;
          }
        }
      `}</style>
    </div>
  );
}

// ----------------------------------
//  INLINE STYLES (DESKTOP DEFAULT)
// ----------------------------------
const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
    background: "#f0f0f0",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "1rem",
    background: "#ffffff",
    borderBottom: "2px solid #4CAF50",
  },
  title: {
    margin: 0,
    fontSize: "2rem",
    color: "#333",
  },
  logoutButton: {
    background: "#4CAF50",
    color: "#ffffff",
    border: "none",
    padding: "0.5rem 1rem",
    borderRadius: "5px",
    cursor: "pointer",
  },
  mainArea: {
    display: "flex",
    flex: 1,
    flexWrap: "wrap",
  },
  sidebar: {
    width: "250px",
    background: "#ffffff",
    padding: "1rem",
    borderRight: "2px solid #4CAF50",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  userItem: {
    display: "flex",
    alignItems: "center",
    padding: "0.5rem",
    marginBottom: "0.5rem",
    cursor: "pointer",
    borderRadius: "4px",
    color: "#333",
  },
  unreadBadge: {
    backgroundColor: "red",
    color: "#fff",
    borderRadius: "50%",
    padding: "2px 6px",
    marginLeft: "8px",
    fontSize: "0.8rem",
  },
  myProfile: {
    marginTop: "auto",
    paddingTop: "1rem",
    borderTop: "1px solid #ddd",
  },
  chatArea: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    padding: "1rem",
    width: "100%",
  },
  placeholder: {
    flex: 1,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    color: "#555",
  },
  privateChatBox: {
    flex: 1,
    padding: "1rem",
    overflowY: "auto",
    background: "#ffffff",
    marginBottom: "1rem",
    border: "1px solid #ddd",
    borderRadius: "4px",
  },
  messageBubble: {
    background: "#e0e0e0",
    padding: "0.5rem 1rem",
    borderRadius: "5px",
    color: "#333",
  },
  form: {
    display: "flex",
    padding: "1rem",
    background: "#ffffff",
    borderTop: "1px solid #ddd",
    alignItems: "center",
  },
  emojiButton: {
    background: "#4CAF50",
    border: "none",
    color: "#ffffff",
    padding: "0.5rem",
    borderRadius: "5px",
    cursor: "pointer",
    marginRight: "0.5rem",
  },
  input: {
    flex: 1,
    padding: "0.5rem",
    border: "1px solid #ccc",
    borderRadius: "5px",
    marginRight: "0.5rem",
  },
  sendButton: {
    background: "#4CAF50",
    border: "none",
    color: "#ffffff",
    padding: "0.5rem 1rem",
    borderRadius: "5px",
    cursor: "pointer",
  },
  emojiPicker: {
    position: "absolute",
    bottom: "60px",
    left: "20px",
  },
};
