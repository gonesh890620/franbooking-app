import "./styles.css";

export const metadata = {
  title: "Franbooking",
  description: "Franbooking recruiter migration app"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
