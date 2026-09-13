; Inno Setup script for AI Quota Meter.
; Build with: iscc installer\ai-quota-meter.iss /DMyAppVersion=0.1.0
; (the release workflow passes /DMyAppVersion from package.json; a manual
; run without it falls back to 0.0.0-dev so the script still compiles.)

#ifndef MyAppVersion
  #define MyAppVersion "0.0.0-dev"
#endif
#define MyAppName "AI Quota Meter"
#define MyAppExe "ai-quota-meter.exe"
#define MyAppPublisher "AI Quota Meter contributors"
#define MyAppURL "https://github.com/vibezentura/ai-quota-meter"

[Setup]
AppId={{9E7F9D6B-6C7B-4B7C-9A2E-3E9E7A5F7C11}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}/releases
; Per-user install under %LocalAppData%\Programs, the same convention VS Code
; and most modern per-user Windows installers use — no admin prompt, no UAC.
DefaultDirName={autopf}\{#MyAppName}
UsePreviousAppDir=yes
UsePreviousTasks=yes
DisableWelcomePage=no
DisableReadyPage=no
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=..\dist
OutputBaseFilename=ai-quota-meter-setup-{#MyAppVersion}
SetupIconFile=..\assets\icon.ico
UninstallDisplayIcon={app}\{#MyAppExe}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
LicenseFile=..\LICENSE
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Files]
Source: "..\dist\{#MyAppExe}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; RunMinimized keeps the console window out of the user's face on the
; shortcuts most people will actually use — it stays inspectable from the
; taskbar for anyone who wants to see it, and a manual double-click of the
; exe itself (e.g. from Explorer) still opens the window normally.
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"; Flags: runminimized
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"; Flags: runminimized; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExe}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[Code]
const
  UninstallKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{9E7F9D6B-6C7B-4B7C-9A2E-3E9E7A5F7C11}_is1';

var
  ExistingInstall: Boolean;
  InstalledVersion, InstalledDirectory, InstallAction: String;

function InitializeSetup(): Boolean;
var
  Root: Integer;
  UninstallCommand: String;
  PreviousVersion, IncomingVersion: Int64;
begin
  Result := True;
  { Match Inno's installation scope and registry view. The desktop edition
    has its own installer identity and must not be mistaken for this one. }
  if IsAdminInstallMode then Root := HKLM64 else Root := HKCU64;
  ExistingInstall := RegQueryStringValue(Root, UninstallKey,
    'UninstallString', UninstallCommand) and (UninstallCommand <> '');
  if not ExistingInstall then Exit;

  RegQueryStringValue(Root, UninstallKey, 'DisplayVersion', InstalledVersion);
  RegQueryStringValue(Root, UninstallKey, 'Inno Setup: App Path', InstalledDirectory);
  InstallAction := 'Update';
  if StrToVersion(InstalledVersion, PreviousVersion) and
     StrToVersion('{#MyAppVersion}', IncomingVersion) then begin
    if ComparePackedVersion(PreviousVersion, IncomingVersion) > 0 then begin
      SuppressibleMsgBox('AI Quota Meter ' + InstalledVersion +
        ' is already installed. This installer contains the older version {#MyAppVersion}.' +
        (#13#10#13#10) + 'Use an installer for the same or a newer version.',
        mbError, MB_OK, IDOK);
      Result := False;
      Exit;
    end;
    if ComparePackedVersion(PreviousVersion, IncomingVersion) = 0 then
      InstallAction := 'Reinstall';
  end;
  if InstalledVersion = '' then InstalledVersion := 'unknown';
end;

procedure InitializeWizard();
begin
  if not ExistingInstall then Exit;
  if InstalledDirectory <> '' then
    WizardForm.DirEdit.Text := InstalledDirectory;
  WizardForm.WelcomeLabel1.Caption := InstallAction + ' {#MyAppName}';
  WizardForm.WelcomeLabel2.Caption :=
    '{#MyAppName} is already installed on this device.' + #13#10#13#10 +
    'Installed version: ' + InstalledVersion + #13#10 +
    'Installer version: {#MyAppVersion}' + #13#10#13#10 +
    'Setup will ' + Lowercase(InstallAction) + ' your existing installation.' +
    (#13#10) + 'Your saved accounts, settings, and usage history will be kept.' +
    (#13#10#13#10) + 'Close AI Quota Meter before continuing.';
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := ExistingInstall and (InstalledDirectory <> '') and
    (PageID = wpSelectDir);
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if not ExistingInstall then Exit;
  if CurPageID = wpReady then begin
    WizardForm.PageNameLabel.Caption := 'Ready to ' + InstallAction;
    WizardForm.PageDescriptionLabel.Caption :=
      'Setup will ' + Lowercase(InstallAction) + ' your existing installation.';
    WizardForm.ReadyLabel.Caption := InstallAction + ' {#MyAppName} from ' +
      InstalledVersion + ' to {#MyAppVersion}. Your saved accounts, settings, ' +
      'and usage history will be kept.';
    WizardForm.NextButton.Caption := '&' + InstallAction;
  end;
  if CurPageID = wpFinished then
    WizardForm.FinishedLabel.Caption := InstallAction + ' complete. ' +
      '{#MyAppName} {#MyAppVersion} is ready. Your saved accounts, settings, and usage history were kept.';
end;
