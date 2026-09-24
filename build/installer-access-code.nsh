!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!addplugindir /x86-unicode "${BUILD_RESOURCES_DIR}\nsis-plugins"

!ifndef BUILD_UNINSTALLER
; Only a salted digest is embedded. The shared installation code itself is not stored here.
!define INSTALL_CODE_SALT "a6c5237526be1ce623bfe4ba47c7391d"
!define INSTALL_CODE_SHA256 "BE868433B4F55869A547C32473F48493379F52080D8DB7394ECF3ADAB8118BD2"

Var InstallCodeDialog
Var InstallCodeInput

!macro customInit
  ; A silent install has no safe way to request the shared code, so it must fail closed.
  ${If} ${Silent}
    SetErrorLevel 5
    Quit
  ${EndIf}
!macroend

!macro customPageAfterChangeDir
  Page custom InstallCodePageCreate InstallCodePageLeave
!macroend

Function InstallCodePageCreate
  nsDialogs::Create 1018
  Pop $InstallCodeDialog
  ${If} $InstallCodeDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 4u 100% 26u "Mã này được cung cấp riêng bởi Nhà Yến. Không chia sẻ mã cho người không được phép."
  Pop $0

  ${NSD_CreateLabel} 0 39u 100% 12u "Mã cài đặt:"
  Pop $0

  ${NSD_CreatePassword} 0 55u 100% 13u ""
  Pop $InstallCodeInput
  SendMessage $InstallCodeInput ${EM_SETPASSWORDCHAR} 0x25CF 0
  ${NSD_SetFocus} $InstallCodeInput

  nsDialogs::Show
FunctionEnd

Function InstallCodePageLeave
  ${NSD_GetText} $InstallCodeInput $0
  StrCmp $0 "" InstallCodeInvalid

  ; Normalize ASCII letters so the formatted code is case-insensitive.
  System::Call 'User32::CharUpperBuff(t r0, i ${NSIS_MAX_STRLEN})'
  Push "SHA2-256"
  Push "${INSTALL_CODE_SALT}$0"
  NhaYenHash::HashText
  Pop $1
  StrCmp $1 "${INSTALL_CODE_SHA256}" InstallCodeValid

InstallCodeInvalid:
  MessageBox MB_OK|MB_ICONSTOP "Mã cài đặt không đúng. Vui lòng kiểm tra và nhập lại."
  Abort

InstallCodeValid:
FunctionEnd
!endif
