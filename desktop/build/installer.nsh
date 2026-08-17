!include "LogicLib.nsh"
!include "nsDialogs.nsh"

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

  ${NSD_CreateLabel} 18u 108u 94% 42u "组件将从国内镜像下载并校验完整性。模型权重在首次使用时按需下载。未安装该组件不影响脚本、图片、视频等其他功能。"
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
