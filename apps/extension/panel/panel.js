const $ = (sel) => document.querySelector(sel);
const state = {
  length: "brief",
  level: "high_school",
  style: "bullets",
  output: "",
  currentRequestId: null,
  isStreaming: false,
};

function render() {
  $("#output").textContent = state.output;
  $("#length").value = state.length;
  $("#level").value = state.level;
  $("#style").value = state.style;
}

async function summarize() {
  // Clear previous output and set loading state
  state.output = "Summarizing current page…";
  state.isStreaming = true;
  render();

  try {
    const res = await chrome.runtime.sendMessage({
      type: "SUMMARIZE",
      params: {
        length: state.length,
        level: state.level,
        style: state.style,
      },
    });

    if (res?.status === "streaming") {
      // Store the request ID to filter incoming chunks
      state.currentRequestId = res.requestId;
      state.output = ""; // Clear loading text to prepare for streaming chunks
      render();
      console.log("[Panel] Streaming started with request ID:", res.requestId);
    } else if (res?.error) {
      // Handle immediate error response
      state.output = `Error: ${res.error.message}`;
      state.isStreaming = false;
      render();
    }
  } catch (error) {
    console.error("[Panel] Failed to send SUMMARIZE message:", error);
    state.output = "Failed to connect to background script";
    state.isStreaming = false;
    render();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.body.innerHTML = `
    <div class="controls">
      <div>
        <label>Length</label>
        <select id="length">
          <option value="brief">brief</option>
          <option value="medium">medium</option>
          <option value="verbose">verbose</option>
        </select>
      </div>
      <div>
        <label>Level</label>
        <select id="level">
          <option value="kinder">kindergarten</option>
          <option value="high_school" selected>high school</option>
          <option value="college">college</option>
          <option value="phd">phd</option>
        </select>
      </div>
      <div>
        <label>Style</label>
        <select id="style">
          <option value="plain">plain</option>
          <option value="bullets" selected>bullets</option>
          <option value="executive">executive</option>
        </select>
      </div>
    </div>
    <div style="margin-top:8px">
      <button id="go">Summarize</button>
    </div>
    <div id="output" class="output"></div>
  `;
  $("#length").addEventListener("change", (e) => (state.length = e.target.value));
  $("#level").addEventListener("change", (e) => (state.level = e.target.value));
  $("#style").addEventListener("change", (e) => (state.style = e.target.value));
  $("#go").addEventListener("click", summarize);
  render();
});

// Listen for streaming messages from the background script
chrome.runtime.onMessage.addListener((msg) => {
  // Only process messages for the current streaming request
  if (!state.isStreaming || !state.currentRequestId) {
    return;
  }

  // Filter messages by request ID to handle concurrent requests
  if (msg.requestId !== state.currentRequestId) {
    return;
  }

  switch (msg.type) {
    case "SUMMARY_CHUNK":
      // Append the chunk to the output
      state.output += msg.payload;
      render();
      console.log(`[Panel] Received chunk: "${msg.payload.substring(0, 50)}..."`);
      break;

    case "SUMMARY_COMPLETE":
      // Mark streaming as complete
      state.isStreaming = false;
      console.log("[Panel] Streaming complete. Metadata:", msg.metadata);
      // Optionally show completion indicator or metadata
      if (msg.metadata) {
        console.log(
          `[Panel] Total chunks: ${msg.metadata.chunksReceived}, Length: ${msg.metadata.totalLength}`,
        );
      }
      break;

    case "SUMMARY_ERROR":
      // Handle streaming error
      state.output = `Error: ${msg.error.message}`;
      state.isStreaming = false;
      render();
      console.error("[Panel] Streaming error:", msg.error);
      break;

    default:
      // Ignore other message types
      break;
  }
});
