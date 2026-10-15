const d = window.JD_DATA;
const report = d.report;
const samples = d.samples;
let selected = 0;
let frameIndex = 0;
let syncing = false;
let ignoreVideoUntil = 0;

const $ = (selector) => document.querySelector(selector);
const fmt = (value, digits = 3) => value == null || Number.isNaN(Number(value)) ? "—" : Number(value).toFixed(digits);
const sourceFps = report.protocol.source_fps || 15;
const predictionFps = samples[0]?.detail?.original_prediction_fps || 8;
const frameIds = samples[0]?.detail?.frame_ids || Array.from({length: 43}, (_, i) => i * 6);
const heads = {
  gripper: {name: "夹爪读数", labels: ["低值", "中间值", "高值"]},
  motion: {name: "末端运动", labels: ["末端静止", "末端移动"]},
  vertical: {name: "垂直方向", labels: ["末端下移", "高度稳定", "末端上移"]},
  gripper_change: {name: "夹爪读数变化", labels: ["数值减小", "数值稳定", "数值增大"]}
};

function populateSummary() {
  const selectedReport = report.models[report.selected_model].prediction;
  $("#test-count").textContent = report.protocol.test_episodes;
  $("#future-f1").textContent = fmt(selectedReport.future.mean_macro_f1);
  $("#psnr").textContent = `${fmt(report.reused_visual_metrics.mean_psnr_db, 2)} dB`;
  $("#evidence-psnr").textContent = fmt(report.reused_visual_metrics.mean_psnr_db, 2);
  $("#evidence-f1").textContent = fmt(selectedReport.future.mean_macro_f1, 3);
  $("#evidence-boundary").textContent = fmt(selectedReport.boundaries.f1, 3);
  $("#model").textContent = report.selected_model.replace("_", " ").toUpperCase();
  $("#episode-count").textContent = `${samples.length} / ${samples.length}`;
}

function renderList() {
  const query = $("#search").value.trim().toLowerCase();
  const visible = samples.map((sample, index) => ({sample, index})).filter(({sample}) => sample.task_text.toLowerCase().includes(query));
  $("#sample-list").innerHTML = visible.map(({sample, index}) => `
    <button class="sample-button ${index === selected ? "selected" : ""}" data-index="${index}">
      <strong>${sample.sample_id}</strong><span>${sample.task_text}</span>
    </button>`).join("");
  $("#sample-list").querySelectorAll(".sample-button").forEach((button) => {
    button.addEventListener("click", () => selectSample(Number(button.dataset.index)));
  });
}

function setVideoTime(index, shouldPlay = false) {
  const sourceFrame = frameIds[index] ?? frameIds[0];
  const reference = $("#reference");
  const prediction = $("#prediction");
  // The two files have different encoded FPS. Their common clock is source frame id.
  syncing = true;
  ignoreVideoUntil = performance.now() + 180;
  if (reference.readyState >= 1) reference.currentTime = sourceFrame / sourceFps;
  if (prediction.readyState >= 1) prediction.currentTime = sourceFrame / predictionFps;
  syncing = false;
  if (shouldPlay) {
    reference.play().catch(() => {});
    prediction.play().catch(() => {});
  }
}

function setFrame(index, fromVideo = false) {
  frameIndex = Math.max(0, Math.min(frameIds.length - 1, Number(index) || 0));
  $("#scrubber").value = frameIndex;
  $("#scrubber").style.setProperty("--progress", `${frameIndex / Math.max(frameIds.length - 1, 1) * 100}%`);
  const sourceFrame = frameIds[frameIndex];
  const seconds = sourceFrame / sourceFps;
  $("#frame-readout").textContent = `F${String(sourceFrame).padStart(3, "0")} · ${seconds.toFixed(2)} s`;
  $("#sample-readout").textContent = `sample ${frameIndex} / ${frameIds.length - 1} · source frame ${sourceFrame}`;
  updateReadings();
  if (!fromVideo) setVideoTime(frameIndex);
}

