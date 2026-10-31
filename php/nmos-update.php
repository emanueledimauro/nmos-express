<?php
/**
 * NMOS Investigator - Resilient Version with JSON output
 * Handles full update or single-node partial update.
 * Non-destructive: if a node is offline, its existing data is preserved.
 */

ini_set('display_errors', '0');
error_reporting(E_ALL);

define('INPUT_FILE',  dirname(__DIR__) . '/json/config.nodes.json');
define('OUTPUT_DIR',  dirname(__DIR__) . '/json');
define('CONNECT_TIMEOUT_SEC', 2);
define('TIMEOUT_SEC', 3);

define('SENDERS_LABS_FILE',   dirname(__DIR__) . '/json/JSON_senders_labs.json');
define('RECEIVERS_LABS_FILE', dirname(__DIR__) . '/json/JSON_receivers_labs.json');

function urlJoin($base, $suffix) {
    return rtrim($base, '/') . '/' . ltrim($suffix, '/');
}

function httpGetJsonSafe($url) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => CONNECT_TIMEOUT_SEC,
        CURLOPT_TIMEOUT        => TIMEOUT_SEC,
        CURLOPT_HTTPHEADER     => ['Accept: application/json']
    ]);

    $body = curl_exec($ch);
    $err  = curl_error($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($body === false) {
        return [false, "cURL error: $err"];
    }
    if ($code < 200 || $code >= 300) {
        return [false, "HTTP $code: " . substr($body, 0, 200)];
    }

    $json = json_decode($body, true);
    if (!is_array($json)) {
        return [false, "Invalid JSON"];
    }

    return [true, $json];
}

function readJsonFile($path, $default) {
    if (!file_exists($path)) return $default;
    $d = json_decode(file_get_contents($path), true);
    return is_array($d) ? $d : $default;
}

function writeJson($path, $data) {
    file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
}

function labsListToMap($list) {
    $m = [];
    foreach ($list as $x) {
        if (isset($x['id'], $x['label'])) $m[$x['id']] = $x['label'];
    }
    return $m;
}

function pickMaxSrCtrlHref($controls) {
    $best = null;
    foreach ($controls as $c) {
        if (!isset($c['type'], $c['href'])) continue;
        if (preg_match('#urn:x-nmos:control:sr-ctrl/v(\d+)\.(\d+)$#', $c['type'], $m)) {
            $ver = [intval($m[1]), intval($m[2])];
            if (!$best || $ver > $best['ver']) {
                $best = ['ver' => $ver, 'href' => $c['href'], 'type' => $c['type']];
            }
        }
    }
    return $best ? ['href' => $best['href'], 'type' => $best['type']] : null;
}

function mediaTypeFromFormat($f) {
    if (!is_string($f)) return null;
    if (preg_match('#urn:x-nmos:format:([a-zA-Z0-9_-]+)$#', $f, $m)) return strtolower($m[1]);
    $p = explode(':', $f);
    return strtolower(end($p));
}

function buildIs05Href($ctrl, $kind, $id) {
    if (!$ctrl) return null;
    return rtrim($ctrl, '/') . "/single/$kind/$id/";
}

