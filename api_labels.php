<?php
/**
 * api_labels.php (PHP 5.6 compatible)
 *
 * Endpoints:
 *  GET  api_labels.php?action=load&type=senders|receivers
 *  POST api_labels.php?action=save&type=senders|receivers
 *        body: { id, label, [profiles_allowed], [update_profile] }
 *  POST api_labels.php?action=bulk_save&type=senders|receivers
 *        body: { items: [{id,label,[profiles_allowed],[update_profile]},...] }
 *
 * Remarques profils :
 *  - SENDERS : le profil est calculé côté backend à partir du SDP
 *              (via sdp-lib.php) et stocké dans JSON_senders_labs.json
 *              sous la forme : { id, label, profile_id }
 *  - RECEIVERS : les profils autorisés sont stockés dans
 *              JSON_receivers_labs.json sous la forme :
 *              { id, label, profiles_allowed: ["1080i50", ...] }
 */

header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', '0');

// --------- FILES ----------
$FILES = array(
  'nodes'          => __DIR__ . '/JSON_nodes_enriched.json',
  'devices'        => __DIR__ . '/JSON_devices.json',
  'senders'        => __DIR__ . '/JSON_senders.json',
  'receivers'      => __DIR__ . '/JSON_receivers.json',
  'senders_labs'   => __DIR__ . '/JSON_senders_labs.json',
  'receivers_labs' => __DIR__ . '/JSON_receivers_labs.json',
  'profiles'       => __DIR__ . '/config.profiles.json',
);

$GLOBALS['FILES'] = $FILES;

// --------- HELPERS JSON I/O ----------

function readJsonFile($path, $default) {
  if (!file_exists($path)) return $default;
  $txt = file_get_contents($path);
  $json = json_decode($txt, true);
  return is_array($json) ? $json : $default;
}

function writeJsonFile($path, $data) {
  $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
  if ($json === false) return false;

  $fp = fopen($path, 'c+');
  if (!$fp) return false;

  if (!flock($fp, LOCK_EX)) {
    fclose($fp);
    return false;
  }

  ftruncate($fp, 0);
  fwrite($fp, $json);
  fflush($fp);
  flock($fp, LOCK_UN);
  fclose($fp);
  return true;
}

function getTypeOrFail() {
  $type = isset($_GET['type']) ? $_GET['type'] : '';
  if ($type !== 'senders' && $type !== 'receivers') {
    http_response_code(400);
    echo json_encode(array('error' => 'type must be senders|receivers'));
    exit;
  }
  return $type;
}

// --------- HELPERS LABELS (existants) ----------

function mergeLabs($mainList, $labsMap) {
  foreach ($mainList as &$it) {
    if (!isset($it['id'])) continue;
    $id = $it['id'];
    if (isset($labsMap[$id])) {
      $labEntry = $labsMap[$id];

      // custom label
      if (isset($labEntry['label'])) {
        $it['custom_label'] = $labEntry['label'];
        $it['_label_custom'] = true;
      } else {
        $it['custom_label'] = null;
        $it['_label_custom'] = false;
      }

      // nouvelle propriété category si présente
      if (isset($labEntry['category'])) {
        $it['category'] = $labEntry['category'];
      }
    } else {
      $it['custom_label'] = null;
      $it['_label_custom'] = false;
    }
  }
  return $mainList;
}


function labsListToMap($labsList) {
  // labs stored as [{id,label,...}, ...]
  $map = array();
  foreach ($labsList as $x) {
    if (isset($x['id'])) {
      $id = $x['id'];
      // On stocke toute l'entrée pour pouvoir récupérer aussi category, profiles_allowed, etc.
      $map[$id] = $x;
    }
  }
  return $map;
}


// supprime complètement une entrée de labs (par id)
function removeLabsById($labsList, $id) {
  $res = array();
  foreach ($labsList as $e) {
    if (!isset($e['id']) || $e['id'] !== $id) {
      $res[] = $e;
    }
  }
  return $res;
}

// synchronise custom_label dans JSON_senders.json / JSON_receivers.json avec labs
function syncMainCustomLabels($mainList, $labsList) {
  $labsMap = labsListToMap($labsList);
  foreach ($mainList as &$it) {
    if (!isset($it['id'])) continue;
    $id = $it['id'];
    if (isset($labsMap[$id]) && isset($labsMap[$id]['label']) && trim($labsMap[$id]['label']) !== '') {
      $it['custom_label'] = $labsMap[$id]['label'];
    } else {
      $it['custom_label'] = null;
    }
  }
  return $mainList;
}

