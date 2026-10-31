#!/usr/bin/env python3
"""
NMOS Express - Virtual Node Simulator (nmos_simulator.py)
---------------------------------------------------------
Simulateur multi-nœuds léger et autonome (IS-04 & IS-05) pour tester NMOS Express
en local sans infrastructure SMPTE ST 2110 physique.

Usage :
    python nmos_simulator.py           # Démarre la simulation sur les ports 8001 à 8005
    python nmos_simulator.py --setup   # Configure config.nodes.json pour pointer sur 127.0.0.1
    python nmos_simulator.py --restore # Restaure config.nodes.json d'origine (IPs physiques)
"""

import sys
import os
import json
import time
import hashlib
import threading
from http.server import HTTPServer, ThreadingHTTPServer, BaseHTTPRequestHandler
import urllib.parse

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
JSON_DIR   = os.path.join(SCRIPT_DIR, 'json')
CONFIG_NODES_PATH = os.path.join(JSON_DIR, 'config.nodes.json')
CONFIG_NODES_BAK  = os.path.join(JSON_DIR, 'config.nodes.real.json')

JSON_DEVICES_PATH   = os.path.join(JSON_DIR, 'JSON_devices.json')
JSON_SENDERS_PATH   = os.path.join(JSON_DIR, 'JSON_senders.json')
JSON_SENDERS_BAK    = os.path.join(JSON_DIR, 'JSON_senders.real.json')
JSON_RECEIVERS_PATH = os.path.join(JSON_DIR, 'JSON_receivers.json')
JSON_RECEIVERS_BAK  = os.path.join(JSON_DIR, 'JSON_receivers.real.json')
JSON_ENRICHED_PATH  = os.path.join(JSON_DIR, 'JSON_nodes_enriched.json')

# Ports attribués aux 5 équipements par défaut
DEFAULT_NODES_MAPPING = [
    {
        "port": 8001,
        "node_name": "SNP-GATEWAY11",
        "alt_name": "SNP-GATEWAY1",
        "node_id": "755f521c-9a7c-58da-bc8e-971ff91662a5"
    },
    {
        "port": 8002,
        "node_name": "SNP-GATEWAY-MONITOR1",
        "alt_name": "SNP-GATEWAY-MONITOR1",
        "node_id": "c820e143-843c-530f-a0b5-5d6026e1770b"
    },
    {
        "port": 8003,
        "node_name": "RossRx01",
        "alt_name": "RossRx01",
        "node_id": "31040ddf-b68f-52a5-909f-81d10c836d3d"
    },
    {
        "port": 8004,
        "node_name": "RossRx02",
        "alt_name": "RossRx02",
        "node_id": "379eee78-0305-5009-afd5-f558b8f218d5"
    },
    {
        "port": 8005,
        "node_name": "NEURON-COLOR ",
        "alt_name": "NEURON-COLOR",
        "node_id": "75c14bec-caed-5ded-bd55-958f23da5b0c"
    }
]

def load_json(path, default=None):
    if not os.path.exists(path):
        return default if default is not None else []
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"[WARN] Erreur lecture {path}: {e}")
        return default if default is not None else []

def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

# Mémorisation déterministe des adresses Multicast
MULTICAST_CACHE = {}

def get_deterministic_multicast(sender_id, media_type):
    if sender_id in MULTICAST_CACHE:
        return MULTICAST_CACHE[sender_id]

    # Dérivation stable basée sur le hash MD5 du sender_id
    h = int(hashlib.md5(sender_id.encode('utf-8')).hexdigest()[:8], 16)
    last_octet = (h % 240) + 10  # 10 à 250
    
    mt = (media_type or 'video').lower()
    if 'audio' in mt:
        mcast_ip = f"239.100.2.{last_octet}"
        port = 5004
    elif 'data' in mt:
        mcast_ip = f"239.100.3.{last_octet}"
        port = 5006
    else: # video
        mcast_ip = f"239.100.1.{last_octet}"
        port = 5000

    MULTICAST_CACHE[sender_id] = (mcast_ip, port)
    return mcast_ip, port

