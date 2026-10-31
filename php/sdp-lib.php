<?php
/**
 * sdp_parse.php 
 *
 * Script autonome pour parser un fichier SDP et en extraire
 * les infos vidéo / audio / data utiles dans un contexte ST 2110.
 *
 * Compatible PHP 5.6 (pas de syntaxe [] ni typage strict).
 *
 * Usage :
 *   php sdp_parse.php           # lit sdp.txt dans le même dossier
 *   php sdp_parse.php fichier   # lit le fichier passé en argument
 */

// ---------------------------------------------------------
// 2) Fonctions de parsing SDP générique
// ---------------------------------------------------------

/**
 * Parse un SDP en structure PHP.
 *
 * Retourne un array:
 * [
 *   'session' => [ 'v' => ..., 'o' => ..., 's' => ..., 'a' => [ ... ] ],
 *   'media'   => [
 *       [
 *         'type'       => 'video' | 'audio' | 'application' | 'data' | ...,
 *         'port'       => 5004,
 *         'proto'      => 'RTP/AVP',
 *         'payloads'   => ['96'],
 *         'attributes' => [
 *             'rtpmap' => [ pt => ['encoding' => ..., 'clockrate' => ..., 'channels' => ...] ],
 *             'fmtp'   => [ pt => ['raw' => '...', 'params' => [k=>v,...]] ],
 *             'other'  => [ 'ts-refclk:...', 'mediaclk:...', ... ]
 *         ]
 *       ],
 *       ...
 *   ]
 * ]
 */
function sdp_parse($sdp)
{
    $lines = preg_split('/\r\n|\n|\r/', trim($sdp));
    $session = array(
        'v' => null,
        'o' => null,
        's' => null,
        'u' => null,
        'e' => null,
        'c' => null,
        't' => null,
        'a' => array()
    );

    $media = array();
    $currentMedia = null;

    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '') continue;

        // format "x=value"
        $prefix = substr($line, 0, 2);
        $value  = substr($line, 2);

        if ($prefix === 'v=') {
            $session['v'] = $value;
        } elseif ($prefix === 'o=') {
            $session['o'] = $value;
        } elseif ($prefix === 's=') {
            $session['s'] = $value;
        } elseif ($prefix === 'u=') {
            $session['u'] = $value;
        } elseif ($prefix === 'e=') {
            $session['e'] = $value;
        } elseif ($prefix === 'c=') {
            $session['c'] = $value;
        } elseif ($prefix === 't=') {
            $session['t'] = $value;
        } elseif ($prefix === 'a=') {
            // attribut de session ou de media
            if ($currentMedia === null) {
                $session['a'][] = $value;
            } else {
                if (!isset($currentMedia['raw_a'])) {
                    $currentMedia['raw_a'] = array();
                }
                $currentMedia['raw_a'][] = $value;
            }
        } elseif ($prefix === 'm=') {
            // on démarre un nouveau bloc media
            if ($currentMedia !== null) {
                $media[] = sdp_finalize_media($currentMedia);
            }
            $currentMedia = sdp_parse_m_line($value);
        } else {
            // autres lignes (p=, b=, k=...) ignorées pour l'instant
        }
    }

    if ($currentMedia !== null) {
        $media[] = sdp_finalize_media($currentMedia);
    }

    return array(
        'session' => $session,
        'media'   => $media
    );
}

/**
 * Parse une ligne "m=" (ex: "video 5004 RTP/AVP 96")
 */
function sdp_parse_m_line($value)
{
    $parts = preg_split('/\s+/', trim($value));
    $m = array(
        'type'       => isset($parts[0]) ? $parts[0] : null,
        'port'       => isset($parts[1]) ? intval($parts[1]) : null,
        'proto'      => isset($parts[2]) ? $parts[2] : null,
        'payloads'   => array(),
        'raw_a'      => array(),
        'attributes' => array()
    );

    // payload types
    $count = count($parts);
    for ($i = 3; $i < $count; $i++) {
        $m['payloads'][] = $parts[$i];
    }

    return $m;
}

/**
 * Finalise la section media: parse les attributs "a=" en structure (rtpmap, fmtp, etc.).
 */
