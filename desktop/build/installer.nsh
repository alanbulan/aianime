!include "LogicLib.nsh"
!include "nsDialogs.nsh"

!ifndef BUILD_UNINSTALLER
  !include "getProcessInfo.nsh"
  Var pid
  Var aiLegacyUninstallString
  Var aiLegacyUninstaller
  Var aiLegacyInstallDir

Function AiAnimeGetQuotedPath
  Exch $R0
  Push $R1
  Push $R2
  Push $R3

  StrCpy $R2 -1
  IntOp $R2 $R2 + 1
  StrCpy $R3 $R0 1 $R2
  StrCmp $R3 "" 0 +3
    StrCpy $R0 ""
    Goto done
  StrCmp $R3 '"' 0 -5

  IntOp $R2 $R2 + 1
  StrCpy $R0 $R0 "" $R2

  StrCpy $R2 0
  IntOp $R2 $R2 + 1
  StrCpy $R3 $R0 1 $R2
  StrCmp $R3 "" 0 +3
    StrCpy $R0 ""
    Goto done
  StrCmp $R3 '"' 0 -5

  StrCpy $R0 $R0 $R2
done:
  Pop $R3
  Pop $R2
  Pop $R1
  Exch $R0
FunctionEnd

Function AiAnimeGetParentPath
  Exch $R0
  Push $R1
  Push $R2
  Push $R3

  StrCpy $R1 0
  StrLen $R2 $R0
  loop:
    IntOp $R1 $R1 + 1
    IntCmp $R1 $R2 get 0 get
    StrCpy $R3 $R0 1 -$R1
    StrCmp $R3 "\" get
    Goto loop
  get:
    StrCpy $R0 $R0 -$R1

  Pop $R3
  Pop $R2
  Pop $R1
  Exch $R0
FunctionEnd

; During an update the installer can start before the parent Electron process
; has finished quitting. A manual installer upgrade has the same race, so use
; the existing installation path as the guard and close that process tree
; before the stock NSIS check runs. A fresh install has no app executable at
; $appExe and keeps the normal check unchanged.
!macro customCheckAppRunning
  ${if} ${FileExists} "$appExe"
    Sleep 1500
    nsExec::Exec `"$SYSDIR\System32\taskkill.exe" /F /T /IM "${APP_EXECUTABLE_FILENAME}"`
    Pop $0
    Sleep 1000
  ${endif}
  !insertmacro IS_POWERSHELL_AVAILABLE
  !insertmacro _CHECK_APP_RUNNING
!macroend

; electron-builder 26 always passes --updated to the previous uninstaller.
; That uninstaller uses an atomic Rename into $PLUGINSDIR, which fails when
; the installation and the temporary directory are on different volumes
; (for example, an app installed on F: with the Windows temp directory on C:).
; If that path returns a non-zero code, retry the same uninstaller without
; --updated. /KEEP_APP_DATA is retained so this compatibility path removes
; only program files and registry entries, never the user's app data.
!macro aiFallbackLegacyUninstaller ROOT_KEY
  ${if} ${Errors}
    StrCpy $R0 2
  ${endif}
  ${if} $R0 != 0
    DetailPrint "旧版本卸载器返回 $R0，改用兼容卸载路径..."
    ${if} "${ROOT_KEY}" == "HKEY_CURRENT_USER"
      StrCpy $R1 "/currentuser"
    ${elseif} $installMode == "CurrentUser"
      StrCpy $R1 "/currentuser"
    ${else}
      StrCpy $R1 "/allusers"
    ${endIf}

    ReadRegStr $aiLegacyUninstallString ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY}" UninstallString
    ReadRegStr $aiLegacyInstallDir ${ROOT_KEY} "${INSTALL_REGISTRY_KEY}" InstallLocation
    Push "$aiLegacyUninstallString"
    Call AiAnimeGetQuotedPath
    Pop $aiLegacyUninstaller
    ${if} $aiLegacyInstallDir == ""
      Push "$aiLegacyUninstaller"
      Call AiAnimeGetParentPath
      Pop $aiLegacyInstallDir
    ${endif}

    StrCpy $R0 2
    ClearErrors
    ExecWait '"$aiLegacyUninstaller" /S /KEEP_APP_DATA $R1 _?=$aiLegacyInstallDir' $R0
    ${if} ${Errors}
      StrCpy $R0 2
    ${endif}
  ${endif}

  ${if} $R0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(uninstallFailed): $R0"
    DetailPrint `Uninstall was not successful. Uninstaller error code: $R0.`
    SetErrorLevel 2
    Quit
  ${endif}
