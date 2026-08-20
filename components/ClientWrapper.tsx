"use client";

import NavBar from "./NavBar";
import HostedAccessBanner from "./HostedAccessBanner";

interface ClientWrapperProps {
  children: React.ReactNode;
}

export default function ClientWrapper({ children }: ClientWrapperProps) {
  return (
    <div className="app-shell">
      <HostedAccessBanner />
      <NavBar />
      {children}
    </div>
  );
}
