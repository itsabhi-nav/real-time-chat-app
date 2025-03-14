"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function UpdateProfile() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Retrieve stored user data from localStorage
    const storedUsername = localStorage.getItem("username");
    const storedDisplayName =
      localStorage.getItem("displayName") || storedUsername;
    if (!storedUsername) {
      router.push("/login");
      return;
    }
    setUsername(storedUsername);
    setDisplayName(storedDisplayName);
  }, [router]);

  const handleAvatarChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setAvatar(e.target.files[0]);
      setAvatarPreview(URL.createObjectURL(e.target.files[0]));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const formData = new FormData();
    formData.append("username", username);
    formData.append("displayName", displayName);
    if (avatar) {
      formData.append("avatar", avatar);
    }

    try {
      const res = await fetch("/api/update-profile", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (res.ok) {
        // Update localStorage with the new profile data
        localStorage.setItem("avatar", data.avatar);
        localStorage.setItem("displayName", data.displayName);
        setMessage("Profile updated successfully!");
        // Redirect to home or another page if needed
        router.push("/");
      } else {
        setMessage(data.message || "Failed to update profile");
      }
    } catch (error) {
      console.error("Error updating profile", error);
      setMessage("An error occurred");
    }
  };

  return (
    <div style={styles.container}>
      <h1>Update Profile</h1>
      {message && <p>{message}</p>}
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.formGroup}>
          <label htmlFor="displayName">Display Name:</label>
          <input
            type="text"
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={styles.input}
          />
        </div>
        <div style={styles.formGroup}>
          <label htmlFor="avatar">Profile Picture:</label>
          <input
            type="file"
            id="avatar"
            accept="image/*"
            onChange={handleAvatarChange}
            style={styles.input}
          />
        </div>
        {avatarPreview && (
          <div style={styles.preview}>
            <img
              src={avatarPreview}
              alt="Avatar Preview"
              style={styles.avatar}
            />
          </div>
        )}
        <button type="submit" style={styles.submitButton}>
          Update Profile
        </button>
      </form>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: "400px",
    margin: "2rem auto",
    padding: "2rem",
    background: "#fff",
    borderRadius: "8px",
    boxShadow: "0 0 10px rgba(0,0,0,0.1)",
    textAlign: "center",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
  },
  input: {
    width: "100%",
    padding: "0.5rem",
    border: "1px solid #ccc",
    borderRadius: "4px",
  },
  preview: {
    marginBottom: "1rem",
  },
  avatar: {
    width: "100px",
    height: "100px",
    borderRadius: "50%",
    objectFit: "cover",
  },
  submitButton: {
    padding: "0.75rem",
    border: "none",
    borderRadius: "4px",
    background: "#4CAF50",
    color: "#fff",
    cursor: "pointer",
  },
};
