<#
  World Cup 2026 Goals Draw - data updater.

  Fetches the latest results from the openfootball public-domain dataset,
  sums goals per team, maps teams to friends, works out who is still in,
  and writes data/standings.json + data/matches.json.

  Scoring rules (from teams.json):
    - Own goals count (they are part of the scoreline).
    - Extra-time goals count (uses score.et when present).
    - Penalty shootouts do NOT count (score.p is ignored for goals;
      it is only used to decide the loser of a knockout tie).

  Runs on Windows PowerShell 5.1 and PowerShell 7 (pwsh) unchanged.
#>

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root    = Split-Path -Parent $PSScriptRoot
$DataDir = Join-Path $Root 'data'
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

# ---------- helpers ----------------------------------------------------------

function Normalize-Name {
    param([string]$s)
    if ([string]::IsNullOrWhiteSpace($s)) { return '' }
    $d = $s.Normalize([Text.NormalizationForm]::FormD)
    $sb = New-Object System.Text.StringBuilder
    foreach ($ch in $d.ToCharArray()) {
        if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$sb.Append($ch)
        }
    }
    $r = $sb.ToString().ToLowerInvariant()
    $r = $r -replace '&', ' and '
    $r = $r -replace "[^a-z0-9 ]", ' '
    $r = ($r -replace '\s+', ' ').Trim()
    return $r
}

# A team1/team2 value is a bracket placeholder (not a real team) until resolved,
# e.g. "1A", "2L", "3A/B/C/D/F", "W73", "L101".
function Test-Placeholder {
    param([string]$s)
    return ($s -match '^[123][A-L]$') -or ($s -match '^3[A-L/]+$') -or ($s -match '^[WL]\d{1,3}$')
}

function Write-JsonFile {
    param($Object, [string]$Path)
    $json = $Object | ConvertTo-Json -Depth 12
    [System.IO.File]::WriteAllText($Path, $json, (New-Object System.Text.UTF8Encoding($false)))
}

# ---------- load config ------------------------------------------------------

$cfgPath = Join-Path $Root 'teams.json'
$cfgRaw  = [System.IO.File]::ReadAllText($cfgPath, [System.Text.Encoding]::UTF8)
$config  = $cfgRaw | ConvertFrom-Json

# normalized team -> friend name, and normalized -> the friend's display string
$ownerOf       = @{}
$displayOfOwned = @{}
foreach ($friend in $config.friends.PSObject.Properties) {
    foreach ($team in $friend.Value) {
        $n = Normalize-Name $team
        $ownerOf[$n]        = $friend.Name
        $displayOfOwned[$n] = $team
        $aliasProp = $config.aliases.PSObject.Properties | Where-Object { $_.Name -eq $team }
        if ($aliasProp) {
            foreach ($al in @($aliasProp.Value)) {
                $an = Normalize-Name $al
                $ownerOf[$an]        = $friend.Name
                $displayOfOwned[$an] = $team
            }
        }
    }
}

# normalized team name -> ISO flag code (for the flag images)
$codeOf = @{}
if ($config.PSObject.Properties.Name -contains 'flags') {
    foreach ($p in $config.flags.PSObject.Properties) { $codeOf[(Normalize-Name $p.Name)] = $p.Value }
}
function Get-Code { param([string]$n) if ($codeOf.ContainsKey($n)) { return $codeOf[$n] } else { return $null } }

# ---------- fetch data -------------------------------------------------------

Write-Host "Fetching $($config.dataSource)"
$wc    = New-Object System.Net.WebClient
$bytes = $wc.DownloadData($config.dataSource)
$text  = [System.Text.Encoding]::UTF8.GetString($bytes)
$data  = $text | ConvertFrom-Json
Write-Host "Loaded $($data.matches.Count) matches."

$knockoutRounds = @('Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', 'Match for third place', 'Final')

# ---------- tally ------------------------------------------------------------

$teamGoals    = @{}   # normalized -> goals scored (across all matches)
$teamPlayed   = @{}   # normalized -> matches played
$officialName = @{}   # normalized -> official display name from the data
$realTeams    = New-Object System.Collections.Generic.HashSet[string]
$lostKnockout = @{}   # normalized -> $true if eliminated in a knockout match
$knockoutTeams = New-Object System.Collections.Generic.HashSet[string]  # real teams named in any KO fixture
$knockoutResolved = $false