!macroend

!macro customUnInstallCheck
  !insertmacro aiFallbackLegacyUninstaller SHELL_CONTEXT
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro aiFallbackLegacyUninstaller HKEY_CURRENT_USER
!macroend
!endif

!ifndef BUILD_UNINSTALLER

Var AiAnimeWorldRuntimeCheckbox
Var AiAnimeInstallWorldRuntime

!macro customPageAfterChangeDir
  Page custom AiAnimeWorldRuntimePageCreate AiAnimeWorldRuntimePageLeave
!macroend

Function AiAnimeWorldRuntimePageCreate
  IfFileExists "$APPDATA\@ai-anime\desktop\dependencies\world\current\install.json" 0 AiAnimeShowWorldRuntimePage
  IfFileExists "$APPDATA\@ai-anime\desktop\dependencies\world\current\world-runtime\ai-anime-world-runtime.exe" 0 AiAnimeShowWorldRuntimePage
  IfFileExists "$APPDATA\@ai-anime\desktop\dependencies\world\current\splat-transform\node.exe" 0 AiAnimeShowWorldRuntimePage
  IfFileExists "$APPDATA\@ai-anime\desktop\dependencies\world\current\splat-transform\node_modules\@playcanvas\splat-transform\bin\cli.mjs" 0 AiAnimeShowWorldRuntimePage
  StrCpy $AiAnimeInstallWorldRuntime ${BST_UNCHECKED}
  Abort

AiAnimeShowWorldRuntimePage:
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 32u "可选环境依赖"
  Pop $0
  CreateFont $1 "$(^Font)" "12" "700"
  SendMessage $0 ${WM_SETFONT} $1 0

  ${NSD_CreateLabel} 0 38u 100% 34u "主安装包保持轻量。导演世界的 3D 推理与 3DGS 转换组件可在安装后从“设置 → 环境依赖”安装，也可以现在勾选下载。"
  Pop $0

  ${NSD_CreateCheckbox} 0 84u 100% 18u "安装导演世界 3D 运行环境（大型组件，推荐 NVIDIA GPU）"
  Pop $AiAnimeWorldRuntimeCheckbox
  ${NSD_Uncheck} $AiAnimeWorldRuntimeCheckbox

  ${NSD_CreateLabel} 18u 108u 94% 42u "组件将按云端清单下载并校验完整性。模型权重可在“设置 → 环境依赖”中另行安装。未安装该组件不影响脚本、图片、视频等其他功能。"
  Pop $0

  nsDialogs::Show
FunctionEnd

Function AiAnimeWorldRuntimePageLeave
  ${NSD_GetState} $AiAnimeWorldRuntimeCheckbox $AiAnimeInstallWorldRuntime
FunctionEnd

!macro customInstall
  ${If} $AiAnimeInstallWorldRuntime == ${BST_CHECKED}
    DetailPrint "正在安装导演世界 3D 运行环境..."
    nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\installer\install-runtime-dependency.ps1"'
    Pop $0
    ${If} $0 != 0
      MessageBox MB_OK|MB_ICONEXCLAMATION "导演世界 3D 运行环境安装失败（退出码 $0）。主程序已正常安装，可稍后在“设置 → 环境依赖”中重试。$\r$\n$\r$\n详细日志：$APPDATA\@ai-anime\desktop\logs\runtime-dependency-install.log"
    ${EndIf}
  ${EndIf}
!macroend

!endif