function fetchNodeResources($api, $nodeName, $sendLabs, $recLabs, &$errors) {
    // 1. SELF
    list($ok, $self) = httpGetJsonSafe(urlJoin($api, 'self/'));
    if (!$ok) {
        $errors[] = ['node_api' => $api, 'step' => 'self', 'error' => $self];
        return null;
    }

    $nid = $self['id'] ?? null;
    if (!$nid) {
        $errors[] = ['node_api' => $api, 'step' => 'self', 'error' => 'Missing node ID in self response'];
        return null;
    }

    $nodeEntry = [
        'id'          => $nid,
        'label'       => $self['label'] ?? null,
        'description' => $self['description'] ?? null,
        'node_api'    => $api,
        'node_name'   => $nodeName
    ];

    // 2. DEVICES
    list($ok, $devices) = httpGetJsonSafe(urlJoin($api, 'devices/'));
    if (!$ok) {
        $errors[] = ['node_api' => $api, 'step' => 'devices', 'error' => $devices];
        $devices = [];
    }

    $devEntries = [];
    $deviceMap = [];

    foreach ($devices as $dev) {
        $id = $dev['id'] ?? null;
        if (!$id) continue;
        $sr = isset($dev['controls']) ? pickMaxSrCtrlHref($dev['controls']) : null;

        $devEntries[] = [
            'id'               => $id,
            'label'            => $dev['label'] ?? null,
            'description'      => $dev['description'] ?? null,
            'senders'          => $dev['senders'] ?? [],
            'receivers'        => $dev['receivers'] ?? [],
            'sr_ctrl'          => $sr,
            'node_id'          => $nid,
            'node_label'       => $self['label'] ?? null,
            'node_description' => $self['description'] ?? null,
            'node_api'         => $api,
            'node_name'        => $nodeName
        ];

        $deviceMap[$id] = [
            'label'        => $dev['label'] ?? null,
            'node_id'      => $nid,
            'node_name'    => $nodeName,
            'sr_ctrl_href' => $sr['href'] ?? null
        ];
    }

    // 3. FLOWS
    list($ok, $flows) = httpGetJsonSafe(urlJoin($api, 'flows/'));
    if (!$ok) {
        $errors[] = ['node_api' => $api, 'step' => 'flows', 'error' => $flows];
        $flows = [];
    }
    $flowType = [];
    foreach ($flows as $f) {
        if (isset($f['id'])) {
            $flowType[$f['id']] = mediaTypeFromFormat($f['format'] ?? null);
        }
    }

    // 4. SENDERS
    list($ok, $senders) = httpGetJsonSafe(urlJoin($api, 'senders/'));
    if (!$ok) {
        $errors[] = ['node_api' => $api, 'step' => 'senders', 'error' => $senders];
        $senders = [];
    }

    $sendEntries = [];
    foreach ($senders as $s) {
        $sid = $s['id'] ?? null;
        if (!$sid) continue;
        $flowId = $s['flow_id'] ?? null;
        $labelNmos = $s['label'] ?? null;
        $mt = ($flowId && isset($flowType[$flowId]))
            ? $flowType[$flowId]
            : (mediaTypeFromFormat($s['format'] ?? null) ?? (stripos($labelNmos ?? '', 'audio') !== false ? 'audio' : (stripos($labelNmos ?? '', 'data') !== false ? 'data' : 'video')));
        $did = $s['device_id'] ?? null;
        $deviceLabel = $deviceMap[$did]['label'] ?? null;
        $srHref = $deviceMap[$did]['sr_ctrl_href'] ?? null;
        $ctrl = buildIs05Href($srHref, 'senders', $sid);

        $labelNmos = $s['label'] ?? null;
        $custom    = $sendLabs[$sid] ?? null;

        $sendEntries[] = [
            'id'           => $sid,
            'label'        => $labelNmos,
            'custom_label' => $custom,
            'equipement'   => $nodeName,
            'mediatype'    => $mt,
            'device_id'    => $did,
            'device_label' => $deviceLabel,
            'node_id'      => $deviceMap[$did]['node_id'] ?? $nid,
            'sdp_href'     => $s['manifest_href'] ?? null,
            'control_href' => $ctrl
        ];
    }

    // 5. RECEIVERS
    list($ok, $receivers) = httpGetJsonSafe(urlJoin($api, 'receivers/'));
    if (!$ok) {
        $errors[] = ['node_api' => $api, 'step' => 'receivers', 'error' => $receivers];
        $receivers = [];
    }

    $recEntries = [];
    foreach ($receivers as $r) {
        $rid = $r['id'] ?? null;
        if (!$rid) continue;
        $did = $r['device_id'] ?? null;
        $deviceLabel = $deviceMap[$did]['label'] ?? null;
        $srHref = $deviceMap[$did]['sr_ctrl_href'] ?? null;
        $ctrl = buildIs05Href($srHref, 'receivers', $rid);

        $subActive = !empty($r['subscription']['active']);
        $subSid    = $r['subscription']['sender_id'] ?? null;

        $labelNmos = $r['label'] ?? null;
        $custom    = $recLabs[$rid] ?? null;

        $recEntries[] = [
            'id'                     => $rid,
            'label'                  => $labelNmos,
            'custom_label'           => $custom,
            'equipement'             => $nodeName,
            'mediatype'              => mediaTypeFromFormat($r['format'] ?? null),
            'device_id'              => $did,
            'device_label'           => $deviceLabel,
            'node_id'                => $deviceMap[$did]['node_id'] ?? $nid,
            'control_href'           => $ctrl,
            'subscription_active'    => $subActive,
            'subscription_sender_id' => $subSid
        ];
    }

    return [
        'node'      => $nodeEntry,
        'devices'   => $devEntries,
        'senders'   => $sendEntries,
        'receivers' => $recEntries
    ];
}

