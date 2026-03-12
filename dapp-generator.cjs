#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║         DApp Frontend Generator — by Claude / Lab 6         ║
 * ║                                                              ║
 * ║  Usage:                                                      ║
 * ║    node dapp-generator.js <ArtifactPath.json>               ║
 * ║      [--address 0xYourContractAddress]                       ║
 * ║      [--out ./frontend]                                      ║
 * ║      [--network http://127.0.0.1:7545]                       ║
 * ║      [--chain 1337]                                          ║
 * ║                                                              ║
 * ║  Example:                                                    ║
 * ║    node dapp-generator.js \                                  ║
 * ║      artifacts/contracts/FinancialContract.sol/\             ║
 * ║      FinancialContract.json \                                ║
 * ║      --address 0xAbc123...                                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

const fs = require("fs");
const path = require("path");

// ─── CLI argument parsing ─────────────────────────────────────────────────────
const args = process.argv.slice(2);

function getArg(flag, fallback = null) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const artifactPath = args.find((a) => !a.startsWith("--"));
const contractAddr = getArg("--address", "0xYourContractAddressHere");
const outDir = getArg("--out", "./frontend");
const rpcUrl = getArg("--network", "http://127.0.0.1:7545");
const chainId = getArg("--chain", "1337");

if (!artifactPath) {
  console.error(
    "❌  Usage: node dapp-generator.js <artifact.json> [--address 0x...] [--out ./frontend]",
  );
  process.exit(1);
}

// ─── Load artifact ────────────────────────────────────────────────────────────
let artifact;
try {
  artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
} catch (e) {
  console.error(
    `❌  Could not read artifact: ${artifactPath}\n   ${e.message}`,
  );
  process.exit(1);
}

const contractName =
  artifact.contractName || path.basename(artifactPath, ".json");
const abi = artifact.abi || [];

// ─── ABI classification ───────────────────────────────────────────────────────
const readFns = abi.filter(
  (e) =>
    e.name !== "admin" &&
    e.type === "function" &&
    (e.stateMutability === "view" || e.stateMutability === "pure"),
);
const writeFns = abi.filter(
  (e) =>
    e.name !== "admin" &&
    e.type === "function" &&
    (e.stateMutability === "nonpayable" || e.stateMutability === "payable"),
);
const events = abi.filter((e) => e.type === "event");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function solTypeToInput(solType) {
  if (solType.startsWith("uint") || solType.startsWith("int")) return "number";
  if (solType === "bool") return "checkbox";
  if (solType === "address") return "text";
  return "text";
}

function solTypePlaceholder(solType, name) {
  if (solType.startsWith("uint") || solType.startsWith("int"))
    return `e.g. 1000000000000000000 (in wei)`;
  if (solType === "address") return "0x...";
  if (solType === "bytes32") return "0x + 64 hex chars";
  return name || solType;
}

function fnCardId(fn) {
  return `card_${fn.name}`;
}

function outputLabel(output, idx) {
  return output.name || `return_${idx}`;
}

// ─── Generate index.html ──────────────────────────────────────────────────────
function generateHTML() {
  const readCards = readFns
    .map((fn) => {
      const inputFields = (fn.inputs || [])
        .map(
          (inp) => `
          <div class="input-row">
            <label>${inp.name} <span class="type-hint">${
            inp.type
          }</span></label>
            <input
              type="${solTypeToInput(inp.type)}"
              id="input_${fn.name}_${inp.name}"
              placeholder="${solTypePlaceholder(inp.type, inp.name)}"
            />
          </div>`,
        )
        .join("");

      const outputDivs = (fn.outputs || [])
        .map(
          (o, i) => `
          <div class="output-row">
            <span class="output-label">${outputLabel(o, i)}</span>
            <span class="output-value mono" id="out_${fn.name}_${i}">—</span>
          </div>`,
        )
        .join("");

      return `
      <!-- READ: ${fn.name} -->
      <div class="fn-card read" id="${fnCardId(fn)}">
        <div class="fn-header">
          <span class="fn-name">${fn.name}(${(fn.inputs || [])
        .map((i) => i.type)
        .join(", ")})</span>
          <span class="badge read-badge">view</span>
        </div>
        ${inputFields}
        <button onclick="call_${fn.name}()">Call ${fn.name}()</button>
        <div class="tx-result" id="tx_${fn.name}"></div>
        ${outputDivs ? `<div class="outputs">${outputDivs}</div>` : ""}
      </div>`;
    })
    .join("\n");

  const writeCards = writeFns
    .map((fn) => {
      const isPayable = fn.stateMutability === "payable";

      const inputFields = (fn.inputs || [])
        .map(
          (inp) => `
          <div class="input-row">
            <label>${inp.name} <span class="type-hint">${
            inp.type
          }</span></label>
            <input
              type="${solTypeToInput(inp.type)}"
              id="input_${fn.name}_${inp.name}"
              placeholder="${solTypePlaceholder(inp.type, inp.name)}"
            />
          </div>`,
        )
        .join("");

      const ethField = isPayable
        ? `
          <div class="input-row payable-row">
            <label>ETH to send <span class="type-hint">payable</span></label>
            <input type="number" id="input_${fn.name}_ethValue" placeholder="e.g. 0.01" step="0.001" min="0"/>
          </div>`
        : "";

      return `
      <!-- WRITE: ${fn.name} -->
      <div class="fn-card write" id="${fnCardId(fn)}">
        <div class="fn-header">
          <span class="fn-name">${fn.name}(${(fn.inputs || [])
        .map((i) => i.type)
        .join(", ")})</span>
          <span class="badge write-badge">${
            isPayable ? "payable" : "write"
          }</span>
        </div>
        ${inputFields}${ethField}
        <button class="write-btn" onclick="send_${fn.name}()">
          ${isPayable ? "⬆ Send ETH + call" : "✏ Call"} ${fn.name}()
        </button>
        <div class="tx-result" id="tx_${fn.name}"></div>
      </div>`;
    })
    .join("\n");

  const eventRows = events
    .map(
      (ev) => `
      <li><strong>${ev.name}</strong>(${(ev.inputs || [])
        .map(
          (i) => `${i.indexed ? "<em>indexed</em> " : ""}${i.type} ${i.name}`,
        )
        .join(", ")})</li>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${contractName} — DApp</title>
  <style>
    /* ── Reset & base ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background: #0f1117;
      color: #e2e8f0;
      min-height: 100vh;
      padding: 32px 16px;
    }

    /* ── Layout ── */
    .container { max-width: 860px; margin: 0 auto; }

    /* ── Header ── */
    .app-header {
      text-align: center;
      margin-bottom: 32px;
    }
    .app-header h1 {
      font-size: 2rem;
      font-weight: 700;
      background: linear-gradient(90deg, #38bdf8, #818cf8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .app-header p { color: #94a3b8; margin-top: 6px; font-size: 14px; }

    /* ── Wallet bar ── */
    .wallet-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      background: #1e2130;
      border: 1px solid #2d3451;
      border-radius: 12px;
      padding: 14px 20px;
      margin-bottom: 28px;
      flex-wrap: wrap;
    }
    .wallet-bar .dot {
      width: 10px; height: 10px; border-radius: 50%;
      background: #ef4444; flex-shrink: 0;
    }
    .wallet-bar .dot.connected { background: #22c55e; }
    .wallet-bar .label { color: #94a3b8; font-size: 13px; }
    .wallet-bar .address { font-family: monospace; font-size: 13px; color: #38bdf8; }
    .wallet-bar .network { margin-left: auto; font-size: 12px; color: #94a3b8; }
    .connect-btn {
      margin-left: auto;
      background: #3b82f6;
      color: white;
      border: none;
      padding: 8px 18px;
      border-radius: 8px;
      font-size: 13px;
      cursor: pointer;
      font-weight: 600;
    }
    .connect-btn:hover { background: #2563eb; }

    /* ── Section titles ── */
    .section-title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 12px;
      margin-top: 28px;
      border-bottom: 1px solid #1e2a3a;
      padding-bottom: 6px;
    }

    /* ── Cards grid ── */
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 16px;
    }

    /* ── Function cards ── */
    .fn-card {
      background: #1e2130;
      border-radius: 12px;
      padding: 18px;
      border: 1px solid #2d3451;
      transition: border-color 0.2s;
    }
    .fn-card.read  { border-left: 3px solid #22c55e; }
    .fn-card.write { border-left: 3px solid #f59e0b; }
    .fn-card:hover { border-color: #3b82f6; }

    .fn-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 14px;
    }
    .fn-name { font-family: monospace; font-size: 14px; font-weight: 700; color: #e2e8f0; }

    /* ── Badges ── */
    .badge {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 20px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .read-badge  { background: #14532d; color: #4ade80; }
    .write-badge { background: #451a03; color: #fbbf24; }

    /* ── Inputs ── */
    .input-row { margin-bottom: 10px; }
    .input-row label { display: block; font-size: 12px; color: #94a3b8; margin-bottom: 4px; }
    .type-hint { color: #475569; font-size: 11px; font-style: italic; }
    input[type="text"], input[type="number"] {
      width: 100%;
      background: #0f1117;
      border: 1px solid #2d3451;
      border-radius: 6px;
      color: #e2e8f0;
      padding: 8px 10px;
      font-size: 13px;
      font-family: monospace;
      transition: border-color 0.2s;
    }
    input[type="text"]:focus, input[type="number"]:focus {
      outline: none;
      border-color: #3b82f6;
    }
    .payable-row label { color: #fb923c; }
    .payable-row input { border-color: #7c2d12; }
    .payable-row input:focus { border-color: #f97316; }

    /* ── Buttons ── */
    button {
      width: 100%;
      padding: 10px;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 4px;
      transition: opacity 0.2s, transform 0.1s;
    }
    button:hover   { opacity: 0.88; }
    button:active  { transform: scale(0.98); }
    .fn-card.read button  { background: #166534; color: #bbf7d0; }
    .fn-card.write button { background: #92400e; color: #fef3c7; }
    .write-btn { background: #1d4ed8; color: white; }
    .write-btn:hover { background: #1e40af; }

    /* ── Outputs ── */
    .outputs { margin-top: 12px; background: #0f1117; border-radius: 8px; padding: 10px; }
    .output-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
      border-bottom: 1px solid #1e2130;
    }
    .output-row:last-child { border-bottom: none; }
    .output-label { font-size: 12px; color: #64748b; }
    .output-value { font-family: monospace; font-size: 13px; color: #38bdf8; }

    /* ── TX result ── */
    .tx-result {
      margin-top: 10px;
      font-size: 12px;
      border-radius: 6px;
      padding: 0;
      word-break: break-all;
    }
    .tx-result.info    { background: #1e3a5f; color: #93c5fd; padding: 8px 10px; }
    .tx-result.ok      { background: #14532d; color: #86efac; padding: 8px 10px; }
    .tx-result.error   { background: #450a0a; color: #fca5a5; padding: 8px 10px; }

    /* ── Events panel ── */
    .events-panel {
      background: #1e2130;
      border: 1px solid #2d3451;
      border-left: 3px solid #818cf8;
      border-radius: 12px;
      padding: 18px;
      margin-top: 28px;
    }
    .events-panel h3 { font-size: 13px; font-weight: 700; color: #a5b4fc; margin-bottom: 10px; }
    .events-panel ul { list-style: none; }
    .events-panel li { font-family: monospace; font-size: 12px; color: #94a3b8; padding: 4px 0; border-bottom: 1px solid #1e2a3a; }
    .events-panel li:last-child { border: none; }
    #eventLog { max-height: 200px; overflow-y: auto; }
    .log-entry { font-family: monospace; font-size: 12px; padding: 6px 0; border-bottom: 1px solid #1e2a3a; color: #94a3b8; }
    .log-entry .ev-name { color: #818cf8; font-weight: 700; }
    .log-entry .ev-block { color: #475569; font-size: 11px; margin-left: 6px; }

    /* ── Mono helper ── */
    .mono { font-family: monospace; }
  </style>
</head>
<body>
  <div class="container">

    <!-- Header -->
    <div class="app-header">
      <h1>${contractName} DApp</h1>
      <p>Auto-generated frontend &bull; Connected to Ganache &bull; Powered by Web3.js</p>
    </div>

    <!-- Wallet bar -->
    <div class="wallet-bar">
      <div class="dot" id="statusDot"></div>
      <span class="label">Account:</span>
      <span class="address" id="accountDisplay">Not connected</span>
      <span class="network" id="networkDisplay"></span>
      <button class="connect-btn" id="connectBtn" onclick="connectWallet()">Connect MetaMask</button>
    </div>

    <!-- ── READ FUNCTIONS ── -->
    ${
      readFns.length > 0
        ? `<div class="section-title">📖 Read Functions (no gas)</div>
    <div class="cards-grid">
      ${readCards}
    </div>`
        : ""
    }

    <!-- ── WRITE FUNCTIONS ── -->
    ${
      writeFns.length > 0
        ? `<div class="section-title">✏️ Write Functions (requires MetaMask)</div>
    <div class="cards-grid">
      ${writeCards}
    </div>`
        : ""
    }

    <!-- ── EVENTS ── -->
    ${
      events.length > 0
        ? `
    <div class="events-panel">
      <h3>⚡ Contract Events</h3>
      <div id="eventLog">
        <p style="color:#475569; font-size:12px;">No events yet. Send a transaction to see live logs.</p>
      </div>
    </div>`
        : ""
    }

  </div>

  <!-- Web3.js CDN -->
  <script src="https://cdn.jsdelivr.net/npm/web3@1.10.0/dist/web3.min.js"></script>
  <script src="app.js"></script>
</body>
</html>`;
}

// ─── Generate app.js ──────────────────────────────────────────────────────────
function generateJS() {
  // Build read function JS
  const readFnJs = readFns
    .map((fn) => {
      const inputCollect = (fn.inputs || [])
        .map(
          (inp) => `
  const raw_${inp.name} = document.getElementById('input_${fn.name}_${
            inp.name
          }')?.value?.trim();
  if (raw_${inp.name} === '' || raw_${
            inp.name
          } === undefined) { showTxResult('${fn.name}', 'Input "${
            inp.name
          }" is required', 'error'); return; }
  let arg_${inp.name} = raw_${inp.name};${
            inp.type === "bytes32"
              ? `\n  if (arg_${inp.name}.length < 66) arg_${inp.name} = arg_${inp.name}.padEnd(66, '0');`
              : ""
          }`,
        )
        .join("");

      const argsList = (fn.inputs || [])
        .map((inp) => `arg_${inp.name}`)
        .join(", ");

      const outputAssignments = (fn.outputs || [])
        .map(
          (o, i) => `
    const el_${i} = document.getElementById('out_${fn.name}_${i}');
    if (el_${i}) el_${i}.textContent = formatValue(result${
            fn.outputs.length > 1 ? `[${i}]` : ""
          });`,
        )
        .join("");

      return `
async function call_${fn.name}() {
  if (!contract) { showTxResult('${fn.name}', 'Connect wallet first', 'error'); return; }
  showTxResult('${fn.name}', 'Querying...', 'info');
${inputCollect}
  try {
    const result = await contract.methods.${fn.name}(${argsList}).call();
    ${outputAssignments}
    showTxResult('${fn.name}', '✅ Success', 'ok');
  } catch (err) {
    console.error('${fn.name} error:', err);
    showTxResult('${fn.name}', '❌ Error: ' + (err.message || err), 'error');
  }
}`;
    })
    .join("\n");

  // Build write function JS
  const writeFnJs = writeFns
    .map((fn) => {
      const isPayable = fn.stateMutability === "payable";
      const inputNames = (fn.inputs || []).map(
        (inp) => `input_${fn.name}_${inp.name}`,
      );

      const inputCollect = (fn.inputs || [])
        .map(
          (inp) => `
  const raw_${inp.name} = document.getElementById('input_${fn.name}_${
            inp.name
          }')?.value?.trim();
  if (raw_${inp.name} === '' || raw_${
            inp.name
          } === undefined) { showTxResult('${fn.name}', 'Input "${
            inp.name
          }" is required', 'error'); return; }
  let arg_${inp.name} = raw_${inp.name};${
            inp.type === "bytes32"
              ? `\n  if (arg_${inp.name}.length < 66) arg_${inp.name} = arg_${inp.name}.padEnd(66, '0');`
              : ""
          }`,
        )
        .join("");

      const argsList = (fn.inputs || [])
        .map((inp) => `arg_${inp.name}`)
        .join(", ");

      const sendOptions = isPayable
        ? `{ from: currentAccount, value: web3.utils.toWei(ethVal, 'ether') }`
        : `{ from: currentAccount }`;

      const ethInput = isPayable
        ? `
  const ethVal = document.getElementById('input_${fn.name}_ethValue')?.value?.trim() || '0';`
        : "";

      return `
async function send_${fn.name}() {
  if (!contract) { alert('Connect wallet first'); return; }
  showTxResult('${fn.name}', 'Waiting for MetaMask confirmation…', 'info');
  ${inputCollect}${ethInput}
  try {
    const tx = await contract.methods.${fn.name}(${argsList}).send(${sendOptions});
    showTxResult('${fn.name}', '✅ Confirmed: ' + tx.transactionHash, 'ok');
    refreshAll();
    logEvent('${fn.name} (tx)', tx.transactionHash, tx.blockNumber);
  } catch (err) {
    showTxResult('${fn.name}', '❌ ' + (err.message || err), 'error');
  }
}`;
    })
    .join("\n");

  // Event subscriptions
  const eventSubs = events
    .map(
      (ev) => `
  contract.events.${ev.name}({}, (err, event) => {
    if (err) return;
    const args = JSON.stringify(event.returnValues, null, 2);
    logEvent('${ev.name}', args, event.blockNumber);
  });`,
    )
    .join("\n");

  // refreshAll calls read functions that do not require inputs
  const refreshCalls = readFns
    .filter((fn) => !fn.inputs || fn.inputs.length === 0)
    .map((fn) => `  call_${fn.name}();`)
    .join("\n");

  return `// ============================================================
// AUTO-GENERATED by dapp-generator.js
// Contract : ${contractName}
// Network  : ${rpcUrl}  (Chain ID ${chainId})
// ============================================================

const CONTRACT_ADDRESS = '${contractAddr}';

const CONTRACT_ABI = ${JSON.stringify(abi, null, 2)};

// ── State ────────────────────────────────────────────────────
let web3;
let contract;
let currentAccount;

// ── Utilities ────────────────────────────────────────────────

function formatValue(val) {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function showTxResult(fnName, msg, type) {
  const el = document.getElementById('tx_' + fnName);
  if (!el) return;
  el.textContent = msg;
  el.className = 'tx-result ' + type;
}

function logEvent(name, data, blockNum) {
  const log = document.getElementById('eventLog');
  if (!log) return;
  // Remove placeholder
  const placeholder = log.querySelector('p');
  if (placeholder) placeholder.remove();

  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = \`<span class="ev-name">\${name}</span>
    <span class="ev-block">block \${blockNum}</span>
    <pre style="margin-top:4px;font-size:11px;color:#64748b;white-space:pre-wrap">\${data}</pre>\`;
  log.prepend(entry);
}

function refreshAll() {
${refreshCalls}
}

// ── Wallet connection ─────────────────────────────────────────

async function connectWallet() {
  if (typeof window.ethereum === 'undefined') {
    alert('MetaMask not detected. Please install it from https://metamask.io');
    return;
  }

  web3 = new Web3(window.ethereum);

  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    currentAccount = accounts[0];
  } catch (err) {
    alert('Wallet connection rejected.');
    return;
  }

  // Verify correct network
  const chainId = await web3.eth.getChainId();
  const expectedChain = ${chainId};
  const netEl = document.getElementById('networkDisplay');
  if (chainId !== expectedChain) {
    if (netEl) netEl.textContent = \`⚠ Wrong network (chain \${chainId}, expected \${expectedChain})\`;
    if (netEl) netEl.style.color = '#f87171';
  } else {
    if (netEl) netEl.textContent = \`Chain ID: \${chainId}\`;
    if (netEl) netEl.style.color = '#4ade80';
  }

  // Update UI
  const dot = document.getElementById('statusDot');
  const addrEl = document.getElementById('accountDisplay');
  const btn = document.getElementById('connectBtn');
  if (dot) dot.classList.add('connected');
  if (addrEl) addrEl.textContent = currentAccount;
  if (btn)  btn.textContent = 'Connected ✓';

  // Instantiate contract
  contract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);

  // Initial read
  refreshAll();

  // Subscribe to events
  ${eventSubs}

  // Handle account change
  window.ethereum.on('accountsChanged', (accounts) => {
    currentAccount = accounts[0] || null;
    if (addrEl) addrEl.textContent = currentAccount || 'Disconnected';
    if (dot) dot.classList.toggle('connected', !!currentAccount);
  });
}

// ── Read functions ────────────────────────────────────────────
${readFnJs}

// ── Write functions ───────────────────────────────────────────
${writeFnJs}

// ── Auto-connect on load ──────────────────────────────────────
window.addEventListener('load', () => {
  if (typeof window.ethereum !== 'undefined' && window.ethereum.selectedAddress) {
    connectWallet();
  }
});
`;
}

// ─── Write output files ───────────────────────────────────────────────────────
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const htmlPath = path.join(outDir, "index.html");
const jsPath = path.join(outDir, "app.js");

fs.writeFileSync(htmlPath, generateHTML());
fs.writeFileSync(jsPath, generateJS());

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`
╔══════════════════════════════════════════════════╗
║     ✅  DApp generated successfully!             ║
╠══════════════════════════════════════════════════╣
║  Contract : ${contractName.padEnd(35)}║
║  Address  : ${contractAddr.substring(0, 35).padEnd(35)}║
║  Network  : ${rpcUrl.padEnd(35)}║
╠══════════════════════════════════════════════════╣
║  Read functions   : ${String(readFns.length).padEnd(28)}║
║  Write functions  : ${String(writeFns.length).padEnd(28)}║
║  Events           : ${String(events.length).padEnd(28)}║
╠══════════════════════════════════════════════════╣
║  Output:                                         ║
║    ${htmlPath.padEnd(46)}║
║    ${jsPath.padEnd(46)}║
╠══════════════════════════════════════════════════╣
║  Next: cd ${outDir} && http-server -p 3000      ║
╚══════════════════════════════════════════════════╝
`);
