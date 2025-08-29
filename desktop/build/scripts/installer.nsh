; Custom NSIS installer script for RAGMaker Desktop

!include "MUI2.nsh"
!include "FileFunc.nsh"

; Modern UI Configuration
!define MUI_ABORTWARNING
!define MUI_ICON "..\..\build\assets\installer.ico"
!define MUI_UNICON "..\..\build\assets\uninstaller.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "..\..\build\assets\installer-sidebar.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "..\..\build\assets\uninstaller-sidebar.bmp"

; Welcome page
!insertmacro MUI_PAGE_WELCOME

; License page
!insertmacro MUI_PAGE_LICENSE "..\..\..\..\LICENSE"

; Components page
!insertmacro MUI_PAGE_COMPONENTS

; Directory page
!insertmacro MUI_PAGE_DIRECTORY

; Install files page
!insertmacro MUI_PAGE_INSTFILES

; Finish page
!define MUI_FINISHPAGE_RUN "$INSTDIR\RAGMaker Desktop.exe"
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\README.txt"
!insertmacro MUI_PAGE_FINISH

; Uninstaller pages
!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

; Languages
!insertmacro MUI_LANGUAGE "English"

; Custom functions
Function .onInit
  ; Check if application is already running
  System::Call 'kernel32::CreateMutexA(i 0, i 0, t "RAGMakerDesktopMutex") i .r1 ?e'
  Pop $R0
  StrCmp $R0 0 +3
  MessageBox MB_OK|MB_ICONEXCLAMATION "RAGMaker Desktop is already running. Please close it and try again."
  Abort
  
  ; Check minimum OS version (Windows 10)
  ${VersionCompare} ${WINDOWS_VERSION} "10.0" $R0
  StrCmp $R0 "2" 0 +3
  MessageBox MB_OK|MB_ICONSTOP "This application requires Windows 10 or later."
  Abort
FunctionEnd

Function un.onInit
  MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON2 "Are you sure you want to completely remove RAGMaker Desktop and all of its components?" IDYES +2
  Abort
FunctionEnd

; Custom install sections
Section "RAGMaker Desktop" SecMain
  SectionIn RO
  
  ; Set output path
  SetOutPath "$INSTDIR"
  
  ; Install main application files
  File /r "${BUILD_RESOURCES_DIR}\*"
  
  ; Create shortcuts
  CreateDirectory "$SMPROGRAMS\RAGMaker"
  CreateShortcut "$SMPROGRAMS\RAGMaker\RAGMaker Desktop.lnk" "$INSTDIR\RAGMaker Desktop.exe"
  CreateShortcut "$SMPROGRAMS\RAGMaker\Uninstall RAGMaker.lnk" "$INSTDIR\Uninstall RAGMaker Desktop.exe"
  
  ; Register uninstaller
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\RAGMaker Desktop" "DisplayName" "RAGMaker Desktop"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\RAGMaker Desktop" "UninstallString" "$INSTDIR\Uninstall RAGMaker Desktop.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\RAGMaker Desktop" "DisplayIcon" "$INSTDIR\RAGMaker Desktop.exe"
  
  ; Get install size
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\RAGMaker Desktop" "EstimatedSize" "$0"
  
  ; Write uninstaller
  WriteUninstaller "$INSTDIR\Uninstall RAGMaker Desktop.exe"
SectionEnd

Section "Desktop Shortcut" SecDesktop
  CreateShortcut "$DESKTOP\RAGMaker Desktop.lnk" "$INSTDIR\RAGMaker Desktop.exe"
SectionEnd

Section "Auto-start with Windows" SecAutostart
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "RAGMaker Desktop" "$INSTDIR\RAGMaker Desktop.exe --hidden"
SectionEnd

; Section descriptions
LangString DESC_SecMain ${LANG_ENGLISH} "The main RAGMaker Desktop application and required files."
LangString DESC_SecDesktop ${LANG_ENGLISH} "Create a shortcut on the desktop."
LangString DESC_SecAutostart ${LANG_ENGLISH} "Automatically start RAGMaker Desktop when Windows starts."

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecMain} $(DESC_SecMain)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} $(DESC_SecDesktop)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecAutostart} $(DESC_SecAutostart)
!insertmacro MUI_FUNCTION_DESCRIPTION_END

; Uninstaller
Section "Uninstall"
  ; Remove registry entries
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\RAGMaker Desktop"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "RAGMaker Desktop"
  
  ; Remove shortcuts
  Delete "$SMPROGRAMS\RAGMaker\RAGMaker Desktop.lnk"
  Delete "$SMPROGRAMS\RAGMaker\Uninstall RAGMaker.lnk"
  RMDir "$SMPROGRAMS\RAGMaker"
  Delete "$DESKTOP\RAGMaker Desktop.lnk"
  
  ; Remove application files
  RMDir /r "$INSTDIR"
  
  ; Remove user data (optional)
  MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON2 "Do you want to remove all user data and settings?" IDNO +2
  RMDir /r "$APPDATA\RAGMaker Desktop"
SectionEnd