<p align="center">
  <a href="../README.md"><img src="../assets/png/icon-256.png" width="80" height="80" alt="AI Quota Meter app icon"></a>
</p>

<h1 align="center">AI Quota Meter</h1>
<p align="center"><strong>Windows installers</strong></p>
<p align="center"><a href="../README.md">Project overview</a> · <a href="#update-behavior">Update behavior</a> · <a href="#verification">Verification</a> · <a href="#framework-references">References</a></p>

Both installers use their framework's existing installation identity and upgrade mechanism. The UI makes that operation explicit before files are replaced. Download the same edition to update it; the browser-based and desktop installers have separate identities.

## Update behavior

| Existing installation | Browser-based / Inno Setup | Desktop / Tauri NSIS |
| --- | --- | --- |
| None | Normal install wizard | Normal install wizard |
| Older version | Update welcome, version comparison, Update confirmation button; reuse existing folder | Version comparison; Update is preselected and keeps accounts/settings |
| Same version | Reinstall welcome and confirmation button | Reinstall is preselected; Uninstall remains available |
| Newer version | Stop with a newer-version message, including silent setup | Warn; disable in-place downgrade; retain Tauri's explicit uninstall-first route |

## Installation identity and data

Inno reads its AppId uninstall registration in the selected installation scope and 64-bit registry view. It keeps the existing AppId, installation directory, and previous shortcut choices. It does not run a prior uninstaller. Tauri uses its normal registration and version comparison; only the maintenance wording and initial upgrade selection are customized. Neither update path deletes browser storage or connector profiles.

## Verification

Compile both installers using the normal release build commands. Test each row above in a disposable Windows user account or VM. Use different installer versions with the **same edition and identity**. For upgrades and reinstalls:

1. Install an earlier version in a custom directory; choose shortcuts and save a test account.
2. Quit the app, then run the incoming installer. Check the detected versions and default operation before continuing.
3. In Inno, check the final **Update** or **Reinstall** button. In NSIS, choose the preselected operation without uninstalling.
4. Finish setup and confirm the new version, existing installation directory, saved account, settings, history, and shortcuts. Windows Installed apps should contain one entry for that edition.
5. Repeat with the app running to check the framework's close-app handling. For desktop, also check updating after minimizing to the tray.

### Current validation coverage

During implementation, both installer formats were compiled and native wizard controls were checked with isolated temporary installation identities for fresh, older, same, and newer version registrations. Checks stopped before installing files; a full replacement/data-retention test still needs a disposable installation. Bundling cached desktop binaries validates installer code but is not a replacement for the full release build.

## Framework references

- [Inno Setup AppId and update identity](https://jrsoftware.org/ishelp/topic_setup_appid.htm)
- [Inno Setup previous installation directory](https://jrsoftware.org/ishelp/topic_setup_usepreviousappdir.htm)
- [Inno Setup installation scopes](https://jrsoftware.org/ishelp/topic_sameappnotes.htm)
- [Tauri NSIS customization](https://v2.tauri.app/distribute/windows-installer/)
- [Tauri custom language files](https://v2.tauri.app/reference/config/#customlanguagefiles)
- [NSIS Modern UI callbacks](https://nsis.sourceforge.io/Docs/Modern%20UI%202/Readme.html)

<p align="center"><a href="../README.md">← Back to AI Quota Meter</a></p>