function sdp_finalize_media($media)
{
    $attributes = array(
        'rtpmap' => array(), // pt => [encoding, clockrate, channels]
        'fmtp'   => array(), // pt => [raw, params]
        'other'  => array()  // autres attributs
    );

    if (isset($media['raw_a'])) {
        foreach ($media['raw_a'] as $a) {
            // ex: "rtpmap:96 L24/48000/8"
            if (strpos($a, 'rtpmap:') === 0) {
                $tmp = substr($a, strlen('rtpmap:'));
                $parts = explode(' ', $tmp, 2);
                if (count($parts) == 2) {
                    $pt  = $parts[0];
                    $enc = $parts[1];
                    // L24/48000/8
                    $encParts = explode('/', $enc);
                    $encoding  = isset($encParts[0]) ? $encParts[0] : null;
                    $clockrate = isset($encParts[1]) ? intval($encParts[1]) : null;
                    $channels  = isset($encParts[2]) ? intval($encParts[2]) : null;
                    $attributes['rtpmap'][$pt] = array(
                        'encoding'  => $encoding,
                        'clockrate' => $clockrate,
                        'channels'  => $channels
                    );
                }
            } elseif (strpos($a, 'fmtp:') === 0) {
                // ex: "fmtp:96 sampling=YCbCr-4:2:2; width=1920; height=1080; exactframerate=25/1; interlace"
                $tmp = substr($a, strlen('fmtp:'));
                $parts = explode(' ', $tmp, 2);
                $pt = $parts[0];
                $rawParams = isset($parts[1]) ? $parts[1] : '';
                $params = sdp_parse_fmtp_params($rawParams);
                $attributes['fmtp'][$pt] = array(
                    'raw'    => $rawParams,
                    'params' => $params
                );
            } else {
                // autres attributs: ts-refclk, mediaclk, source-filter, recvonly, etc.
                $attributes['other'][] = $a;
            }
        }
    }

    $media['attributes'] = $attributes;
    unset($media['raw_a']);

    return $media;
}

/**
 * Parse les paramètres FMTP de type "key=value; key2=value2; flag"
 */
function sdp_parse_fmtp_params($raw)
{
    $params = array();
    $parts = preg_split('/;\s*/', trim($raw));
    foreach ($parts as $p) {
        if ($p === '') continue;
        $kv = explode('=', $p, 2);
        if (count($kv) == 2) {
            $key = trim($kv[0]);
            $val = trim($kv[1]);
            $params[$key] = $val;
        } else {
            // paramètre de type flag (ex: "interlace")
            $key = trim($p);
            $params[$key] = true;
        }
    }
    return $params;
}

// ---------------------------------------------------------
// 3) Helpers pour récupérer les blocs media
// ---------------------------------------------------------

function sdp_find_first_media_of_type($sdpStruct, $type)
{
    foreach ($sdpStruct['media'] as $m) {
        if ($m['type'] === $type) {
            return $m;
        }
    }
    return null;
}

// ---------------------------------------------------------
// 4) Helpers de décodage 2110 vidéo / audio / data
// ---------------------------------------------------------

/**
 * Décode quelques infos utiles pour la vidéo ST 2110-20 :
 * width, height, exactframerate, sampling, interlace, colorimetry...
 */
