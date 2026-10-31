<?php
// api_workflow.php 
// Stockage simple sur disque : JSON_workflows.json
// Actions:
//  - GET  ?action=list
//  - POST ?action=save   (body = workflow object)
//  - POST ?action=delete (body = {id: "wf_..."})

header('Content-Type: application/json; charset=utf-8');

$ACTION = isset($_GET['action']) ? $_GET['action'] : '';
$FILE = __DIR__ . DIRECTORY_SEPARATOR . 'JSON_workflows.json';

function respond($ok, $payload = []) {
  echo json_encode(array_merge(['ok' => $ok], $payload), JSON_PRETTY_PRINT);
  exit;
}

function read_json_file($path) {
  if (!file_exists($path)) return [];
  $raw = file_get_contents($path);
  if ($raw === false) return [];
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

function write_json_file($path, $data) {
  $tmp = $path . '.tmp';
  $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
  if ($json === false) return false;

  // file lock with temp file then rename (atomic-ish)
  if (file_put_contents($tmp, $json, LOCK_EX) === false) return false;
  return rename($tmp, $path);
}

function read_body_json() {
  $raw = file_get_contents('php://input');
  if (!$raw) return null;
  $data = json_decode($raw, true);
  return $data;
}

function normalize_workflow($wf) {
  if (!is_array($wf)) return null;

  $id = isset($wf['id']) ? (string)$wf['id'] : '';
  if ($id === '') return null;

  $out = [
    'id' => $id,
    'description' => isset($wf['description']) ? (string)$wf['description'] : '',
    'created_at' => isset($wf['created_at']) ? (string)$wf['created_at'] : date('c'),
    'items' => []
  ];

  if (isset($wf['items']) && is_array($wf['items'])) {
    foreach ($wf['items'] as $it) {
      if (!is_array($it)) continue;
      $out['items'][] = [
        'media' => isset($it['media']) ? (string)$it['media'] : '',
        'sender_id' => isset($it['sender_id']) ? (string)$it['sender_id'] : '',
        'receiver_id' => isset($it['receiver_id']) ? (string)$it['receiver_id'] : '',
        'note' => isset($it['note']) ? (string)$it['note'] : ''
      ];
    }
  }

  return $out;
}

if ($ACTION === 'list') {
  $all = read_json_file($FILE);
  respond(true, ['workflows' => $all]);
}

if ($ACTION === 'save') {
  $wf = read_body_json();
  $norm = normalize_workflow($wf);
  if ($norm === null) respond(false, ['error' => 'Invalid workflow (missing id)']);

  $all = read_json_file($FILE);

  // upsert by id
  $found = false;
  for ($i=0; $i<count($all); $i++) {
    if (isset($all[$i]['id']) && $all[$i]['id'] === $norm['id']) {
      $all[$i] = $norm;
      $found = true;
      break;
    }
  }
  if (!$found) array_unshift($all, $norm);

  if (!write_json_file($FILE, $all)) {
    respond(false, ['error' => 'Unable to write JSON_workflows.json']);
  }
  respond(true, ['saved' => true]);
}

if ($ACTION === 'delete') {
  $body = read_body_json();
  $id = is_array($body) && isset($body['id']) ? (string)$body['id'] : '';
  if ($id === '') respond(false, ['error' => 'Missing id']);

  $all = read_json_file($FILE);
  $all2 = [];
  foreach ($all as $w) {
    if (is_array($w) && isset($w['id']) && $w['id'] === $id) continue;
    $all2[] = $w;
  }

  if (!write_json_file($FILE, $all2)) {
    respond(false, ['error' => 'Unable to write JSON_workflows.json']);
  }
  respond(true, ['deleted' => true]);
}

respond(false, ['error' => 'Unknown action']);