function mergeNodeData(&$nodesE, &$devE, &$sendE, &$recE, $res, $targetApi, $targetName) {
    $newNodeId = $res['node']['id'];
    $matchedNodeIds = [$newNodeId];

    // Find existing node IDs for this node_api or node_name
    foreach ($nodesE as $ne) {
        $neApi = rtrim($ne['node_api'] ?? '', '/');
        $tgtApiClean = rtrim($targetApi, '/');
        if (($neApi !== '' && $neApi === $tgtApiClean) || (!empty($targetName) && ($ne['node_name'] ?? '') === $targetName)) {
            if (!empty($ne['id']) && !in_array($ne['id'], $matchedNodeIds)) {
                $matchedNodeIds[] = $ne['id'];
            }
        }
    }

    // Filter out old entries for this node
    $nodesE = array_values(array_filter($nodesE, function($n) use ($targetApi, $targetName, $matchedNodeIds) {
        $nApi = rtrim($n['node_api'] ?? '', '/');
        $tgtApiClean = rtrim($targetApi, '/');
        if ($nApi !== '' && $nApi === $tgtApiClean) return false;
        if (!empty($targetName) && ($n['node_name'] ?? '') === $targetName) return false;
        if (!empty($n['id']) && in_array($n['id'], $matchedNodeIds)) return false;
        return true;
    }));

    $devE = array_values(array_filter($devE, function($d) use ($targetApi, $targetName, $matchedNodeIds) {
        $dApi = rtrim($d['node_api'] ?? '', '/');
        $tgtApiClean = rtrim($targetApi, '/');
        if ($dApi !== '' && $dApi === $tgtApiClean) return false;
        if (!empty($targetName) && ($d['node_name'] ?? '') === $targetName) return false;
        if (!empty($d['node_id']) && in_array($d['node_id'], $matchedNodeIds)) return false;
        return true;
    }));

    $sendE = array_values(array_filter($sendE, function($s) use ($targetName, $matchedNodeIds) {
        if (!empty($targetName) && ($s['equipement'] ?? '') === $targetName) return false;
        if (!empty($s['node_id']) && in_array($s['node_id'], $matchedNodeIds)) return false;
        return true;
    }));

    $recE = array_values(array_filter($recE, function($r) use ($targetName, $matchedNodeIds) {
        if (!empty($targetName) && ($r['equipement'] ?? '') === $targetName) return false;
        if (!empty($r['node_id']) && in_array($r['node_id'], $matchedNodeIds)) return false;
        return true;
    }));

    // Append new resources
    $nodesE[] = $res['node'];
    $devE     = array_merge($devE, $res['devices']);
    $sendE    = array_merge($sendE, $res['senders']);
    $recE     = array_merge($recE, $res['receivers']);
}

/**
 * Purge entries whose node is no longer present in config.nodes.json.
 * Preserves nodes that ARE in config.nodes.json even if temporarily unreachable.
 */