def generate_sdp(sender_id, label, media_type):
    mcast_ip, port = get_deterministic_multicast(sender_id, media_type)
    mt = (media_type or 'video').lower()
    clean_label = (label or sender_id).replace(" ", "_")

    if 'audio' in mt:
        # ST 2110-30 Audio (2 canaux 48kHz L24) -> Profil: 48000-L24-2CH
        sdp = (
            f"v=0\r\n"
            f"o=- {int(time.time())} {int(time.time())} IN IP4 127.0.0.1\r\n"
            f"s={clean_label}\r\n"
            f"t=0 0\r\n"
            f"m=audio {port} RTP/AVP 97\r\n"
            f"c=IN IP4 {mcast_ip}/32\r\n"
            f"a=rtpmap:97 L24/48000/2\r\n"
            f"a=ptime:1\r\n"
            f"a=mediaclk:direct=0\r\n"
            f"a=ts-refclk:localmac=00-00-00-00-00-00\r\n"
        )
    elif 'data' in mt:
        # ST 2110-40 ANC Data -> Profil: ANC-2110-40
        sdp = (
            f"v=0\r\n"
            f"o=- {int(time.time())} {int(time.time())} IN IP4 127.0.0.1\r\n"
            f"s={clean_label}\r\n"
            f"t=0 0\r\n"
            f"m=application {port} RTP/AVP 100\r\n"
            f"c=IN IP4 {mcast_ip}/32\r\n"
            f"a=rtpmap:100 smpte291/90000\r\n"
            f"a=fmtp:100 DID_SDID={{0x41,0x05}}\r\n"
            f"a=mediaclk:direct=0\r\n"
        )
    else:
        # ST 2110-20 Video HD 1080i50 -> Profil: 1080i50
        sdp = (
            f"v=0\r\n"
            f"o=- {int(time.time())} {int(time.time())} IN IP4 127.0.0.1\r\n"
            f"s={clean_label}\r\n"
            f"t=0 0\r\n"
            f"m=video {port} RTP/AVP 96\r\n"
            f"c=IN IP4 {mcast_ip}/32\r\n"
            f"a=rtpmap:96 raw/90000\r\n"
            f"a=fmtp:96 sampling=YCbCr-4:2:2; width=1920; height=1080; exactframerate=25/1; depth=10; TCS=SDR; colorimetry=BT709; interlace\r\n"
            f"a=mediaclk:direct=0\r\n"
            f"a=ts-refclk:localmac=00-00-00-00-00-00\r\n"
        )
    return sdp


