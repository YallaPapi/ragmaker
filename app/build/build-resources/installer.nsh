# NSIS Script for RagMaker Standalone Installer
# Advanced installer with embedded resources and license management

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "WinMessages.nsh"

# Installer configuration
!define PRODUCT_NAME "RagMaker Standalone"
!define PRODUCT_VERSION "${VERSION}"
!define PRODUCT_PUBLISHER "RagMaker Team"
!define PRODUCT_WEB_SITE "https://ragmaker.com"
!define PRODUCT_DIR_REGKEY "Software\Microsoft\Windows\CurrentVersion\App Paths\ragmaker.exe"
!define PRODUCT_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"
!define PRODUCT_UNINST_ROOT_KEY "HKLM"

# Installer settings
Name "${PRODUCT_NAME}"
OutFile "${PRODUCT_NAME}-Setup-${PRODUCT_VERSION}.exe"
InstallDir "$PROGRAMFILES64\RagMaker"
InstallDirRegKey HKLM "${PRODUCT_DIR_REGKEY}" ""
ShowInstDetails show
ShowUnInstDetails show
RequestExecutionLevel admin
Compressor /SOLID lzma
SetCompressor /FINAL lzma

# Interface configuration
!define MUI_ABORTWARNING
!define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\modern-install.ico"
!define MUI_UNICON "${NSISDIR}\Contrib\Graphics\Icons\modern-uninstall.ico"

# Header image
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "header.bmp"
!define MUI_HEADERIMAGE_RIGHT

# Welcome and finish page configuration
!define MUI_WELCOMEFINISHPAGE_BITMAP "wizard.bmp"
!define MUI_WELCOMEPAGE_TITLE_3LINES
!define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of ${PRODUCT_NAME}.\r\n\r\nRagMaker is an advanced document indexing and AI-powered search system that helps you organize and query your knowledge base efficiently.\r\n\r\nClick Next to continue."

# Finish page configuration
!define MUI_FINISHPAGE_RUN "$INSTDIR\ragmaker.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch ${PRODUCT_NAME}"
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\README.txt"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Show release notes"
!define MUI_FINISHPAGE_LINK "Visit the RagMaker website for more information"
!define MUI_FINISHPAGE_LINK_LOCATION "${PRODUCT_WEB_SITE}"

# Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "License.txt"
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY

# Custom page for license activation
Page custom LicenseActivationPage LicenseActivationPageLeave

!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

# Uninstaller pages
!insertmacro MUI_UNPAGE_INSTFILES

# Languages
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Spanish"
!insertmacro MUI_LANGUAGE "French"
!insertmacro MUI_LANGUAGE "German"
!insertmacro MUI_LANGUAGE "Italian"
!insertmacro MUI_LANGUAGE "Portuguese"
!insertmacro MUI_LANGUAGE "Russian"
!insertmacro MUI_LANGUAGE "Japanese"
!insertmacro MUI_LANGUAGE "Chinese"

# Variables
Var LicenseKey
Var ActivationMethod
Var InstallDataSize

# Version information
VIProductVersion "${PRODUCT_VERSION}.0"
VIAddVersionKey "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey "Comments" "Advanced RAG system for document indexing"
VIAddVersionKey "CompanyName" "${PRODUCT_PUBLISHER}"
VIAddVersionKey "LegalTrademarks" "RagMaker is a trademark of RagMaker Team"
VIAddVersionKey "LegalCopyright" "© 2025 RagMaker Team"
VIAddVersionKey "FileDescription" "${PRODUCT_NAME} Installer"
VIAddVersionKey "FileVersion" "${PRODUCT_VERSION}"
VIAddVersionKey "ProductVersion" "${PRODUCT_VERSION}"
VIAddVersionKey "OriginalFilename" "RagMaker-Setup.exe"

# Installation sections
Section "Core Application" SecCore
  SectionIn RO  ; Read-only, always installed
  
  SetOutPath "$INSTDIR"
  SetOverwrite on
  
  # Main application files
  File /r "app\*.*"
  File "ragmaker.exe"
  File "LICENSE.txt"
  File "README.txt"
  
  # Create application shortcuts
  CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
  CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" "$INSTDIR\ragmaker.exe"
  CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\Uninstall.lnk" "$INSTDIR\uninst.exe"
  CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\ragmaker.exe"
  
  # Registry entries
  WriteRegStr HKLM "${PRODUCT_DIR_REGKEY}" "" "$INSTDIR\ragmaker.exe"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayName" "$(^Name)"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "UninstallString" "$INSTDIR\uninst.exe"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayIcon" "$INSTDIR\ragmaker.exe"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "URLInfoAbout" "${PRODUCT_WEB_SITE}"
  WriteRegDWORD ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "NoModify" 1
  WriteRegDWORD ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "NoRepair" 1
  
  # Calculate installed size
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "EstimatedSize" "$0"
  
  # Auto-updater configuration
  WriteRegStr HKLM "Software\${PRODUCT_PUBLISHER}\${PRODUCT_NAME}" "InstallPath" "$INSTDIR"
  WriteRegStr HKLM "Software\${PRODUCT_PUBLISHER}\${PRODUCT_NAME}" "Version" "${PRODUCT_VERSION}"
  WriteRegStr HKLM "Software\${PRODUCT_PUBLISHER}\${PRODUCT_NAME}" "UpdateChannel" "stable"
