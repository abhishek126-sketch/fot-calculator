'use strict';
// Key Generator 2.0: copies the shared licence code next to main.js. The PRIVATE key is NOT embedded in the build;
// it is read at run time from OneDrive\Documents\FOT-Publisher-Keys.
const fs = require('fs');
const path = require('path');
const dest = path.join(__dirname, '..', 'lib');
fs.mkdirSync(dest, { recursive: true });
fs.copyFileSync(path.join(__dirname, '..', '..', 'lib', 'licence.js'), path.join(dest, 'licence.js'));
console.log('Copied licence.js for the key generator build');
