import StyledComponentsRegistry from "@/components/StyledRegistry";

export const metadata = {
  title: "PDF → TTS Reader",
  description: "Extract chapters, read aloud, and highlight words in real time",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StyledComponentsRegistry>{children}</StyledComponentsRegistry>
      </body>
    </html>
  );
}