SectionEnd

Section "Embedded Database" SecDatabase
  SetOutPath "$INSTDIR\data"
  
  # Embedded SQLite databases
  File /r "data\databases\*.*"
  
  # Sample data and configurations
  File /r "data\samples\*.*"
  File /r "data\config\*.*"
SectionEnd

Section "AI Models" SecModels
  SetOutPath "$INSTDIR\models"
  
  DetailPrint "Installing AI models (this may take a few minutes)..."
  
  # Embedding models
  File /r "models\embeddings\*.*"
  
  # Language models (optional, large files)
  File /r /x "*.large" "models\language\*.*"
  
  # Create models registry
  WriteRegStr HKLM "Software\${PRODUCT_PUBLISHER}\${PRODUCT_NAME}\Models" "EmbeddingModel" "sentence-transformers/all-MiniLM-L6-v2"
  WriteRegStr HKLM "Software\${PRODUCT_PUBLISHER}\${PRODUCT_NAME}\Models" "LanguageModel" "gpt-3.5-turbo"
SectionEnd

Section "Development Tools" SecDevTools
  SetOutPath "$INSTDIR\tools"
  
  # Development and debugging tools
  File /r "tools\*.*"
  
  # Add tools to PATH (optional)
  ReadEnvStr $R0 "PATH"
  StrCpy $R0 "$R0;$INSTDIR\tools"
  WriteRegExpandStr HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "PATH" "$R0"
SectionEnd

Section "File Associations" SecFileAssoc
  # Associate .rag files with the application
  WriteRegStr HKCR ".rag" "" "RagMaker.Document"
  WriteRegStr HKCR "RagMaker.Document" "" "RagMaker Document"
  WriteRegStr HKCR "RagMaker.Document\DefaultIcon" "" "$INSTDIR\ragmaker.exe,0"
  WriteRegStr HKCR "RagMaker.Document\shell\open\command" "" '"$INSTDIR\ragmaker.exe" "%1"'
  
  # Register with Windows Search
  WriteRegStr HKCR "RagMaker.Document\shell\search" "" "Search with RagMaker"
  WriteRegStr HKCR "RagMaker.Document\shell\search\command" "" '"$INSTDIR\ragmaker.exe" --search "%1"'
SectionEnd

# Section descriptions
!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecCore} "Core application files and runtime (required)"
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDatabase} "Embedded database and sample data"
  !insertmacro MUI_DESCRIPTION_TEXT ${SecModels} "AI models for embedding and language processing"
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDevTools} "Development tools and utilities"
  !insertmacro MUI_DESCRIPTION_TEXT ${SecFileAssoc} "File associations and Windows integration"
!insertmacro MUI_FUNCTION_DESCRIPTION_END

# Custom license activation page
Function LicenseActivationPage
  !insertmacro MUI_HEADER_TEXT "License Activation" "Activate your RagMaker license"
  
  nsDialogs::Create 1018
  Pop $0
  
  ${NSD_CreateLabel} 10 10 280 20u "Enter your license key or choose trial mode:"
  
  ${NSD_CreateRadioButton} 20 40 260 15u "Start 30-day free trial"
  Pop $R0
  ${NSD_Check} $R0
  
  ${NSD_CreateRadioButton} 20 65 260 15u "Enter license key:"
  Pop $R1
  
  ${NSD_CreateText} 40 90 240 15u ""
  Pop $R2
  
  ${NSD_CreateLabel} 40 115 240 30u "License key format: XXXX-XXXX-XXXX-XXXX"
  
  # Event handlers
  ${NSD_OnClick} $R0 TrialModeSelected
  ${NSD_OnClick} $R1 LicenseKeyModeSelected
  
  nsDialogs::Show
FunctionEnd

Function TrialModeSelected
  StrCpy $ActivationMethod "trial"
  ${NSD_SetText} $R2 ""
  EnableWindow $R2 0
FunctionEnd

Function LicenseKeyModeSelected
  StrCpy $ActivationMethod "license"
  EnableWindow $R2 1
  ${NSD_SetFocus} $R2
FunctionEnd

