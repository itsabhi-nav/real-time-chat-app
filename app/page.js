"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import io from "socket.io-client";
import dynamic from "next/dynamic";

// Dynamically import EmojiPicker (client-only)
const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

export default function ChatPage() {
  const router = useRouter();
  const [user, setUser] = useState({
    username: "",
    avatar: "",
    displayName: "",
  });
  const [allUsers, setAllUsers] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [privateMessages, setPrivateMessages] = useState({});
  const [activeChatUser, setActiveChatUser] = useState(null);
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const socketRef = useRef(null);

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

    // 3) Connect via Socket.IO
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

    // 5) Listen for private messages
    socketRef.current.on("privateMessage", (data) => {
      const { from, message, attachment } = data;
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

    return () => {
      socketRef.current.disconnect();
      socketRef.current = null;
    };
  }, [router]);

  // Load chat history for two users
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

  // Handle selecting a user from sidebar
  const handleSelectUser = async (username) => {
    setActiveChatUser(username);
    await loadChatHistory(username);
  };

  // Handle sending a message (with optional attachment)
  const sendPrivateMessage = async (e) => {
    e.preventDefault();
    if (!message.trim() || !activeChatUser) return;

    let attachmentUrl = "";
    if (attachment) {
      // Upload attachment to /api/upload-attachment
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

    // Update local UI immediately
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

    // Emit message via Socket.IO
    socketRef.current.emit("privateMessage", {
      from: user.username,
      to: activeChatUser,
      message,
      attachment: attachmentUrl,
    });
    setMessage("");
  };

  // Emoji picker callback
  const onEmojiClick = (emojiData) => {
    setMessage((prev) => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  // Logout
  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("avatar");
    localStorage.removeItem("displayName");
    router.push("/login");
  };

  // Exclude current user from sidebar list
  const displayedUsers = allUsers
    .filter((u) => u.username !== user.username)
    .map((u) => ({ ...u, online: onlineUsers.includes(u.username) }));

  const activeMessages = privateMessages[activeChatUser] || [];

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Futuristic Chat</h1>
        <button style={styles.logoutButton} onClick={handleLogout}>
          Logout
        </button>
      </header>

      <div style={styles.mainArea}>
        {/* Sidebar */}
        <div style={styles.sidebar}>
          <h2>All Users</h2>
          {displayedUsers.length === 0 ? (
            <div>No registered users</div>
          ) : (
            displayedUsers.map((u) => (
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
                {u.username} {u.displayName && `(${u.displayName})`}
              </div>
            ))
          )}
          {/* Current user's profile at bottom with update option */}
          <div style={styles.myProfile}>
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
              <div>{user.username}</div>
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

        {/* Chat Area */}
        <div style={styles.chatArea}>
          {!activeChatUser ? (
            <div style={styles.placeholder}>
              <h2>Select a user from the sidebar to start a chat</h2>
            </div>
          ) : (
            <>
              <h2>Chat with {activeChatUser}</h2>
              <div style={styles.privateChatBox}>
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
                    <div style={styles.messageBubble}>
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
              <form onSubmit={sendPrivateMessage} style={styles.form}>
                <button
                  type="button"
                  style={styles.emojiButton}
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                >
                  😊
                </button>
                <input
                  style={styles.input}
                  type="text"
                  placeholder={`Message ${activeChatUser}...`}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setAttachment(e.target.files[0])}
                  style={{ marginRight: "0.5rem" }}
                />
                <button style={styles.sendButton} type="submit">
                  Send
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Emoji Picker */}
      {showEmojiPicker && (
        <div style={styles.emojiPicker}>
          <EmojiPicker onEmojiClick={onEmojiClick} />
        </div>
      )}
    </div>
  );
}

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
