import { useEffect, useRef, useCallback } from "react";
import { useSummarizationStore } from "../stores/summarization.store";

interface ExtensionMessage {
  type: string;
  requestId?: string;
  chunk?: string;
  error?: { message: string };
  status?: string;
  [key: string]: unknown;
}

interface SummarizeRequest {
  type: "SUMMARIZE";
  params: {
    length: string;
    level: string;
    style: string;
    focus?: string;
  };
}

export function useExtensionPort() {
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const {
    setError,
    updateStreamBuffer,
    completeSummarization,
    setRequestId,
    currentRequestId,
    params,
  } = useSummarizationStore();

  // Handle messages from background script
  const handleMessage = useCallback(
    (message: ExtensionMessage) => {
      console.log("[ExtensionPort] Received message:", message);

      switch (message.type) {
        case "STREAM_CHUNK":
          if (message.requestId === currentRequestId && message.chunk) {
            updateStreamBuffer(message.chunk);
          }
          break;

        case "STREAM_COMPLETE":
          if (message.requestId === currentRequestId) {
            completeSummarization();
          }
          break;

        case "ERROR":
          if (message.requestId === currentRequestId) {
            setError(new Error(message.error?.message || "Unknown error occurred"));
          }
          break;

        default:
          console.warn("[ExtensionPort] Unknown message type:", message.type);
      }
    },
    [currentRequestId, updateStreamBuffer, completeSummarization, setError],
  );

  // Connect to background script
  const connect = useCallback(() => {
    try {
      console.log("[ExtensionPort] Connecting to background script...");
      const port = chrome.runtime.connect({ name: "sidepanel" });

      port.onMessage.addListener(handleMessage);

      port.onDisconnect.addListener(() => {
        console.log("[ExtensionPort] Port disconnected");
        portRef.current = null;

        // Attempt reconnection after a delay
        setTimeout(() => {
          if (!portRef.current) {
            connect();
          }
        }, 1000);
      });

      portRef.current = port;
      console.log("[ExtensionPort] Connected successfully");
      return port;
    } catch (error) {
      console.error("[ExtensionPort] Failed to connect:", error);
      setError(error instanceof Error ? error : new Error("Connection failed"));
      return null;
    }
  }, [handleMessage, setError]);

  // Send message to background script
  const sendMessage = useCallback(
    (message: Record<string, unknown>) => {
      if (!portRef.current) {
        console.error("[ExtensionPort] No active port connection");
        setError(new Error("No connection to background script"));
        return;
      }

      try {
        portRef.current.postMessage(message);
        console.log("[ExtensionPort] Sent message:", message);
      } catch (error) {
        console.error("[ExtensionPort] Failed to send message:", error);
        setError(error instanceof Error ? error : new Error("Failed to send message"));
      }
    },
    [setError],
  );

  // Start summarization
  const startSummarization = useCallback(() => {
    const requestId = crypto.randomUUID();
    setRequestId(requestId);

    const message: SummarizeRequest = {
      type: "SUMMARIZE",
      params: {
        length: params.length,
        level: params.level,
        style: params.style,
        focus: params.focus,
      },
    };

    // Add requestId to track this specific request
    const messageWithId = { ...message, requestId };

    sendMessage(messageWithId);
  }, [params, sendMessage, setRequestId]);

  // Cancel summarization
  const cancelSummarization = useCallback(() => {
    if (currentRequestId) {
      sendMessage({
        type: "CANCEL_SUMMARIZATION",
        requestId: currentRequestId,
      });
    }
  }, [currentRequestId, sendMessage]);

  // Initialize connection on mount
  useEffect(() => {
    connect();

    return () => {
      if (portRef.current) {
        portRef.current.disconnect();
        portRef.current = null;
      }
    };
  }, [connect]);

  return {
    isConnected: !!portRef.current,
    sendMessage,
    startSummarization,
    cancelSummarization,
  };
}
