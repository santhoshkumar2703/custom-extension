// =============== Native Messaging Helper ===============
function sendNative(action, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(
      "local_sysinfo_host",
      { action, ...payload },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Native host error:", chrome.runtime.lastError.message);
          reject(chrome.runtime.lastError);
        } else {
          resolve(response || {});
        }
      }
    );
  });
}

// =============== Clock ===============
function updateClock() {
  const now = new Date();
  const clockEl = document.getElementById("clock");
  const dateEl = document.getElementById("date");

  if (clockEl) clockEl.textContent = now.toLocaleTimeString();
  if (dateEl) dateEl.textContent = now.toDateString();
}

// =============== Battery ===============
async function loadBattery() {
  const textEl = document.getElementById("battery-text");
  const statusEl = document.getElementById("battery-status");
  const fillEl = document.getElementById("battery-fill");
  const outerEl = document.getElementById("battery-outer");
  const iconEl = document.getElementById("battery-icon");

  if (!textEl || !fillEl || !outerEl || !statusEl || !iconEl) return;

  // init
  statusEl.textContent = "Loading...";
  statusEl.style.color = "#8ba0c5";
  iconEl.style.display = "none";

  try {
    const data = await sendNative("get_battery");
    // structured fields
    const raw = data && data.battery ? String(data.battery) : "";
    const adapterRaw = data && data.adapter_raw ? String(data.adapter_raw) : "";
    let percent = (typeof data.percent === "number") ? data.percent : null;
    let charging = (typeof data.charging === "boolean") ? data.charging : null;

    // fallback parse if structured fields missing
    if (percent === null) {
      const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
      const line = lines.length ? lines[0] : "";
      const m = line.match(/(\d+)%/);
      if (m) percent = parseInt(m[1], 10);
    }

    if (charging === null) {
      // prefer adapterRaw (acpi -a)
      const checkStr = (adapterRaw || raw || "").toLowerCase();
      // robust regex checks similar to python
      if (/\bon[\s-]?line\b/.test(checkStr)) charging = true;
      else if (/\boff[\s-]?line\b/.test(checkStr)) charging = false;
      else if (/\bon\b/.test(checkStr) && !/\boff\b/.test(checkStr)) charging = true;
      else if (/\boff\b/.test(checkStr) && !/\bon\b/.test(checkStr)) charging = false;
      else charging = null;
    }

    // Update percent text
    textEl.textContent = percent !== null ? `${percent}%` : "--%";

    // Update textual status
    if (charging === true) {
      statusEl.textContent = "Charging • Yes";
      statusEl.style.color = "#5cffbf";
      outerEl.classList.add("charging");
    } else if (charging === false) {
      // show Full if percent is near 100
      if (percent !== null && percent >= 99) {
        statusEl.textContent = "Full • No";
      } else {
        statusEl.textContent = "Charging • No";
      }
      statusEl.style.color = "#8ba0c5";
      outerEl.classList.remove("charging");
    } else {
      statusEl.textContent = "Unknown";
      statusEl.style.color = "#cccccc";
      outerEl.classList.remove("charging");
    }

    // fill styling
    fillEl.style.width = percent !== null ? (Math.max(0, Math.min(100, percent)) + "%") : "0%";
    outerEl.classList.remove("low");
    if (percent !== null) {
      if (percent > 50) {
        fillEl.style.background = "linear-gradient(90deg, #00ff95, #00ffa2)";
      } else if (percent > 20) {
        fillEl.style.background = "linear-gradient(90deg, #ffcc00, #ffdb4d)";
      } else {
        fillEl.style.background = "linear-gradient(90deg, #ff3b3b, #ff6666)";
        outerEl.classList.add("low");
      }
    } else {
      fillEl.style.background = "linear-gradient(90deg, #666a76, #6d7280)";
    }

    // ICON: show only when charging === true
    if (charging === true) {
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='24' height='24'>
        <path fill='%23ffffff' d='M11 21h-1l1-7H6l6-11v7h4l-6 11z' />
      </svg>`;
      iconEl.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
      iconEl.style.display = "inline-block";
    } else {
      iconEl.style.display = "none";
      iconEl.src = "";
    }

  } catch (e) {
    console.error("Battery load failed:", e);
    textEl.textContent = "--%";
    statusEl.textContent = "Error";
    statusEl.style.color = "#ff8080";
    fillEl.style.width = "0%";
    outerEl.classList.remove("charging");
    outerEl.classList.remove("low");
    iconEl.style.display = "none";
    iconEl.src = "";
  }
}

// =============== Wi-Fi Password (connected network) ===============
let wifiPasswordActual = "";
let wifiPasswordVisible = false;

function maskWithStars(str) {
  if (!str) return "-";
  // keep at least 6 stars for short values for visual consistency
  const len = Math.max(6, String(str).length);
  return "*".repeat(len);
}

async function loadWifiPassword() {
  const ssidEl = document.getElementById("wifi-ssid");
  const passEl = document.getElementById("wifi-password");
  const toggleEl = document.getElementById("wifi-toggle");

  if (!ssidEl || !passEl || !toggleEl) return;

  try {
    const data = await sendNative("get_wifi_password");
    const raw = data && data.wifi_password ? data.wifi_password : "";

    let ssid = "-";
    let password = "-";

    raw.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("SSID:")) {
        ssid = trimmed.slice("SSID:".length).trim();
      } else if (trimmed.startsWith("Password:")) {
        password = trimmed.slice("Password:".length).trim();
      }
    });

    wifiPasswordActual = password && password !== "error" ? password : "";
    wifiPasswordVisible = false;

    ssidEl.textContent = ssid || "-";

    if (wifiPasswordActual) {
      passEl.textContent = maskWithStars(wifiPasswordActual);
      toggleEl.disabled = false;
      toggleEl.textContent = "Show";
    } else {
      passEl.textContent = "-";
      toggleEl.disabled = true;
      toggleEl.textContent = "Show";
    }
  } catch (e) {
    console.error("Wi-Fi password load failed:", e);
    ssidEl.textContent = "Error";
    passEl.textContent = "Error";
    if (toggleEl) toggleEl.disabled = true;
  }
}

function toggleWifiPassword() {
  const passEl = document.getElementById("wifi-password");
  const toggleEl = document.getElementById("wifi-toggle");
  if (!passEl || !toggleEl) return;
  if (!wifiPasswordActual) return;

  wifiPasswordVisible = !wifiPasswordVisible;
  if (wifiPasswordVisible) {
    passEl.textContent = wifiPasswordActual;
    toggleEl.textContent = "Hide";
  } else {
    passEl.textContent = maskWithStars(wifiPasswordActual);
    toggleEl.textContent = "Show";
  }
}

// =============== Device Info (mask hostname + ip) ===============
let deviceHostnameActual = "";
let deviceIpActual = "";
let deviceHostnameVisible = false;
let deviceIpVisible = false;

async function loadDeviceInfo() {
  const hostEl = document.getElementById("device-hostname");
  const ipEl = document.getElementById("device-ip");
  const hostToggle = document.getElementById("device-host-toggle");
  const ipToggle = document.getElementById("device-ip-toggle");

  if (!hostEl || !ipEl) return;

  try {
    const data = await sendNative("get_device_info");
    deviceHostnameActual = data.hostname || "";
    deviceIpActual = data.ip || "";

    // show masked by default
    deviceHostnameVisible = false;
    deviceIpVisible = false;

    hostEl.textContent = deviceHostnameActual ? maskWithStars(deviceHostnameActual) : "-";
    ipEl.textContent = deviceIpActual ? maskWithStars(deviceIpActual) : "-";

    if (hostToggle) {
      hostToggle.disabled = !deviceHostnameActual;
      hostToggle.textContent = "Show";
    }
    if (ipToggle) {
      ipToggle.disabled = !deviceIpActual;
      ipToggle.textContent = "Show";
    }
  } catch (e) {
    console.error("Device info failed:", e);
    if (hostEl) hostEl.textContent = "Error";
    if (ipEl) ipEl.textContent = "Error";
    if (hostToggle) hostToggle.disabled = true;
    if (ipToggle) ipToggle.disabled = true;
  }
}

function toggleDeviceHostname() {
  const hostEl = document.getElementById("device-hostname");
  const hostToggle = document.getElementById("device-host-toggle");
  if (!hostEl || !hostToggle) return;
  if (!deviceHostnameActual) return;

  deviceHostnameVisible = !deviceHostnameVisible;
  if (deviceHostnameVisible) {
    hostEl.textContent = deviceHostnameActual;
    hostToggle.textContent = "Hide";
  } else {
    hostEl.textContent = maskWithStars(deviceHostnameActual);
    hostToggle.textContent = "Show";
  }
}

function toggleDeviceIp() {
  const ipEl = document.getElementById("device-ip");
  const ipToggle = document.getElementById("device-ip-toggle");
  if (!ipEl || !ipToggle) return;
  if (!deviceIpActual) return;

  deviceIpVisible = !deviceIpVisible;
  if (deviceIpVisible) {
    ipEl.textContent = deviceIpActual;
    ipToggle.textContent = "Hide";
  } else {
    ipEl.textContent = maskWithStars(deviceIpActual);
    ipToggle.textContent = "Show";
  }
}

// =============== Copy Device Info (copies actual values) ===============
async function copyDeviceInfo() {
  const statusEl = document.getElementById("device-copy-status");
  const hostname = deviceHostnameActual || document.getElementById("device-hostname")?.textContent || "";
  const ip = deviceIpActual || document.getElementById("device-ip")?.textContent || "";

  const text = `Hostname: ${hostname}\nIP Address: ${ip}`;
  try {
    await navigator.clipboard.writeText(text);
    if (statusEl) {
      statusEl.textContent = "Copied device info to clipboard.";
      statusEl.style.color = "#5cffbf";
    }
  } catch (e) {
    console.error("copyDeviceInfo failed:", e);
    if (statusEl) {
      statusEl.textContent = "Failed to copy device info.";
      statusEl.style.color = "#ff8080";
    }
  }
}

// =============== Copy Wi-Fi Details ===============
async function copyWifiDetails() {
  const ssid = document.getElementById("wifi-ssid")?.textContent || "";
  const statusEl = document.getElementById("wifi-copy-status");
  const password = wifiPasswordActual || document.getElementById("wifi-password")?.textContent || "";

  const text = `Wi-Fi: ${ssid}\nPassword: ${password}`;

  try {
    await navigator.clipboard.writeText(text);
    if (statusEl) {
      statusEl.textContent = "Copied Wi-Fi details to clipboard.";
      statusEl.style.color = "#5cffbf";
    }
  } catch (e) {
    console.error("copyWifiDetails failed:", e);
    if (statusEl) {
      statusEl.textContent = "Failed to copy Wi-Fi details.";
      statusEl.style.color = "#ff8080";
    }
  }
}

// =============== Tasks (dynamic list) ===============
let currentTasks = []; // [{text, done}...]
const MAX_TASKS = 20;

function renderTasks() {
  const list = document.getElementById("task-list");
  if (!list) return;

  list.innerHTML = "";

  if (!currentTasks.length) {
    const empty = document.createElement("li");
    empty.textContent = "No tasks yet. Click 'Add Task' to create one.";
    empty.style.fontSize = "12px";
    empty.style.color = "#8ba0c5";
    list.appendChild(empty);
    return;
  }

  currentTasks.forEach((task, index) => {
    const li = document.createElement("li");
    li.className = "task-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !!task.done;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "task-input";
    input.value = task.text || "";
    input.placeholder = "Task " + (index + 1);

    const delBtn = document.createElement("button");
    delBtn.textContent = "✕";
    delBtn.title = "Delete task";
    delBtn.className = "task-delete-btn";

    checkbox.addEventListener("change", () => {
      currentTasks[index].done = checkbox.checked;
      saveTasks();
    });

    input.addEventListener("input", () => {
      currentTasks[index].text = input.value;
      saveTasks();
    });

    delBtn.addEventListener("click", () => {
      currentTasks.splice(index, 1);
      saveTasks();
      renderTasks();
    });

    li.appendChild(checkbox);
    li.appendChild(input);
    li.appendChild(delBtn);
    list.appendChild(li);
  });
}

function loadTasks() {
  chrome.storage.sync.get(["tasks"], (data) => {
    currentTasks = Array.isArray(data.tasks) ? data.tasks : [];
    renderTasks();
  });
}

function saveTasks() {
  chrome.storage.sync.set({ tasks: currentTasks });
}

function addTask() {
  if (currentTasks.length >= MAX_TASKS) {
    const hint = document.getElementById("task-hint");
    if (hint) {
      hint.textContent = "Maximum tasks reached (" + MAX_TASKS + ").";
      hint.style.color = "#ff8080";
    }
    return;
  }

  currentTasks.push({ text: "", done: false });
  saveTasks();
  renderTasks();
}

// ================= Internet Check =================
async function checkInternet() {
  const statusEl = document.getElementById("internet-status");
  if (!statusEl) return;

  statusEl.textContent = "Checking...";
  statusEl.style.color = "#8ba0c5";

  try {
    const resp = await sendNative("check_internet");
    statusEl.textContent = resp.message;
    statusEl.style.color = resp.status === "ok" ? "#5cffbf" : "#ff8080";
  } catch (e) {
    console.error("checkInternet failed:", e);
    statusEl.textContent = "Error contacting native host.";
    statusEl.style.color = "#ff8080";
  }
}

// ================= DNS Check (google.com) =================
async function checkDNS() {
  const statusEl = document.getElementById("dns-status");
  if (!statusEl) return;

  statusEl.textContent = "Checking...";
  statusEl.style.color = "#8ba0c5";

  try {
    const resp = await sendNative("check_dns");
    statusEl.textContent = resp.message;
    statusEl.style.color = resp.status === "ok" ? "#5cffbf" : "#ff8080";
  } catch (e) {
    console.error("checkDNS failed:", e);
    statusEl.textContent = "Error contacting native host.";
    statusEl.style.color = "#ff8080";
  }
}

// ================= DNS Check for custom domain =================
async function checkDNSDomain() {
  const input = document.getElementById("dns-domain");
  const statusEl = document.getElementById("dns-domain-status");
  const detailsWrap = document.getElementById("dns-domain-details");
  const outputEl = document.getElementById("dns-domain-output");

  if (!input || !statusEl) return;

  const domain = input.value.trim();
  if (!domain) {
    statusEl.textContent = "Please enter a domain.";
    statusEl.style.color = "#ff8080";
    if (detailsWrap && outputEl) {
      detailsWrap.style.display = "none";
      outputEl.textContent = "";
    }
    return;
  }

  statusEl.textContent = "Checking " + domain + "...";
  statusEl.style.color = "#8ba0c5";
  if (detailsWrap && outputEl) {
    detailsWrap.style.display = "none";
    outputEl.textContent = "";
  }

  try {
    const resp = await sendNative("check_dns_domain", { domain });

    if (resp.status === "ok") {
      statusEl.textContent = `DNS OK for ${domain}`;
      statusEl.style.color = "#5cffbf";
    } else {
      statusEl.textContent = `DNS issue for ${domain}: ${resp.message || ""}`;
      statusEl.style.color = "#ff8080";
    }

    if (detailsWrap && outputEl && resp.output) {
      detailsWrap.style.display = "block";
      outputEl.textContent = resp.output;
    }
  } catch (e) {
    console.error("checkDNSDomain failed:", e);
    statusEl.textContent = "Error contacting native host.";
    statusEl.style.color = "#ff8080";
    if (detailsWrap && outputEl) {
      detailsWrap.style.display = "none";
      outputEl.textContent = "";
    }
  }
}

// ================= Gateway Check =================
async function checkGateway() {
  const statusEl = document.getElementById("gateway-status");
  if (!statusEl) return;

  statusEl.textContent = "Checking...";
  statusEl.style.color = "#8ba0c5";

  try {
    const resp = await sendNative("check_gateway");
    statusEl.textContent = resp.message;
    statusEl.style.color = resp.status === "ok" ? "#5cffbf" : "#ff8080";
  } catch (e) {
    console.error("checkGateway failed:", e);
    statusEl.textContent = "Error contacting native host.";
    statusEl.style.color = "#ff8080";
  }
}

// ================= Public IP =================
async function checkPublicIP() {
  const statusEl = document.getElementById("publicip-status");
  if (!statusEl) return;

  statusEl.textContent = "Checking...";
  statusEl.style.color = "#8ba0c5";

  try {
    const resp = await sendNative("check_public_ip");
    if (resp.status === "ok" && resp.ip) {
      statusEl.textContent = resp.ip;
      statusEl.style.color = "#5cffbf";
    } else {
      statusEl.textContent = resp.message || "Unable to fetch public IP";
      statusEl.style.color = "#ff8080";
    }
  } catch (e) {
    console.error("checkPublicIP failed:", e);
    statusEl.textContent = "Error contacting native host.";
    statusEl.style.color = "#ff8080";
  }
}

// =============== Init ===============
document.addEventListener("DOMContentLoaded", () => {
  // Clock
  updateClock();
  setInterval(updateClock, 1000);

  // Data loads
  loadBattery();
  loadDeviceInfo();
  loadWifiPassword();
  loadTasks();

  // Wi-Fi toggle
  const wifiToggle = document.getElementById("wifi-toggle");
  if (wifiToggle) wifiToggle.addEventListener("click", toggleWifiPassword);

  // Device toggles
  const hostToggle = document.getElementById("device-host-toggle");
  if (hostToggle) hostToggle.addEventListener("click", toggleDeviceHostname);

  const ipToggle = document.getElementById("device-ip-toggle");
  if (ipToggle) ipToggle.addEventListener("click", toggleDeviceIp);

  // Task events
  const addTaskBtn = document.getElementById("add-task-btn");
  if (addTaskBtn) addTaskBtn.addEventListener("click", addTask);

  // Copy buttons
  const copyWifiBtn = document.getElementById("copy-wifi");
  if (copyWifiBtn) copyWifiBtn.addEventListener("click", copyWifiDetails);

  const copyDeviceBtn = document.getElementById("copy-device");
  if (copyDeviceBtn) copyDeviceBtn.addEventListener("click", copyDeviceInfo);

  // Network troubleshooter buttons
  const internetBtn = document.getElementById("check-internet");
  if (internetBtn) internetBtn.addEventListener("click", checkInternet);

  const dnsBtn = document.getElementById("check-dns");
  if (dnsBtn) dnsBtn.addEventListener("click", checkDNS);

  const dnsDomainBtn = document.getElementById("check-dns-domain");
  if (dnsDomainBtn) dnsDomainBtn.addEventListener("click", checkDNSDomain);

  const gatewayBtn = document.getElementById("check-gateway");
  if (gatewayBtn) gatewayBtn.addEventListener("click", checkGateway);

  const publicIpBtn = document.getElementById("check-publicip");
  if (publicIpBtn) publicIpBtn.addEventListener("click", checkPublicIP);
});