Function LicenseActivationPageLeave
  ${If} $ActivationMethod == "license"
    ${NSD_GetText} $R2 $LicenseKey
    ${If} $LicenseKey == ""
      MessageBox MB_ICONEXCLAMATION "Please enter a license key or select trial mode."
      Abort
    ${EndIf}
    
    # Validate license key format (basic check)
    StrLen $0 $LicenseKey
    ${If} $0 < 19  # XXXX-XXXX-XXXX-XXXX = 19 characters
      MessageBox MB_ICONEXCLAMATION "Invalid license key format. Please check and try again."
      Abort
    ${EndIf}
  ${EndIf}
  
  # Store activation choice
  WriteRegStr HKLM "Software\${PRODUCT_PUBLISHER}\${PRODUCT_NAME}" "ActivationMethod" "$ActivationMethod"
  ${If} $ActivationMethod == "license"
    WriteRegStr HKLM "Software\${PRODUCT_PUBLISHER}\${PRODUCT_NAME}" "LicenseKey" "$LicenseKey"
  ${EndIf}
FunctionEnd

# Installation event functions
Function .onInit
  # Check if already installed
  ReadRegStr $R0 ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "UninstallString"
  ${If} $R0 != ""
    MessageBox MB_YESNO|MB_ICONQUESTION "${PRODUCT_NAME} is already installed. Do you want to uninstall the previous version?" IDNO +3
    ExecWait '$R0 _?=$INSTDIR'
    Delete "$R0"
  ${EndIf}
  
  # Check system requirements
  ${If} ${RunningX64}
    SetRegView 64
  ${Else}
    MessageBox MB_ICONSTOP "This application requires a 64-bit version of Windows."
    Abort
  ${EndIf}
  
  # Check .NET Framework
  Call CheckDotNet
  
  # Language selection
  !insertmacro MUI_LANGDLL_DISPLAY
FunctionEnd

Function CheckDotNet
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full" "Release"
  ${If} $0 < 461808  # .NET 4.7.2
    MessageBox MB_YESNO|MB_ICONQUESTION ".NET Framework 4.7.2 or later is required. Do you want to download it now?" IDNO +3
    ExecShell "open" "https://dotnet.microsoft.com/download/dotnet-framework"
    Abort
  ${EndIf}
FunctionEnd

Function .onInstSuccess
  # Perform license activation
  ${If} $ActivationMethod == "license"
    DetailPrint "Activating license..."
    ExecWait '"$INSTDIR\ragmaker.exe" --activate "$LicenseKey"' $0
    ${If} $0 != 0
      MessageBox MB_ICONEXCLAMATION "License activation failed. You can activate it later from the Help menu."
    ${Else}
      DetailPrint "License activated successfully"
    ${EndIf}
  ${Else}
    DetailPrint "Trial mode activated"
  ${EndIf}
  
  # Register application for Windows Defender exclusion (optional)
  ExecWait 'powershell.exe -Command "Add-MpPreference -ExclusionPath \"$INSTDIR\""' $0
  
  # Create uninstaller
  WriteUninstaller "$INSTDIR\uninst.exe"
  
  # Refresh shell icons
  System::Call 'shell32.dll::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
FunctionEnd

# Uninstaller
Section Uninstall
  # Remove registry keys
  DeleteRegKey ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}"
  DeleteRegKey HKLM "${PRODUCT_DIR_REGKEY}"
  DeleteRegKey HKLM "Software\${PRODUCT_PUBLISHER}\${PRODUCT_NAME}"
  
  # Remove file associations
  DeleteRegKey HKCR "RagMaker.Document"
  DeleteRegKey HKCR ".rag"
  
  # Remove shortcuts
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\*.*"
  RMDir "$SMPROGRAMS\${PRODUCT_NAME}"
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  
  # Remove application files
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\data"
  RMDir /r "$INSTDIR\models"
  RMDir /r "$INSTDIR\tools"
  Delete "$INSTDIR\ragmaker.exe"
  Delete "$INSTDIR\LICENSE.txt"
  Delete "$INSTDIR\README.txt"
  Delete "$INSTDIR\uninst.exe"
  
  # Remove installation directory if empty
  RMDir "$INSTDIR"
  
  # Refresh shell icons
  System::Call 'shell32.dll::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
SectionEnd

# Uninstaller event functions
Function un.onInit
  !insertmacro MUI_UNGETLANGUAGE
  
  MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON2 "Are you sure you want to completely remove ${PRODUCT_NAME} and all of its components?" IDYES +2
  Abort
FunctionEnd

Function un.onUninstSuccess
  HideWindow
  MessageBox MB_ICONINFORMATION|MB_OK "${PRODUCT_NAME} has been successfully removed from your computer."
FunctionEnd
