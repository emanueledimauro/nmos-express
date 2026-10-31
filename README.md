# NMOS Express

<p align="center">
  <img src="images/nmos-express-transparent-white.png" alt="NMOS Express Logo" width="420" />
</p>

<p align="center">
  <strong>Lightweight, offline-first Web UI, Routing Matrix, and Virtual Simulator for SMPTE ST 2110 & AMWA NMOS (IS-04 / IS-05).</strong>
</p>

<p align="center">
  <a href="README.fr.md">🇫🇷 Lire en Français</a> &nbsp;|&nbsp; <strong>🇬🇧 English</strong>
</p>

---

## 📌 Overview

**NMOS Express** is an open-source, air-gapped web application designed for broadcast facilities, live studios, and testing laboratories operating SMPTE ST 2110 IP networks.

It provides a responsive, intuitive interface to discover NMOS nodes, manage operational labels, route elementary streams via visual graphs or matrix grids, orchestrate multi-essence virtual devices, automate workflow salvos.

### Key Highlights

- **Air-Gapped & Offline-First**: Zero external CDN calls, fonts, or cloud dependencies. Runs entirely inside isolated broadcast production networks.
- **Database-Free**: State is stored in native, readable JSON files—no SQL engine, Redis, or daemon services required.
- **AMWA NMOS Compliant**: Full support for **IS-04** (Discovery & Registration v1.0 to v1.3) and **IS-05** (Device Connection Management v1.0 & v1.1).
- **SDP Profile Safety Engine**: Validates SDP stream formats (e.g. 1080i50 vs. 1080p, audio channels, packet time) before switching to prevent incompatible routes on receivers.
- **Built-in Multi-Node Simulator**: Lightweight Python script simulating 5 concurrent NMOS nodes with dynamic SDP generation for instant local testing.
- **Modern Modal & Toast Dialogs**: Polished asynchronous UI dialogs with keyboard shortcuts (Escape / Enter) replacing native blocking browser alerts.
- **Multilingual Support**: Fully localized interface in English, French, and Italian.

---

## 🖥️ Detailed Modules Breakdown

NMOS Express is organized into 8 specialized web modules, each designed for a specific operational workflow:

### 1. Routing Matrix (`index.html`)
The main control grid for rapid stream distribution in live production.
- **General Operation**: Displays sources (Senders) and destinations (Receivers) in an XY crosspoint matrix. Clicking an intersection stages and executes an IS-05 connection immediately.
- **Characteristics**:
  - Tabbed organization by equipment/node (e.g., *SNP-GATEWAY*, *RossRx*, *Neuron*).
  - Media essence selector: Video, Audio, Data, or All.
  - Expandable/collapsible equipment groups for clean navigation in high-density installations.
- **Key Features**:
  - Real-time active connection indicator (glowing green crosspoint badge).
  - Live pre-switch SDP verification: checks compatibility between sender and receiver before firing IS-05 requests.
  - Direct receiver disconnect / unpark button.
  - Search bar with instant filtering by label or stream ID.

### 2. Interactive NMOS Graph (`nmos_graph.html`)
A visual topological graph representing the physical and logical flow of media across the facility.
- **General Operation**: Automatically arranges devices into a structured 3-column architecture:
  - **Left column**: Primary Sources / Senders.
  - **Center column**: Processing Equipment & Hybrids (e.g. Vision Mixers, Color Processors, Multiviewers).
  - **Right column**: Final Destinations / Receivers.
- **Characteristics**:
  - Dynamic SVG bezier curved links connecting active subscriptions in real time.
  - Hover tooltips detailing multicast IP, port, RTP payload type, and SDP profile.
- **Key Features**:
  - **Commutation Mode**: Clicking any destination selects it, highlights only compatible sources, and temporarily filters out non-relevant media types (e.g., hides audio and data while routing video).
  - **Top Commutation Badge**: Displays an active status pill (*"Mode commutation Vidéo"*) with a 1-click cancel button that instantly restores all sources and destinations.
  - Equipment search and dynamic layout adaptation.

