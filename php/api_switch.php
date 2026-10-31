<?php
// api_switch.php  (PHP 5.6 compatible)
// POST { sender_id, receiver_id }
//
// Returns: { ok, sent_json, received_json } 

header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', '0');

function readJsonFile($path, $default) {
    if (!file_exists($path)) return $default;
    $txt = file_get_contents($path);
    $json = json_decode($txt, true);
    return is_array($json) ? $json : $default;
}



function writeJsonFile($path, $data) {
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if ($json === false) throw new Exception("json_encode failed");
    file_put_contents($path, $json);
}

function updateReceiverSubscriptionLocal($receiverId, $senderId) {
    $path = dirname(__DIR__) . '/json/JSON_receivers.json';
    $receivers = readJsonFile($path, array());

    for ($i=0; $i<count($receivers); $i++) {
        if (isset($receivers[$i]['id']) && $receivers[$i]['id'] === $receiverId) {
            $receivers[$i]['subscription_active'] = true;
            $receivers[$i]['subscription_sender_id'] = $senderId;
            break;
        }
    }

    writeJsonFile($path, $receivers);
}






















function httpGetText($url) {
    $ch = curl_init($url);
    curl_setopt_array($ch, array(
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 5,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_HTTPHEADER => array('Accept: application/sdp, text/plain, */*'),
    ));
    $body = curl_exec($ch);
    if ($body === false) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new Exception("GET failed: $err");
    }
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($status < 200 || $status >= 300) {
        throw new Exception("GET HTTP $status on $url");
    }
    return $body;
}

function httpPatchJson($url, $payload, &$responseBody) {
    $ch = curl_init($url);
    curl_setopt_array($ch, array(
        CURLOPT_CUSTOMREQUEST => 'PATCH',
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 5,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_HTTPHEADER => array(
            'Content-Type: application/json',
            'Accept: application/json'
        ),
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_SLASHES)
    ));
    $body = curl_exec($ch);
    $responseBody = $body;

    if ($body === false) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new Exception("PATCH failed: $err");
    }
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($status < 200 || $status >= 300) {
        throw new Exception("PATCH HTTP $status on $url, body=" . substr($body,0,400));
    }
}

try {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body) || !isset($body['sender_id']) || !isset($body['receiver_id'])) {
        http_response_code(400);
        echo json_encode(array('ok'=>false,'error'=>'sender_id and receiver_id required'));
        exit;
    }

    $senderId = $body['sender_id'];
    $receiverId = $body['receiver_id'];

    $senders = readJsonFile(dirname(__DIR__) . '/json/JSON_senders.json', array());
    $receivers = readJsonFile(dirname(__DIR__) . '/json/JSON_receivers.json', array());

    $sender = null;
    foreach ($senders as $s) {
        if (isset($s['id']) && $s['id'] === $senderId) { $sender = $s; break; }
    }
    $receiver = null;
    foreach ($receivers as $r) {
        if (isset($r['id']) && $r['id'] === $receiverId) { $receiver = $r; break; }
    }

    if (!$sender || !$receiver) {
        throw new Exception("Sender or Receiver not found in JSON");
    }
    if (empty($sender['sdp_href'])) {
        throw new Exception("Sender sdp_href missing");
    }
    if (empty($receiver['control_href'])) {
        throw new Exception("Receiver control_href missing");
    }

    // 1) GET SDP
    $sdp = httpGetText($sender['sdp_href']);

    // 2) FULL PATCH BODY
    $patchBody = array(
        "activation" => array(
            "requested_time" => null,
            "mode" => "activate_immediate"
        ),
        "master_enable" => true,
        "sender_id" => $senderId,
        "transport_file" => array(
            "type" => "application/sdp",
            "data" => $sdp
        )
    );

    // 3) PATCH /staged
    $stagedUrl = rtrim($receiver['control_href'], '/') . '/staged';
    $responseJson = null;
    httpPatchJson($stagedUrl, $patchBody, $responseJson);
	updateReceiverSubscriptionLocal($receiverId, $senderId);

    echo json_encode(array(
        'ok' => true,
        'sent_json' => $patchBody,
        'received_json' => $responseJson
    ));

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(array('ok'=>false,'error'=>$e->getMessage()));
}
?>
