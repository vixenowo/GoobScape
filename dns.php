<?php
header('Content-Type: application/json');
session_start();

$maxRequests = 30;
$timeWindow = 60;

if (!isset($_SESSION['rate_limit'])) {
    $_SESSION['rate_limit'] = [
        'count' => 0,
        'start' => time()
    ];
}

$rl = &$_SESSION['rate_limit'];

if (time() - $rl['start'] >= $timeWindow) {
    $rl['count'] = 0;
    $rl['start'] = time();
}

$rl['count']++;

if ($rl['count'] > $maxRequests) {
    http_response_code(429);
    echo json_encode([
        'error' => 'Rate limit exceeded',
        'retry_after' => $timeWindow - (time() - $rl['start'])
    ]);
    exit;
}

$domain = '';
if (isset($_GET['domain'])) {
    $domain = trim($_GET['domain']);
} elseif (isset($_POST['domain'])) {
    $domain = trim($_POST['domain']);
}

if (!$domain) {
    echo json_encode([
        'error' => 'No domain specified'
    ]);
    exit;
}

if (!preg_match('/^[a-zA-Z0-9.-]{1,253}$/', $domain)) {
    echo json_encode(['error' => 'Invalid'], JSON_UNESCAPED_SLASHES);
    exit;
}


$domainsFile = __DIR__ . '/domains.json';
if (!file_exists($domainsFile)) {
    echo json_encode([
        'error' => 'Domains file not found'
    ]);
    exit;
}

$domainsData = json_decode(file_get_contents($domainsFile), true);
if ($domainsData === null) {
    echo json_encode([
        'error' => 'Invalid JSON in domains file'
    ]);
    exit;
}

if (isset($domainsData[$domain])) {
    echo json_encode($domainsData[$domain]);
} else {
    echo json_encode([
        'error' => 'Domain not found',
        'domain' => $domain
    ]);
}
?>
