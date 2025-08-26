import React from "react";
import { useSummarizationStore } from "../../stores/summarization.store";
import { useExtensionPort } from "../../hooks/useExtensionPort";
import LengthSelector from "../controls/LengthSelector";
import StyleSelector from "../controls/StyleSelector";
import FocusInput from "../controls/FocusInput";
import StreamingText from "../display/StreamingText";
import LoadingIndicator from "../display/LoadingIndicator";

const SummarizeTab: React.FC = () => {
  const { status, summary, streamBuffer, error, params, updateParams, reset, cancelSummarization } =
    useSummarizationStore();

  const { startSummarization, isConnected } = useExtensionPort();

  const handleSummarize = () => {
    if (status === "streaming" || status === "extracting") {
      cancelSummarization();
    } else {
      startSummarization();
    }
  };

  const isActive = status === "streaming" || status === "extracting";
  const hasContent = summary || streamBuffer;
  const displayText = status === "complete" ? summary : streamBuffer;

  return (
    <div className="summarize-tab" id="tab-panel-summarize" role="tabpanel">
      <div className="container">
        {/* Control Panel */}
        <div className="control-panel">
          <div className="control-row">
            <LengthSelector
              value={params.length}
              onChange={(length) => updateParams({ length })}
              disabled={isActive}
            />
            <StyleSelector
              value={params.style}
              onChange={(style) => updateParams({ style })}
              disabled={isActive}
            />
          </div>

          <FocusInput
            value={params.focus || ""}
            onChange={(focus) => updateParams({ focus: focus || undefined })}
            disabled={isActive}
            placeholder="Optional: What should the summary focus on?"
          />

          <div className="action-row">
            <button
              className={`button-primary ${isActive ? "button-cancel" : ""}`}
              onClick={handleSummarize}
              disabled={!isConnected}
              title={!isConnected ? "Not connected to background script" : undefined}
            >
              {isActive ? "Cancel" : "Summarize Page"}
            </button>

            {hasContent && !isActive && (
              <button className="button-secondary" onClick={reset}>
                Clear
              </button>
            )}
          </div>

          {!isConnected && (
            <div className="warning">⚠️ Not connected to extension. Please refresh the page.</div>
          )}
        </div>

        {/* Status Display */}
        {(isActive || hasContent || error) && (
          <div className="summary-section">
            {error && (
              <div className="error-message">
                <strong>Error:</strong> {error.message}
              </div>
            )}

            {isActive && !error && <LoadingIndicator status={status} />}

            {hasContent && !error && (
              <div className="summary-content">
                <StreamingText text={displayText} isStreaming={status === "streaming"} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SummarizeTab;