### 3. Virtual Devices Graph (`nmos_graph_virtual.html`)
Visual topological routing tailored for bundled multi-essence streams.
- **General Operation**: Displays logical virtual devices (bundled Video + Audio + Metadata) rather than individual elementary streams.
- **Characteristics**:
  - Simplified multi-essence link visualization: a single topological curve represents the full bundled AV connection.
- **Key Features**:
  - Visual one-click virtual routing directly on the diagram.
  - Instant visibility of which physical receivers are currently linked to which virtual production sources.

### 4. Label & SDP Profile Manager (`labels.html`)
The operational naming and signal diagnostic center.
- **General Operation**: Allows operators to assign friendly operational aliases (e.g. *"CAM 1"*, *"PGM 1"*, *"EVS A"*) to physical NMOS senders and receivers without touching device firmware.
- **Characteristics**:
  - Two-way persistence: custom labels are saved in `JSON_senders_labs.json` and `JSON_receivers_labs.json` and persist across node restarts or network rescans.
  - Live SDP Inspector: queries the active SDP manifest of each sender in real time and decodes format parameters.
- **Key Features**:
  - Real-time profile decoding: resolution, frame rate, sampling, colorimetry, audio channels (e.g. `1080i50 BT.709`, `48000-L24-2CH`).
  - One-click **"Liberate"** (*Libérer*) button: clears custom overrides and reverts to factory NMOS hardware labels with modal confirmation.
  - Filterable by equipment and media type.

### 5. Virtual Device Configurator (`virtual.html`)
Creation and management of logical multi-essence production devices.
- **General Operation**: In broadcast, a single camera or playback server comprises multiple elementary streams (1 video, 4 to 16 audio channels, 1 ANC data stream). This module bundles them into a single virtual source or destination.
- **Characteristics**:
  - Clean master-detail editor for Virtual Sources and Virtual Destinations.
  - Strict essence validation: prevents assigning duplicate streams or mismatched formats.
- **Key Features**:
  - Dropdown selectors mapped to available physical senders/receivers.
  - Instant creation, modification, and deletion with styled modal confirmation.
  - Enables true 1-click "Full-Take" switching across all essences in matrix and panel modules.

### 6. Automation & Workflows Engine (`workflow.html`)
Automation rule builder for operational salvos and event-driven switching.
- **General Operation**: Allows engineers to construct multi-step routing macros and automated policies (e.g., *"When PGM routes to Line 1, also switch Audio Monitor and Multiviewer 4"*).
- **Characteristics**:
  - Visual rule cards with triggers, condition gates, and action sequences.
  - Live syntax and device existence validator (flags missing or renamed endpoints).
- **Key Features**:
  - Macro duplication and reordering.
  - Execution status notifications (success toasts, error reporting).
  - Export and import of automation rules.

### 7. Touch Remote Panel (`panel.html`)
High-contrast hardware-style control panel optimized for touchscreens and operator desks.
- **General Operation**: Emulates physical broadcast hardware router panels (e.g. 1RU/2RU push-button panels) for rapid, mistake-free routing during live broadcasts.
- **Characteristics**:
  - High-contrast dark theme with large, touch-friendly tactile push buttons.
  - Broadcast color coding: Amber/Red for selected destination, Green for active source, Blue for staged.
- **Key Features**:
  - Media essence selector: Video, Audio, Data, or Virtual.
  - Instant virtual full-take switching.
  - Standalone layout with embedded language switcher, ideal for dedicated kiosk tablets or secondary monitors.

### 8. Node Registry & Health Monitor (`nodes.html`)
The central management and diagnostic hub for all connected NMOS equipment.
- **General Operation**: Manages registered NMOS node base URLs (`config.nodes.json`) and monitors network reachability.
- **Characteristics**:
  - Dynamic status indicators: real-time green/red health dots testing HTTP/IS-04 reachability via IPv4-optimized background pings.
  - Auto-Discovery modal: enter an IP address and port, click **"Detect"**, and the system automatically queries `/x-nmos/node/` to list supported IS-04 versions (`v1.0`, `v1.1`, `v1.2`, `v1.3`).
