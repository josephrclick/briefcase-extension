import { useState, useEffect, useCallback, useRef } from "react";

interface UseStreamingTextOptions {
  text: string;
  isStreaming: boolean;
  speed?: number; // milliseconds per character
  enableTypewriter?: boolean;
}

export function useStreamingText({
  text,
  isStreaming,
  speed = 10,
  enableTypewriter = true,
}: UseStreamingTextOptions) {
  const [displayText, setDisplayText] = useState("");
  const [cursor, setCursor] = useState(0);
  const animationRef = useRef<number>();
  const lastTextRef = useRef("");

  // Reset animation when text changes significantly
  useEffect(() => {
    const currentText = text || "";
    const lastText = lastTextRef.current;

    // If text is completely different (not an append), reset
    if (
      currentText.length < lastText.length ||
      (!currentText.startsWith(lastText) && Math.abs(currentText.length - lastText.length) > 10)
    ) {
      setDisplayText("");
      setCursor(0);
    }

    lastTextRef.current = currentText;
  }, [text]);

  // Typewriter effect
  const typewriterEffect = useCallback(() => {
    if (!enableTypewriter || !text) {
      setDisplayText(text || "");
      return;
    }

    if (cursor < text.length) {
      const nextCursor = cursor + 1;
      setDisplayText(text.slice(0, nextCursor));
      setCursor(nextCursor);

      animationRef.current = window.requestAnimationFrame(() => {
        setTimeout(typewriterEffect, speed);
      });
    }
  }, [text, cursor, speed, enableTypewriter]);

  // Start/stop typewriter effect
  useEffect(() => {
    if (enableTypewriter && text && cursor < text.length) {
      typewriterEffect();
    }

    return () => {
      if (animationRef.current) {
        window.cancelAnimationFrame(animationRef.current);
      }
    };
  }, [typewriterEffect, text, cursor, enableTypewriter]);

  // Fast forward to current text when streaming completes
  useEffect(() => {
    if (!isStreaming && text && displayText !== text && enableTypewriter) {
      // If streaming is done but displayText is behind, fast forward
      const timer = setTimeout(() => {
        setDisplayText(text);
        setCursor(text.length);
      }, 500); // Small delay to show completion

      return () => clearTimeout(timer);
    }
  }, [isStreaming, text, displayText, enableTypewriter]);

  // Instant mode when typewriter is disabled
  useEffect(() => {
    if (!enableTypewriter) {
      setDisplayText(text || "");
    }
  }, [text, enableTypewriter]);

  const skipToEnd = useCallback(() => {
    if (text) {
      setDisplayText(text);
      setCursor(text.length);
      if (animationRef.current) {
        window.cancelAnimationFrame(animationRef.current);
      }
    }
  }, [text]);

  return {
    displayText: enableTypewriter ? displayText : text || "",
    isAnimating: enableTypewriter && cursor < (text?.length || 0),
    progress: text ? Math.min(cursor / text.length, 1) : 0,
    skipToEnd,
  };
}