function sdp_decode_video_2110($media)
{
    $pt = isset($media['payloads'][0]) ? $media['payloads'][0] : null;
    if ($pt === null) return null;

    $rtpmap    = isset($media['attributes']['rtpmap'][$pt]) ? $media['attributes']['rtpmap'][$pt] : null;
    $fmtpEntry = isset($media['attributes']['fmtp'][$pt])   ? $media['attributes']['fmtp'][$pt]    : null;
    $fmtp      = $fmtpEntry ? $fmtpEntry['params'] : array();

    // width / height / sampling
    $width  = isset($fmtp['width'])  ? intval($fmtp['width'])  : null;
    $height = isset($fmtp['height']) ? intval($fmtp['height']) : null;
    $sampling = isset($fmtp['sampling']) ? $fmtp['sampling'] : null;

    // COLORIMETRY ou colorimetry (on garde tel quel, c’est l’info générique)
    $colorimetry = null;
    if (isset($fmtp['colorimetry'])) {
        $colorimetry = $fmtp['colorimetry'];
    } elseif (isset($fmtp['COLORIMETRY'])) {
        $colorimetry = $fmtp['COLORIMETRY'];
    }

    // TCS ou tcs -> SDR / HLG / PQ / ...
    $tcs = null;
    if (isset($fmtp['TCS'])) {
        $tcs = $fmtp['TCS'];
    } elseif (isset($fmtp['tcs'])) {
        $tcs = $fmtp['tcs'];
    }

    // Déduction HDR / SDR uniquement depuis TCS
    $hdr        = false;
    $hdr_format = null;

    if ($tcs !== null) {
        $tcs_up = strtoupper($tcs);
        if ($tcs_up !== 'SDR') {
            // tout ce qui n’est pas SDR est considéré HDR
            $hdr = true;
            $hdr_format = $tcs_up; // HLG, PQ, etc.
        }
    }

    // exactframerate (exactframerate ou EXACTFRAMERATE)
    $exactframerate = null;
    if (isset($fmtp['exactframerate'])) {
        $exactframerate = $fmtp['exactframerate'];
    } elseif (isset($fmtp['EXACTFRAMERATE'])) {
        $exactframerate = $fmtp['EXACTFRAMERATE'];
    }

    $info = array(
        'encoding'       => $rtpmap ? $rtpmap['encoding'] : null,
        'clockrate'      => $rtpmap ? $rtpmap['clockrate'] : null,
        'width'          => $width,
        'height'         => $height,
        'sampling'       => $sampling,
        'colorimetry'    => $colorimetry,
        'exactframerate' => $exactframerate,
        'interlace'      => (isset($fmtp['interlace'])  && $fmtp['interlace']  === true)
                            || (isset($fmtp['INTERLACE']) && $fmtp['INTERLACE'] === true),
        'segmented'      => (isset($fmtp['segmented'])  && $fmtp['segmented']  === true)
                            || (isset($fmtp['SEGMENTED']) && $fmtp['SEGMENTED'] === true),

        // champs HDR séparés
        'tcs'        => $tcs,        // valeur brute SDP (SDR, HLG, PQ…)
        'hdr'        => $hdr,        // bool
        'hdr_format' => $hdr_format  // HLG, PQ… ou null si SDR
    );

    return $info;
}



/**
 * Décode audio : encodage (L24/L16), sample_rate, channels, channel_order, ptime...
 */
function sdp_decode_audio_2110($media)
{
    $pt = isset($media['payloads'][0]) ? $media['payloads'][0] : null;
    if ($pt === null) return null;

    $rtpmap = isset($media['attributes']['rtpmap'][$pt]) ? $media['attributes']['rtpmap'][$pt] : null;
    $fmtp   = isset($media['attributes']['fmtp'][$pt])   ? $media['attributes']['fmtp'][$pt]['params'] : array();

    $encoding  = $rtpmap ? $rtpmap['encoding'] : null;   // L24, L16, AM824...
    $clockrate = $rtpmap ? $rtpmap['clockrate'] : null;  // typiquement 48000
    $channels  = ($rtpmap && isset($rtpmap['channels']) && $rtpmap['channels']) ? $rtpmap['channels'] : null;

    // --- récupérer ptime dans les autres attributs (a=ptime:...)
    $ptime = null;
    if (isset($media['attributes']['other']) && is_array($media['attributes']['other'])) {
        foreach ($media['attributes']['other'] as $other) {
            if (strpos($other, 'ptime:') === 0) {
                $ptime = trim(substr($other, strlen('ptime:')));
                break;
            }
        }
    }

    $info = array(
        'encoding'      => $encoding,
        'sample_rate'   => $clockrate,
        'channels'      => $channels,
        'channel_order' => isset($fmtp['channel-order']) ? $fmtp['channel-order'] : null,
        'ptime'         => $ptime,
        'fmtp_params'   => $fmtp
    );

    return $info;
}


/**
 * Décode data / ANC (2110-40)
 */
