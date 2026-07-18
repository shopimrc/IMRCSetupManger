# build-android.ps1
# Windows PowerShell script to run EAS Android build and print download link
param(
  [switch]$bumpVersion
)

Write-Host "Running EAS Android build (production profile)..."

if ($bumpVersion) {
  Write-Host "Bumping version in app.json is not automated in this script. Please bump version manually or run version-bump script."
}

# Run EAS build
eas build --platform android --profile production

if ($LASTEXITCODE -eq 0) {
  Write-Host "Build started. Check EAS dashboard for progress and download link."
} else {
  Write-Host "EAS build command failed. Check the output above for details."
}
