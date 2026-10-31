<?php
header('Content-Type: application/json');

$jsonFile = 'config.nodes.json';

// Helper to read JSON
function readJsonNodes($file)
{
    if (!file_exists($file))
        return [];
    $content = file_get_contents($file);
    $data = json_decode($content, true);
    return is_array($data) ? $data : [];
}

// Helper to write JSON
function saveJsonNodes($file, $data)
{
    // Pretty print for readability
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    file_put_contents($file, $json);
}

$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? $_GET['action'] : '';

if ($method === 'GET' && $action === 'discover_versions') {
    $ip   = isset($_GET['ip']) ? trim($_GET['ip']) : '';
    $port = isset($_GET['port']) ? trim($_GET['port']) : '';

    if ($ip === '' || !preg_match('/^[a-zA-Z0-9.\-]+$/', $ip)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Invalid IP address']);
        exit;
    }

    if ($port !== '' && (!ctype_digit($port) || intval($port) < 1 || intval($port) > 65535)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Invalid port']);
        exit;
    }

    $baseUrl = 'http://' . $ip . ($port !== '' ? ':' . $port : '') . '/x-nmos/node/';

    $ch = curl_init($baseUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT        => 4,
        CURLOPT_HTTPHEADER     => ['Accept: application/json']
    ]);

    $body = curl_exec($ch);
    $err  = curl_error($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($body === false) {
        echo json_encode(['ok' => false, 'error' => "cURL error: $err", 'base_url' => $baseUrl]);
        exit;
    }

    if ($code < 200 || $code >= 300) {
        echo json_encode(['ok' => false, 'error' => "HTTP $code on $baseUrl", 'base_url' => $baseUrl]);
        exit;
    }

    $decoded = json_decode($body, true);
    if (!is_array($decoded)) {
        echo json_encode(['ok' => false, 'error' => 'Invalid JSON response from node', 'base_url' => $baseUrl]);
        exit;
    }

    $versions = [];
    foreach ($decoded as $v) {
        if (is_string($v) && trim($v) !== '') {
            $vClean = rtrim(trim($v), '/') . '/';
            $versions[] = $vClean;
        }
    }

    if (empty($versions)) {
        echo json_encode(['ok' => false, 'error' => 'No NMOS versions found', 'base_url' => $baseUrl]);
        exit;
    }

    echo json_encode([
        'ok'       => true,
        'base_url' => $baseUrl,
        'versions' => $versions
    ]);
    exit;
}

if ($method === 'GET' && $action === 'check_node') {
    $url = isset($_GET['url']) ? trim($_GET['url']) : '';

    if ($url === '' || !preg_match('#^https?://#i', $url)) {
        echo json_encode(['ok' => false, 'reachable' => false, 'error' => 'Invalid URL']);
        exit;
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_TIMEOUT        => 3,
        CURLOPT_HTTPHEADER     => ['Accept: application/json']
    ]);

    $body = curl_exec($ch);
    $err  = curl_error($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($body === false) {
        echo json_encode(['ok' => true, 'reachable' => false, 'error' => $err]);
        exit;
    }

    $decoded = json_decode($body, true);
    $reachable = ($code >= 200 && $code < 300 && is_array($decoded));

    echo json_encode([
        'ok'        => true,
        'reachable' => $reachable,
        'http_code' => $code
    ]);
    exit;
}

if ($method === 'GET') {
    // GET: Return the list of nodes
    $nodes = readJsonNodes($jsonFile);
    echo json_encode($nodes);
    exit;
}

if ($method === 'POST') {
    // POST: Save the list of nodes (full replacement or adding/editing)
    // We expect the body to contains the full list or an action
    // For simplicity, let's assume the frontend sends the full list of nodes to save

    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON input']);
        exit;
    }

    // Validation (optional but good practice)
    $validNodes = [];
    foreach ($data as $node) {
        if (isset($node['node_api']) && isset($node['node_name'])) {
            $validNodes[] = [
                'node_api' => $node['node_api'],
                'node_name' => $node['node_name']
            ];
        }
    }

    saveJsonNodes($jsonFile, $validNodes);
    echo json_encode(['success' => true, 'count' => count($validNodes)]);
    exit;
}

http_response_code(405); // Method Not Allowed
echo json_encode(['error' => 'Method not allowed']);
