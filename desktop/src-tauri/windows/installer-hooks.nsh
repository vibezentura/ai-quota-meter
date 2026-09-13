; Tauri includes hooks before generating the MUI pages. Register the standard
; MUI callback here; English.nsh defines it after Tauri's variables/constants.
!define MUI_CUSTOMFUNCTION_GUIINIT QuotaUpdateGuiInit
