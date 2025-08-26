import React, { memo } from "react";
import { useStreamingText } from "../../hooks/useStreamingText";

interface StreamingTextProps {
  text: string;
  isStreaming: boolean;
  enableTypewriter?: boolean;
  speed?: number;
}

const StreamingText: React.FC<StreamingTextProps> = memo(
  ({ text, isStreaming, enableTypewriter = true, speed = 15 }) => {
    const { displayText, isAnimating, skipToEnd } = useStreamingText({
      text,
      isStreaming,
      speed,
      enableTypewriter,
    });

    const handleClick = () => {
      if (isAnimating) {
        skipToEnd();
      }
    };

    return (
      <div className="streaming-text-container">
        <div
          className={`streaming-text ${isAnimating ? "streaming-text--animating" : ""}`}
          onClick={handleClick}
          title={isAnimating ? "Click to skip animation" : undefined}
        >
          <pre className="streaming-content">{displayText}</pre>
          {isStreaming && (
            <span className="cursor-blink" aria-label="streaming">
              ▊
            </span>
          )}
        </div>

        {isAnimating && (
          <div className="streaming-hint">
            <span className="text-xs text-secondary">Click to skip animation</span>
          </div>
        )}
      </div>
    );
  },
);

StreamingText.displayName = "StreamingText";

export default StreamingText;
