import React from "react";

const SettingsTab: React.FC = () => {
  return (
    <div className="settings-tab" id="tab-panel-settings" role="tabpanel">
      <div className="container">
        <div className="placeholder-content">
          <h2>Settings</h2>
          <p className="text-secondary">
            Configure your preferences, API keys, and default summary settings.
          </p>
          <p className="text-secondary">
            <em>Settings panel coming soon...</em>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SettingsTab;
