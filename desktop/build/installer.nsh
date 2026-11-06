; Default install dir: Documents\FOT Calculator\App (per-user)
!macro preInit
  SetRegView 64
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$DOCUMENTS\FOT Calculator\App"
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$DOCUMENTS\FOT Calculator\App"
  SetRegView 32
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$DOCUMENTS\FOT Calculator\App"
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$DOCUMENTS\FOT Calculator\App"
!macroend
