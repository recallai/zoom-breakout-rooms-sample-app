import type { Metadata } from "next";
import { Toaster } from "@/components/ui/Sonner";
import "./globals.css";

export const metadata: Metadata = {
    title: "Zoom Breakout Rooms Demo",
    description: "Keep a Recall.ai bot in the main room and send bots to specific Zoom breakout rooms.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return <html lang="en"><body className="min-h-screen font-sans antialiased">{children}<Toaster position="top-right" /></body></html>;
}
