import React from "react";
import { useExtensionPort } from "../hooks/useExtensionPort";

const Header: React.FC = () => {
  const { isConnected } = useExtensionPort();

  return (
    <header className="header">
      <div className="header-content">
        <div className="header-title">
          <h1>Briefcase</h1>
          <div className="header-status">
            <span
              className={`connection-indicator ${isConnected ? "connected" : "disconnected"}`}
              title={isConnected ? "Connected" : "Disconnected"}
            />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
