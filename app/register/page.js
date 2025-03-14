"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleRegister = async (e) => {
    e.preventDefault();
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message);
      return;
    }
    if (avatarFile) {
      const formData = new FormData();
      formData.append("avatar", avatarFile);
      formData.append("username", username);
      await fetch("/api/upload-profile", {
        method: "POST",
        body: formData,
      });
    }
    router.push("/login");
  };

  return (
    <div style={styles.container}>
      <h1>Register</h1>
      <form onSubmit={handleRegister} style={styles.form}>
        <input
          style={styles.input}
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input
          style={styles.input}
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setAvatarFile(e.target.files[0])}
        />
        {error && <p style={{ color: "red" }}>{error}</p>}
        <button style={styles.button} type="submit">
          Register
        </button>
      </form>
      <p>
        Already have an account? <a href="/login">Login Here</a>
      </p>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#121212",
    color: "#fff",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    marginTop: "1rem",
  },
  input: {
    margin: "0.5rem 0",
    padding: "0.8rem",
    borderRadius: "5px",
    border: "none",
    background: "#2a2a2a",
    color: "#fff",
  },
  button: {
    margin: "0.5rem 0",
    padding: "0.8rem",
    borderRadius: "5px",
    border: "none",
    background: "#0ff",
    color: "#121212",
    fontWeight: "bold",
    cursor: "pointer",
  },
};
