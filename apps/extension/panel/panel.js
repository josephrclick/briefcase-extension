const $ = (sel) => document.querySelector(sel);
const state = { length: "brief", level: "high_school", style: "bullets", output: "" };

function render() {
  $("#output").textContent = state.output;
  $("#length").value = state.length;
  $("#level").value = state.level;
  $("#style").value = state.style;
}

async function summarize() {
  state.output = "Summarizing current page…";
  render();
  const res = await chrome.runtime.sendMessage({
    type: "SUMMARIZE",
    params: {
      length: state.length,
      level: state.level,
      style: state.style,
    },
  });
  state.output = res?.text || "(no result)";
  render();
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
