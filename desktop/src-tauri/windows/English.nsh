; Tauri English maintenance messages, customized from:
; https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.4/crates/tauri-bundler/src/bundle/windows/nsis/languages/English.nsh
; Keep every upstream LangString when updating the Tauri CLI.
Var QuotaInstalledVersion

LangString addOrReinstall ${LANG_ENGLISH} "Reinstall ${VERSION} (keep accounts and settings)"
LangString alreadyInstalled ${LANG_ENGLISH} "Existing installation found"
LangString alreadyInstalledLong ${LANG_ENGLISH} "${PRODUCTNAME} ${VERSION} is already installed. Reinstall to keep your accounts and settings, or choose Uninstall."
LangString appRunning ${LANG_ENGLISH} "${PRODUCTNAME} is running. Choose Quit from its tray menu, then try again."
LangString appRunningOkKill ${LANG_ENGLISH} "${PRODUCTNAME} is running. Click OK to close it and continue setup."
LangString chooseMaintenanceOption ${LANG_ENGLISH} "Choose whether to reinstall or uninstall."
LangString choowHowToInstall ${LANG_ENGLISH} "Review the existing installation before continuing."
LangString createDesktop ${LANG_ENGLISH} "Create desktop shortcut"
LangString dontUninstall ${LANG_ENGLISH} "Update to ${VERSION} (keep accounts and settings)"
LangString dontUninstallDowngrade ${LANG_ENGLISH} "In-place downgrade is unavailable; use a newer installer."
LangString failedToKillApp ${LANG_ENGLISH} "Could not close ${PRODUCTNAME}. Choose Quit from its tray menu and try again."
LangString installingWebview2 ${LANG_ENGLISH} "Installing WebView2..."
LangString newerVersionInstalled ${LANG_ENGLISH} "A newer version is installed. Cancel and download the latest installer, or uninstall first to install ${VERSION}."
LangString older ${LANG_ENGLISH} "older"
LangString olderOrUnknownVersionInstalled ${LANG_ENGLISH} "Update $QuotaInstalledVersion to ${VERSION}. Choose Update below to keep your accounts and settings."
LangString silentDowngrades ${LANG_ENGLISH} "Downgrades are disabled for this installer, can't proceed with the silent installer, please use the graphical interface installer instead.$\n"
LangString unableToUninstall ${LANG_ENGLISH} "Unable to uninstall!"
LangString uninstallApp ${LANG_ENGLISH} "Uninstall ${PRODUCTNAME}"
LangString uninstallBeforeInstalling ${LANG_ENGLISH} "Uninstall first, then install ${VERSION}"
LangString unknown ${LANG_ENGLISH} "unknown"
LangString webview2AbortError ${LANG_ENGLISH} "Failed to install WebView2! The app can't run without it. Try restarting the installer."
LangString webview2DownloadError ${LANG_ENGLISH} "Error: Downloading WebView2 Failed - $0"
LangString webview2DownloadSuccess ${LANG_ENGLISH} "WebView2 bootstrapper downloaded successfully"
LangString webview2Downloading ${LANG_ENGLISH} "Downloading WebView2 bootstrapper..."
LangString webview2InstallError ${LANG_ENGLISH} "Error: Installing WebView2 failed with exit code $1"
LangString webview2InstallSuccess ${LANG_ENGLISH} "WebView2 installed successfully"
LangString deleteAppData ${LANG_ENGLISH} "Delete the application data"

; installer-hooks.nsh registers this MUI callback before pages are generated.
; This language file is included after UNINSTKEY and ReinstallPageCheck exist.
Function QuotaUpdateGuiInit
  Push $0
  Push $1
  ReadRegStr $0 SHCTX "${UNINSTKEY}" "UninstallString"
  ${If} $0 != ""
    ReadRegStr $QuotaInstalledVersion SHCTX "${UNINSTKEY}" "DisplayVersion"
    ${If} $QuotaInstalledVersion == ""
      StrCpy $QuotaInstalledVersion "an unknown version"
    ${Else}
      nsis_tauri_utils::SemverCompare "${VERSION}" $QuotaInstalledVersion
      Pop $1
      ${If} $1 = 1
        ; Tauri's second maintenance option updates without uninstalling.
        StrCpy $ReinstallPageCheck 2
      ${EndIf}
    ${EndIf}
  ${EndIf}
  Pop $1
  Pop $0
FunctionEnd