function purgeOrphanedNodes(&$nodesE, &$devE, &$sendE, &$recE, $validNodesList) {
    $validApis = [];
    $validNames = [];
    foreach ($validNodesList as $vn) {
        if (!empty($vn['node_api'])) {
            $validApis[] = rtrim(trim($vn['node_api']), '/');
        }
        if (!empty($vn['node_name'])) {
            $validNames[] = trim($vn['node_name']);
        }
    }

    // Identify which node IDs correspond to declared nodes
    $validNodeIds = [];
    foreach ($nodesE as $ne) {
        $neApi = rtrim($ne['node_api'] ?? '', '/');
        $neName = trim($ne['node_name'] ?? '');
        if (in_array($neApi, $validApis, true) || in_array($neName, $validNames, true)) {
            if (!empty($ne['id']) && !in_array($ne['id'], $validNodeIds, true)) {
                $validNodeIds[] = $ne['id'];
            }
        }
    }

    $nodesBefore = count($nodesE);
    $devBefore   = count($devE);
    $sendBefore  = count($sendE);
    $recBefore   = count($recE);

    // Filter nodes
    $nodesE = array_values(array_filter($nodesE, function($n) use ($validApis, $validNames, $validNodeIds) {
        $nApi = rtrim($n['node_api'] ?? '', '/');
        $nName = trim($n['node_name'] ?? '');
        $nid = $n['id'] ?? '';
        return in_array($nApi, $validApis, true) || in_array($nName, $validNames, true) || in_array($nid, $validNodeIds, true);
    }));

    // Filter devices
    $devE = array_values(array_filter($devE, function($d) use ($validApis, $validNames, $validNodeIds) {
        $dApi = rtrim($d['node_api'] ?? '', '/');
        $dName = trim($d['node_name'] ?? '');
        $nid = $d['node_id'] ?? '';
        return in_array($dApi, $validApis, true) || in_array($dName, $validNames, true) || in_array($nid, $validNodeIds, true);
    }));

    // Filter senders
    $sendE = array_values(array_filter($sendE, function($s) use ($validNames, $validNodeIds) {
        $eqName = trim($s['equipement'] ?? '');
        $nid = $s['node_id'] ?? '';
        return in_array($eqName, $validNames, true) || in_array($nid, $validNodeIds, true);
    }));

    // Filter receivers
    $recE = array_values(array_filter($recE, function($r) use ($validNames, $validNodeIds) {
        $eqName = trim($r['equipement'] ?? '');
        $nid = $r['node_id'] ?? '';
        return in_array($eqName, $validNames, true) || in_array($nid, $validNodeIds, true);
    }));

    // Clean up labs files if orphaned senders/receivers were removed
    $validSenderIdMap = array_flip(array_column($sendE, 'id'));
    $validRecvIdMap   = array_flip(array_column($recE, 'id'));

    $sendLabsRaw = readJsonFile(SENDERS_LABS_FILE, []);
    $newSendLabs = array_values(array_filter($sendLabsRaw, function($x) use ($validSenderIdMap) {
        return isset($x['id']) && isset($validSenderIdMap[$x['id']]);
    }));
    if (count($newSendLabs) !== count($sendLabsRaw)) {
        writeJson(SENDERS_LABS_FILE, $newSendLabs);
    }

    $recLabsRaw = readJsonFile(RECEIVERS_LABS_FILE, []);
    $newRecLabs = array_values(array_filter($recLabsRaw, function($x) use ($validRecvIdMap) {
        return isset($x['id']) && isset($validRecvIdMap[$x['id']]);
    }));
    if (count($newRecLabs) !== count($recLabsRaw)) {
        writeJson(RECEIVERS_LABS_FILE, $newRecLabs);
    }

    return [
        'nodes'     => $nodesBefore - count($nodesE),
        'devices'   => $devBefore - count($devE),
        'senders'   => $sendBefore - count($sendE),
        'receivers' => $recBefore - count($recE)
    ];
}

$errors = [];
$nodesOK = 0;

