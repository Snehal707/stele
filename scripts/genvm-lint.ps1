param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $Arguments
)

$venvLint = Join-Path $env:USERPROFILE '.cache\genlayer-lint-venv\Scripts\genvm-lint.exe'
if (-not (Test-Path -LiteralPath $venvLint)) {
    throw "Missing repaired GenVM linter environment: $venvLint"
}

$env:PYTHONIOENCODING = 'utf-8'
& $venvLint @Arguments
exit $LASTEXITCODE