function sdp_decode_data_2110($media)
{
    $pt = isset($media['payloads'][0]) ? $media['payloads'][0] : null;
    if ($pt === null) return null;

    $rtpmap = isset($media['attributes']['rtpmap'][$pt]) ? $media['attributes']['rtpmap'][$pt] : null;
    $fmtp   = isset($media['attributes']['fmtp'][$pt])   ? $media['attributes']['fmtp'][$pt]['params'] : array();

    $info = array(
        'encoding'  => $rtpmap ? $rtpmap['encoding'] : null,   // ex: SMPTE291
        'clockrate' => $rtpmap ? $rtpmap['clockrate'] : null,
        'fmtp_params' => $fmtp
    );

    return $info;
}













/**
 * Normalise le exactframerate SDP (ex: "25/1", "50/1.001", "25")
 * en un entier lisible (25, 50, etc.).
 * Si $interlace = true, on renvoie le "field rate" (x2).
 */
function sdp_normalize_framerate($exactframerate, $interlace)
{
    if ($exactframerate === null || $exactframerate === '') {
        return null;
    }

    // "25/1", "50/1.001", "25"
    $num = null;
    $den = 1.0;

    if (strpos($exactframerate, '/') !== false) {
        $parts = explode('/', $exactframerate, 2);
        $num = floatval($parts[0]);
        $den = floatval($parts[1]) != 0.0 ? floatval($parts[1]) : 1.0;
    } else {
        $num = floatval($exactframerate);
    }

    if ($num === null) {
        return null;
    }

    $frameRate = $num / $den;

    // Si interlace : on affiche le "field rate" (ex: 25 fps -> 50i)
    $nominal = $interlace ? ($frameRate * 2.0) : $frameRate;

    return intval(round($nominal));
}

/**
 * Retourne un profil "lisible" à partir d'un SDP complet et d'un type:
 *   - type = 'audio' -> "48000-L24-8CH"
 *   - type = 'video' -> "1080i50", "2160p50-HLG-BT2020"
 *
 * Retourne null si impossible.
 */
function sdp_get_profile_from_sdp($sdp, $type)
{
    $parsed = sdp_parse($sdp);

    if ($type === 'audio') {
        $media = sdp_find_first_media_of_type($parsed, 'audio');
        if (!$media) {
            return null;
        }
        $info = sdp_decode_audio_2110($media);
        if ($info === null) {
            return null;
        }

        $sr        = isset($info['sample_rate']) ? $info['sample_rate'] : null;
        $encoding  = isset($info['encoding']) ? strtoupper($info['encoding']) : null;
        $channels  = isset($info['channels']) ? $info['channels'] : null;

        if ($sr === null || $encoding === null || $channels === null) {
            return null;
        }

        // Ex: "48000-L24-8CH"
        return $sr . '-' . $encoding . '-' . $channels . 'CH';
    }

    if ($type === 'video') {
        $media = sdp_find_first_media_of_type($parsed, 'video');
        if (!$media) {
            return null;
        }
        $info = sdp_decode_video_2110($media);
        if ($info === null) {
            return null;
        }

        $width       = isset($info['width']) ? $info['width'] : null;
        $height      = isset($info['height']) ? $info['height'] : null;
        $exactrate   = isset($info['exactframerate']) ? $info['exactframerate'] : null;
        $interlace   = isset($info['interlace']) ? $info['interlace'] : false;
        $colorimetry = isset($info['colorimetry']) ? $info['colorimetry'] : null;
        $hdr         = isset($info['hdr']) ? $info['hdr'] : false;
        $hdrFormat   = isset($info['hdr_format']) ? $info['hdr_format'] : null;

        if ($height === null) {
            return null;
        }

        // 1080i vs 1080p
        $scan = $interlace ? 'i' : 'p';

        // Frame/field rate : 25, 50, etc.
        $rate = sdp_normalize_framerate($exactrate, $interlace);
        if ($rate === null) {
            return null;
        }

        // Base : "1080i50" ou "2160p25"
        $profile = $height . $scan . $rate;

        // HDR : on ajoute "-HLG-BT2020" etc.
        if ($hdr && $hdrFormat !== null) {
            $hdrFormatUp = strtoupper($hdrFormat);
            $col = $colorimetry ? strtoupper($colorimetry) : null;

            $profile .= '-' . $hdrFormatUp;
            if ($col !== null) {
                $profile .= '-' . $col;
            }
        }

        return $profile;
    }

    // type non supporté
    return null;
}


?>