- **Key Features**:
  - **Single Node Update**: Crawl and update resources for a single piece of equipment without impacting others.
  - **Update NMOS Database**: Full crawl across all registered nodes: fetches devices, flows, senders, receivers, maps connection endpoints, and purges obsolete devices.
  - Safe node removal with styled confirmation modal.

---

## 🛠️ Architecture

```
nmos-express/
├── images/                  # Application branding & icons
├── json/                    # State & configuration caches (nodes, senders, receivers, profiles, i18n)
├── lib/
│   ├── css/                 # Offline stylesheets (Tailwind, FontAwesome, modal.css, page styles)
│   └── js/                  # Frontend controllers, menu loader, modal/toast engine, i18n
├── php/                     # Backend APIs, switch engines & IS-04/IS-05 crawler
├── *.html                   # Application UI views (matrix, graph, labels, virtual, workflows, panel, nodes)
├── nmos_simulator.py        # Autonomous multi-node Python simulator
├── README.md                # Documentation (English)
├── README.fr.md             # Documentation (Français)
└── LICENSE                  # MIT License
```

---

## 💻 Getting Started

### Prerequisites

- **PHP 7.4+** or **PHP 8.x** with the `php-curl` and `php-json` extensions enabled.
- A modern web browser (Google Chrome, Mozilla Firefox, Microsoft Edge, Safari).
- *(Optional)* **Python 3.8+** (standard library only) to run the virtual node simulator.

### 1. Installation

Clone or download the repository into your web server directory:

```bash
git clone https://github.com/your-username/nmos-express.git
cd nmos-express
```

### 2. Launching the Web Server

You can use the built-in PHP development server:

```bash
php -S localhost:8000
```

Open your browser at `http://localhost:8000/`.

---

## 🧪 Testing with the NMOS Virtual Simulator

Don't have access to a physical SMPTE ST 2110 / NMOS infrastructure? NMOS Express comes with an autonomous Python simulator (`nmos_simulator.py`) requiring **zero external dependencies** (no `pip install`).

### 1. Start the simulator

In a separate terminal window:

```bash
python nmos_simulator.py
```

The simulator automatically:
- Backs up your physical configuration files to `*.real.json`.
- Spins up **5 independent multi-threaded HTTP servers** on loopback ports:
  - `8001`: `SNP-GATEWAY11` (IS-04 Node, Devices, Flows & Senders)
  - `8002`: `SNP-GATEWAY-MONITOR1` (IS-04 Node, Devices & Receivers)
  - `8003`: `RossRx01` (Receivers)
  - `8004`: `RossRx02` (Receivers)
  - `8005`: `NEURON-COLOR` (Hybrid Processing Node with Senders & Receivers)
- Exposes dynamic ST 2110 SDP endpoints (`/sdp/<sender_id>`) with stable multicast addresses (`239.100.x.x`).
- Emulates **IS-05 staged & active patches** with immediate state reflection.

### 2. Restoring Real Infrastructure IPs

When moving back to a real production network:

```bash
python nmos_simulator.py --restore
```

This restores your original physical IP endpoints without any data loss.

---

## ⚙️ Configuration

### Adding Real NMOS Nodes

1. Open `http://localhost:8000/nodes.html`.
2. Click **"Add a Node"** (*Ajouter un noeud*).
3. Enter the equipment IP address and port (e.g. `192.168.1.50`, port `8080`).
4. Click **"Detect"** to query `/x-nmos/node/` and retrieve available IS-04 versions.
5. Save and click **"Update NMOS Database"** to crawl devices, flows, senders, and receivers.

---

## 🔒 Security & Best Practices

- NMOS Express communicates directly with equipment control cards over HTTP/HTTPS. Ensure it is deployed on a dedicated management or broadcast control VLAN.
- Files named `*.real.json` contain internal equipment identifiers and IPs. They are ignored by `.gitignore` by default to prevent leaking private network topologies.

---

## 👤 Author & Credits

- **Author**: Emanuele Di Mauro
- **Organization**: IIFA Media180
- **Project**: NMOS Express (Version 1.0)
- **Copyright**: &copy; 2026 Emanuele Di Mauro &mdash; IIFA Media180. All rights reserved.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