// --------- HELPERS LABS ENRICHI (profils) ----------

// SENDERS : upsert {id,label,profile_id?,category?}
function upsertSenderLabs($labsList, $id, $label, $profileId, $category = null) {
  if ($category !== null) {
    $category = trim($category);
  }

  $found = false;
  for ($i = 0; $i < count($labsList); $i++) {
    if (isset($labsList[$i]['id']) && $labsList[$i]['id'] === $id) {
      $labsList[$i]['label'] = $label;
      if ($profileId !== null) {
        $labsList[$i]['profile_id'] = $profileId;
      }
      // gestion category
      if ($category !== null) {
        if ($category === '') {
          unset($labsList[$i]['category']);
        } else {
          $labsList[$i]['category'] = $category;
        }
      }
      $found = true;
      break;
    }
  }

  if (!$found) {
    $entry = array(
      'id'    => $id,
      'label' => $label
    );
    if ($profileId !== null) {
      $entry['profile_id'] = $profileId;
    }
    if ($category !== null && $category !== '') {
      $entry['category'] = $category;
    }
    $labsList[] = $entry;
  }

  return $labsList;
}


// RECEIVERS : upsert {id,label,profiles_allowed?,category?}
function upsertReceiverLabs($labsList, $id, $label, $profilesAllowed, $category = null) {
  if ($category !== null) {
    $category = trim($category);
  }

  $found = false;
  for ($i = 0; $i < count($labsList); $i++) {
    if (isset($labsList[$i]['id']) && $labsList[$i]['id'] === $id) {
      // entrée déjà existante
      $labsList[$i]['label'] = $label;

      if ($profilesAllowed !== null) {
        $labsList[$i]['profiles_allowed'] = $profilesAllowed;
      } elseif (!isset($labsList[$i]['profiles_allowed'])) {
        $labsList[$i]['profiles_allowed'] = "*";
      }

      // gestion category
      if ($category !== null) {
        if ($category === '') {
          unset($labsList[$i]['category']);
        } else {
          $labsList[$i]['category'] = $category;
        }
      }

      $found = true;
      break;
    }
  }

  if (!$found) {
    $entry = array(
      'id'    => $id,
      'label' => $label,
      'profiles_allowed' => ($profilesAllowed !== null ? $profilesAllowed : "*")
    );
    if ($category !== null && $category !== '') {
      $entry['category'] = $category;
    }
    $labsList[] = $entry;
  }

  return $labsList;
}



// --------- HELPERS PROFILS (SDP + config.profiles) ----------

function findSenderById($mainList, $id) {
  for ($i = 0; $i < count($mainList); $i++) {
    if (isset($mainList[$i]['id']) && $mainList[$i]['id'] === $id) {
      return $mainList[$i];
    }
  }
  return null;
}

function fetchSdpFromUrl($url) {
  if ($url === null || $url === '') return null;

  $ch = curl_init();
  curl_setopt($ch, CURLOPT_URL, $url);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
  curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);
  curl_setopt($ch, CURLOPT_TIMEOUT, 5);

  $resp = curl_exec($ch);
  if ($resp === false) {
    curl_close($ch);
    return null;
  }
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  if ($code >= 400) return null;
  return $resp;
}

/**
 * Calcule le profil pour un sender donné à partir du SDP.
 * Retourne une string de profil (ex: "1080i50", "48000-L24-8CH") ou null.
 */
function computeProfileForSender($id, $mainList) {
  $sender = findSenderById($mainList, $id);
  if ($sender === null) return null;

  if (!isset($sender['mediatype'])) return null;
  $mt = $sender['mediatype'];

  // on ne gère le profil que pour audio / video pour l'instant
  if ($mt !== 'audio' && $mt !== 'video') {
    return null;
  }

  $sdpUrl = isset($sender['sdp_href']) ? $sender['sdp_href'] : null;
  if ($sdpUrl === null || $sdpUrl === '') {
    return null;
  }

  $sdp = fetchSdpFromUrl($sdpUrl);
  if ($sdp === null) return null;

  // sdp-lib.php doit être à la racine du projet
  require_once __DIR__ . '/sdp-lib.php';

  $kind = ($mt === 'audio') ? 'audio' : 'video';
  if (!function_exists('sdp_get_profile_from_sdp')) {
    // la lib n'expose pas la fonction attendue
    return null;
  }

  $profile = sdp_get_profile_from_sdp($sdp, $kind);
  if ($profile === null || $profile === '') return null;

  // On ne filtre PAS sur config.profiles.json ici :
  // on stocke la valeur brute. Si elle n'est pas dans config.profiles.json,
  // elle ne sera simplement jamais sélectionnable côté receiver.
  return $profile;
}