try {
    if (!file_exists(INPUT_FILE)) {
        throw new Exception("Missing config.nodes.json");
    }

    $nodesList = json_decode(file_get_contents(INPUT_FILE), true);
    if (!is_array($nodesList)) {
        throw new Exception("Invalid config.nodes.json");
    }

    $sendLabs = labsListToMap(readJsonFile(SENDERS_LABS_FILE, []));
    $recLabs  = labsListToMap(readJsonFile(RECEIVERS_LABS_FILE, []));

    // Check if target node_api is requested for single node partial update
    $targetApi = '';
    $targetName = '';

    $rawInput = file_get_contents('php://input');
    if ($rawInput) {
        $parsed = json_decode($rawInput, true);
        if (is_array($parsed)) {
            if (!empty($parsed['node_api'])) $targetApi = trim($parsed['node_api']);
            if (!empty($parsed['node_name'])) $targetName = trim($parsed['node_name']);
        }
    }
    if (empty($targetApi) && !empty($_GET['node_api'])) {
        $targetApi = trim($_GET['node_api']);
    }
    if (empty($targetName) && !empty($_GET['node_name'])) {
        $targetName = trim($_GET['node_name']);
    }

    // Load existing files (non-destructive)
    $nodesE = readJsonFile(OUTPUT_DIR . '/JSON_nodes_enriched.json', []);
    $devE   = readJsonFile(OUTPUT_DIR . '/JSON_devices.json', []);
    $sendE  = readJsonFile(OUTPUT_DIR . '/JSON_senders.json', []);
    $recE   = readJsonFile(OUTPUT_DIR . '/JSON_receivers.json', []);

    if (!empty($targetApi)) {
        // --- PARTIAL / SINGLE NODE UPDATE MODE ---
        if (empty($targetName)) {
            foreach ($nodesList as $entry) {
                if (rtrim($entry['node_api'] ?? '', '/') === rtrim($targetApi, '/')) {
                    $targetName = $entry['node_name'] ?? '';
                    break;
                }
            }
        }

        $res = fetchNodeResources($targetApi, $targetName, $sendLabs, $recLabs, $errors);
        if (!$res) {
            http_response_code(400);
            echo json_encode([
                "ok"     => false,
                "error"  => !empty($errors) ? $errors[0]['error'] : "Failed to query node",
                "errors" => $errors
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
            exit;
        }

        mergeNodeData($nodesE, $devE, $sendE, $recE, $res, $targetApi, $targetName);

        writeJson(OUTPUT_DIR . '/JSON_nodes_enriched.json', $nodesE);
        writeJson(OUTPUT_DIR . '/JSON_devices.json', $devE);
        writeJson(OUTPUT_DIR . '/JSON_senders.json', $sendE);
        writeJson(OUTPUT_DIR . '/JSON_receivers.json', $recE);

        echo json_encode([
            "ok"              => true,
            "partial"         => true,
            "node_api"        => $targetApi,
            "node_name"       => $targetName,
            "node_id"         => $res['node']['id'],
            "devices_count"   => count($res['devices']),
            "senders_count"   => count($res['senders']),
            "receivers_count" => count($res['receivers']),
            "errors"          => $errors
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        exit;
    }

    // --- FULL RESILIENT UPDATE MODE ---
    // If a node is reachable, its entries are refreshed.
    // If a node is unreachable, it is logged in $errors and its existing data is PRESERVED.
    foreach ($nodesList as $nodeEntry) {
        if (!isset($nodeEntry['node_api'], $nodeEntry['node_name'])) continue;
        $api = $nodeEntry['node_api'];
        $nodeName = $nodeEntry['node_name'];

        $res = fetchNodeResources($api, $nodeName, $sendLabs, $recLabs, $errors);
        if (!$res) {
            // Node unreachable: skip it, existing data remains intact in JSON_*
            continue;
        }

        $nodesOK++;
        mergeNodeData($nodesE, $devE, $sendE, $recE, $res, $api, $nodeName);
    }

    // Purge orphaned nodes (nodes no longer in config.nodes.json)
    $purgeStats = purgeOrphanedNodes($nodesE, $devE, $sendE, $recE, $nodesList);

    writeJson(OUTPUT_DIR . '/JSON_nodes_enriched.json', $nodesE);
    writeJson(OUTPUT_DIR . '/JSON_devices.json', $devE);
    writeJson(OUTPUT_DIR . '/JSON_senders.json', $sendE);
    writeJson(OUTPUT_DIR . '/JSON_receivers.json', $recE);

    echo json_encode([
        "ok"       => true,
        "nodes_ok" => $nodesOK,
        "nodes_ko" => count($errors),
        "purged"   => $purgeStats,
        "errors"   => $errors
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["ok" => false, "error" => $e->getMessage()]);
}
?>
