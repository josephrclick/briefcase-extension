import React from "react";

interface LoadingIndicatorProps {
  status: "extracting" | "streaming" | "idle" | "complete" | "error";
  message?: string;
}

const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({ status, message }) => {
  const getStatusMessage = () => {
    if (message) return message;

    switch (status) {
      case "extracting":
        return "Extracting content from page...";
      case "streaming":
        return "Generating summary...";
      default:
        return "Loading...";
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case "extracting":
        return "📄";
      case "streaming":
        return "✨";
      default:
        return "⏳";
    }
  };

  return (
    <div className="loading-indicator">
      <div className="loading-content">
        <div className="loading-icon">
          <span className="status-icon">{getStatusIcon()}</span>
          <div className="loading-spinner-small" />
        </div>
        <p className="loading-message">{getStatusMessage()}</p>
      </div>
    </div>
  );
};

export default LoadingIndicator;