class NodeSimulatorHandler(BaseHTTPRequestHandler):
    """Gère les requêtes HTTP d'un nœud virtuel NMOS (IS-04 et IS-05)"""

    def log_message(self, format, *args):
        # Silence le logging verbeux par défaut
        pass

    def _send_cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Accept')

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors()
        self.end_headers()

    def do_GET(self):
        node = self.server.node_info
        port = self.server.port
        path = self.path.split('?')[0].rstrip('/') + '/'
        raw_path = self.path.split('?')[0]

        # 0. Root
        if path == '/':
            self.send_response(200)
            self._send_cors()
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(f"NMOS Simulated Node: {node['node_name']} (Port {port})".encode('utf-8'))
            return

        # 1. Découverte de versions IS-04 (/x-nmos/node/)
        if path == '/x-nmos/node/':
            self._send_json(["v1.0/", "v1.1/", "v1.2/", "v1.3/"])
            return

        # 2. Endpoints racine du nœud (/x-nmos/node/v1.3/)
        if path in ['/x-nmos/node/v1.3/', '/x-nmos/node/v1.2/', '/x-nmos/node/v1.1/', '/x-nmos/node/v1.0/']:
            self._send_json(["self/", "devices/", "sources/", "flows/", "senders/", "receivers/"])
            return

        # 3. Self (Identité du nœud)
        if '/self/' in path:
            self_obj = {
                "id": node['node_id'],
                "version": "1600000000:0",
                "label": node['node_name'],
                "description": f"Simulated NMOS Node {node['node_name']}",
                "href": f"http://127.0.0.1:{port}/",
                "api": {
                    "versions": ["v1.0", "v1.1", "v1.2", "v1.3"],
                    "endpoints": [{"host": "127.0.0.1", "port": port, "protocol": "http"}]
                },
                "caps": {},
                "services": [],
                "clocks": [],
                "interfaces": []
            }
            self._send_json(self_obj)
            return

        # 4. Devices
        if '/devices/' in path:
            dev_list = self.server.get_devices()
            self._send_json(dev_list)
            return

        # 5. Senders
        if '/senders/' in path and not '/connection/' in path:
            senders_list = self.server.get_senders()
            self._send_json(senders_list)
            return

        # 6. Receivers
        if '/receivers/' in path and not '/connection/' in path:
            receivers_list = self.server.get_receivers()
            self._send_json(receivers_list)
            return

        # 7. Sources & Flows
        if '/flows/' in path:
            flows_list = self.server.get_flows()
            self._send_json(flows_list)
            return

        if '/sources/' in path:
            self._send_json([])
            return

        # 8. Récupération SDP à la volée (/sdp/<sender_id>)
        if raw_path.startswith('/sdp/'):
            sender_id = raw_path.split('/sdp/')[1].strip('/')
            sender = self.server.find_sender(sender_id)
            media_type = sender.get('mediatype', 'video') if sender else 'video'
            label = sender.get('label', sender_id) if sender else sender_id
            
            sdp_content = generate_sdp(sender_id, label, media_type)
            
            self.send_response(200)
            self._send_cors()
            self.send_header('Content-Type', 'application/sdp')
            self.send_header('Content-Length', str(len(sdp_content.encode('utf-8'))))
            self.send_header('Connection', 'close')
            self.end_headers()
            self.wfile.write(sdp_content.encode('utf-8'))
            print(f"  [SDP] Port {port}: Servis SDP ({media_type}) pour {label}")
            return

        # 9. IS-05 Connection API : GET /active
        if '/connection/' in raw_path and raw_path.endswith('/active'):
            # /x-nmos/connection/v1.1/single/receivers/<id>/active
            parts = raw_path.split('/')
            receiver_id = parts[-2]
            state = self.server.get_active_state(receiver_id)
            self._send_json(state)
            return

        # Non trouvé
        self.send_response(404)
        self._send_cors()
        self.end_headers()
        self.wfile.write(b"Not Found in NMOS Simulator")

    def do_PATCH(self):
        """Gère les commutations NMOS IS-05 (PATCH /staged)"""
        node = self.server.node_info
        port = self.server.port
        raw_path = self.path.split('?')[0]

        if '/connection/' in raw_path and raw_path.endswith('/staged'):
            content_len = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_len).decode('utf-8')
            try:
                patch_data = json.loads(post_body)
            except Exception:
                patch_data = {}

            # Extraction receiver_id
            parts = raw_path.split('/')
            receiver_id = parts[-2]

            sender_id = patch_data.get('sender_id')
            master_enable = patch_data.get('master_enable', True)

            # Enregistrer la commutation en mémoire
            self.server.apply_switch(receiver_id, sender_id, patch_data.get('transport_file'))

            # Trouver les labels pour un affichage clair dans la console
            sender = self.server.find_sender_global(sender_id) if sender_id else None
            receiver = self.server.find_receiver(receiver_id)

            s_label = (sender.get('custom_label') or sender.get('label') or sender_id) if sender else str(sender_id)
            r_label = (receiver.get('custom_label') or receiver.get('label') or receiver_id) if receiver else receiver_id

            print(f"  \033[92m[SWITCH IS-05 REÇU]\033[0m Port {port} ({node['node_name']}):")
            print(f"    -> Destination : {r_label}")
            print(f"    -> Source      : {s_label}")
            print(f"    -> Statut      : ACTIF (Commuté avec succès)")

            resp_payload = {
                "activation": {
                    "mode": "activate_immediate",
                    "requested_time": None,
                    "activation_time": f"{int(time.time())}:0"
                },
                "master_enable": master_enable,
                "sender_id": sender_id,
                "transport_file": patch_data.get('transport_file')
            }
            self._send_json(resp_payload)
            return

        self.send_response(404)
        self._send_cors()
        self.end_headers()

    def _send_json(self, data):
        body = json.dumps(data, indent=2, ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self._send_cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(body)


class SimulatedNodeServer(ThreadingHTTPServer):
    def __init__(self, host, port, node_info, all_data):
        super().__init__((host, port), NodeSimulatorHandler)
        self.port = port
        self.node_info = node_info
        self.all_data = all_data
        self.active_connections = {}  # receiver_id -> { sender_id, transport_file }
        self._init_resources()

    def _init_resources(self):
        nid = self.node_info['node_id']
        alt = self.node_info.get('alt_name', '')
        name = self.node_info.get('node_name', '')

        # Filtrer senders pour ce nœud
        self.senders = [
            s for s in self.all_data['senders']
            if s.get('node_id') == nid or s.get('equipement') == name or (alt and s.get('equipement') == alt)
        ]
        # Filtrer receivers pour ce nœud
        self.receivers = [
            r for r in self.all_data['receivers']
            if r.get('node_id') == nid or r.get('equipement') == name or (alt and r.get('equipement') == alt)
        ]
        # Filtrer devices pour ce nœud
        self.devices = [
            d for d in self.all_data['devices']
            if d.get('node_id') == nid or (d.get('label', '').startswith(name) or (alt and d.get('label', '').startswith(alt)))
        ]

        # Initialiser active_connections d'après les JSON
        for r in self.receivers:
            if r.get('subscription_active') and r.get('subscription_sender_id'):
                self.active_connections[r['id']] = {
                    'sender_id': r['subscription_sender_id'],
                    'transport_file': None
                }

    def get_devices(self):
        # Formater les devices au standard IS-04 avec sr-ctrl IS-05
        res = []
        for d in self.devices:
            did = d.get('id') or f"{self.node_info['node_id']}-dev1"
            res.append({
                "id": did,
                "version": "1600000000:0",
                "label": d.get('label') or f"{self.node_info['node_name']}-device1",
                "type": "urn:x-nmos:device:generic",
                "node_id": self.node_info['node_id'],
                "senders": [s['id'] for s in self.senders if s.get('device_id') == did or not s.get('device_id')],
                "receivers": [r['id'] for r in self.receivers if r.get('device_id') == did or not r.get('device_id')],
                "controls": [
                    {
                        "type": "urn:x-nmos:control:sr-ctrl/v1.1",
                        "href": f"http://127.0.0.1:{self.port}/x-nmos/connection/v1.1/"
                    }
                ]
            })
        if not res:
            # Fallback 1 device si aucun
            res.append({
                "id": f"{self.node_info['node_id']}-device1",
                "version": "1600000000:0",
                "label": f"{self.node_info['node_name']}-device1",
                "type": "urn:x-nmos:device:generic",
                "node_id": self.node_info['node_id'],
                "controls": [{
                    "type": "urn:x-nmos:control:sr-ctrl/v1.1",
                    "href": f"http://127.0.0.1:{self.port}/x-nmos/connection/v1.1/"
                }]
            })
        return res

    def get_senders(self):
        # Format IS-04 Senders
        res = []
        for s in self.senders:
            sid = s['id']
            mt = s.get('mediatype', 'video').lower()
            fmt = "urn:x-nmos:format:video" if mt == 'video' else ("urn:x-nmos:format:audio" if mt == 'audio' else "urn:x-nmos:format:data")
            res.append({
                "id": sid,
                "version": "1600000000:0",
                "label": s.get('label') or sid,
                "device_id": s.get('device_id') or f"{self.node_info['node_id']}-device1",
                "manifest_href": f"http://127.0.0.1:{self.port}/sdp/{sid}",
                "flow_id": f"{sid}-flow",
                "format": fmt,
                "transport": "urn:x-nmos:transport:rtp.mcast"
            })
        return res

    def get_flows(self):
        # Format IS-04 Flows
        res = []
        for s in self.senders:
            sid = s['id']
            mt = s.get('mediatype', 'video').lower()
            fmt = "urn:x-nmos:format:video" if mt == 'video' else ("urn:x-nmos:format:audio" if mt == 'audio' else "urn:x-nmos:format:data")
            res.append({
                "id": f"{sid}-flow",
                "version": "1600000000:0",
                "label": f"{s.get('label') or sid} Flow",
                "format": fmt,
                "device_id": s.get('device_id') or f"{self.node_info['node_id']}-device1",
                "source_id": f"{sid}-source"
            })
        return res

    def get_receivers(self):
        # Format IS-04 Receivers
        res = []
        for r in self.receivers:
            rid = r['id']
            mt = r.get('mediatype', 'video').lower()
            fmt = "urn:x-nmos:format:video" if mt == 'video' else ("urn:x-nmos:format:audio" if mt == 'audio' else "urn:x-nmos:format:data")
            conn = self.active_connections.get(rid, {})
            sub_active = bool(conn.get('sender_id'))
            sub_id = conn.get('sender_id')

            res.append({
                "id": rid,
                "version": "1600000000:0",
                "label": r.get('label') or rid,
                "device_id": r.get('device_id') or f"{self.node_info['node_id']}-device1",
                "format": fmt,
                "transport": "urn:x-nmos:transport:rtp.mcast",
                "subscription": {
                    "active": sub_active,
                    "sender_id": sub_id
                }
            })
        return res

    def find_sender(self, sender_id):
        return next((s for s in self.senders if s['id'] == sender_id), None)

    def find_receiver(self, receiver_id):
        return next((r for r in self.receivers if r['id'] == receiver_id), None)

    def find_sender_global(self, sender_id):
        return next((s for s in self.all_data['senders'] if s['id'] == sender_id), None)

    def get_active_state(self, receiver_id):
        conn = self.active_connections.get(receiver_id, {})
        sender_id = conn.get('sender_id')
        return {
            "sender_id": sender_id,
            "master_enable": bool(sender_id),
            "activation": {
                "mode": "activate_immediate",
                "requested_time": None,
                "activation_time": f"{int(time.time())}:0"
            },
            "transport_file": conn.get('transport_file')
        }

    def apply_switch(self, receiver_id, sender_id, transport_file):
        self.active_connections[receiver_id] = {
            'sender_id': sender_id,
            'transport_file': transport_file
        }

        # Synchroniser également JSON_receivers.json localement
        receivers = load_json(JSON_RECEIVERS_PATH, [])
        changed = False
        for r in receivers:
            if r.get('id') == receiver_id:
                r['subscription_active'] = bool(sender_id)
                r['subscription_sender_id'] = sender_id
                changed = True
                break
        if changed:
            try:
                save_json(JSON_RECEIVERS_PATH, receivers)
            except Exception as e:
                print(f"[WARN] Erreur synchronisation JSON_receivers: {e}")


def find_port_for_item(item):
    node_id = item.get('node_id') or item.get('device_node_id')
    label = item.get('label') or ''
    dev_label = item.get('device_label') or ''
    for m in DEFAULT_NODES_MAPPING:
        if node_id and node_id == m['node_id']:
            return m['port']
        if m['node_name'].lower().strip() in label.lower() or m['alt_name'].lower().strip() in label.lower() or m['alt_name'].lower().strip() in dev_label.lower():
            return m['port']
    return 8001


def setup_local_config():
    """Bascule config.nodes.json, JSON_senders.json et JSON_receivers.json vers 127.0.0.1:8001..8005"""
    # 1. config.nodes.json
    current_nodes = load_json(CONFIG_NODES_PATH, [])
    if not os.path.exists(CONFIG_NODES_BAK) and current_nodes:
        save_json(CONFIG_NODES_BAK, current_nodes)
        print(f"[OK] Sauvegarde config.nodes.json -> config.nodes.real.json")

    simulated_config = []
    for item in DEFAULT_NODES_MAPPING:
        simulated_config.append({
            "node_api": f"http://127.0.0.1:{item['port']}/x-nmos/node/v1.3/",
            "node_name": item['node_name']
        })
    save_json(CONFIG_NODES_PATH, simulated_config)
    print(f"\033[92m[OK] config.nodes.json mis a jour vers 127.0.0.1:8001 a 8005 !\033[0m")

    # 2. JSON_senders.json
    senders = load_json(JSON_SENDERS_PATH, [])
    if senders:
        if not os.path.exists(JSON_SENDERS_BAK):
            save_json(JSON_SENDERS_BAK, senders)
            print(f"[OK] Sauvegarde JSON_senders.json -> JSON_senders.real.json")
        for s in senders:
            sid = s.get('id')
            port = find_port_for_item(s)
            s['sdp_href'] = f"http://127.0.0.1:{port}/sdp/{sid}"
            s['control_href'] = f"http://127.0.0.1:{port}/x-nmos/connection/v1.1/single/senders/{sid}/"
        save_json(JSON_SENDERS_PATH, senders)
        print(f"\033[92m[OK] JSON_senders.json mis a jour vers 127.0.0.1 (sdp_href et control_href) !\033[0m")

    # 3. JSON_receivers.json
    receivers = load_json(JSON_RECEIVERS_PATH, [])
    if receivers:
        if not os.path.exists(JSON_RECEIVERS_BAK):
            save_json(JSON_RECEIVERS_BAK, receivers)
            print(f"[OK] Sauvegarde JSON_receivers.json -> JSON_receivers.real.json")
        for r in receivers:
            rid = r.get('id')
            port = find_port_for_item(r)
            r['control_href'] = f"http://127.0.0.1:{port}/x-nmos/connection/v1.1/single/receivers/{rid}/"
        save_json(JSON_RECEIVERS_PATH, receivers)
        print(f"\033[92m[OK] JSON_receivers.json mis a jour vers 127.0.0.1 (control_href) !\033[0m")


def restore_real_config():
    """Restaure les fichiers JSON d'origine (IPs physiques réelles)"""
    restored = 0
    if os.path.exists(CONFIG_NODES_BAK):
        save_json(CONFIG_NODES_PATH, load_json(CONFIG_NODES_BAK))
        print(f"\033[92m[OK] config.nodes.json restaure depuis config.nodes.real.json\033[0m")
        restored += 1
    if os.path.exists(JSON_SENDERS_BAK):
        save_json(JSON_SENDERS_PATH, load_json(JSON_SENDERS_BAK))
        print(f"\033[92m[OK] JSON_senders.json restaure depuis JSON_senders.real.json\033[0m")
        restored += 1
    if os.path.exists(JSON_RECEIVERS_BAK):
        save_json(JSON_RECEIVERS_PATH, load_json(JSON_RECEIVERS_BAK))
        print(f"\033[92m[OK] JSON_receivers.json restaure depuis JSON_receivers.real.json\033[0m")
        restored += 1

    if restored == 0:
        print("[INFO] Aucun fichier .real.json trouve a restaurer.")


def main():
    if '--restore' in sys.argv:
        restore_real_config()
        return

    if '--setup' in sys.argv or '--enable' in sys.argv:
        setup_local_config()
        return

    print("=" * 65)
    print("   [NMOS] NMOS EXPRESS - SIMULATEUR DE NOEUDS SMPTE 2110 (IS-04/IS-05)")
    print("=" * 65)

    # Vérification config.nodes.json
    cfg = load_json(CONFIG_NODES_PATH, [])
    is_localhost = any('127.0.0.1' in n.get('node_api', '') or 'localhost' in n.get('node_api', '') for n in cfg)

    if not is_localhost:
        print("\n[NOTE] config.nodes.json pointe actuellement sur des IPs réelles (192.168.x.x).")
        print("       Bascule automatique en mode simulation locale (127.0.0.1)...")
        setup_local_config()
        print("       (Vos IPs réelles sont conservées dans config.nodes.real.json)\n")

    # Chargement des bases
    all_data = {
        'senders': load_json(JSON_SENDERS_PATH, []),
        'receivers': load_json(JSON_RECEIVERS_PATH, []),
        'devices': load_json(JSON_DEVICES_PATH, []),
    }

    servers = []
    threads = []

    print("Démarrage des serveurs virtuels :")
    for mapping in DEFAULT_NODES_MAPPING:
        port = mapping['port']
        name = mapping['node_name']
        try:
            srv = SimulatedNodeServer('127.0.0.1', port, mapping, all_data)
            t = threading.Thread(target=srv.serve_forever, daemon=True)
            t.start()
            servers.append(srv)
            threads.append(t)
            s_count = len(srv.senders)
            r_count = len(srv.receivers)
            print(f"  [+] Port {port} -> \033[1m{name.strip()}\033[0m ({s_count} Senders, {r_count} Receivers)")
        except Exception as e:
            print(f"  [-] Erreur démarrage sur port {port}: {e}")

    print("-" * 65)
    print("[*] Le simulateur est EN LIGNE !")
    print("   - API IS-04 active sur http://127.0.0.1:8001/ à 8005/")
    print("   - Générateur SDP actif sur http://127.0.0.1:8001/sdp/<id>")
    print("   - Commutations IS-05 actives sur http://127.0.0.1:8001/x-nmos/connection/v1.1/")
    print("\n[i] Ouvrez maintenant NMOS Express dans votre navigateur.")
    print("   Appuyez sur Ctrl+C pour arrêter le simulateur.")
    print("=" * 65 + "\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[INFO] Arrêt des serveurs NMOS...")
        for s in servers:
            s.shutdown()
        print("[OK] Simulateur arrêté. À bientôt !")


if __name__ == '__main__':
    main()
