<?php
/**
 * api_virtual.php (PHP 5.6 compatible) 
 *
 * Endpoints:
 *  GET  api_virtual.php?action=list&type=sources|destinations
 *  POST api_virtual.php?action=save&type=sources|destinations     body: { ...objet virtuel... }
 *  POST api_virtual.php?action=delete&type=sources|destinations   body: { "id": "xxx" }
 */

header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', '0');

// ---------- FILES ----------
$FILES = array(
    'sources'      => dirname(__DIR__) . '/json/JSON_virtual_sources.json',
    'destinations' => dirname(__DIR__) . '/json/JSON_virtual_destinations.json'
);

$action = isset($_GET['action']) ? $_GET['action'] : '';
$type   = isset($_GET['type'])   ? $_GET['type']   : '';

if (!isset($FILES[$type])) {
  http_response_code(400);
  echo json_encode(array('error' => 'Invalid type (expected sources|destinations)'));
  exit;
}

$file = $FILES[$type];

// ---------- HELPERS ----------

function load_json_file($file) {
  if (!file_exists($file)) {
    return array();
  }
  $content = @file_get_contents($file);
  if ($content === false || $content === '') {
    return array();
  }
  $data = json_decode($content, true);
  if (!is_array($data)) {
    return array();
  }
  return $data;
}

function save_json_file($file, $data) {
  // On force un tableau JSON
  if (!is_array($data)) {
    $data = array();
  }
  // JSON_PRETTY_PRINT existe en PHP 5.6
  $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
  if ($json === false) {
    return false;
  }
  return (file_put_contents($file, $json) !== false);
}

// ---------- ROUTING ----------

switch ($action) {
  case 'list':
    $items = load_json_file($file);
    echo json_encode($items);
    break;

  case 'save':
    $raw = file_get_contents('php://input');
    $input = json_decode($raw, true);

    if (!is_array($input) || !isset($input['id']) || $input['id'] === '') {
      http_response_code(400);
      echo json_encode(array('error' => 'Invalid payload: id is required'));
      exit;
    }

    $items = load_json_file($file);
    $found = false;

    // Mise à jour si id existe déjà
    for ($i = 0; $i < count($items); $i++) {
      if (isset($items[$i]['id']) && $items[$i]['id'] === $input['id']) {
        $items[$i] = $input;
        $found = true;
        break;
      }
    }

    // Sinon, ajout
    if (!$found) {
      $items[] = $input;
    }

    if (!save_json_file($file, $items)) {
      http_response_code(500);
      echo json_encode(array('error' => 'Unable to save file'));
      exit;
    }

    echo json_encode(array('status' => 'ok'));
    break;

  case 'delete':
    $raw = file_get_contents('php://input');
    $input = json_decode($raw, true);

    if (!is_array($input) || !isset($input['id']) || $input['id'] === '') {
      http_response_code(400);
      echo json_encode(array('error' => 'Invalid payload: id is required'));
      exit;
    }

    $items = load_json_file($file);
    $out = array();

    foreach ($items as $it) {
      if (!isset($it['id']) || $it['id'] !== $input['id']) {
        $out[] = $it;
      }
    }

    if (!save_json_file($file, $out)) {
      http_response_code(500);
      echo json_encode(array('error' => 'Unable to save file'));
      exit;
    }

    echo json_encode(array('status' => 'ok'));
    break;


  case 'save_connection':
    $raw = file_get_contents('php://input');
    $input = json_decode($raw, true);

    if (!is_array($input)
        || !isset($input['dest_id'])
        || !isset($input['virtual_sender_id'])
        || $input['dest_id'] === '') {

      http_response_code(400);
      echo json_encode(array('error' => 'Invalid payload: dest_id and virtual_sender_id are required'));
      exit;
    }

    // On ne travaille QUE sur "destinations"
    if ($type !== 'destinations') {
      http_response_code(400);
      echo json_encode(array('error' => 'save_connection only valid for type=destinations'));
      exit;
    }

    $dest_id = $input['dest_id'];
    $virt_src = $input['virtual_sender_id'];

    $items = load_json_file($file);
    $found = false;

    // Mise à jour
    for ($i = 0; $i < count($items); $i++) {
      if (isset($items[$i]['id']) && $items[$i]['id'] === $dest_id) {
        $items[$i]['virtual_sender_id'] = $virt_src;
        $found = true;
        break;
      }
    }

    if (!$found) {
      http_response_code(404);
      echo json_encode(array('error' => 'Destination not found'));
      exit;
    }

    if (!save_json_file($file, $items)) {
      http_response_code(500);
      echo json_encode(array('error' => 'Unable to save virtual connection'));
      exit;
    }

    echo json_encode(array('status' => 'ok'));
    break;


  default:
    http_response_code(400);
    echo json_encode(array('error' => 'Invalid action (list|save|delete)'));
}