function updateReadings() {
  const detail = samples[selected].detail;
  const telemetry = detail.telemetry;
  const i = frameIndex;
  $("#gripper-value").textContent = fmt(telemetry.gripper_value[i]);
  $("#speed-value").textContent = fmt(telemetry.speed_m_per_s[i]);
  $("#vertical-value").textContent = fmt(telemetry.vertical_m_per_s[i]);
  const current = detail.predictions.prediction.current[i] || [];
  const labels = [heads.gripper.labels, heads.motion.labels, heads.vertical.labels, heads.gripper_change.labels];
  const state = current.map((value, j) => labels[j]?.[value] || "—").join(" · ");
  $("#state-value").textContent = state || "—";
  const probabilities = detail.predictions.prediction.current_probabilities_uncalibrated || {};
  const confidence = ["gripper", "motion", "vertical", "gripper_change"].map((key) => {
    const vector = probabilities[key]?.[i];
    return vector ? Math.max(...vector) : null;
  }).filter((value) => value != null);
  $("#state-confidence").textContent = confidence.length ? `max class score ${fmt(Math.min(...confidence))} · uncalibrated` : "video model · uncalibrated";
  renderPlayhead();
}

function renderPlayhead() {
  const percent = frameIndex / Math.max(frameIds.length - 1, 1) * 100;
  document.querySelectorAll(".playhead").forEach((node) => { node.style.left = `${percent}%`; });
}

function eventRows(detail, kind) {
  const max = detail.source_times_s.at(-1) || 1;
  const predicted = detail.events[kind] || [];
  const truth = detail.events.telemetry || [];
  return Object.keys(heads).map((type) => {
    const labels = [...predicted.filter((event) => event.type === type).map((event) => ({...event, role: "prediction"})), ...truth.filter((event) => event.type === type).map((event) => ({...event, role: "telemetry"}))];
    const blocks = labels.map((event) => `<span class="segment ${event.role}" style="left:${event.start_s / max * 100}%;width:${Math.max((event.end_s - event.start_s) / max * 100, .5)}%">${event.label_zh}</span>`).join("");
    const score = detail.scores[kind]?.[type]?.macro_f1;
    return `<div class="event-row"><div class="event-name">${heads[type].name}</div><div class="track"><span class="playhead"></span>${blocks}</div><div class="metric">F1 ${fmt(score)}</div></div>`;
  }).join("");
}

function selectSample(index) {
  selected = index;
  frameIndex = 0;
  const sample = samples[selected];
  const detail = sample.detail;
  $("#title").textContent = sample.sample_id;
  $("#task").textContent = sample.task_text;
  $("#episode-id").textContent = `EPISODE ${String(detail.episode_index).padStart(6, "0")}`;
  $("#reference").src = sample.reference_url;
  $("#prediction").src = sample.prediction_url;
  $("#timeline").innerHTML = eventRows(detail, "prediction");
  renderList();
  setFrame(0);
  $("#reference").addEventListener("loadedmetadata", () => setVideoTime(frameIndex), {once: true});
  $("#prediction").addEventListener("loadedmetadata", () => setVideoTime(frameIndex), {once: true});
}

function frameFromVideo(video, fps) {
  if (!video.duration || syncing || performance.now() < ignoreVideoUntil) return;
  const sourceFrame = video.currentTime * fps;
  const nearest = frameIds.reduce((best, frame, i) => Math.abs(frame - sourceFrame) < Math.abs(frameIds[best] - sourceFrame) ? i : best, 0);
  setFrame(nearest, true);
}

populateSummary();
$("#search").addEventListener("input", renderList);
$("#scrubber").max = frameIds.length - 1;
$("#scrubber").addEventListener("input", (event) => setFrame(event.target.value));
$("#reference").addEventListener("timeupdate", () => frameFromVideo($("#reference"), sourceFps));
$("#prediction").addEventListener("timeupdate", () => frameFromVideo($("#prediction"), predictionFps));
selectSample(0);