function Score-Final {
    param($score)
    # final score for goal-counting: extra time if it went there, else full time
    $fs = $score.ft
    if (($score.PSObject.Properties.Name -contains 'et') -and $score.et) { $fs = $score.et }
    return @([int]$fs[0], [int]$fs[1])
}

function Test-Played {
    param($m)
    return ($m.PSObject.Properties.Name -contains 'score') -and $m.score `
        -and ($m.score.PSObject.Properties.Name -contains 'ft') -and $m.score.ft
}

foreach ($m in $data.matches) {
    $t1 = [string]$m.team1; $t2 = [string]$m.team2
    $n1 = Normalize-Name $t1; $n2 = Normalize-Name $t2
    $t1real = -not (Test-Placeholder $t1)
    $t2real = -not (Test-Placeholder $t2)
    $isKO   = $knockoutRounds -contains $m.round

    if ($t1real) { [void]$realTeams.Add($n1); $officialName[$n1] = $t1 }
    if ($t2real) { [void]$realTeams.Add($n2); $officialName[$n2] = $t2 }

    if ($isKO) {
        if ($t1real) { [void]$knockoutTeams.Add($n1); $knockoutResolved = $true }
        if ($t2real) { [void]$knockoutTeams.Add($n2); $knockoutResolved = $true }
    }

    if (Test-Played $m) {
        $fs = Score-Final $m.score
        $g1 = $fs[0]; $g2 = $fs[1]
        if ($t1real) { $teamGoals[$n1] = [int]$teamGoals[$n1] + $g1; $teamPlayed[$n1] = [int]$teamPlayed[$n1] + 1 }
        if ($t2real) { $teamGoals[$n2] = [int]$teamGoals[$n2] + $g2; $teamPlayed[$n2] = [int]$teamPlayed[$n2] + 1 }

        if ($isKO -and $t1real -and $t2real) {
            $loser = $null
            if ($g1 -ne $g2) {
                if ($g1 -lt $g2) { $loser = $n1 } else { $loser = $n2 }
            } elseif (($m.score.PSObject.Properties.Name -contains 'p') -and $m.score.p) {
                $p1 = [int]$m.score.p[0]; $p2 = [int]$m.score.p[1]
                if ($p1 -lt $p2) { $loser = $n1 } elseif ($p2 -lt $p1) { $loser = $n2 }
            }
            if ($loser) { $lostKnockout[$loser] = $true }
        }
    }
}

# A real team is "still in" unless it lost a knockout match, or the knockout
# bracket has started resolving and the team is not in it (i.e. it went out at
# the group stage). During the group stage every team counts as still in.
function Test-Alive {
    param([string]$n)
    if ($lostKnockout[$n]) { return $false }
    if ($knockoutResolved -and -not $knockoutTeams.Contains($n)) { return $false }
    return $true
}

# ---------- build standings --------------------------------------------------

$friendObjs = @()
foreach ($friend in $config.friends.PSObject.Properties) {
    $teamRows = @()
    $total = 0; $left = 0
    foreach ($team in $friend.Value) {
        $n = Normalize-Name $team
        $g = [int]$teamGoals[$n]
        $p = [int]$teamPlayed[$n]
        $alive = [bool](Test-Alive $n)
        if ($alive) { $left++ }
        $total += $g
        $disp = if ($officialName.ContainsKey($n)) { $officialName[$n] } else { $team }
        $teamRows += [pscustomobject]@{ name = $disp; goals = $g; played = $p; alive = $alive; code = (Get-Code $n) }
    }
    $teamRows = @($teamRows | Sort-Object @{Expression = 'goals'; Descending = $true}, @{Expression = 'name'})
    $friendObjs += [pscustomobject]@{
        name = $friend.Name; totalGoals = $total; teamsLeft = $left; teamsTotal = @($friend.Value).Count; teams = $teamRows
    }
}

$friendObjs = @($friendObjs | Sort-Object `
    @{Expression = 'totalGoals'; Descending = $true}, `
    @{Expression = 'teamsLeft';  Descending = $true}, `
    @{Expression = 'name'})

$friendsOut = @()
$rank = 0; $prevGoals = $null; $seen = 0
foreach ($f in $friendObjs) {
    $seen++
    if ($f.totalGoals -ne $prevGoals) { $rank = $seen; $prevGoals = $f.totalGoals }
    $teamsList = @()
    foreach ($t in $f.teams) {
        $teamsList += [ordered]@{ name = $t.name; goals = $t.goals; played = $t.played; alive = $t.alive; code = $t.code }
    }
    $friendsOut += [ordered]@{
        rank = $rank; name = $f.name; totalGoals = $f.totalGoals
        teamsLeft = $f.teamsLeft; teamsTotal = $f.teamsTotal; teams = @($teamsList)
    }
}

