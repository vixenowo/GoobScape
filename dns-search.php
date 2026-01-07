<?php
header('Content-Type: application/json');
session_start();

$maxRequests = 30;
$timeWindow = 60;

if (!isset($_SESSION['rate_limit'])) {
    $_SESSION['rate_limit'] = ['count' => 0, 'start' => time()];
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

$query = isset($_GET['q']) ? trim($_GET['q']) : "";
$page  = isset($_GET['page']) ? intval($_GET['page']) : 1;
$limit = isset($_GET['limit']) ? intval($_GET['limit']) : 10;

if ($page < 1) $page = 1;
if ($limit < 1 || $limit > 100) $limit = 10; 

if ($query === "") {
    echo json_encode([
        'error' => 'Missing search query'
    ]);
    exit;
}

if (!preg_match('/^[a-zA-Z0-9 :\/._-]{1,100}$/', $query)) {
    echo json_encode([
        'error' => 'Invalid search query'
    ]);
    exit;
}

$domainsFile = __DIR__ . '/domains.json';

if (!file_exists($domainsFile)) {
    echo json_encode(['error' => 'Domains file not found']);
    exit;
}

$domainsData = json_decode(file_get_contents($domainsFile), true);

if (!is_array($domainsData)) {
    echo json_encode(['error' => 'Invalid domains JSON']);
    exit;
}

$queryWords = preg_split('/\s+/', strtolower($query));
$results = [];

foreach ($domainsData as $domain => $info) {
    $data = isset($info['domain']) ? $info['domain'] : $info;

    $haystack = strtolower(
        $domain . " " .
        ($data['title'] ?? "") . " " .
        ($data['description'] ?? "")
    );

    $haystackWords = preg_split('/\s+/', $haystack);
    $score = 0;

    
    foreach ($queryWords as $word) {
        if ($word === "") continue;

        if (strpos($haystack, $word) !== false) {
            $score += 2;
            continue;
        }

        foreach ($haystackWords as $hw) {
            if ($hw === "") continue;

            $distance = levenshtein($word, $hw);

            $maxAllowed = ceil(strlen($hw) * 0.35);

            if ($distance <= $maxAllowed) {
                $score += 1;
                break;
            }
        }
    }

    if ($score > 0) {
        $results[] = [
            'domain' => $domain,
            'title' => $data['title'] ?? "",
            'address' => $data['address'] ?? "", 
            'description' => $data['description'] ?? "",
            'score' => $score
        ];
    }
}

usort($results, function ($a, $b) {
    return $b['score'] - $a['score'];
});

$totalResults = count($results);
$totalPages = max(1, ceil($totalResults / $limit));

$startIndex = ($page - 1) * $limit;
$pagedResults = array_slice($results, $startIndex, $limit);

echo json_encode([
    'query' => $query,
    'page' => $page,
    'total_pages' => $totalPages,
    'per_page' => $limit,
    'total_results' => $totalResults,
    'results' => $pagedResults
], JSON_PRETTY_PRINT);

?>
