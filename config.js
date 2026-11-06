/* Public app config. GOOGLE_CLIENT_ID is public (OAuth Web client ID).
 * Never put a client secret here — GIS token client does not need one for this SPA.
 * Leave empty until a Cloud Console Web client is created for this origin. */
(function (root) {
  'use strict';
  root.FOT_CONFIG = {
    // Paste the Web application OAuth client ID here, e.g.
    // '123456789-abcdefg.apps.googleusercontent.com'
    GOOGLE_CLIENT_ID: '',
    // drive.file: only files this app creates/opens; visible in the user's Drive.
    // Chosen over drive.appdata so backups are findable/deletable across phones/PCs.
    DRIVE_SCOPE: 'https://www.googleapis.com/auth/drive.file',
    DRIVE_FILE_NAME: 'fot-calculator-sync.json'
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