# Unassigned = real tournament teams nobody drew
$unTeams = @(); $unTotal = 0; $unLeft = 0
foreach ($n in $realTeams) {
    if (-not $ownerOf.ContainsKey($n)) {
        $g = [int]$teamGoals[$n]; $p = [int]$teamPlayed[$n]; $alive = [bool](Test-Alive $n)
        if ($alive) { $unLeft++ }
        $unTotal += $g
        $unTeams += [pscustomobject]@{ name = $officialName[$n]; goals = $g; played = $p; alive = $alive; code = (Get-Code $n) }
    }
}
$unTeams = @($unTeams | Sort-Object @{Expression = 'goals'; Descending = $true}, @{Expression = 'name'})
$unList = @()
foreach ($t in $unTeams) { $unList += [ordered]@{ name = $t.name; goals = $t.goals; played = $t.played; alive = $t.alive; code = $t.code } }

$played = @($data.matches | Where-Object { Test-Played $_ }).Count
$now    = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

$standings = [ordered]@{
    generatedAt = $now
    competition = $config.competition
    rules       = $config.rules
    meta        = [ordered]@{ matchesPlayed = $played; matchesTotal = @($data.matches).Count; teamsInTournament = $realTeams.Count }
    friends     = @($friendsOut)
    unassigned  = [ordered]@{ totalGoals = $unTotal; teamsLeft = $unLeft; teamsTotal = @($unTeams).Count; teams = @($unList) }
}

# ---------- build matches feed ----------------------------------------------

$matchesOut = @()
$idx = 0
foreach ($m in $data.matches) {
    $idx++
    $t1 = [string]$m.team1; $t2 = [string]$m.team2
    $n1 = Normalize-Name $t1; $n2 = Normalize-Name $t2
    $o1 = if (Test-Placeholder $t1) { 'TBD' } elseif ($ownerOf.ContainsKey($n1)) { $ownerOf[$n1] } else { 'Unassigned' }
    $o2 = if (Test-Placeholder $t2) { 'TBD' } elseif ($ownerOf.ContainsKey($n2)) { $ownerOf[$n2] } else { 'Unassigned' }
    $c1 = if (Test-Placeholder $t1) { $null } else { Get-Code $n1 }
    $c2 = if (Test-Placeholder $t2) { $null } else { Get-Code $n2 }
    $played1 = $null; $played2 = $null; $pens = $null
    $isPlayed = Test-Played $m
    if ($isPlayed) {
        $fs = Score-Final $m.score; $played1 = $fs[0]; $played2 = $fs[1]
        if (($m.score.PSObject.Properties.Name -contains 'p') -and $m.score.p) {
            $pens = "$([int]$m.score.p[0])-$([int]$m.score.p[1])"
        }
    }
    $num = if ($m.PSObject.Properties.Name -contains 'num') { $m.num } else { $idx }
    $grp = if ($m.PSObject.Properties.Name -contains 'group') { $m.group } else { $null }
    $matchesOut += [ordered]@{
        num = $num; round = $m.round; group = $grp
        date = $m.date; time = $m.time; ground = $m.ground
        team1 = $t1; team2 = $t2; owner1 = $o1; owner2 = $o2; code1 = $c1; code2 = $c2
        played = [bool]$isPlayed; score1 = $played1; score2 = $played2; pens = $pens
    }
}

$matchesFeed = [ordered]@{ generatedAt = $now; matches = @($matchesOut) }

# ---------- write ------------------------------------------------------------

Write-JsonFile $standings   (Join-Path $DataDir 'standings.json')
Write-JsonFile $matchesFeed (Join-Path $DataDir 'matches.json')

Write-Host ""
Write-Host "Standings (rank  player  goals  teams left):"
foreach ($f in $friendsOut) {
    Write-Host ("  {0}.  {1,-7} {2,3} goals   {3}/{4} teams left" -f $f.rank, $f.name, $f.totalGoals, $f.teamsLeft, $f.teamsTotal)
}
Write-Host ("  --  Unassigned {0,3} goals   {1}/{2} teams left  ({3})" -f $unTotal, $unLeft, @($unTeams).Count, (($unTeams | ForEach-Object { $_.name }) -join ', '))
Write-Host ""
Write-Host "Matches played: $played / $(@($data.matches).Count)"
Write-Host "Wrote standings.json and matches.json to $DataDir"
