// app/layout.js

export const metadata = {
  title: "Futuristic Chat",
  description: "A modern dark-themed chat application",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
