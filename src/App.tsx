import { TitleBar } from "./components/layout/TitleBar";
import { ChatWindow } from "./components/chat/ChatWindow";
import { Sidebar } from "./components/sidebar/Sidebar";
import { useState } from "react";

export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeSession, setActiveSession] = useState("default");

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-[#0a0a0a] text-gray-900 dark:text-neutral-100 overflow-hidden select-none transition-colors duration-200">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          activeSession={activeSession}
          onSessionChange={setActiveSession}
        />
        <main className="flex-1 overflow-hidden">
          <ChatWindow
            sessionId={activeSession}
            onSessionChange={setActiveSession}
          />
        </main>
      </div>
    </div>
  );
}