// --------- ROUTER ----------

$action = isset($_GET['action']) ? $_GET['action'] : '';

if ($action === 'load') {
  $type    = getTypeOrFail();
  $mainPath = ($type === 'senders') ? $GLOBALS['FILES']['senders'] : $GLOBALS['FILES']['receivers'];
  $labsPath = ($type === 'senders') ? $GLOBALS['FILES']['senders_labs'] : $GLOBALS['FILES']['receivers_labs'];

  $nodes   = readJsonFile($GLOBALS['FILES']['nodes'], array());
  $devices = readJsonFile($GLOBALS['FILES']['devices'], array());
  $main    = readJsonFile($mainPath, array());
  $labs    = readJsonFile($labsPath, array());

  $labsMap = labsListToMap($labs);
  $merged  = mergeLabs($main, $labsMap);

  echo json_encode(array(
    'nodes'   => $nodes,
    'devices' => $devices,
    $type     => $merged,
    'labs'    => $labs
  ));
  exit;
}

if ($action === 'save' || $action === 'bulk_save') {
  $type    = getTypeOrFail();
  $mainPath = ($type === 'senders') ? $GLOBALS['FILES']['senders'] : $GLOBALS['FILES']['receivers'];
  $labsPath = ($type === 'senders') ? $GLOBALS['FILES']['senders_labs'] : $GLOBALS['FILES']['receivers_labs'];

  $body = json_decode(file_get_contents('php://input'), true);
  if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(array('error' => 'invalid json body'));
    exit;
  }

  $main = readJsonFile($mainPath, array());
  $labs = readJsonFile($labsPath, array());

  if ($action === 'save') {
    if (!isset($body['id']) || !isset($body['label'])) {
      http_response_code(400);
      echo json_encode(array('error' => 'body must contain id,label'));
      exit;
    }
    $id    = $body['id'];
    $label = $body['label'];

    // optionnel : profiles_allowed (receivers)
    $profilesAllowed = null;
    if (isset($body['profiles_allowed'])) {
      $profilesAllowed = $body['profiles_allowed'];
    }
	
	// optionnel : category (senders / receivers)
	$category = null;
	if (array_key_exists('category', $body)) {
	  $category = $body['category'];
	}	

    if ($label === null || trim($label) === '') {
      // empty label => remove custom label (et profil associé)
      $labs = removeLabsById($labs, $id);
    } else {
	if ($type === 'senders') {
	  $profileId = computeProfileForSender($id, $main);
	  $labs = upsertSenderLabs($labs, $id, $label, $profileId, $category);
	} else { // receivers
	  $labs = upsertReceiverLabs($labs, $id, $label, $profilesAllowed, $category);
	}
    }

  } else { // bulk_save
    if (!isset($body['items']) || !is_array($body['items'])) {
      http_response_code(400);
      echo json_encode(array('error' => 'body must contain items[]'));
      exit;
    }

    foreach ($body['items'] as $it) {
      if (!isset($it['id']) || !isset($it['label'])) continue;
      $cid    = $it['id'];
      $clabel = $it['label'];

      $profilesAllowed = null;
      if (isset($it['profiles_allowed'])) {
        $profilesAllowed = $it['profiles_allowed'];
      }
	  
	  $category = null;
	  if (array_key_exists('category', $it)) {
		$category = $it['category'];
	  }	  

      if ($clabel === null || trim($clabel) === '') {
        $labs = removeLabsById($labs, $cid);
      } else {
			if ($type === 'senders') {
			  $profileId = computeProfileForSender($cid, $main);
			  $labs = upsertSenderLabs($labs, $cid, $clabel, $profileId, $category);
			} else { // receivers
			  $labs = upsertReceiverLabs($labs, $cid, $clabel, $profilesAllowed, $category);
			}

      }
    }
  }

  $main = syncMainCustomLabels($main, $labs);
  $okLabs = writeJsonFile($labsPath, $labs);
  $okMain = writeJsonFile($mainPath, $main);
  echo json_encode(array('ok' => ($okLabs && $okMain)));
  exit;
}

http_response_code(404);
echo json_encode(array('error' => 'unknown action'));
?>
