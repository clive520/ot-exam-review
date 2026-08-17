param([string]$Year, [string]$CodeSet = "old")
$names = @{ '0105'='解剖學與生理學'; '0801'='職能治療學概論'; '0802'='生理障礙職能治療學'; '0803'='心理障礙職能治療學'; '0804'='小兒職能治療學'; '0805'='職能治療技術學' }
$map = @{ '11'='0105'; '22'='0801'; '33'='0802'; '44'='0803'; '55'='0804'; '66'='0805' }
if ($CodeSet -eq "new") { $codes = @('0105','0801','0802','0803','0804','0805') } else { $codes = @('11','22','33','44','55','66') }

foreach ($c in $codes) {
  $code = if ($CodeSet -eq "new") { $c } else { $map[$c] }
  $dir = "$Year\$code"
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $exam = Get-ChildItem "$Year\*_${c}_*.pdf" | Where-Object { $_.Name -notlike "*ANS*" -and $_.Name -notlike "*MOD*" } | Select-Object -First 1
  $ans = Get-ChildItem "$Year\*_ANS${c}_*.pdf" | Select-Object -First 1
  $mod = Get-ChildItem "$Year\*_MOD${c}_*.pdf" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $exam -or -not $ans) { Write-Host ("WARN " + $Year + "/" + $code + " 缺檔"); continue }
  Write-Host ("--- " + $Year + " " + $code + " " + $names[$code])
  node "pdf_sop\scripts\01_extract_text.js" $exam.FullName "$dir\exam.txt"
  node "pdf_sop\scripts\01_extract_text.js" $ans.FullName "$dir\ans.txt"
  if ($mod) { node "pdf_sop\scripts\01_extract_text.js" $mod.FullName "$dir\mod.txt" }
  node "pdf_sop\scripts\02_build_csv.js" "$dir\exam.txt" "$dir\ans.txt" "$dir\基礎.csv"
  if ($mod) {
    node "pdf_sop\scripts\06_apply_mod.js" "$dir\基礎.csv" "$dir\mod.txt" "$dir\基礎_含更正.csv"
  } else {
    Copy-Item "$dir\基礎.csv" "$dir\基礎_含更正.csv" -Force
  }
  if (-not (Test-Path "$dir\term_fixes.json")) {
    [System.IO.File]::WriteAllText((Join-Path (Get-Location) "$dir\term_fixes.json"), "[]", (New-Object System.Text.UTF8Encoding $false))
  }
  node "pdf_sop\scripts\03_clean_csv.js" "$dir\基礎_含更正.csv" "$dir\清洗版.csv" "$dir\修正紀錄.csv" "$dir\term_fixes.json"
}
Write-Host ("=== " + $Year + " 完成 ===")
